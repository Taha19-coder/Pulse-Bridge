import httpx

from backend.core.config import settings


async def call_nvidia_chat(user_message: str) -> str:
    """Send a chat request to NVIDIA NIM's OpenAI-compatible endpoint."""
    api_key = settings.NVIDIA_NIMS_API_KEY
    if not api_key:
        raise RuntimeError("NVIDIA_NIMS_API_KEY is not set in the environment")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.NVIDIA_NIMS_CHAT_MODEL,
        "messages": [{"role": "user", "content": user_message}],
        "max_tokens": 512,
        "temperature": 1.0,
        "top_p": 0.95,
    }
    timeout = httpx.Timeout(connect=5.0, read=35.0, write=10.0, pool=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            json=payload,
            headers=headers,
        )
        resp.raise_for_status()
        try:
            data = resp.json()
            reply = data["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise RuntimeError("NVIDIA returned an invalid chat response") from exc

        if not isinstance(reply, str) or not reply.strip():
            raise RuntimeError("NVIDIA returned an empty chat response")
        return reply.strip()
