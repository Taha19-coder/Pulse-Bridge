"""Tests for the blink detector (OpenCV Haar-cascade based)."""

import numpy as np
import pytest

from backend.modules.eye_comm.detector import (
    BlinkDetector,
    DEFAULT_BLINK_MAX_MS,
    DEFAULT_BLINK_MIN_MS,
)


def test_detector_instantiation():
    d = BlinkDetector()
    assert d.min_blink_ms == DEFAULT_BLINK_MIN_MS
    assert d.max_blink_ms == DEFAULT_BLINK_MAX_MS
    d.close()


def test_process_blank_image_no_events():
    """A blank image has no face, so no blink events should be emitted."""
    d = BlinkDetector()
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    events, landmarks = d.process(frame, timestamp_ms=1000.0)
    assert len(events) == 0
    assert landmarks.face_detected is False
    assert landmarks.eye_openness is None
    d.close()


def test_calibrate_basic():
    d = BlinkDetector()
    open_samples = [0.45, 0.47, 0.44, 0.46, 0.48]
    closed_samples = [0.10, 0.12, 0.08, 0.11, 0.09]
    result = d.calibrate(open_samples, closed_samples, k=1.5)
    assert result["n_open"] == 5
    assert result["n_closed"] == 5
    assert 0 < result["ear_threshold_closed"] < result["ear_threshold_open"] < 1
    assert result["open_mean"] == pytest.approx(0.46, abs=0.01)
    assert result["closed_mean"] == pytest.approx(0.10, abs=0.01)
    d.close()


def test_calibrate_empty_samples_raises():
    d = BlinkDetector()
    with pytest.raises(ValueError):
        d.calibrate([], [0.1])
    with pytest.raises(ValueError):
        d.calibrate([0.45], [])
    d.close()


def test_calibrate_sets_thresholds():
    d = BlinkDetector()
    assert d.get_thresholds() == (None, None)
    d.calibrate([0.45, 0.47, 0.44], [0.10, 0.12, 0.08])
    open_thresh, closed_thresh = d.get_thresholds()
    assert open_thresh is not None
    assert closed_thresh is not None
    assert closed_thresh < open_thresh
    d.close()


def test_blink_state_machine_with_calibrated_thresholds():
    """Simulate a blink by directly setting thresholds and calling process
    with frames that have no face but manually injecting state.

    Since we can't drive the Haar cascade with synthetic images, we test
    the state machine by manipulating internal state directly.

    In the no-face path, only blink_end is emitted (blink_complete requires
    a clean eyes-closed -> eyes-open transition with face tracking).
    """
    d = BlinkDetector()
    d.calibrate([0.45, 0.47, 0.44], [0.10, 0.12, 0.08])

    # Manually simulate: eyes closed -> open (a complete blink)
    d._eye_closed = True
    d._blink_start_ms = 1000.0

    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    # No face detected, but we were tracking a blink -> should emit blink_end
    events, _ = d.process(frame, timestamp_ms=1200.0)
    # elapsed = 200ms, within min/max range -> should emit blink_end only
    assert len(events) == 1
    assert events[0].event_type == "blink_end"
    assert events[0].duration_ms == 200.0
    d.close()


def test_blink_too_short_is_discarded():
    d = BlinkDetector()
    d.calibrate([0.45, 0.47, 0.44], [0.10, 0.12, 0.08])

    d._eye_closed = True
    d._blink_start_ms = 1000.0
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    # elapsed = 50ms, below min_blink_ms (80ms) -> discarded
    events, _ = d.process(frame, timestamp_ms=1050.0)
    assert len(events) == 0
    d.close()


def test_blink_too_long_is_discarded():
    d = BlinkDetector()
    d.calibrate([0.45, 0.47, 0.44], [0.10, 0.12, 0.08])

    d._eye_closed = True
    d._blink_start_ms = 1000.0
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    # elapsed = 3000ms, above max_blink_ms (2000ms) -> discarded
    events, _ = d.process(frame, timestamp_ms=4000.0)
    assert len(events) == 0
    # But a blink within range still emits
    d._eye_closed = True
    d._blink_start_ms = 1000.0
    events, _ = d.process(frame, timestamp_ms=1200.0)
    assert len(events) == 1
    assert events[0].duration_ms == 200.0
    d.close()
