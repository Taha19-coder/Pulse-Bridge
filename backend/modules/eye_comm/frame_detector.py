"""Frame-based blink detection endpoint helper.

Receives a camera frame (base64 JPEG), runs the OpenCV blink detector, and
returns blink events. Used as a fallback when in-browser MediaPipe is unavailable.
"""

from __future__ import annotations

import base64
from typing import Optional

import cv2
import numpy as np

from .detector import BlinkDetector, BlinkEvent

# Shared detector instance (stateless enough for single-user demo).
_frame_detector = BlinkDetector()


def process_frame_base64(
    frame_b64: str,
    timestamp_ms: float,
) -> tuple[list[dict], Optional[float]]:
    """Decode a base64 JPEG frame, run blink detection, return events.

    Args:
        frame_b64: Base64-encoded JPEG image (may include data URL prefix).
        timestamp_ms: Monotonic timestamp in milliseconds.

    Returns:
        (events, composed_text) where events is a list of dicts and
        composed_text is the current encoder text.
    """
    from .service import _eye_comm_service  # noqa: PLC0415

    # Strip data URL prefix if present.
    if "," in frame_b64:
        frame_b64 = frame_b64.split(",", 1)[1]

    img_bytes = base64.b64decode(frame_b64)
    nparr = np.frombuffer(img_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        return [], None

    events, _landmarks = _frame_detector.process(frame, timestamp_ms)

    # Convert to serializable dicts.
    out_events = []
    for event in events:
        out_events.append(
            {
                "event_type": event.event_type,
                "timestamp_ms": event.timestamp_ms,
                "duration_ms": event.duration_ms,
            }
        )

    return out_events, None
