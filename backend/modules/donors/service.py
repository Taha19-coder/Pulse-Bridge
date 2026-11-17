import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional

import pandas as pd

from backend.core.config import settings
from backend.core.supabase_client import get_supabase_client
from backend.models.schemas import (
    BloodMatchRequest,
    BloodMatchResponse,
    DonorRegistrationRequest,
    BloodRequestCreate,
    BloodRequestResponse,
)
from backend.modules.donors.matcher import rank_and_format_donors, normalize_pakistan_phone

DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data"
CSV_PATH = DATA_DIR / "blood_donors.csv"
DONOR_REGISTRY_CSV_PATH = DATA_DIR / "donor_registrations.csv"
DONOR_REGISTRY_XLSX_PATH = DATA_DIR / "donor_registrations.xlsx"
DONOR_REGISTRY_COLUMNS = [
    "donor_code",
    "full_name",
    "age",
    "gender",
    "blood_group",
    "city",
    "area",
    "full_address",
    "contact_number",
    "availability_status",
    "last_donation_date",
    "user_id",
    "registered_at",
]


def load_seed_donors_from_csv() -> List[Dict[str, Any]]:
    """
    Reads the verified raw blood_donors.csv file non-destructively.
    """
    if not CSV_PATH.exists():
        return []
    df = pd.read_csv(CSV_PATH)
    donors = []
    for _, row in df.iterrows():
        donors.append({
            "donor_code": str(row["Donor_ID"]),
            "full_name": str(row["Full_Name"]),
            "age": int(row["Age"]),
            "gender": str(row["Gender"]),
            "blood_group": str(row["Blood_Group"]),
            "city": str(row["City"]),
            "area": str(row["Address"]).split(",")[2].strip() if len(str(row["Address"]).split(",")) > 2 else "Central",
            "full_address": str(row["Address"]),
            "contact_number": str(row["Contact_Number"]),
            "availability_status": str(row["Availability"]),
            "last_donation_date": str(row["Last_Donation_Date"]),
        })
    return donors


class BloodDonorService:
    @staticmethod
    def _ensure_local_registry_files() -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)

        if not DONOR_REGISTRY_CSV_PATH.exists() or DONOR_REGISTRY_CSV_PATH.stat().st_size == 0:
            pd.DataFrame(columns=DONOR_REGISTRY_COLUMNS).to_csv(DONOR_REGISTRY_CSV_PATH, index=False)

        try:
            if not DONOR_REGISTRY_XLSX_PATH.exists():
                pd.read_csv(DONOR_REGISTRY_CSV_PATH).to_excel(DONOR_REGISTRY_XLSX_PATH, index=False)
        except Exception as exc:
            print(f"[BloodDonorService] Temporary Excel registry unavailable: {exc}")

    @staticmethod
    def _persist_local_registry_record(record: Dict[str, Any]) -> None:
        BloodDonorService._ensure_local_registry_files()

        try:
            if DONOR_REGISTRY_CSV_PATH.exists() and DONOR_REGISTRY_CSV_PATH.stat().st_size > 0:
                donor_df = pd.read_csv(DONOR_REGISTRY_CSV_PATH)
            else:
                donor_df = pd.DataFrame(columns=DONOR_REGISTRY_COLUMNS)
        except Exception:
            donor_df = pd.DataFrame(columns=DONOR_REGISTRY_COLUMNS)

        donor_row = {column: record.get(column, "") for column in DONOR_REGISTRY_COLUMNS}
        donor_df = pd.concat([donor_df, pd.DataFrame([donor_row])], ignore_index=True)
        donor_df.to_csv(DONOR_REGISTRY_CSV_PATH, index=False)

        try:
            donor_df.to_excel(DONOR_REGISTRY_XLSX_PATH, index=False)
        except Exception as exc:
            print(f"[BloodDonorService] Could not refresh donor registry workbook: {exc}")

    @staticmethod
    def match_donors(request: BloodMatchRequest) -> BloodMatchResponse:
        """
        Retrieves donors from Supabase (or seed CSV if Supabase is initializing).
        Applies blood compatibility rules and proximity hierarchy.
        """
        records: List[Dict[str, Any]] = []

        try:
            supabase = get_supabase_client()
            response = supabase.table("donors").select("*").execute()
            if response.data and len(response.data) > 0:
                records = response.data
        except Exception as e:
            # If Supabase not yet migrated, fall back to seed CSV
            print(f"[BloodDonorService] Falling back to verified CSV seed data: {e}")
            records = load_seed_donors_from_csv()

        if not records:
            records = load_seed_donors_from_csv()

        return rank_and_format_donors(records, request)

    @staticmethod
    def register_donor(data: DonorRegistrationRequest, user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Registers a new voluntary donor in Supabase and keeps a temporary local spreadsheet backup.
        """
        normalized_phone = normalize_pakistan_phone(data.contact_number)
        donor_code = f"PKD{uuid.uuid4().hex[:6].upper()}"

        record = {
            "donor_code": donor_code,
            "full_name": data.full_name,
            "age": data.age,
            "gender": data.gender,
            "blood_group": data.blood_group.upper(),
            "city": data.city.title(),
            "area": data.area or "General City Area",
            "full_address": data.address,
            "contact_number": normalized_phone,
            "availability_status": data.availability,
            "last_donation_date": data.last_donation_date,
            "user_id": user_id,
            "registered_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }

        try:
            supabase = get_supabase_client()
            res = supabase.table("donors").insert(record).execute()
            if res.data:
                saved_record = dict(res.data[0])
                BloodDonorService._persist_local_registry_record(saved_record)
                return saved_record
        except Exception as e:
            print(f"[BloodDonorService] Notice: Supabase insert deferred ({e})")

        BloodDonorService._persist_local_registry_record(record)
        return record

    @staticmethod
    def create_blood_request(data: BloodRequestCreate, requester_id: Optional[str] = None) -> BloodRequestResponse:
        """
        Broadcasts an emergency blood request.
        """
        req_id = str(uuid.uuid4())
        req_code = f"REQ-{uuid.uuid4().hex[:6].upper()}"

        record = {
            "id": req_id,
            "request_code": req_code,
            "patient_name": data.patient_name,
            "blood_group_needed": data.blood_group_needed.upper(),
            "units_required": data.units_required,
            "city": data.city.title(),
            "hospital_name": data.hospital_name,
            "urgency_level": data.urgency_level,
            "contact_person": data.contact_person,
            "contact_phone": normalize_pakistan_phone(data.contact_phone),
            "request_status": "Open",
            "requester_id": requester_id
        }

        try:
            supabase = get_supabase_client()
            res = supabase.table("blood_requests").insert(record).execute()
            if res.data:
                item = res.data[0]
                return BloodRequestResponse(**item)
        except Exception as e:
            print(f"[BloodDonorService] Notice: Supabase insert deferred ({e})")

        return BloodRequestResponse(
            **record,
            created_at=pd.Timestamp.now().isoformat()
        )

    @staticmethod
    def list_blood_requests(limit: int = 20) -> List[BloodRequestResponse]:
        """
        Lists all open emergency blood requests.
        """
        try:
            supabase = get_supabase_client()
            res = supabase.table("blood_requests").select("*").eq("request_status", "Open").order("created_at", desc=True).limit(limit).execute()
            if res.data:
                return [BloodRequestResponse(**item) for item in res.data]
        except Exception:
            pass
        return []
