"""Eye-blink communication service.

Orchestrates the blink detector and encoder, manages per-user calibration
thresholds and composition sessions. Designed to be stateless enough for
testing, with an optional in-memory session store.

Not a medical device — see docs/EYE_COMMUNICATION_PLAN.md.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from .detector import BlinkDetector, BlinkEvent
from .encoder import BlinkEncoder, BlinkSymbol
from .schemas import (
    BlinkEventIn,
    BlinkEventOut,
    CalibrateRequest,
    CalibrateResponse,
    EyeCommSessionResponse,
)


class EyeCommService:
    """High-level service for eye-blink communication."""

    def __init__(self, detector: Optional[BlinkDetector] = None):
        self.detector = detector or BlinkDetector()
        self.encoder = BlinkEncoder()

        # Per-user calibration thresholds: user_id -> {open, closed}
        self._calibration: Dict[str, dict] = {}

        # In-memory session store (replace with Supabase in production).
        self._sessions: Dict[str, dict] = {}

    # ------------------------------------------------------------------
    # Calibration
    # ------------------------------------------------------------------

    def calibrate(self, request: CalibrateRequest) -> CalibrateResponse:
        """Run calibration for a user and store their EAR thresholds."""
        result = self.detector.calibrate(
                    open_eye_openness_samples=request.open_ear_samples,
                    closed_eye_openness_samples=request.closed_ear_samples,
            k=request.k,
        )
        self._calibration[request.user_id] = {
            "ear_threshold_open": result["ear_threshold_open"],
            "ear_threshold_closed": result["ear_threshold_closed"],
        }

        # Apply thresholds to the detector for subsequent frames.
        self.detector._ear_threshold_open = result["ear_threshold_open"]
        self.detector._ear_threshold_closed = result["ear_threshold_closed"]

        return CalibrateResponse(
            user_id=request.user_id,
            ear_threshold_open=result["ear_threshold_open"],
            ear_threshold_closed=result["ear_threshold_closed"],
            open_mean=result["open_mean"],
            open_std=result["open_std"],
            closed_mean=result["closed_mean"],
            n_open=result["n_open"],
            n_closed=result["n_closed"],
        )

    def get_calibration(self, user_id: str) -> Optional[dict]:
        return self._calibration.get(user_id)

    # ------------------------------------------------------------------
    # Frame processing (backend receives a frame, returns blink events)
    # ------------------------------------------------------------------

    def process_frame(
        self,
        frame_bgr,
        timestamp_ms: float,
        user_id: Optional[str] = None,
    ) -> tuple[List[BlinkEventOut], Optional[EyeCommSessionResponse]]:
        """Process a camera frame and return blink events + session state.

        This is the main entry point when the frontend sends frames to the
        backend. In the preferred architecture, blink detection runs in the
        browser and only events are sent; this method supports the alternative
        where the backend does detection.
        """
        import cv2
        import numpy as np

        events, _landmarks = self.detector.process(frame_bgr, timestamp_ms)
        outs: List[BlinkEventOut] = []

        for event in events:
            if event.event_type == "blink_complete" and event.duration_ms is not None:
                symbols = self.encoder.process_blink_complete(
                    event.duration_ms, event.timestamp_ms
                )
                for symbol in symbols:
                    outs.append(
                        BlinkEventOut(
                            event_type="symbol",
                            timestamp_ms=symbol.timestamp_ms,
                            duration_ms=event.duration_ms,
                            symbol=symbol.value,
                            composed_text=self.encoder.get_composed_text(),
                        )
                    )
            else:
                outs.append(
                    BlinkEventOut(
                        event_type=event.event_type,
                        timestamp_ms=event.timestamp_ms,
                        duration_ms=event.duration_ms,
                        composed_text=self.encoder.get_composed_text(),
                    )
                )

        session = self._get_or_create_session(user_id)
        return outs, session

    # ------------------------------------------------------------------
    # Event-based processing (frontend detects blinks, sends events)
    # ------------------------------------------------------------------

    def process_blink_events(
        self,
        events: List[BlinkEventIn],
        user_id: Optional[str] = None,
        timestamp_ms: Optional[float] = None,
    ) -> tuple[List[BlinkEventOut], Optional[EyeCommSessionResponse]]:
        """Process blink events sent from the frontend.

        This is the recommended path: MediaPipe runs in-browser, the frontend
        sends blink_complete events with durations, and the backend maintains
        composition state.
        """
        outs: List[BlinkEventOut] = []
        now = timestamp_ms if timestamp_ms is not None else _now_ms()
        prev_ts: Optional[float] = None

        for event in events:
            ts = event.timestamp_ms if event.timestamp_ms is not None else now

            # Before processing this event, check if the gap from the previous
            # event exceeds letter/word thresholds and finalize accordingly.
            if prev_ts is not None:
                gap = ts - prev_ts
                self._emit_gaps(outs, gap)

            if event.event_type == "blink_complete" and event.duration_ms is not None:
                symbols = self.encoder.process_blink_complete(
                    event.duration_ms, ts
                )
                for symbol in symbols:
                    outs.append(
                        BlinkEventOut(
                            event_type="symbol",
                            timestamp_ms=symbol.timestamp_ms,
                            duration_ms=event.duration_ms,
                            symbol=symbol.value,
                            composed_text=self.encoder.get_composed_text(),
                        )
                    )
            elif event.event_type == "blink_end":
                outs.append(
                    BlinkEventOut(
                        event_type="blink_end",
                        timestamp_ms=ts,
                        duration_ms=event.duration_ms,
                        composed_text=self.encoder.get_composed_text(),
                    )
                )
            elif event.event_type == "blink_start":
                outs.append(
                    BlinkEventOut(
                        event_type="blink_start",
                        timestamp_ms=ts,
                        composed_text=self.encoder.get_composed_text(),
                    )
                )

            prev_ts = ts

        # Final check at the end based on the last event time.
        if events and prev_ts is not None:
            self._emit_gaps(outs, 0.0, final=True)

        session = self._save_session(user_id)
        return outs, session

    def _emit_gaps(
        self,
        outs: List[BlinkEventOut],
        gap_ms: float,
        final: bool = False,
    ) -> None:
        """Emit letter/word gap symbols when a gap between events is large enough.

        Args:
            outs: Output list to append symbols to.
            gap_ms: Gap in milliseconds since the previous event.
            final: If True, always try to flush pending letter/word (end of batch).
        """
        encoder = self.encoder

        if final:
            # At end of batch: finalize any pending letter, then any pending word.
            if encoder.should_emit_letter_gap(_now_ms()):
                for symbol in encoder.process_letter_gap(_now_ms()):
                    outs.append(
                        BlinkEventOut(
                            event_type="symbol",
                            timestamp_ms=symbol.timestamp_ms,
                            symbol=symbol.value,
                            composed_text=encoder.get_composed_text(),
                        )
                    )
            if encoder.should_emit_word_gap(_now_ms()):
                for symbol in encoder.process_word_gap(_now_ms()):
                    outs.append(
                        BlinkEventOut(
                            event_type="symbol",
                            timestamp_ms=symbol.timestamp_ms,
                            symbol=symbol.value,
                            composed_text=encoder.get_composed_text(),
                        )
                    )
            return

        # During batch: use the actual gap between consecutive events.
        if gap_ms >= encoder.word_gap_ms:
            # Word gap takes precedence — finalize letter first if pending, then word.
            if encoder.state.current_letter:
                for symbol in encoder.process_letter_gap(_now_ms()):
                    outs.append(
                        BlinkEventOut(
                            event_type="symbol",
                            timestamp_ms=symbol.timestamp_ms,
                            symbol=symbol.value,
                            composed_text=encoder.get_composed_text(),
                        )
                    )
            for symbol in encoder.process_word_gap(_now_ms()):
                outs.append(
                    BlinkEventOut(
                        event_type="symbol",
                        timestamp_ms=symbol.timestamp_ms,
                        symbol=symbol.value,
                        composed_text=encoder.get_composed_text(),
                    )
                )
        elif gap_ms >= encoder.letter_gap_ms:
            for symbol in encoder.process_letter_gap(_now_ms()):
                outs.append(
                    BlinkEventOut(
                        event_type="symbol",
                        timestamp_ms=symbol.timestamp_ms,
                        symbol=symbol.value,
                        composed_text=encoder.get_composed_text(),
                    )
                )

    def get_composed_text(self) -> str:
        return self.encoder.get_composed_text()

    def reset_composition(self) -> None:
        self.encoder.reset()

    # ------------------------------------------------------------------
    # Sessions
    # ------------------------------------------------------------------

    def _get_or_create_session(self, user_id: Optional[str]) -> Optional[EyeCommSessionResponse]:
        if user_id is None:
            return None
        if user_id not in self._sessions:
            self._sessions[user_id] = {
                "session_id": str(uuid.uuid4()),
                "user_id": user_id,
                "composed_text": "",
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
                "event_count": 0,
            }
        return self._session_response(user_id)

    def _save_session(self, user_id: Optional[str]) -> Optional[EyeCommSessionResponse]:
        if user_id is None:
            return None
        if user_id not in self._sessions:
            self._sessions[user_id] = {
                "session_id": str(uuid.uuid4()),
                "user_id": user_id,
                "composed_text": "",
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
                "event_count": 0,
            }
        sess = self._sessions[user_id]
        sess["composed_text"] = self.encoder.get_composed_text()
        sess["updated_at"] = datetime.now(timezone.utc)
        sess["event_count"] += 1
        return self._session_response(user_id)

    def get_session(self, session_id: str) -> Optional[EyeCommSessionResponse]:
        for sess in self._sessions.values():
            if sess["session_id"] == session_id:
                return EyeCommSessionResponse(
                    session_id=sess["session_id"],
                    user_id=sess["user_id"],
                    composed_text=sess["composed_text"],
                    created_at=sess["created_at"],
                    updated_at=sess["updated_at"],
                    event_count=sess["event_count"],
                )
        return None

    def _session_response(self, user_id: str) -> EyeCommSessionResponse:
        sess = self._sessions[user_id]
        return EyeCommSessionResponse(
            session_id=sess["session_id"],
            user_id=sess["user_id"],
            composed_text=sess["composed_text"],
            created_at=sess["created_at"],
            updated_at=sess["updated_at"],
            event_count=sess["event_count"],
        )

    def close(self) -> None:
        self.detector.close()


def _now_ms() -> float:
    return datetime.now(timezone.utc).timestamp() * 1000.0
