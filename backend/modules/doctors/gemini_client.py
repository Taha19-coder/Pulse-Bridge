import asyncio

from google import genai
from google.genai import types

from backend.core.config import settings


async def call_gemini_chat(user_message: str) -> str:
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set in the environment")

    client = genai.Client(
        api_key=settings.GEMINI_API_KEY,
        http_options=types.HttpOptions(timeout=30_000),
    )
    prompt = (
        "You are Pulse Bridge's health information assistant. Give clear general "
        "health information, do not diagnose or prescribe treatment, and advise "
        "users to consult a qualified healthcare professional for personal medical "
        f"decisions.\n\nUser message: {user_message}"
    )
    response = await asyncio.wait_for(
        asyncio.to_thread(
            client.models.generate_content,
            model=settings.GEMINI_CHAT_MODEL,
            contents=prompt,
        ),
        timeout=35,
    )
    if not response.text:
        raise RuntimeError("Gemini returned an empty chat response")
    return response.text
