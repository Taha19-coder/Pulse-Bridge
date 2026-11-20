# PULSE BRIDGE — Eye-Blink Communication Feature Plan
**Feature:** Assistive eye-blink / gaze communication for paralyzed (e.g., locked-in syndrome, ALS) users who can only move their eyes.  
**Status:** Phase 1–2 implemented (backend detector + encoder + API routes)  
**Third-party bases:** MediaPipe (face/eye landmarks), BlinkLinMulT (blink-pattern classification), L2CS-Net (gaze/head-pose estimation)

---

## 1. Problem & Scope

Users with severe motor paralysis often retain full eye control. This feature lets them communicate by blinking (and optionally by gaze direction) through a webcam, translating blinks into text/commands that can be spoken, copied, or sent as messages.

**Out of scope (v1):** medical diagnosis, prescription, emergency alerting to hospitals, replacing FDA-cleared assistive devices. This is an accessibility aid, not a medical device.

---

## 2. Role of Each Third-Party Repo

| Repo | Responsibility in Pulse Bridge | Why |
|---|---|---|
| **MediaPipe** (google-ai-edge/mediapipe) | Face Mesh landmark detection (468 3D face landmarks incl. eyes), Eye Aspect Ratio (EAR) computation, real-time blink detection (open/closed state per frame). Runs client-side or on the backend per frame. | Lightweight, real-time, no model weights to ship, proven eye landmark set. |
| **BlinkLinMulT** (fodorad/BlinkLinMulT) | Blink-pattern classification: sequences of blinks (duration + inter-blink intervals) mapped to symbols/commands (dot/dash-like Morse, or custom blink language). | Turns raw blink events into intentional communication symbols rather than reflex blinks. |
| **L2CS-Net** (Ahmednull/L2CS-Net) | Gaze vector + head-pose estimation from the face. Used for "look-to-select" menu navigation (row/column scanning board) as a secondary input channel. | Adds gaze-based selection so users aren't limited to blink Morse alone. Heavier (PyTorch) — introduced in Phase 2. |

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js)                                         │
│  • EyeCommBoard: webcam → canvas overlay                    │
│  • Blink detector (MediaPipe via CDN / WASM)                │
│  • Gaze overlay (L2CS-Net via backend or TF.js)             │
│  • Composed text output, speak/copy/send actions            │
└──────────────┬──────────────────────────────────────────────┘
               │ HTTP / WebSocket (frames + events)
