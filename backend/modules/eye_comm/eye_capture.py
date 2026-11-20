"""Eye image capture storage.

Saves webcam eye frames captured by the frontend to a local directory.
In production these would be uploaded to Supabase Storage with signed URLs.
"""

from __future__ import annotations

import base64
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

# Storage directory for captured eye images.
CAPTURE_DIR = Path(__file__).resolve().parents[2] / "data" / "eye_captures"
CAPTURE_DIR.mkdir(parents=True, exist_ok=True)


def save_eye_capture(
    frame_b64: str,
    user_id: str,
    timestamp_ms: float,
    label: Optional[str] = None,
) -> dict:
    """Decode a base64 JPEG frame and save it as an eye capture image.

    Args:
        frame_b64: Base64-encoded JPEG image (may include data URL prefix).
        user_id: User identifier.
        timestamp_ms: Monotonic timestamp in milliseconds.
        label: Optional user-provided label (e.g., "eyes open", "blinking").

    Returns:
        Dict with capture metadata: capture_id, file_path, file_url, user_id,
        timestamp_ms, label, created_at.
    """
    # Strip data URL prefix if present.
    if "," in frame_b64:
        frame_b64 = frame_b64.split(",", 1)[1]

    img_bytes = base64.b64decode(frame_b64)
    nparr = np.frombuffer(img_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        raise ValueError("Failed to decode image frame")

    # Generate capture ID and file path.
    capture_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    file_name = f"{capture_id}.jpg"
    file_path = CAPTURE_DIR / file_name

    # Save the image.
    cv2.imwrite(str(file_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 90])

    # Build a local file URL (served by backend static files in production;
    # for now it's a relative path the frontend can read).
    file_url = f"/api/v1/eye-comm/captures/{capture_id}"

    result = {
        "capture_id": capture_id,
        "file_path": str(file_path),
        "file_url": file_url,
        "user_id": user_id,
        "timestamp_ms": timestamp_ms,
        "label": label,
        "created_at": created_at,
    }

    # Save metadata sidecar as JSON so list_eye_captures can find it.
    meta_path = file_path.with_suffix(".json")
    import json
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    return result


def list_eye_captures(user_id: Optional[str] = None, limit: int = 50) -> list[dict]:
    """List saved eye captures, newest first.

    Args:
        user_id: Optional filter by user ID.
        limit: Maximum number of captures to return.

    Returns:
        List of capture metadata dicts.
    """
    captures = []
    for file_path in sorted(CAPTURE_DIR.glob("*.jpg"), key=lambda p: p.stat().st_mtime, reverse=True):
        capture_id = file_path.stem
        # Try to read a sidecar metadata JSON if it exists.
        meta_path = file_path.with_suffix(".json")
        if meta_path.exists():
            import json
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            if user_id and meta.get("user_id") != user_id:
                continue
            captures.append(meta)
        else:
            # No metadata — create a minimal entry.
            if user_id:
                continue
            captures.append({
                "capture_id": capture_id,
                "file_path": str(file_path),
                "file_url": f"/api/v1/eye-comm/captures/{capture_id}",
                "user_id": None,
                "timestamp_ms": None,
                "label": None,
                "created_at": datetime.fromtimestamp(file_path.stat().st_mtime, timezone.utc).isoformat(),
            })

        if len(captures) >= limit:
            break

    return captures


def get_eye_capture(capture_id: str) -> Optional[dict]:
    """Get metadata for a specific capture."""
    meta_path = CAPTURE_DIR / f"{capture_id}.json"
    if not meta_path.exists():
        return None
    import json
    with open(meta_path, "r", encoding="utf-8") as f:
        return json.load(f)
