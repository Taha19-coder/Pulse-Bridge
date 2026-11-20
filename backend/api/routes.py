import logging
import re
from typing import List, Optional, Tuple
from pydantic import BaseModel, Field
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
import httpx
from backend.core.config import settings
from backend.models.schemas import (
    DoctorAssistantChatRequest,
    DoctorAssistantChatResponse,
    SystemHealthResponse,
    ReportExplanationResponse,
    DoctorSearchQuery,
    DoctorSearchResponse,
    DoctorFilterMetaResponse,
    BloodMatchRequest,
    BloodMatchResponse,
    DonorRegistrationRequest,
    BloodRequestCreate,
    BloodRequestResponse,
)
from backend.modules.report.explainer import ReportExplainerService
from backend.modules.donors.service import BloodDonorService
from backend.modules.doctors.synthesizer import DoctorRAGService
from backend.modules.doctors.gemini_client import call_gemini_chat
from backend.modules.doctors.nvidia_client import call_nvidia_chat
from backend.modules.doctors.openrouter_client import call_openrouter_chat

router = APIRouter(prefix="/api/v1")
logger = logging.getLogger(__name__)

_DOCTOR_SEARCH_TERMS = re.compile(
    r"\b(?:doctors?|physicians?|specialists?|cardio(?:logy|logist|logists)?|cardiac|heart)\b",
    re.IGNORECASE,
)
_DOCTOR_SEARCH_ACTIONS = re.compile(
    r"\b(?:find|search|list|show|recommend|suggest|looking\s+for|give\s+me)\b",
    re.IGNORECASE,
)
_CARDIOLOGY_TERMS = re.compile(
    r"\b(?:cardio(?:logy|logist|logists)?|cardiac|heart)\b",
    re.IGNORECASE,
)
_BLOOD_GROUP_PATTERN = re.compile(
    r"(?<![A-Za-z])(?P<group>AB|A|B|O)\s*(?P<rh>[+-]|positive|negative)(?![A-Za-z])",
    re.IGNORECASE,
)
_DONOR_SEARCH_TERMS = re.compile(r"\b(?:donors?|donat(?:e|ion|ing)s?)\b", re.IGNORECASE)
_COMPATIBLE_DONOR_TERMS = re.compile(
    r"\b(?:compatible|can\s+donate|donate\s+to|recipient|need|needs|for)\b",
    re.IGNORECASE,
)
_DONOR_CITY_PATTERN = re.compile(
    r"\b(?:in|near|around)\s+([A-Za-z][A-Za-z -]*?)"
    r"(?=\s+(?:for|with|who|available|please|and|needed|urgent)\b|[?.!,;]|$)",
    re.IGNORECASE,
)


def _doctor_search_query(user_message: str) -> DoctorSearchQuery | None:
    if not _DOCTOR_SEARCH_TERMS.search(user_message):
        return None

    cities = DoctorRAGService.get_filter_meta().cities
    city = next(
        (
            available_city
            for available_city in cities
            if re.search(rf"\b{re.escape(available_city)}\b", user_message, re.IGNORECASE)
        ),
        None,
    )
    if not city and not _DOCTOR_SEARCH_ACTIONS.search(user_message):
        return None

    specialization = "Cardiologist" if _CARDIOLOGY_TERMS.search(user_message) else None
    return DoctorSearchQuery(
        query=user_message,
        city=city,
        specialization=specialization,
    )


def _format_doctor_search_reply(search_result: DoctorSearchResponse, query: DoctorSearchQuery) -> str:
    if not search_result.doctors:
        specialty = "cardiologists" if query.specialization == "Cardiologist" else "doctors"
        location = f" in {query.city}" if query.city else ""
        return f"No verified {specialty}{location} were found in the doctor directory. Try another city or specialty."

    specialty = "cardiologists" if query.specialization == "Cardiologist" else "doctors"
    location = f" in {query.city}" if query.city else ""
    lines = [f"Verified {specialty}{location}:", ""]
    for index, doctor in enumerate(search_result.doctors, start=1):
        lines.append(f"{index}. {doctor.doctor_name} — {doctor.specialization_primary}")
        if doctor.hospital_name:
            lines.append(f"   - Hospital/clinic: {doctor.hospital_name}")
        lines.append(f"   - City: {doctor.city}")
        lines.append(f"   - Consultation fee: PKR {doctor.fee_pkr}")
        lines.append(f"   - Experience: {doctor.experience_years:.0f} years")
    return "\n".join(lines)


