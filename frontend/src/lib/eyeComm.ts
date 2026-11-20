import {
  BlinkEventsRequest,
  BlinkEventsResponse,
  CalibrateRequest,
  CalibrateResponse,
  EyeCommSessionResponse,
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


