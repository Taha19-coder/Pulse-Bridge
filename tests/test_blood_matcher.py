import pytest
from backend.modules.donors.compatibility import get_compatible_donor_groups, is_compatible
from backend.modules.donors.service import BloodDonorService
from backend.models.schemas import BloodMatchRequest


def test_compatibility_rules():
    # O- is universal donor
    assert is_compatible("O-", "A+")
    assert is_compatible("O-", "B+")
    assert is_compatible("O-", "AB+")
    assert is_compatible("O-", "O-")

    # AB+ is universal recipient
    assert set(get_compatible_donor_groups("AB+")) == {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}

    # B+ recipient can only receive B+, B-, O+, O-
    assert set(get_compatible_donor_groups("B+")) == {"B+", "B-", "O+", "O-"}
    assert not is_compatible("A+", "B+")
    assert not is_compatible("AB+", "B+")


def test_donor_search_and_privacy_masking():
    req = BloodMatchRequest(recipient_blood_group="A+", city="Lahore", urgency="Emergency")
    res = BloodDonorService.match_donors(req)
    assert res.total_matches > 0
    for donor in res.donors:
        # Check donor blood group is safe
        assert donor.blood_group in ["A+", "A-", "O+", "O-"]
        # Check contact masking format
        assert "•••••" in donor.masked_contact or "•••" in donor.masked_contact
        # Check WhatsApp link is generated
        assert donor.whatsapp_link.startswith("https://wa.me/")
