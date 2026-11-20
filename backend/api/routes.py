import logging
import re
from typing import List, Optional, Tuple
from pydantic import BaseModel, Field
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
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
)
from backend.modules.report.explainer import ReportExplainerService
from backend.modules.doctors.synthesizer import DoctorRAGService
from backend.modules.doctors.gemini_client import call_gemini_chat
from backend.modules.doctors.nvidia_client import call_nvidia_chat
from backend.modules.doctors.openrouter_client import call_openrouter_chat
from backend.modules.eye_comm.eye_capture import (
    CAPTURE_DIR,
    get_eye_capture,
    list_eye_captures,
    save_eye_capture,
)
from backend.modules.eye_comm.frame_detector import process_frame_base64
from backend.modules.eye_comm.service import EyeCommService
from backend.modules.eye_comm.schemas import (
    BlinkEventIn,
    BlinkEventOut,
    CalibrateRequest,
    CalibrateResponse,
    EyeCommSessionResponse,
)

router = APIRouter(prefix="/api/v1")
logger = logging.getLogger(__name__)

# ------------------------------------------------------------------------------
# Eye-blink communication service (singleton)
# ------------------------------------------------------------------------------
_eye_comm_service = EyeCommService()

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


@router.post(
    "/rag/chat",
    response_model=DoctorAssistantChatResponse,
    tags=["Doctor RAG"],
)
async def rag_chat_endpoint(request: DoctorAssistantChatRequest):
    """Answer doctor-directory requests from verified records; use AI for other chat.
    This endpoint is used by the floating chat button in the UI.
    """
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
# 5. EYE-BLINK COMMUNICATION (Assistive Technology)
# ------------------------------------------------------------------------------
@router.post(
    "/eye-comm/calibrate",
    response_model=CalibrateResponse,
    tags=["Eye-Blink Communication"],
)
def calibrate_eye_comm(request: CalibrateRequest):
    """
    Calibrate per-user eye-openness thresholds.

    The user blinks naturally while the frontend collects EAR samples with eyes
    open and eyes closed. The backend derives thresholds used to distinguish
    intentional blinks from noise.
    """
    try:
        return _eye_comm_service.calibrate(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Calibration error: {str(e)}")


class BlinkEventsRequest(BaseModel):
    events: List[BlinkEventIn]
    user_id: Optional[str] = None
    timestamp_ms: Optional[float] = None


@router.post(
    "/eye-comm/events",
    tags=["Eye-Blink Communication"],
)
async def submit_blink_events(request: BlinkEventsRequest):
    """
    Submit blink events from the frontend.

    The frontend runs MediaPipe blink detection in-browser and sends blink
    events (start, end, complete) to the backend. The backend maintains the
    composition state (Morse decoding) and returns the updated composed text.
    """
    try:
        outs, session = _eye_comm_service.process_blink_events(
            events=request.events,
            user_id=request.user_id,
            timestamp_ms=request.timestamp_ms,
        )
        return {
            "events": outs,
            "session": session,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Blink event processing error: {str(e)}")


class FrameDetectRequest(BaseModel):
    frame_b64: str = Field(description="Base64-encoded JPEG image (may include data URL prefix)")
    timestamp_ms: float = Field(description="Monotonic timestamp in milliseconds")
    user_id: Optional[str] = None


@router.post(
    "/eye-comm/frame",
    tags=["Eye-Blink Communication"],
)
async def detect_blink_from_frame(request: FrameDetectRequest):
    """
    Detect blinks from a camera frame sent by the frontend.

    The frontend captures a video frame, encodes it as base64 JPEG, and sends
    it here. The backend runs OpenCV blink detection and returns blink events
    plus the updated composed text. This is a fallback when in-browser
    MediaPipe is unavailable (e.g., WASM issues).
    """
    try:
        events, _ = process_frame_base64(
            frame_b64=request.frame_b64,
            timestamp_ms=request.timestamp_ms,
        )

        # Convert backend events to BlinkEventIn and process through the
        # encoder to maintain composition state.
        blink_events = [
            BlinkEventIn(
                event_type=e["event_type"],
                timestamp_ms=e["timestamp_ms"],
                duration_ms=e.get("duration_ms"),
            )
            for e in events
        ]

        outs, session = _eye_comm_service.process_blink_events(
            events=blink_events,
            user_id=request.user_id,
            timestamp_ms=request.timestamp_ms,
        )
        return {
            "events": outs,
            "session": session,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Frame detection error: {str(e)}")


@router.get(
    "/eye-comm/session/{session_id}",
    response_model=EyeCommSessionResponse,
    tags=["Eye-Blink Communication"],
)
def get_eye_comm_session(session_id: str):
    """
    Retrieve a previously saved eye-blink communication session.
    """
    session = _eye_comm_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get(
    "/eye-comm/captures",
    tags=["Eye-Blink Communication"],
)
def list_eye_captures_endpoint(
    user_id: Optional[str] = None,
    limit: int = Field(default=50, ge=1, le=200),
):
    """
    List saved eye captures, newest first.
    """
    captures = list_eye_captures(user_id=user_id, limit=limit)
    return {"captures": captures, "total": len(captures)}


@router.get(
    "/eye-comm/captures/{capture_id}",
    tags=["Eye-Blink Communication"],
)
def get_eye_capture_endpoint(capture_id: str):
    """
    Get metadata for a specific eye capture.
    """
    capture = get_eye_capture(capture_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    return capture


@router.get(
    "/eye-comm/captures/{capture_id}/image",
    tags=["Eye-Blink Communication"],
)
def get_eye_capture_image(capture_id: str):
    """
    Serve the actual image file for a captured eye capture.
    """
    image_path = CAPTURE_DIR / f"{capture_id}.jpg"
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path=str(image_path), media_type="image/jpeg")
