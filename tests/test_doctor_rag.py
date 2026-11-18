import pytest
from backend.modules.doctors import rag_retriever
from backend.modules.doctors.synthesizer import DoctorRAGService
from backend.modules.doctors.retriever import search_doctors_in_dataset
from backend.models.schemas import DoctorSearchQuery


def test_doctor_search_heart_symptom():
    query = DoctorSearchQuery(query="consult with doctor about heart", limit=5)
    res = DoctorRAGService.search(query)
    assert res.total_found > 0
    # At least one returned doctor must have Cardiology specialty
    specs = [s.lower() for d in res.doctors for s in d.specializations]
    assert any("cardio" in s for s in specs)


def test_doctor_search_city_filter():
    query = DoctorSearchQuery(query="Skin specialist in Quetta", city="Quetta", specialization="Dermatologist", limit=5)
    res = DoctorRAGService.search(query)
    assert res.total_found > 0
    for d in res.doctors:
        assert d.city.lower() == "quetta"
        assert any("dermatolog" in s.lower() for s in d.specializations)


def test_doctor_search_max_fee_budget():
    max_fee = 1500
    query = DoctorSearchQuery(query="General Physician", city="Lahore", max_fee=max_fee, limit=5)
    res = DoctorRAGService.search(query)
    assert res.total_found > 0
    for d in res.doctors:
        assert d.fee_pkr <= max_fee


def test_zero_hallucination_verification():
    # Doctors must have verified genuine data (not fabricated)
    query = DoctorSearchQuery(query="Child specialist in Lahore", limit=3)
    res = DoctorRAGService.search(query)
    assert res.total_found > 0
    for d in res.doctors:
        assert d.doctor_name
        assert d.city
        assert d.specialization_primary
        assert d.experience_years >= 0
        assert d.total_reviews >= 0
        assert 0 <= d.patient_satisfaction_pct <= 100


def test_doctor_search_returns_unique_doctor_ids():
    query = DoctorSearchQuery(
        query="lung specialist in Lahore",
        city="Lahore",
        limit=20,
    )
    results = search_doctors_in_dataset(query)
    doctor_ids = [doctor.id for doctor in results]

    assert len(doctor_ids) == len(set(doctor_ids))


def test_cardio_query_does_not_return_unrelated_doctors_in_requested_city():
    query = DoctorSearchQuery(
        query="Tell me cardio doctors in Lahore",
        city="Lahore",
        limit=6,
    )
    results = search_doctors_in_dataset(query)

    assert results == []


def test_embedding_search_filters_cardio_results_by_specialty_and_city(monkeypatch):
    def indexed_doctor(name, specialty, city):
        return {
            "raw_hash": name,
            "doctor_name": name,
            "title_prefix": "Dr.",
            "city": city,
            "specialization_primary": specialty,
            "specializations": [specialty],
            "qualifications": "MBBS",
            "experience_years": 10,
            "total_reviews": 20,
            "patient_satisfaction_pct": 95,
            "avg_time_to_patients_mins": 10,
            "wait_time_mins": 10,
            "hospital_name": "Test Hospital",
            "hospital_address": "Test Address",
            "profile_url": None,
            "fee_pkr": 1000,
            "search_document": f"Doctor {name}, {specialty}, {city}",
            "embedding": [1.0],
        }

    monkeypatch.setattr(
        rag_retriever,
        "get_embeddings",
        lambda: [
            indexed_doctor("Lahore Cardiologist", "Cardiologist", "Lahore"),
            indexed_doctor("Lahore Orthopedic", "Orthopedic Surgeon", "Lahore"),
            indexed_doctor("Karachi Cardiologist", "Cardiologist", "Karachi"),
        ],
    )
    monkeypatch.setattr(rag_retriever, "generate_query_embedding", lambda _: [1.0])

    results = rag_retriever.search_doctors_rag(
        DoctorSearchQuery(query="cardio doctors in Lahore", city="Lahore", limit=6)
    )

    assert [doctor.doctor_name for doctor in results] == ["Lahore Cardiologist"]
