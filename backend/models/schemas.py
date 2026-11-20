from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator


# ------------------------------------------------------------------------------
# 1. SYSTEM HEALTH SCHEMAS
# ------------------------------------------------------------------------------
class SystemHealthResponse(BaseModel):
    status: str
    version: str = "2.0.0"
    supabase_configured: bool
    gemini_configured: bool
    missing_configurations: List[str] = []


class DoctorAssistantChatRequest(BaseModel):
    user_message: str = Field(min_length=1, max_length=4000)

    @field_validator("user_message")
    @classmethod
    def strip_user_message(cls, value: str) -> str:
        message = value.strip()
        if not message:
            raise ValueError("Message cannot be blank.")
        return message


class DoctorAssistantChatResponse(BaseModel):
    reply: str = Field(min_length=1)


# ------------------------------------------------------------------------------
# 2. MEDICAL REPORT EXPLAINER SCHEMAS
# ------------------------------------------------------------------------------
class BiomarkerItem(BaseModel):
    name: str = Field(description="Name of the test or biomarker, e.g. Hemoglobin, Fasting Blood Sugar")
    observed_value: str = Field(description="Patient's test value with unit, e.g. 9.5 g/dL")
    reference_range: str = Field(description="Standard reference interval, e.g. 12.0 - 15.5 g/dL")
    status: str = Field(description="'NORMAL', 'LOW', 'ELEVATED', or 'INDETERMINATE'")
    clinical_note_layman: str = Field(description="Plain-language definition of what this marker measures")


class ReportExplanationResponse(BaseModel):
    id: Optional[str] = None
    report_title: str
    detected_category: str
    language: str = "en"
    biomarkers: List[BiomarkerItem]
    abnormal_findings_summary: str
    overall_health_insight: str
    suggested_questions_for_doctor: List[str]
    dietary_lifestyle_considerations: List[str] = []
    key_takeaways: List[str] = []
    mandatory_disclaimer: str


# ------------------------------------------------------------------------------
# 3. DOCTOR RAG SEARCH SCHEMAS
# ------------------------------------------------------------------------------
    request_status: str
    created_at: str


# ------------------------------------------------------------------------------
# 4. DOCTOR RAG SEARCH SCHEMAS
# ------------------------------------------------------------------------------
class DoctorSearchQuery(BaseModel):
    query: str = Field(description="Natural language query, e.g. 'Affordable child specialist in Lahore'")
    city: Optional[str] = None
    specialization: Optional[str] = None
    max_fee: Optional[int] = None
    min_experience_years: Optional[float] = None
    min_satisfaction_rate: Optional[float] = None
    limit: int = Field(default=6, ge=1, le=20)


class VerifiedDoctor(BaseModel):
    id: str
    doctor_name: str
    title_prefix: str
    city: str
    specialization_primary: str
    specializations: List[str]
    qualifications: str
    experience_years: float
    total_reviews: int
    patient_satisfaction_pct: float
    avg_time_to_patients_mins: int
    wait_time_mins: int
    hospital_name: Optional[str] = None
    hospital_address: Optional[str] = None
    profile_url: Optional[str] = None
    fee_pkr: int
    relevance_score: float = 1.0
    recommendation_reason: str


class DoctorSearchResponse(BaseModel):
    total_found: int
    query_interpreted: str
    applied_filters: Dict[str, Any]
    grounded_summary: str
    doctors: List[VerifiedDoctor]


class DoctorFilterMetaResponse(BaseModel):
    cities: List[str]
    specializations: List[str]
    total_doctors: int
