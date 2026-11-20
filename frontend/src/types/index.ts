export type Language = 'en' | 'ur';

export type BiomarkerStatus = 'NORMAL' | 'LOW' | 'ELEVATED' | 'INDETERMINATE';

export interface BiomarkerItem {
  name: string;
  observed_value: string;
  reference_range: string;
  status: BiomarkerStatus;
  clinical_note_layman: string;
}

export interface ReportExplanationResponse {
  id?: string;
  report_title: string;
  detected_category: string;
  language: Language;
  biomarkers: BiomarkerItem[];
  abnormal_findings_summary: string;
  overall_health_insight: string;
  suggested_questions_for_doctor: string[];
  dietary_lifestyle_considerations: string[];
  mandatory_disclaimer: string;
}

export interface VerifiedDoctor {
  id: string;
  doctor_name: string;
  title_prefix: string;
  city: string;
  specialization_primary: string;
  specializations: string[];
  qualifications: string;
  experience_years: number;
  total_reviews: number;
  patient_satisfaction_pct: number;
  avg_time_to_patients_mins: number;
  wait_time_mins: number;
  hospital_name?: string | null;
  hospital_address?: string | null;
  profile_url?: string | null;
  fee_pkr: number;
  relevance_score: number;
  recommendation_reason: string;
}

export interface DoctorSearchQuery {
  query: string;
  city?: string;
  specialization?: string;
  max_fee?: number;
  min_experience_years?: number;
  min_satisfaction_rate?: number;
  limit?: number;
}

export interface DoctorSearchResponse {
  total_found: number;
  query_interpreted: string;
  applied_filters: Record<string, unknown>;
  grounded_summary: string;
  doctors: VerifiedDoctor[];
}

export interface DoctorFilterMetaResponse {
  cities: string[];
  specializations: string[];
  total_doctors: number;
}

export interface SystemHealthResponse {
  status: string;
  version: string;
  supabase_configured: boolean;
  gemini_configured: boolean;
  missing_configurations: string[];
}

export interface DoctorAssistantChatResponse {
  reply: string;
}

// ------------------------------------------------------------------------------
// Eye-blink communication types
// ------------------------------------------------------------------------------
export interface BlinkEventIn {
  event_type: 'blink_start' | 'blink_end' | 'blink_complete';
  timestamp_ms: number;
  duration_ms?: number;
  ear_left?: number;
  ear_right?: number;
}

export interface BlinkEventOut {
  event_type: string;
  timestamp_ms: number;
  duration_ms?: number;
  symbol?: string;
  composed_text: string;
}

export interface CalibrateRequest {
  user_id: string;
  open_ear_samples: number[];
  closed_ear_samples: number[];
  k?: number;
}

export interface CalibrateResponse {
  user_id: string;
  ear_threshold_open: number;
  ear_threshold_closed: number;
  open_mean: number;
  open_std: number;
  closed_mean: number;
  n_open: number;
  n_closed: number;
}

export interface EyeCommSessionResponse {
  session_id: string;
  user_id?: string;
  composed_text: string;
  created_at: string;
  updated_at: string;
  event_count: number;
}

export interface BlinkEventsRequest {
  events: BlinkEventIn[];
  user_id?: string;
  timestamp_ms?: number;
}

export interface BlinkEventsResponse {
  events: BlinkEventOut[];
  session: EyeCommSessionResponse | null;
}

