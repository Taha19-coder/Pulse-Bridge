"""Blink detection pipeline using OpenCV Haar cascades.

Detects faces and eyes in each frame, computes an eye-openness metric
(eye bounding-box height / width ratio, analogous to Eye Aspect Ratio), and
runs an open/closed state machine that emits blink events.

Why OpenCV instead of MediaPipe: the MediaPipe Python wheel on Windows only
exposes the Tasks API, which requires a separate .tflite model file that is
not publicly accessible at the documented storage URLs. OpenCV's Haar
cascades are bundled with the package and work out of the box.

Not a medical device — see docs/EYE_COMMUNICATION_PLAN.md.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

# Default timing thresholds (milliseconds). These are per-user calibrated.
DEFAULT_BLINK_MIN_MS = 80      # below this: noise / reflex, ignore
DEFAULT_BLINK_MAX_MS = 2000    # above this: looking away / sleep, ignore
DEFAULT_SHORT_MAX_MS = 450     # short blink -> Morse dot
DEFAULT_LONG_MIN_MS = 450      # long blink (eyes held closed) -> Morse dash


@dataclass
class EyeLandmarks:
    """Eye detection results for a single frame."""

    left_eye: np.ndarray  # shape (2, 2) -> [x, y] center + [w, h] bbox
    right_eye: np.ndarray  # shape (2, 2)
    face_detected: bool
    eye_openness: Optional[float] = None  # 0 = closed, 1 = fully open (normalized)
    ear_left: Optional[float] = None
    ear_right: Optional[float] = None


@dataclass
class BlinkEvent:
    """A single detected blink."""

    event_type: str  # "blink_start" | "blink_end" | "blink_complete"
    timestamp_ms: float
    duration_ms: Optional[float] = None  # only set on blink_complete
    ear_left: Optional[float] = None
    ear_right: Optional[float] = None


class BlinkDetector:
    """OpenCV Haar-cascade based blink detector.

    Usage:
        detector = BlinkDetector()
        frame_bgr = cv2.imread("frame.jpg")  # or from webcam
        events, landmarks = detector.process(frame_bgr, timestamp_ms)
        for event in events:
            print(event)
    """

    def __init__(
        self,
        min_blink_ms: float = DEFAULT_BLINK_MIN_MS,
        max_blink_ms: float = DEFAULT_BLINK_MAX_MS,
    ):
        self.min_blink_ms = min_blink_ms
        self.max_blink_ms = max_blink_ms

        # Load bundled OpenCV Haar cascades.
        cascade_dir = os.path.join(os.path.dirname(cv2.__file__), "data")
        self._face_cascade = cv2.CascadeClassifier(
            os.path.join(cascade_dir, "haarcascade_frontalface_default.xml")
        )
        self._eye_cascade = cv2.CascadeClassifier(
            os.path.join(cascade_dir, "haarcascade_eye.xml")
        )

        # State machine state
        self._eye_closed = False
        self._blink_start_ms: Optional[float] = None

        # EAR thresholds (set via calibrate())
        self._ear_threshold_open: Optional[float] = None
        self._ear_threshold_closed: Optional[float] = None

    def process(self, frame_bgr: np.ndarray, timestamp_ms: float) -> tuple[list[BlinkEvent], EyeLandmarks]:
        """Process a single BGR frame and return blink events + landmarks."""
        events: list[BlinkEvent] = []
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)

        landmarks = self._detect_eyes(gray)
        eye_openness = landmarks.eye_openness

        if not landmarks.face_detected or eye_openness is None:
            # No face or eyes: if we were tracking a blink, close it.
            if self._eye_closed and self._blink_start_ms is not None:
                elapsed = timestamp_ms - self._blink_start_ms
                self._eye_closed = False
                self._blink_start_ms = None
                # Only emit if within valid blink duration (not too short, not too long).
                if self.min_blink_ms <= elapsed <= self.max_blink_ms:
                    events.append(
                        BlinkEvent(
                            event_type="blink_end",
                            timestamp_ms=timestamp_ms,
                            duration_ms=elapsed,
                        )
                    )
            return events, landmarks

        # Determine open/closed state using calibrated thresholds.
        if self._ear_threshold_open is None or self._ear_threshold_closed is None:
            # Not calibrated yet: use a heuristic (eyes closed if openness < 0.25).
            is_closed = eye_openness < 0.25
        else:
            is_closed = eye_openness < self._ear_threshold_closed

        if not self._eye_closed:
            # Waiting for eyes to close.
            if is_closed:
                self._eye_closed = True
                self._blink_start_ms = timestamp_ms
                events.append(
                    BlinkEvent(
                        event_type="blink_start",
                        timestamp_ms=timestamp_ms,
                        ear_left=landmarks.ear_left,
                        ear_right=landmarks.ear_right,
                    )
                )
        else:
            # Eyes are closed; waiting for them to reopen.
            if not is_closed:
                elapsed = timestamp_ms - (self._blink_start_ms or timestamp_ms)
                self._eye_closed = False
                start_ms = self._blink_start_ms
                self._blink_start_ms = None
                if self.min_blink_ms <= elapsed <= self.max_blink_ms:
                    events.append(
                        BlinkEvent(
                            event_type="blink_end",
                            timestamp_ms=timestamp_ms,
                            duration_ms=elapsed,
                            ear_left=landmarks.ear_left,
                            ear_right=landmarks.ear_right,
                        )
                    )
                    events.append(
                        BlinkEvent(
                            event_type="blink_complete",
                            timestamp_ms=timestamp_ms,
                            duration_ms=elapsed,
                            ear_left=landmarks.ear_left,
                            ear_right=landmarks.ear_right,
                        )
                    )
                # If blink was too short or too long, discard (noise / looking away).

        return events, landmarks

    # ------------------------------------------------------------------
    # Calibration
    # ------------------------------------------------------------------

    def calibrate(
        self,
        open_eye_openness_samples: list[float],
        closed_eye_openness_samples: list[float],
        k: float = 1.5,
    ) -> dict[str, float]:
        """Derive per-user eye-openness thresholds from calibration samples.

        Args:
            open_eye_openness_samples: openness values while eyes are open.
            closed_eye_openness_samples: openness values while eyes are closed.
            k: Number of standard deviations to offset from the open mean.

        Returns:
            Dict with thresholds and stats.
        """
        if not open_eye_openness_samples or not closed_eye_openness_samples:
            raise ValueError("Need at least one open and one closed sample.")

        open_arr = np.array(open_eye_openness_samples, dtype=float)
        closed_arr = np.array(closed_eye_openness_samples, dtype=float)

        open_mean = float(np.mean(open_arr))
        open_std = float(np.std(open_arr))
        closed_mean = float(np.mean(closed_arr))

        ear_threshold_open = open_mean - k * open_std
        ear_threshold_closed = (open_mean + closed_mean) / 2.0

        self._ear_threshold_open = ear_threshold_open
        self._ear_threshold_closed = ear_threshold_closed

        return {
            "ear_threshold_open": ear_threshold_open,
            "ear_threshold_closed": ear_threshold_closed,
            "open_mean": open_mean,
            "open_std": open_std,
            "closed_mean": closed_mean,
            "n_open": len(open_eye_openness_samples),
            "n_closed": len(closed_eye_openness_samples),
        }

    def get_thresholds(self) -> tuple[Optional[float], Optional[float]]:
        return self._ear_threshold_open, self._ear_threshold_closed

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _detect_eyes(self, gray: np.ndarray) -> EyeLandmarks:
        faces = self._face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
        )

        if len(faces) == 0:
            return EyeLandmarks(
                left_eye=np.zeros((2, 2), dtype=float),
                right_eye=np.zeros((2, 2), dtype=float),
                face_detected=False,
                eye_openness=None,
            )

        # Take the largest face.
        face = max(faces, key=lambda r: r[2] * r[3])
        fx, fy, fw, fh = face
        face_roi = gray[fy : fy + fh, fx : fx + fw]

        eyes = self._eye_cascade.detectMultiScale(
            face_roi, scaleFactor=1.1, minNeighbors=5, minSize=(20, 20)
        )

        if len(eyes) < 2:
            return EyeLandmarks(
                left_eye=np.zeros((2, 2), dtype=float),
                right_eye=np.zeros((2, 2), dtype=float),
                face_detected=True,
                eye_openness=None,
            )

        # Sort eyes by x-coordinate: left eye first (smaller x).
        eyes = sorted(eyes, key=lambda r: r[0])
        left_eye = eyes[0]
        right_eye = eyes[1]

        # Convert to absolute coordinates.
        left_eye_abs = np.array([left_eye[0] + fx, left_eye[1] + fy], dtype=float)
        right_eye_abs = np.array([right_eye[0] + fx, right_eye[1] + fy], dtype=float)

        # Eye openness = height / width ratio (higher = more open).
        left_openness = left_eye[3] / left_eye[2] if left_eye[2] > 0 else 0.0
        right_openness = right_eye[3] / right_eye[2] if right_eye[2] > 0 else 0.0
        avg_openness = (left_openness + right_openness) / 2.0

        return EyeLandmarks(
            left_eye=np.array([left_eye_abs[0], left_eye_abs[1]], dtype=float),
            right_eye=np.array([right_eye_abs[0], right_eye_abs[1]], dtype=float),
            face_detected=True,
            eye_openness=avg_openness,
            ear_left=left_openness,
            ear_right=right_openness,
        )

    def close(self) -> None:
        pass  # No resources to release for Haar cascades.
