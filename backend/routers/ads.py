import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
import models
from services import meta_ads
from services.security import decrypt

router = APIRouter(prefix="/api/ads", tags=["ads"])


def _meta_creds(db: Session):
    """Token + ids from the stored connector, falling back to env."""
    c = db.query(models.Connector).filter(models.Connector.platform == "meta").first()
    token = decrypt(c.access_token) if c and c.access_token else os.getenv("META_SYSTEM_USER_TOKEN")
    meta = (c.meta if c and c.meta else {}) or {}
    return {
        "token": token,
        "ad_account_id": meta.get("ad_account_id") or os.getenv("META_AD_ACCOUNT_ID"),
        "page_id": meta.get("page_id") or os.getenv("META_PAGE_ID"),
        "ig_user_id": meta.get("ig_user_id") or os.getenv("META_IG_USER_ID"),
    }


@router.get("/insights")
def insights(date_preset: str = "last_7d", db: Session = Depends(get_db)):
    cr = _meta_creds(db)
    if cr["token"] and cr["ad_account_id"]:
        try:
            return {"source": "live", "rows": meta_ads.get_insights(
                cr["ad_account_id"], cr["token"], "campaign", date_preset, 1)}
        except meta_ads.MetaError as e:
            return {"source": "error", "error": str(e), "rows": []}
    # not connected → return stored insights so the dashboard still renders
    rows = [i.serialize() for i in db.query(models.AdInsight)
            .order_by(models.AdInsight.captured_at.desc()).limit(60).all()]
    return {"source": "stored", "rows": rows}


@router.get("/campaigns")
def campaigns(db: Session = Depends(get_db)):
    out = []
    for c in db.query(models.AdCampaign).order_by(models.AdCampaign.created_at.desc()).all():
        d = c.serialize()
        m = (db.query(models.AdInsight).filter(models.AdInsight.ad_campaign_id == c.id)
             .order_by(models.AdInsight.captured_at.desc()).first())
        d["latest"] = m.serialize() if m else None
        out.append(d)
    return out


class BoostBody(BaseModel):
    winner_id: int
    daily_budget_kzt: float = 2000


@router.post("/boost")
def boost(body: BoostBody, db: Session = Depends(get_db)):
    """Create a PAUSED boost behind a winning organic post. Never spends until activated."""
    w = db.get(models.Winner, body.winner_id)
    post = db.get(models.Post, w.post_id) if w else None
    if not post:
        raise HTTPException(404, "winner/post not found")
    if not post.platform_post_id:
        raise HTTPException(400, "у поста нет platform_post_id — нечего бустить (сначала опубликуй)")
    cr = _meta_creds(db)
    name = f"{post.platform} · idea{post.content_idea_id}"
    ids = {}
    if cr["token"] and cr["ad_account_id"] and cr["page_id"]:
        try:
            ids = meta_ads.create_boost(
                cr["token"], cr["ad_account_id"], cr["page_id"], cr["ig_user_id"],
                post.platform_post_id, body.daily_budget_kzt, name,
                is_instagram=(post.platform == "instagram"))
        except meta_ads.MetaError as e:
            raise HTTPException(400, f"Meta: {e}")
    camp = models.AdCampaign(
        platform="meta", winner_id=w.id, source_post_id=post.id,
        external_campaign_id=ids.get("campaign_id"), external_adset_id=ids.get("adset_id"),
        external_ad_id=ids.get("ad_id"), name=name, status="PAUSED",
        daily_budget_kzt=body.daily_budget_kzt)
    db.add(camp)
    w.boosted = True; w.action = "both" if w.variations_created else "boost"
    post.is_boosted = True
    db.commit(); db.refresh(camp)
    return {"campaign": camp.serialize(), "live": bool(ids)}


@router.post("/campaigns/{cid}/{action}")
def set_campaign_status(cid: int, action: str, db: Session = Depends(get_db)):
    if action not in ("activate", "pause"):
        raise HTTPException(400, "action must be activate|pause")
    c = db.get(models.AdCampaign, cid)
    if not c:
        raise HTTPException(404, "campaign not found")
    status = "ACTIVE" if action == "activate" else "PAUSED"
    cr = _meta_creds(db)
    if c.external_campaign_id and cr["token"]:
        try:
            meta_ads.set_status(cr["token"], c.external_campaign_id, status)
        except meta_ads.MetaError as e:
            raise HTTPException(400, f"Meta: {e}")
    c.status = status; db.commit()
    return c.serialize()
