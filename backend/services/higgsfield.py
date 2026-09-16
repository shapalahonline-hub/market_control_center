"""Higgsfield video connector.

Two paths feed the SAME asset row:
  • API: Cloud REST (key-pair auth `Key id:secret`) image→video, async job.
  • Manual: the operator generates in the Higgsfield web Creative Studio (their
    strong point) and uploads the result; the app just tracks the request.
If API keys aren't set, request_video returns a manual stub.
"""
import os
import requests
from dotenv import load_dotenv

load_dotenv()
BASE = "https://platform.higgsfield.ai"
KEY_ID = os.getenv("HIGGSFIELD_KEY_ID")
KEY_SECRET = os.getenv("HIGGSFIELD_KEY_SECRET")


def has_api() -> bool:
    return bool(KEY_ID and KEY_SECRET)


def request_video(image_url: str, prompt: str, webhook_url: str | None = None) -> dict:
    """Submit an image→video job. Returns {mode, job_id|None, status}."""
    if not has_api():
        return {"mode": "manual", "job_id": None, "status": "awaiting_manual_upload"}
    headers = {"Authorization": f"Key {KEY_ID}:{KEY_SECRET}",
               "Content-Type": "application/json"}
    payload = {"image_url": image_url, "prompt": prompt}
    if webhook_url:
        payload["webhook"] = {"url": webhook_url}
    r = requests.post(f"{BASE}/v1/image2video/dop", json=payload, headers=headers, timeout=60)
    if r.status_code >= 400:
        # fall back to manual rather than hard-fail the pipeline
        return {"mode": "manual", "job_id": None,
                "status": "api_error", "detail": r.text[:200]}
    data = r.json()
    return {"mode": "api", "job_id": data.get("id") or data.get("job_id"),
            "status": data.get("status", "generating")}
