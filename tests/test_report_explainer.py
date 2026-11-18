import pytest
from backend.modules.report.explainer import ReportExplainerService
from backend.core.guardrails import (
    validate_and_sanitize_medical_text,
    MANDATORY_DISCLAIMER_EN,
    LEGACY_DISCLAIMER_EN,
)


def test_guardrails_prevent_unauthorized_diagnoses():
    violating_text = "Based on your test, you have leukemia and must take 500mg amoxicillin."
    sanitized, warnings = validate_and_sanitize_medical_text(violating_text, language="en")
    # Must have caught both diagnostic and prescriptive violations
    assert len(warnings) >= 2
    # The explicit diagnosis must be sanitized
    assert "you have leukemia" not in sanitized.lower()
    assert MANDATORY_DISCLAIMER_EN not in sanitized


def test_report_pipeline_extraction_and_disclaimer():
    sample_text = """
    LABORATORY TEST REPORT
    Hemoglobin: 9.5 g/dL (Reference: 12.0 - 15.5 g/dL)
    WBC Count: 7,200 /uL (Reference: 4,000 - 11,000 /uL)
    """
    res = ReportExplainerService.process_and_explain(
        file_bytes=sample_text.encode("utf-8"),
        filename="cbc_test.txt",
        language="en"
    )
    assert len(res.biomarkers) >= 2
    # Hemoglobin should be flagged as LOW
    hb = next((b for b in res.biomarkers if "hemoglobin" in b.name.lower()), None)
    assert hb is not None
    assert hb.status == "LOW"
    assert bool(res.mandatory_disclaimer)
    assert MANDATORY_DISCLAIMER_EN in res.mandatory_disclaimer
    assert MANDATORY_DISCLAIMER_EN not in res.abnormal_findings_summary
    assert MANDATORY_DISCLAIMER_EN not in res.overall_health_insight


def test_report_guardrails_remove_repeated_disclaimer_and_health_heading():
    text = (
        "Summary text.\n\n---\n**"
        + LEGACY_DISCLAIMER_EN
        + "**\n\n#### Overall Health Insight\nInsight text."
    )

    sanitized, _ = validate_and_sanitize_medical_text(text, language="en")

    assert sanitized == "Summary text.\n\nInsight text."
    assert MANDATORY_DISCLAIMER_EN not in sanitized
    assert LEGACY_DISCLAIMER_EN not in sanitized
    assert "Overall Health Insight" not in sanitized
