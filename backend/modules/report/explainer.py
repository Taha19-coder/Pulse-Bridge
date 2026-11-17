import uuid
from typing import Dict, Any, List, Optional
from google import genai
from google.genai import types
from backend.core.config import settings
from backend.core.guardrails import validate_and_sanitize_medical_text, MANDATORY_DISCLAIMER_EN, MANDATORY_DISCLAIMER_UR
from backend.core.supabase_client import get_supabase_client
from backend.models.schemas import ReportExplanationResponse, BiomarkerItem
from backend.modules.report.parser import inspect_report_file
from backend.modules.report.extractor import extract_biomarkers_with_gemini, fallback_rule_based_extractor


EXPLANATION_PROMPT_TEMPLATE = """
You are Pulse Bridge's empathetic, highly knowledgeable medical health literacy AI.
Target Language: {language}

Here is the extracted patient biomarker data:
{biomarkers_summary}

YOUR CLINICAL LITERACY RESPONSIBILITIES:
1. Explain the findings in simple, compassionate, non-technical language.
2. If any test values are marked LOW or ELEVATED, explain what that generally signifies in everyday terms (e.g. low hemoglobin may cause mild fatigue or reflect low dietary iron).
3. If language is 'ur', provide fluent, culturally respectful Urdu text suitable for Pakistani patients.
4. Provide 3 specific, educated questions the patient should ask their attending doctor.
5. Provide 2 general dietary or lifestyle wellness considerations (strictly non-prescriptive, e.g. leafy greens for iron, adequate hydration).
6. STRICT CLINICAL GUARDRAIL: NEVER declare a medical diagnosis (e.g. do not say "You have diabetes"). NEVER prescribe drugs or dosages. Always advise consulting a licensed physician.

FORMAT YOUR RESPONSE AS JSON:
{{
  "abnormal_findings_summary": "Plain-language summary of out-of-range markers",
  "overall_health_insight": "Empathetic overview of the patient's test panel",
  "suggested_questions_for_doctor": [
    "Question 1",
    "Question 2",
    "Question 3"
  ],
  "dietary_lifestyle_considerations": [
    "Consideration 1",
    "Consideration 2"
  ]
}}
"""


