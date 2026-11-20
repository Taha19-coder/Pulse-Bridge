"""Eye-blink communication module for Pulse Bridge.

Provides assistive eye-blink / gaze communication for users with severe motor
paralysis who can only move their eyes. Built on MediaPipe Face Mesh (blink
detection via Eye Aspect Ratio) and a blink-sequence encoder (Morse-style
communication).

Not a medical device. See docs/EYE_COMMUNICATION_PLAN.md for the full plan,
safety boundaries, and calibration guidance.
"""

from .detector import BlinkDetector, BlinkEvent, EyeLandmarks
from .encoder import BlinkEncoder, MORSE_CODE_TABLE as MorseCodeTable
from .schemas import (
    BlinkEventIn,
    BlinkEventOut,
    CalibrateRequest,
    CalibrateResponse,
    EyeCommSessionResponse,
)
from .service import EyeCommService

__all__ = [
    "BlinkDetector",
    "BlinkEvent",
    "EyeLandmarks",
    "BlinkEncoder",
    "MorseCodeTable",
    "BlinkEventIn",
    "BlinkEventOut",
    "CalibrateRequest",
    "CalibrateResponse",
    "EyeCommSessionResponse",
    "EyeCommService",
]
