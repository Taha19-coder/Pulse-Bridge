import pytest
from unittest.mock import AsyncMock, Mock, patch
from fastapi.testclient import TestClient
from backend.main import app
from backend.modules.doctors.nvidia_client import call_nvidia_chat

client = TestClient(app)


def test_api_health_endpoint():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["version"] == "2.0.0"
    assert "status" in data


def test_api_rag_chat_endpoint_uses_chat_service():
    with patch("backend.api.routes.call_nvidia_chat", new_callable=AsyncMock) as chat_service:
        chat_service.return_value = "I can help with general health information."

        response = client.post(
            "/api/v1/rag/chat",
            json={"user_message": "Can you help me understand a health term?"},
        )

    assert response.status_code == 200
    assert response.json() == {"reply": "I can help with general health information."}
    chat_service.assert_awaited_once_with("Can you help me understand a health term?")


def test_api_rag_chat_returns_grounded_doctor_results_as_points():
    doctors = [
        Mock(
            doctor_name="Dr. Example One",
            specialization_primary="Cardiologist",
            hospital_name="Heart Care Clinic",
            city="Lahore",
            fee_pkr=2500,
            experience_years=12,
        ),
        Mock(
            doctor_name="Dr. Example Two",
            specialization_primary="Cardiologist",
            hospital_name="City Medical Center",
            city="Lahore",
            fee_pkr=3000,
            experience_years=8,
        ),
    ]

    with (
        patch(
            "backend.api.routes.DoctorRAGService.get_filter_meta",
            return_value=Mock(cities=["Lahore"]),
        ),
        patch(
            "backend.api.routes.DoctorRAGService.search",
            return_value=Mock(doctors=doctors),
        ) as doctor_search,
        patch("backend.api.routes.call_nvidia_chat", new_callable=AsyncMock) as chat_service,
    ):
        response = client.post(
            "/api/v1/rag/chat",
            json={"user_message": "Tell me cardio doctors in Lahore"},
        )

    assert response.status_code == 200
    reply = response.json()["reply"]
    assert "Verified cardiologists in Lahore:" in reply
    assert "1. Dr. Example One — Cardiologist" in reply
    assert "Hospital/clinic: Heart Care Clinic" in reply
    assert "2. Dr. Example Two — Cardiologist" in reply
    assert doctor_search.call_args.args[0].city == "Lahore"
    assert doctor_search.call_args.args[0].specialization == "Cardiologist"
    chat_service.assert_not_awaited()


def test_api_rag_chat_reports_when_no_verified_cardiologists_match():
    with (
        patch(
            "backend.api.routes.DoctorRAGService.get_filter_meta",
            return_value=Mock(cities=["Lahore"]),
        ),
        patch(
            "backend.api.routes.DoctorRAGService.search",
            return_value=Mock(doctors=[]),
        ),
    ):
        response = client.post(
            "/api/v1/rag/chat",
            json={"user_message": "Tell me cardio doctors in Lahore"},
        )

    assert response.status_code == 200
    assert response.json()["reply"] == (
        "No verified cardiologists in Lahore were found in the doctor directory. "
        "Try another city or specialty."
    )


def test_api_rag_chat_searches_donors_by_exact_blood_group():
    donors = [
        Mock(full_name="Eligible O Negative Donor", blood_group="O-", city="Lahore", eligible_now=True),
        Mock(full_name="Other Blood Group Donor", blood_group="A+", city="Lahore", eligible_now=True),
        Mock(full_name="Ineligible O Negative Donor", blood_group="O-", city="Lahore", eligible_now=False),
    ]
    with (
        patch(
            "backend.api.routes.BloodDonorService.match_donors",
            return_value=Mock(donors=donors),
        ) as donor_search,
        patch("backend.api.routes.call_nvidia_chat", new_callable=AsyncMock) as chat_service,
    ):
        response = client.post(
            "/api/v1/rag/chat",
            json={"user_message": "Show O- donors in Lahore"},
        )

    assert response.status_code == 200
    reply = response.json()["reply"]
    assert "Eligible O Negative Donor" in reply
    assert "Other Blood Group Donor" not in reply
    assert "Ineligible O Negative Donor" not in reply
    assert "Contact details are not shown in chat" in reply
    search_request = donor_search.call_args.args[0]
    assert search_request.recipient_blood_group == "O-"
    assert search_request.city == "Lahore"
    assert search_request.only_available
    chat_service.assert_not_awaited()


def test_api_rag_chat_uses_gemini_when_nvidia_fails():
    with (
        patch(
            "backend.api.routes.call_nvidia_chat",
            new_callable=AsyncMock,
            side_effect=RuntimeError("NVIDIA model is unavailable"),
        ),
        patch(
            "backend.api.routes.call_gemini_chat",
            new_callable=AsyncMock,
            return_value="I can share general health information.",
        ) as gemini_service,
    ):
        response = client.post(
            "/api/v1/rag/chat",
            json={"user_message": "Can you help me understand a health term?"},
        )

    assert response.status_code == 200
    assert response.json() == {"reply": "I can share general health information."}
    gemini_service.assert_awaited_once_with("Can you help me understand a health term?")


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"user_message": "   "},
        {"user_message": "a" * 4001},
    ],
)
def test_api_rag_chat_rejects_invalid_messages(payload):
    response = client.post("/api/v1/rag/chat", json=payload)

    assert response.status_code == 422


def test_api_rag_chat_reports_missing_provider_configuration():
    with (
        patch("backend.api.routes.settings.NVIDIA_NIMS_API_KEY", ""),
        patch("backend.api.routes.settings.GEMINI_API_KEY", ""),
    ):
        response = client.post(
            "/api/v1/rag/chat",
            json={"user_message": "Can you help me understand a health term?"},
        )

    assert response.status_code == 503
    assert "NVIDIA_NIMS_API_KEY or GEMINI_API_KEY" in response.json()["detail"]


def test_api_rag_chat_reports_provider_failure():
    with (
        patch(
            "backend.api.routes.call_nvidia_chat",
            new_callable=AsyncMock,
            side_effect=TimeoutError(),
        ),
        patch(
            "backend.api.routes.call_gemini_chat",
            new_callable=AsyncMock,
            side_effect=TimeoutError(),
        ),
    ):
        response = client.post(
            "/api/v1/rag/chat",
            json={"user_message": "Can you help me understand a health term?"},
        )

    assert response.status_code == 503
    assert response.json() == {
        "detail": "The AI assistant is temporarily unavailable. Check backend provider logs and try again."
    }


@pytest.mark.asyncio
async def test_nvidia_chat_uses_configured_model_and_parses_reply():
    response = Mock()
    response.json.return_value = {
        "choices": [{"message": {"content": "A provider response"}}]
    }
    response.raise_for_status.return_value = None

    client = AsyncMock()
    client.__aenter__.return_value = client
    client.post.return_value = response

    with (
        patch(
            "backend.modules.doctors.nvidia_client.httpx.AsyncClient",
            return_value=client,
        ),
        patch("backend.modules.doctors.nvidia_client.settings.NVIDIA_NIMS_API_KEY", "test-key"),
        patch(
            "backend.modules.doctors.nvidia_client.settings.NVIDIA_NIMS_CHAT_MODEL",
            "test/model",
        ),
    ):
        reply = await call_nvidia_chat("Test question")

    assert reply == "A provider response"
    request = client.post.await_args
    assert request.args[0] == "https://integrate.api.nvidia.com/v1/chat/completions"
    assert request.kwargs["json"]["model"] == "test/model"
    assert request.kwargs["json"]["messages"] == [{"role": "user", "content": "Test question"}]


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