def _donor_search_request(user_message: str) -> Optional[Tuple[str, Optional[str], bool]]:
    if not _DONOR_SEARCH_TERMS.search(user_message):
        return None

    match = _BLOOD_GROUP_PATTERN.search(user_message)
    if not match:
        return None

    rh_factor = match.group("rh").lower()
    blood_group = f"{match.group('group').upper()}{'+' if rh_factor in {'+', 'positive'} else '-'}"
    city_match = _DONOR_CITY_PATTERN.search(user_message)
    city = city_match.group(1).strip() if city_match else None
    is_compatibility_search = bool(_COMPATIBLE_DONOR_TERMS.search(user_message))
    return blood_group, city, is_compatibility_search


def _format_donor_search_reply(
    search_result: BloodMatchResponse,
    blood_group: str,
    city: Optional[str],
    is_compatibility_search: bool,
) -> str:
    donors = [
        donor
        for donor in search_result.donors
        if donor.eligible_now
        and (is_compatibility_search or donor.blood_group.upper() == blood_group)
    ]
    city_context = f" (prioritized by proximity to {city})" if city else ""
    if not donors:
        donor_description = (
            f"compatible donors for {blood_group}"
            if is_compatibility_search
            else f"donors with blood group {blood_group}"
        )
        return f"No available, donation-eligible {donor_description} were found{city_context}."

    donor_description = (
        f"compatible donors for recipient group {blood_group}"
        if is_compatibility_search
        else f"donors with blood group {blood_group}"
    )
    lines = [f"Available, donation-eligible {donor_description}{city_context}:", ""]
    for index, donor in enumerate(donors[:10], start=1):
        lines.append(f"{index}. {donor.full_name} — {donor.blood_group}, {donor.city}")
    if len(donors) > 10:
        lines.append(f"\nAnd {len(donors) - 10} more. Open Blood support to view the full donor list.")
    lines.append("\nContact details are not shown in chat; use Blood support to connect with a donor.")
    return "\n".join(lines)


@router.post(
    "/rag/chat",
    response_model=DoctorAssistantChatResponse,
    tags=["Doctor RAG"],
)
async def rag_chat_endpoint(request: DoctorAssistantChatRequest):
    """Answer doctor-directory requests from verified records; use AI for other chat.
    This endpoint is used by the floating chat button in the UI.
    """
    donor_query = _donor_search_request(request.user_message)
    if donor_query:
        blood_group, city, is_compatibility_search = donor_query
        search_result = BloodDonorService.match_donors(
            BloodMatchRequest(
                recipient_blood_group=blood_group,
                city=city or "All locations",
                only_available=True,
            )
        )
        return DoctorAssistantChatResponse(
            reply=_format_donor_search_reply(
                search_result,
                blood_group,
                city,
                is_compatibility_search,
            )
        )

    doctor_query = _doctor_search_query(request.user_message)
    if doctor_query:
        search_result = DoctorRAGService.search(doctor_query)
        return DoctorAssistantChatResponse(
            reply=_format_doctor_search_reply(search_result, doctor_query)
        )

    if not settings.NVIDIA_NIMS_API_KEY and not settings.GEMINI_API_KEY and not settings.OPENROUTER_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI chat is not configured. Set NVIDIA_NIMS_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY in backend/.env.",
        )

    # 1. Try NVIDIA NIM
    if settings.NVIDIA_NIMS_API_KEY:
        try:
            return DoctorAssistantChatResponse(
                reply=await call_nvidia_chat(request.user_message)
            )
        except Exception as nvidia_error:
            status_code = (
                nvidia_error.response.status_code
                if isinstance(nvidia_error, httpx.HTTPStatusError)
                else None
            )
            logger.warning(
                "NVIDIA chat provider failed (%s, HTTP %s); trying Gemini fallback",
                type(nvidia_error).__name__,
                status_code or "n/a",
            )

    # 2. Try Gemini
    if settings.GEMINI_API_KEY:
        try:
            return DoctorAssistantChatResponse(
                reply=await call_gemini_chat(request.user_message)
            )
        except Exception as gemini_error:
            status_code = getattr(gemini_error, "code", None) or getattr(
                gemini_error, "status_code", None
            )
            logger.warning(
                "Gemini chat fallback failed (%s, HTTP %s); trying OpenRouter fallback",
                type(gemini_error).__name__,
                status_code or "n/a",
            )
    else:
        logger.warning(
            "Gemini chat fallback is not configured; set GEMINI_API_KEY in backend/.env"
        )

    # 3. Try OpenRouter
    if settings.OPENROUTER_API_KEY:
        try:
            return DoctorAssistantChatResponse(
                reply=await call_openrouter_chat(request.user_message)
            )
        except Exception as openrouter_error:
            logger.warning(
                "OpenRouter chat fallback failed (%s)",
                type(openrouter_error).__name__,
            )
    else:
        logger.warning(
            "OpenRouter chat fallback is not configured; set OPENROUTER_API_KEY in backend/.env"
        )

    raise HTTPException(
        status_code=503,
        detail="The AI assistant is temporarily unavailable. Check backend provider logs and try again.",
    )

