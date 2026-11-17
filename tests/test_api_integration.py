import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_api_health_endpoint():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["version"] == "2.0.0"
    assert "status" in data


def test_api_doctor_search_endpoint():
    payload = {
        "query": "Heart doctor in Faisalabad",
        "limit": 3
    }
    response = client.post("/api/v1/doctors/search", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "doctors" in data
    assert len(data["doctors"]) > 0
    assert "grounded_summary" in data


def test_api_blood_match_endpoint():
    payload = {
        "recipient_blood_group": "B+",
        "city": "Lahore",
        "urgency": "Emergency",
        "only_available": True
    }
    response = client.post("/api/v1/blood/match", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["recipient_group"] == "B+"
    assert len(data["donors"]) > 0


def test_api_report_explain_endpoint():
    sample_content = b"Hemoglobin: 9.8 g/dL (Reference: 12.0 - 15.5)\nWBC: 6000 /uL"
    files = {"file": ("test.txt", sample_content, "text/plain")}
    data = {"language": "en", "disclaimer_accepted": "true"}

    response = client.post("/api/v1/reports/explain", files=files, data=data)
    assert response.status_code == 200
    res_data = response.json()
    assert "biomarkers" in res_data
    assert len(res_data["biomarkers"]) > 0
    assert "mandatory_disclaimer" in res_data
