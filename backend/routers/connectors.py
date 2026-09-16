import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from database import get_db
import models
from services.security import encrypt, decrypt
from services import meta_ads

router = APIRouter(prefix="/api/connectors", tags=["connectors"])
settings_router = APIRouter(prefix="/api/settings", tags=["settings"])

# Platforms surfaced on the Connectors screen
KNOWN = ["meta", "instagram", "tiktok", "youtube", "higgsfield"]


@router.get("")
def list_connectors(db: Session = Depends(get_db)):
    have = {c.platform: c for c in db.query(models.Connector).all()}
    out = []
    for plat in KNOWN:
        c = have.get(plat)
        if c:
            out.append(c.serialize())
        else:
            out.append({"platform": plat, "status": "disconnected", "display_name": None,
                        "access_token": False, "meta": {}, "last_synced_at": None})
    return out


class ConnectorIn(BaseModel):
    display_name: Optional[str] = None
    account_id: Optional[str] = None
    access_token: Optional[str] = None
    scopes: Optional[List[str]] = None
    meta: Optional[Dict[str, Any]] = None


@router.put("/{platform}")
def upsert_connector(platform: str, body: ConnectorIn, db: Session = Depends(get_db)):
    c = db.query(models.Connector).filter(models.Connector.platform == platform).first()
    if not c:
        c = models.Connector(platform=platform); db.add(c)
    if body.display_name is not None:
        c.display_name = body.display_name
    if body.account_id is not None:
        c.account_id = body.account_id
    if body.access_token:
        c.access_token = encrypt(body.access_token)
    if body.scopes is not None:
        c.scopes = body.scopes
    if body.meta is not None:
        c.meta = body.meta
    c.status = "connected" if c.access_token else "disconnected"
    db.commit(); db.refresh(c)
    return c.serialize()


@router.post("/{platform}/test")
def test_connector(platform: str, db: Session = Depends(get_db)):
    c = db.query(models.Connector).filter(models.Connector.platform == platform).first()
    token = decrypt(c.access_token) if c and c.access_token else None
    meta = (c.meta if c and c.meta else {}) or {}
    if platform == "meta":
        token = token or os.getenv("META_SYSTEM_USER_TOKEN")
        acct = meta.get("ad_account_id") or os.getenv("META_AD_ACCOUNT_ID")
        if not token or not acct:
            return {"ok": False, "detail": "нет токена или ad_account_id"}
        try:
            rows = meta_ads.get_insights(acct, token, "account", "last_7d")
            if c:
                c.status = "connected"; c.last_synced_at = datetime.now(timezone.utc); db.commit()
            return {"ok": True, "detail": f"OK · {len(rows)} строк инсайтов"}
        except meta_ads.MetaError as e:
            if c:
                c.status = "error"; db.commit()
            return {"ok": False, "detail": str(e)}
    return {"ok": bool(token), "detail": "токен сохранён" if token else "нет токена"}


# ── settings (winner thresholds, cadence caps, UTM defaults, timezone) ──────
DEFAULT_SETTINGS = {
    "timezone": "Asia/Almaty",
    "winner_min_score": 500,
    "cadence_caps": {"instagram": 1, "tiktok": 3, "youtube": 2},
    "utm_default": {"medium": "organic_social"},
    # autopilot (strategist brain) — off by default; weekly local trigger
    "autopilot_enabled": False,
    "autopilot_weekday": 0,            # 0 = Monday
    "autopilot_hour": 9,
    "autopilot_n_products": 5,
}


@settings_router.get("")
def get_settings(db: Session = Depends(get_db)):
    rows = {s.key: s.value for s in db.query(models.Setting).all()}
    return {**DEFAULT_SETTINGS, **rows}


@settings_router.put("")
def put_settings(body: Dict[str, Any], db: Session = Depends(get_db)):
    for k, v in body.items():
        s = db.get(models.Setting, k)
        if not s:
            s = models.Setting(key=k, value=v); db.add(s)
        else:
            s.value = v
    db.commit()
    return get_settings(db)