class ReportExplainerService:
    @staticmethod
    def process_and_explain(
        file_bytes: bytes,
        filename: str,
        language: str = "en",
        user_id: Optional[str] = None
    ) -> ReportExplanationResponse:
        """
        End-to-end report pipeline:
        1. Parse file bytes (PDF text / image)
        2. Extract structured biomarkers
        3. Generate patient-friendly explanation in EN or UR
        4. Pass through clinical safety guardrails
        5. Persist record to Supabase
        """
        extracted_text, mime_type = inspect_report_file(file_bytes, filename)

        # 1. Structured Biomarker Extraction
        extracted_data: Dict[str, Any] = {}
        if settings.GEMINI_API_KEY:
            try:
                extracted_data = extract_biomarkers_with_gemini(
                    text_content=extracted_text,
                    image_bytes=file_bytes if mime_type and mime_type.startswith("image/") else None,
                    mime_type=mime_type
                )
            except Exception as e:
                print(f"[ReportExplainer] Gemini extraction notice: {e}. Utilizing fallback parser.")
                extracted_data = fallback_rule_based_extractor(extracted_text or filename)
        else:
            extracted_data = fallback_rule_based_extractor(extracted_text or filename)

        biomarkers = [BiomarkerItem(**b) for b in extracted_data.get("biomarkers", [])]
        report_title = extracted_data.get("report_title", "Medical Diagnostic Report")
        category = extracted_data.get("detected_category", "Clinical Laboratory")

        # 2. Generate Bilingual Explanation
        abnormal_items = [b for b in biomarkers if b.status in ("LOW", "ELEVATED")]
        biomarkers_summary = "\n".join([
            f"- {b.name}: {b.observed_value} (Normal: {b.reference_range}) -> Status: {b.status}"
            for b in biomarkers
        ])

        if settings.GEMINI_API_KEY:
            try:
                client = genai.Client(api_key=settings.GEMINI_API_KEY)
                prompt = EXPLANATION_PROMPT_TEMPLATE.format(
                    language="Urdu (اردو)" if language == "ur" else "English",
                    biomarkers_summary=biomarkers_summary
                )
                res = client.models.generate_content(
                    model=settings.GEMINI_CHAT_MODEL,
                    contents=prompt
                )
                raw_json = res.text.strip()
                if "```json" in raw_json:
                    raw_json = raw_json.split("```json")[1].split("```")[0].strip()
                elif "```" in raw_json:
                    raw_json = raw_json.split("```")[1].split("```")[0].strip()
                import json
                explanation_data = json.loads(raw_json)
            except Exception as e:
                print(f"[ReportExplainer] Gemini explanation notice: {e}")
                explanation_data = ReportExplainerService._generate_rule_based_explanation(abnormal_items, language)
        else:
            explanation_data = ReportExplainerService._generate_rule_based_explanation(abnormal_items, language)

        abnormal_summary = explanation_data.get("abnormal_findings_summary", "")
        health_insight = explanation_data.get("overall_health_insight", "")
        questions = explanation_data.get("suggested_questions_for_doctor", [])
        lifestyle = explanation_data.get("dietary_lifestyle_considerations", [])

        # 3. Clinical Safety Guardrail Pass
        sanitized_summary, _ = validate_and_sanitize_medical_text(abnormal_summary, language)
        sanitized_insight, _ = validate_and_sanitize_medical_text(health_insight, language)
        disclaimer = MANDATORY_DISCLAIMER_UR if language == "ur" else MANDATORY_DISCLAIMER_EN

        report_id = str(uuid.uuid4())

        # 4. Optional Supabase Persistence
        try:
            supabase = get_supabase_client()
            supabase.table("report_records").insert({
                "id": report_id,
                "user_id": user_id,
                "report_title": report_title,
                "detected_category": category,
                "language": language,
                "biomarkers": [b.model_dump() for b in biomarkers],
                "abnormal_findings": sanitized_summary,
                "health_insight": sanitized_insight,
                "questions_for_doctor": questions,
                "disclaimer_acknowledged": True
            }).execute()
        except Exception:
            pass

        return ReportExplanationResponse(
            id=report_id,
            report_title=report_title,
            detected_category=category,
            language=language,
            biomarkers=biomarkers,
            abnormal_findings_summary=sanitized_summary,
            overall_health_insight=sanitized_insight,
            suggested_questions_for_doctor=questions,
            dietary_lifestyle_considerations=lifestyle,
            mandatory_disclaimer=disclaimer
        )

    @staticmethod
    def _generate_rule_based_explanation(abnormal_items: List[BiomarkerItem], language: str) -> Dict[str, Any]:
        if language == "ur":
            if not abnormal_items:
                return {
                    "abnormal_findings_summary": "تمام جانچے گئے بنیادی ٹیسٹ لیبارٹری کی عام حد کے مطابق ہیں۔",
                    "overall_health_insight": "آپ کے عمومی لیب کے نتائج مستحکم ہیں، تاہم انفرادی صحت کے جائزے کے لیے اپنے معالج سے مشورہ جاری رکھیں۔",
                    "suggested_questions_for_doctor": [
                        "کیا مجھے مستقبل میں معمول کے فالو اپ ٹیسٹ کروانے کی ضرورت ہے؟",
                        "طرز زندگی یا خوراک میں کون سی مثبت تبدیلیاں میری صحت کے لیے مفید ہوں گی؟"
                    ],
                    "dietary_lifestyle_considerations": [
                        "متوازن غذا اور پانی کا مناسب استعمال معمول بنائیں",
                        "روزانہ ہلکی ورزش کو معمول کا حصہ بنائیں"
                    ]
                }
            items_str = "، ".join([f"{b.name} ({b.observed_value})" for b in abnormal_items])
            return {
                "abnormal_findings_summary": f"کچھ پیرامیٹرز میں تغیر دیکھا گیا ہے: {items_str}۔ یہ عارضی غذائی یا جسمانی عوامل کی وجہ سے ہو سکتا ہے۔",
                "overall_health_insight": "یہ رپورٹ بنیادی آگاہی فراہم کرتی ہے۔ درست تشخیص کے لیے اپنے مستند معالج سے رجوع فرمائیں۔",
                "suggested_questions_for_doctor": [
                    "کیا ان نتائج کے لیے کوئی اضافی تشخیصی ٹیسٹ درکار ہے؟",
                    "کیا غذائی پرہیز یا طرز زندگی کی تبدیلیاں تجویز کی جاتی ہیں؟"
                ],
                "dietary_lifestyle_considerations": [
                    "ڈاکٹر کے مشورے کے بغیر کوئی خود ساختہ دوا نہ لیں",
                    "صحت بخش قدرتی غذا اور مناسب نیند کا خیال رکھیں"
                ]
            }

        # English
        if not abnormal_items:
            return {
                "abnormal_findings_summary": "All identified parameters fall within standard biological reference ranges.",
                "overall_health_insight": "Your laboratory markers demonstrate healthy baseline stability. Continue routine preventative health checkups.",
                "suggested_questions_for_doctor": [
                    "Are there any specific wellness markers we should recheck annually?",
                    "Do my current results support my current lifestyle and exercise regimen?"
                ],
                "dietary_lifestyle_considerations": [
                    "Maintain balanced hydration and whole-food nutrition",
                    "Incorporate regular moderate cardiovascular activity"
                ]
            }

        items_str = ", ".join([f"{b.name} ({b.observed_value} vs {b.reference_range})" for b in abnormal_items])
        return {
            "abnormal_findings_summary": f"Notable variations observed in: {items_str}. These changes often correlate with dietary factors, temporary strain, or nutritional needs.",
            "overall_health_insight": "Several markers deviate from standard reference thresholds and warrant clinical review with your primary care physician.",
            "suggested_questions_for_doctor": [
                "Could these out-of-range values indicate an underlying dietary or metabolic factor?",
                "Would you recommend any follow-up blood panels in the next 4 to 8 weeks?",
                "Are there specific lifestyle or nutritional adjustments indicated by these markers?"
            ],
            "dietary_lifestyle_considerations": [
                "Avoid self-prescribing over-the-counter supplements prior to clinical review",
                "Maintain a consistent sleep schedule and hydration"
            ]
        }
