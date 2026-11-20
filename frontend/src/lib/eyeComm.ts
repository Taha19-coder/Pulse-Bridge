import {
  BlinkEventsRequest,
  BlinkEventsResponse,
  CalibrateRequest,
  CalibrateResponse,
  EyeCaptureRequest,
  EyeCaptureResponse,
  EyeCommSessionResponse,
  FrameDetectRequest,
} from '@/types';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1').replace(/\/+$/, '');

async function handleResponse(res: Response): Promise<unknown> {
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export async function calibrateEyeComm(request: CalibrateRequest): Promise<CalibrateResponse> {
  const res = await fetch(`${API_BASE_URL}/eye-comm/calibrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse(res) as Promise<CalibrateResponse>;
}

export async function submitBlinkEvents(
  request: BlinkEventsRequest,
): Promise<BlinkEventsResponse> {
  const res = await fetch(`${API_BASE_URL}/eye-comm/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse(res) as Promise<BlinkEventsResponse>;
}

export async function getEyeCommSession(sessionId: string): Promise<EyeCommSessionResponse> {
  const res = await fetch(`${API_BASE_URL}/eye-comm/session/${sessionId}`, {
    method: 'GET',
    cache: 'no-store',
  });
  return handleResponse(res) as Promise<EyeCommSessionResponse>;
}

export async function checkEyeCommHealth(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE_URL}/health`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Backend health check failed');
  return res.json() as Promise<{ status: string }>;
}

export async function detectBlinkFromFrame(
  request: FrameDetectRequest,
): Promise<BlinkEventsResponse> {
  const res = await fetch(`${API_BASE_URL}/eye-comm/frame`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse(res) as Promise<BlinkEventsResponse>;
}

export async function captureEyeImage(
  request: EyeCaptureRequest,
): Promise<EyeCaptureResponse> {
  const res = await fetch(`${API_BASE_URL}/eye-comm/capture-eye`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return handleResponse(res) as Promise<EyeCaptureResponse>;
}

export async function listEyeCaptures(
  userId?: string,
  limit = 50,
): Promise<{ captures: EyeCaptureResponse[]; total: number }> {
  const url = new URL(`${API_BASE_URL}/eye-comm/captures`);
  if (userId) url.searchParams.set('user_id', userId);
  url.searchParams.set('limit', String(limit));
  const res = await fetch(url.toString(), { cache: 'no-store' });
  return handleResponse(res) as Promise<{ captures: EyeCaptureResponse[]; total: number }>;
}

export async function getEyeCaptureImage(captureId: string): Promise<string> {
  return `${API_BASE_URL}/eye-comm/captures/${captureId}/image`;
}
