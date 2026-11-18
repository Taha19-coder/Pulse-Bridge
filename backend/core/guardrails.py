import re
from typing import Tuple, List

MANDATORY_DISCLAIMER_EN = (
    "For educational purposes only; this is not a diagnosis. Discuss your results with a qualified medical professional."
)

MANDATORY_DISCLAIMER_UR = (
    "یہ خلاصہ صرف معلوماتی مقصد کے لیے ہے، تشخیص یا علاج نہیں۔ اپنی رپورٹ کے بارے میں مستند ڈاکٹر سے مشورہ کریں۔"
)

LEGACY_DISCLAIMER_EN = (
    "IMPORTANT MEDICAL NOTICE: This analysis is provided for educational and health literacy purposes only. "
    "It does not constitute a medical diagnosis, clinical prognosis, or treatment plan. "
    "Always discuss your laboratory results directly with a qualified, licensed medical professional."
)

LEGACY_DISCLAIMER_UR = (
    "اہم طبی آگاہی: یہ خلاصہ صرف معلوماتی اور طبی آگاہی کے لیے فراہم کیا گیا ہے۔ "
    "یہ کسی بھی صورت میں حتمی تشخیص یا علاج کی تجویز نہیں ہے۔ "
    "اپنی رپورٹ کے حوالے سے ہمیشہ مستند اور قابل معالج (ڈاکٹر) سے براہ راست رجوع فرمائیں۔"
)

# Prohibited diagnostic assertion patterns
DIAGNOSTIC_PATTERNS = [
    r"\byou\s+have\s+(cancer|leukemia|diabetes|tuberculosis|hepatitis|hiv|aids|cardiac arrest)\b",
    r"\bwe\s+diagnose\s+you\s+with\b",
    r"\bdiagnosis:\s*(confirmed|positive|definite)\b",
    r"\byou\s+are\s+suffering\s+from\s+[a-z\s]+disease\b",
]

# Prohibited prescriptive instruction patterns
PRESCRIPTIVE_PATTERNS = [
    r"\btake\s+\d+\s*(mg|ml|tablets?|capsules?|pills?)\b",
    r"\bprescribe\s+[a-z\s]+\b",
    r"\byou\s+must\s+take\s+[a-z\s]+\b",
    r"\bdosage:\s*\d+\b",
]


def validate_and_sanitize_medical_text(text: str, language: str = "en") -> Tuple[str, List[str]]:
    """
    Deterministic safety guardrail:
    1. Scans generated AI content for unauthorized clinical diagnosis or prescription attempts.
    2. Redacts or softens violating sentences.
    3. Removes repeated disclaimer text and generated section headings; the UI renders one safety note separately.
    """
    warnings = []
    sanitized_text = text

    # Check and sanitize diagnostic claims
    for pattern in DIAGNOSTIC_PATTERNS:
        matches = re.findall(pattern, sanitized_text, flags=re.IGNORECASE)
        if matches:
            warnings.append(f"Blocked explicit diagnostic statement matching pattern: {pattern}")
            sanitized_text = re.sub(
                pattern,
                "these laboratory findings should be evaluated by a physician for potential conditions",
                sanitized_text,
                flags=re.IGNORECASE
            )

    # Check and sanitize prescriptive assertions
    for pattern in PRESCRIPTIVE_PATTERNS:
        matches = re.findall(pattern, sanitized_text, flags=re.IGNORECASE)
        if matches:
            warnings.append(f"Blocked prescriptive drug/dosage statement matching pattern: {pattern}")
            sanitized_text = re.sub(
                pattern,
                "consult your doctor regarding whether any medication or dosage is indicated",
                sanitized_text,
                flags=re.IGNORECASE
            )

    for disclaimer in (
        MANDATORY_DISCLAIMER_EN,
        MANDATORY_DISCLAIMER_UR,
        LEGACY_DISCLAIMER_EN,
        LEGACY_DISCLAIMER_UR,
    ):
        sanitized_text = re.sub(
            rf"(?:\s*---\s*)?\s*(?:\*\*)?{re.escape(disclaimer)}(?:\*\*)?",
            "",
            sanitized_text,
            flags=re.IGNORECASE,
        )

    sanitized_text = re.sub(
        r"(?im)^\s*#{1,6}\s*Overall Health Insight\s*$",
        "",
        sanitized_text,
    )
    sanitized_text = re.sub(r"(?m)^\s*---\s*$", "", sanitized_text)
    sanitized_text = re.sub(r"[ \t]+\n", "\n", sanitized_text)
    sanitized_text = re.sub(r"\n{3,}", "\n\n", sanitized_text).strip()

    return sanitized_text, warnings
