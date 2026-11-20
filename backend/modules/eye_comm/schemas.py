"""Pydantic schemas for the eye-blink communication API."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class BlinkEventIn(BaseModel):
    """A single blink event sent from the frontend to the backend."""

    event_type: str = Field(
        description="'blink_start' | 'blink_end' | 'blink_complete'"
    )
    timestamp_ms: float = Field(description="Monotonic timestamp in milliseconds")
    duration_ms: Optional[float] = Field(
        default=None, description="Blink duration in ms (set on blink_complete)"
    )
    ear_left: Optional[float] = Field(default=None, description="Left eye EAR")
    ear_right: Optional[float] = Field(default=None, description="Right eye EAR")


class BlinkEventOut(BaseModel):
    """A blink event returned to the frontend."""

    event_type: str
    timestamp_ms: float
    duration_ms: Optional[float] = None
    symbol: Optional[str] = Field(
        default=None, description="Decoded symbol ('.', '-', ' ', command, etc.)"
    )
    composed_text: str = Field(default="", description="Current composed text")


class CalibrateRequest(BaseModel):
    """Calibration samples from the user."""

    user_id: str = Field(description="User identifier")
    open_ear_samples: List[float] = Field(
        description="EAR values while eyes are open (min 5 recommended)"
    )
    closed_ear_samples: List[float] = Field(
        description="EAR values while eyes are closed / blinking (min 5 recommended)"
    )
    k: float = Field(default=1.5, description="Std-dev offset for open-ear threshold")


class CalibrateResponse(BaseModel):
    user_id: str
    ear_threshold_open: float
    ear_threshold_closed: float
    open_mean: float
    open_std: float
    closed_mean: float
    n_open: int
    n_closed: int


class EyeCommSessionResponse(BaseModel):
    session_id: str
    user_id: Optional[str] = None
    composed_text: str
    created_at: datetime
    updated_at: datetime
    event_count: int = 0