@router.get("/health", response_model=SystemHealthResponse, tags=["Health"])
def get_system_health():
    """
    Returns system status, Supabase configuration readiness, and AI service status.
    """
    missing = settings.validate_runtime_credentials()
    return SystemHealthResponse(
        status="HEALTHY" if not missing else "CONFIG_REQUIRED",
        version="2.0.0",
        supabase_configured=bool(settings.SUPABASE_URL and "your-project" not in settings.SUPABASE_URL),
        gemini_configured=bool(settings.GEMINI_API_KEY and "your-gemini" not in settings.GEMINI_API_KEY),
        missing_configurations=missing
    )


# ------------------------------------------------------------------------------
# 2. MEDICAL REPORT EXPLAINER
# ------------------------------------------------------------------------------
@router.post("/reports/explain", response_model=ReportExplanationResponse, tags=["Medical AI Explainer"])
async def explain_medical_report(
    file: UploadFile = File(...),
    language: str = Form("en"),
    disclaimer_accepted: bool = Form(True)
):
    """
    Upload a medical laboratory report (PDF, PNG, JPG, WebP) to receive a
    structured biomarker extraction and patient-friendly layman explanation in EN or UR.
    """
    if not disclaimer_accepted:
        raise HTTPException(
            status_code=400,
            detail="The mandatory medical disclaimer must be acknowledged before analyzing reports."
        )

    allowed_exts = (".pdf", ".png", ".jpg", ".jpeg", ".webp", ".txt")
    if not any(file.filename.lower().endswith(ext) for ext in allowed_exts):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format. Please upload one of: {', '.join(allowed_exts)}"
        )

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds maximum 10MB limit.")

    try:
        response = ReportExplainerService.process_and_explain(
            file_bytes=file_bytes,
            filename=file.filename,
            language=language
        )
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Medical report analysis error: {str(e)}")


# ------------------------------------------------------------------------------
# 3. DOCTOR FINDER USING GROUNDED RAG
# ------------------------------------------------------------------------------
@router.post("/doctors/search", response_model=DoctorSearchResponse, tags=["Doctor RAG"])
def search_doctors(query: DoctorSearchQuery):
    """
    Executes hybrid retrieval across the 2,652 verified doctor dataset.
    Never hallucinates or fabricates doctors.
    """
    try:
        return DoctorRAGService.search(query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Doctor search retrieval error: {str(e)}")


@router.get("/doctors/filters/meta", response_model=DoctorFilterMetaResponse, tags=["Doctor RAG"])
def get_doctor_filter_meta():
    """
    Returns unique cities and specialties for UI filter dropdowns.
    """
    return DoctorRAGService.get_filter_meta()


# ------------------------------------------------------------------------------
# 4. BLOOD DONOR MATCHING & REGISTRATION
# ------------------------------------------------------------------------------
@router.post("/blood/match", response_model=BloodMatchResponse, tags=["Blood Donor Network"])
def match_blood_donors(request: BloodMatchRequest):
    """
    Finds compatible voluntary donors according to ABO/Rh transfusion rules
    and proximity ranking (City + Area > City > Other).
    """
    try:
        return BloodDonorService.match_donors(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Blood donor matching error: {str(e)}")


@router.post("/blood/donors/register", tags=["Blood Donor Network"])
def register_donor(data: DonorRegistrationRequest):
    """
    Enrolls a community member into the voluntary donor registry.
    """
    try:
        res = BloodDonorService.register_donor(data)
        return {
            "success": True,
            "message": "Donor registered successfully and saved to the temporary donor registry sheet.",
            "data": res,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Donor registration error: {str(e)}")


@router.post("/blood/requests", response_model=BloodRequestResponse, tags=["Blood Donor Network"])
def broadcast_blood_request(data: BloodRequestCreate):
    """
    Broadcasts an urgent blood requirement for patient transfusion.
    """
    try:
        return BloodDonorService.create_blood_request(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Blood request creation error: {str(e)}")


@router.get("/blood/requests", response_model=List[BloodRequestResponse], tags=["Blood Donor Network"])
def list_blood_requests():
    """
    Lists open emergency blood requests.
    """
    return BloodDonorService.list_blood_requests()


