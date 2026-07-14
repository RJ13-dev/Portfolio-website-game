"""
Chatbot proxy for the Contact page.

The frontend posts here so my Gemini key never sits in the browser. I read the
key from GEMINI_API_KEY and call Google's REST API server-side. If there's no
key (or the call errors), I just return a friendly fallback so the site still
works locally.
"""

import json
import urllib.error
import urllib.request

from django.conf import settings
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

# Short brief about me so the bot answers like a resume assistant.
SYSTEM_PROMPT = (
    "You are a helpful assistant embedded in Rijul Sobti's portfolio website. "
    "Answer questions about Rijul concisely and professionally. "
    "Rijul is a Computer Science graduate (Software Engineering) from the "
    "University of Wollongong with IT support experience, building full-stack "
    "projects with Python, Django, and JavaScript. Keep answers short and "
    "friendly. If asked for contact details, share: rijulsobti575@gmail.com."
)

FALLBACK_REPLY = (
    "Thanks for your message! The live AI assistant isn't configured right "
    "now, but you can reach Rijul directly at rijulsobti575@gmail.com."
)

GEMINI_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent"
)


def _ask_gemini(api_key, model, message):
    """Call the Gemini REST API and return the reply text (or None on failure)."""
    url = GEMINI_ENDPOINT.format(model=model)
    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": message}]}],
        "generationConfig": {"maxOutputTokens": 400, "temperature": 0.7},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    candidates = data.get("candidates") or []
    if not candidates:
        return None
    parts = candidates[0].get("content", {}).get("parts") or []
    text = "".join(part.get("text", "") for part in parts).strip()
    return text or None


# Drop anything longer than this before it reaches the (paid) Gemini API.
MAX_MESSAGE_LENGTH = 2000


class ChatView(APIView):
    permission_classes = [permissions.AllowAny]
    # Throttled at 30/hour/IP (see DEFAULT_THROTTLE_RATES["chat"]) so nobody can
    # burn through the Gemini quota.
    throttle_scope = "chat"

    def post(self, request):
        user_message = (request.data.get("message") or "").strip()
        if not user_message:
            return Response(
                {"detail": "A 'message' field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(user_message) > MAX_MESSAGE_LENGTH:
            return Response(
                {"detail": "Message is too long (max %d characters)."
                 % MAX_MESSAGE_LENGTH},
                status=status.HTTP_400_BAD_REQUEST,
            )

        api_key = settings.GEMINI_API_KEY
        if not api_key:
            reply = FALLBACK_REPLY
            if settings.DEBUG:
                reply += " [debug: GEMINI_API_KEY is empty. Did you restart the server after editing .env?]"
            return Response({"reply": reply})

        try:
            reply = _ask_gemini(api_key, settings.GEMINI_MODEL, user_message)
            return Response({"reply": reply or FALLBACK_REPLY})
        except urllib.error.HTTPError as exc:
            # Google returns useful JSON error bodies; surface them in dev only.
            try:
                detail = exc.read().decode("utf-8")
            except Exception:
                detail = str(exc)
            if settings.DEBUG:
                return Response({"reply": f"[debug HTTP {exc.code}] {detail}"})
            return Response({"reply": FALLBACK_REPLY})
        except Exception as exc:
            if settings.DEBUG:
                return Response({"reply": f"[debug error] {type(exc).__name__}: {exc}"})
            # Never leak internal errors or the key; degrade gracefully.
            return Response({"reply": FALLBACK_REPLY})