┌──────────────▼──────────────────────────────────────────────┐
│  BACKEND (FastAPI) — new module: backend/modules/eye_comm/  │
│  • eye_comm/detector.py   — per-frame blink + gaze pipeline │
│  • eye_comm/encoder.py    — blink-sequence → text encoder   │
│  • eye_comm/schemas.py    — Pydantic request/response       │
│  • eye_comm/service.py    — calibration, session state      │
│  • api/routes.py          — /api/v1/eye-comm/* endpoints   │
└──────────────┬──────────────────────────────────────────────┘
               │ Supabase (optional: store composed messages)
┌──────────────▼──────────────────────────────────────────────┐
│  SUPABASE                                                     │
│  • eye_comm_sessions table (user, created_at, final_text)   │
│  • RLS: users read/write own sessions only                  │
└─────────────────────────────────────────────────────────────┘
```

**Latency strategy:** blink detection happens in the browser (MediaPipe JS) for sub-second response; the backend receives blink *events* (not raw video) and maintains the composition state. L2CS-Net gaze runs on the backend per-frame if used.

---

## 4. Communication Protocol (Blink Language)

| Input | Meaning (v1 default) |
|---|---|
| 1 short blink | "Yes" / select highlighted item |
| 2 short blinks | "No" / back / cancel |
| Short blink (~0.1–0.4s) | Morse dot `.` |
| Long blink (~0.6–1.5s, eyes held closed) | Morse dash `-` |
| Gap ~0.7s between blinks | end of letter |
| Gap ~2.5s+ | end of word → space |
| 3 rapid blinks | clear current word |
| 5 rapid blinks | speak/copy composed text |

Morse example: `E` = `.` (one short blink), `T` = `-` (one long blink), `SOS` = `... --- ...`.

The encoder is configurable (Morse vs. custom blink code) and per-user calibrated.

---

## 5. Implementation Phases

### Phase 1 — Local blink detection pipeline (Python prototype)
- New module `backend/modules/eye_comm/` with `detector.py`: MediaPipe Face Mesh, EAR computation, open/closed state machine, blink event emission (timestamp, duration).
- Calibration script: user blinks naturally 10× to set personal EAR threshold (mean ± std of open EAR vs. closed EAR).
- Unit tests: synthetic landmark sequences → correct blink events; edge cases (no face, multiple faces, partial occlusion).

### Phase 2 — Blink-to-text encoder
- `encoder.py`: accumulate blink events into dot/dash/word symbols; Morse decoder table; configurable timing thresholds; output composed text.
- CLI demo: run webcam → print composed text live.

### Phase 3 — Backend API integration
- New FastAPI routes under `/api/v1/eye-comm/*`:
  - `POST /calibrate` — receive calibration blinks, store per-user EAR thresholds (Supabase or in-memory session).
  - `POST /frame` — receive a frame (base64 JPEG) → return blink events + gaze vector (if L2CS enabled).
  - `POST /events` — receive blink events from client → return updated composed text.
  - `GET /session/{id}` — retrieve composed message history.
- Add `EyeCommSession`/`EyeCommMessage` schemas in `backend/models/schemas.py` (or a dedicated `backend/modules/eye_comm/schemas.py`).

### Phase 4 — L2CS-Net gaze (optional Phase 2+)
- Wrap L2CS-Net inference: face → gaze pitch/yaw + head pose.
- Frontend scanning board: highlight rows/columns; user looks at target + blinks to select (alternative to Morse).
- Only if model weights can be shipped/licensed; otherwise Phase 4 is deferred.

### Phase 5 — Frontend integration
- New component `frontend/src/components/EyeCommBoard.tsx`:
  - Webcam access (`navigator.mediaDevices.getUserMedia`), canvas with face/eye landmark overlay.
  - MediaPipe Face Mesh via CDN (`@mediapipe/face_mesh` or tasks-vision) running in-browser.
  - Blink event → POST to `/api/v1/eye-comm/events`; composed text displayed in a text area.
  - Buttons: Speak (browser speech synthesis), Copy, Clear, Send (Supabase/chat).
  - Calibration UI (blink naturally X times).
  - Accessibility: high-contrast mode, large text, keyboard-free operation.

### Phase 6 — Testing, calibration guide & demo
- Pytest tests for detector + encoder (synthetic landmarks).
- End-to-end: blink "HELLO" in Morse → text appears on screen.
- Demo script + medical disclaimer screen before first use.

---

## 6. File Plan (new files)

```
backend/
  modules/
    eye_comm/
      __init__.py
      detector.py       # MediaPipe Face Mesh + EAR + blink state machine
      encoder.py        # blink sequence → text (Morse / custom code)
      schemas.py        # Pydantic models for eye-comm API
      service.py        # calibration, session/composition state
      calibrate.py      # offline calibration helper (CLI)
  api/
    routes.py           # add /api/v1/eye-comm/* routes (edit existing)
core/
  config.py             # add EYE_COMM_* settings (optional: model paths, thresholds)
frontend/
  src/
    components/
      EyeCommBoard.tsx  # webcam + blink UI + composed text
    lib/
      eyeComm.ts        # API client for eye-comm endpoints
tests/
  test_eye_comm_detector.py
  test_eye_comm_encoder.py
docs/
  EYE_COMMUNICATION_PLAN.md   # this file
```

---

## 7. API Contracts (additions to `backend/api/routes.py`)

```http
POST /api/v1/eye-comm/calibrate
Body: { user_id, calibration_blinks: [{ear, timestamp_ms}] }
Response: { user_id, ear_threshold_open, ear_threshold_closed, blink_min_ms, blink_max_ms }

POST /api/v1/eye-comm/events
Body: { user_id, events: [{type: "blink_start"|"blink_end", timestamp_ms, duration_ms}] }
Response: { composed_text, latest_symbol, is_complete_word }

GET /api/v1/eye-comm/session/{session_id}
Response: { session_id, user_id, final_text, created_at, events_count }
```

(Exact schemas to be defined in `backend/modules/eye_comm/schemas.py` following the existing Pydantic v2 style.)

---

## 8. Frontend Plan

- Reuse existing patterns from `ChatModal.tsx` / `lib/api.ts` (fetch wrapper, error handling, loading states).
- `EyeCommBoard.tsx` is a client component ("use camera").
- MediaPipe loaded from CDN to avoid heavy npm build steps in the hackathon timeline.
- Composed text can be pushed into the existing chat flow (`/api/v1/rag/chat`) or shown standalone.

---

## 9. Calibration & UX (critical for reliability)

- EAR threshold is per-user: `closed_threshold = mean(open_EAR) - k * std(open_EAR)`; tune `k` during calibration.
- Blink duration window: reject blinks shorter than ~80ms (reflex/noise) and longer than ~2s (sleep/looking away).
- "No face detected" → pause composition, show on-screen instruction ("Center your face in the camera").
- Confirmation dwell: after composing a message, require a deliberate blink sequence before "speak/send" to avoid accidents.

---

## 10. Safety, Ethics & Medical Disclaimers

Consistent with Pulse Bridge's architecture doc (Section 5: Clinical & Ethical Boundaries):

- **Not a medical device.** Explicit disclaimer before first use: "This tool is an accessibility aid, not a certified medical communication device. Always keep an alternative communication method available."
- No diagnosis, no prescribing, no emergency auto-calling.
- Video frames are processed locally where possible; if sent to the backend, they are not stored permanently unless the user saves a composed session.
- Consent-driven camera access: browser permission, camera indicator light respected, easy toggle off.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Ambient light changes break EAR threshold | Re-calibration button; adaptive threshold over time |
| Reflex blinks corrupt text | Min/max blink duration filters; intentional-sequence confirmation |
| L2CS-Net weights heavy / hard to ship | Defer gaze to Phase 4; Morse blink is fully functional without it |
| Webcam unavailable on some devices | Fallback: manual blink buttons (space/enter) for demo purposes |
| Privacy of video | Process in-browser; no frame storage by default |

---

## 12. Definition of Done (MVP Demo)

- [ ] User calibrates blink threshold in <30 seconds
- [ ] User blinks Morse `.... . .-.. .-.. ---` (HELLO) → text "HELLO" appears on screen
- [ ] User can copy/speak the composed text
- [ ] Backend API accepts blink events and returns composed text
- [ ] Pytest suite passes for detector + encoder with synthetic inputs
- [ ] Disclaimer screen shown before first use

---

## Implementation Status

### Complete (Phase 1–2)
- `backend/modules/eye_comm/detector.py` — OpenCV Haar-cascade blink detector with EAR-like eye-openness metric, calibration, and blink state machine
- `backend/modules/eye_comm/encoder.py` — Morse-style blink-to-text encoder (dot/dash, letter/word gaps, rapid-blink clear/speak commands)
- `backend/modules/eye_comm/schemas.py` — Pydantic API schemas
- `backend/modules/eye_comm/service.py` — Service orchestrating detector + encoder + session state
- `backend/modules/eye_comm/__init__.py` — Module exports
- `backend/api/routes.py` — Three new endpoints: `POST /eye-comm/calibrate`, `POST /eye-comm/events`, `GET /eye-comm/session/{session_id}`
- `tests/test_eye_comm_detector.py` — 8 tests (calibration, state machine, blink duration filtering)
- `tests/test_eye_comm_encoder.py` — 12 tests (Morse decoding, word/letter gaps, rapid commands)
- All 20 tests pass

### Remaining (Phase 3–6)
- Frontend `EyeCommBoard.tsx` component with webcam + MediaPipe Face Mesh
- Frontend API client (`eyeComm.ts`)
- L2CS-Net gaze integration (deferred — model weights not accessible via documented URLs)
- Supabase session persistence (currently in-memory)
- End-to-end demo: blink "HELLO" → text on screen

## Next Steps

1. Create branch `feature/eye-blink-communication`.
2. Build frontend `EyeCommBoard.tsx` component (webcam, blink detection in-browser, composed text display).
3. Add Supabase persistence for sessions (replace in-memory store).
4. Evaluate L2CS-Net gaze integration (model weight availability).
5. End-to-end demo and final testing.
