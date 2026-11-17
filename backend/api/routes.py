from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from backend.core.config import settings
from backend.models.schemas import (
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

router = APIRouter(prefix="/api/v1")


# ------------------------------------------------------------------------------
# 1. SYSTEM HEALTH
# ------------------------------------------------------------------------------
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
        return {"success": True, "message": "Donor registered successfully", "data": res}
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
