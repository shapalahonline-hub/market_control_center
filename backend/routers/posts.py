import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
import models

router = APIRouter(prefix="/api/posts", tags=["posts"])
PUBLIC_BASE = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000")


def _enrich(db, posts):
    pmap = {p.id: p.title for p in db.query(models.Product).all()}
    # latest metric per post
    out = []
    for p in posts:
        d = p.serialize()
        d["product_title"] = pmap.get(p.product_id, "—")
        m = (db.query(models.PostMetric).filter(models.PostMetric.post_id == p.id)
             .order_by(models.PostMetric.captured_at.desc()).first())
        d["latest"] = m.serialize() if m else None
        out.append(d)
    return out


@router.get("")
def list_posts(platform: Optional[str] = None, state: Optional[str] = None,
               db: Session = Depends(get_db)):
    q = db.query(models.Post)
    if platform:
        q = q.filter(models.Post.platform == platform)
    if state:
        q = q.filter(models.Post.state == state)
    posts = q.order_by(models.Post.created_at.desc()).all()
    return _enrich(db, posts)


@router.get("/kanban")
def kanban(db: Session = Depends(get_db)):
    cols = {s: [] for s in ("idea", "asset_ready", "approved", "scheduled",
                            "publishing", "published", "measuring")}
    for d in _enrich(db, db.query(models.Post).order_by(models.Post.created_at.desc()).all()):
        cols.setdefault(d["state"], []).append(d)
    return cols


def _due(scheduled_for, now):
    if scheduled_for is None:
        return True
    sf = scheduled_for
    if sf.tzinfo is not None:
        sf = sf.astimezone(timezone.utc).replace(tzinfo=None)
    return sf <= now


@router.get("/publish-queue")
def publish_queue(db: Session = Depends(get_db)):
    """What the posting agent should publish next: approved/scheduled posts that
    have a ready asset and are due — each with its full publish kit."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    candidates = (db.query(models.Post)
                  .filter(models.Post.state.in_(("approved", "scheduled")),
                          models.Post.asset_id.isnot(None))
                  .order_by(models.Post.scheduled_for.asc()).all())
    prod = {p.id: p.title for p in db.query(models.Product).all()}
    out = []
    for p in candidates:
        if not _due(p.scheduled_for, now):
            continue
        asset = db.get(models.Asset, p.asset_id)
        if not asset or not asset.public_url:
            continue  # no real video to upload yet
        tags = " ".join(p.hashtags_final or [])
        out.append({
            "post_id": p.id,
            "platform": p.platform,
            "product_title": prod.get(p.product_id, "—"),
            "caption": (p.caption_final or "") + ("\n\n" + tags if tags else ""),
            "hashtags": p.hashtags_final or [],
            "asset_url": asset.public_url,
            "aspect_ratio": asset.aspect_ratio,
            "share_link": f"{PUBLIC_BASE}/r/{p.link_slug}" if p.link_slug else None,
            "scheduled_for": p.scheduled_for.isoformat() if p.scheduled_for else None,
        })
    return out


@router.post("/{pid}/claim")
def claim(pid: int, db: Session = Depends(get_db)):
    """Agent locks a post before publishing it (prevents double-posting)."""
    p = db.get(models.Post, pid)
    if not p:
        raise HTTPException(404, "post not found")
    if p.state not in ("approved", "scheduled"):
        raise HTTPException(409, f"post not claimable (state={p.state})")
    p.state = "publishing"
    db.commit()
    return p.serialize()


class FailBody(BaseModel):
    reason: Optional[str] = None


@router.post("/{pid}/fail")
def mark_failed(pid: int, body: FailBody, db: Session = Depends(get_db)):
    """Agent reports a post failed to publish (back off; human can retry)."""
    p = db.get(models.Post, pid)
    if not p:
        raise HTTPException(404, "post not found")
    p.state = "failed"
    db.commit()
    return {"ok": True, "post_id": pid, "reason": body.reason}


@router.post("/{pid}/approve")
def approve(pid: int, db: Session = Depends(get_db)):
    p = db.get(models.Post, pid)
    if p.state not in ("asset_ready", "idea"):
        raise HTTPException(400, "post not ready to approve")
    p.state = "approved"; p.approved_at = datetime.now(timezone.utc); db.commit()
    return p.serialize()


class ScheduleBody(BaseModel):
    scheduled_for: datetime


@router.post("/{pid}/schedule")
def schedule(pid: int, body: ScheduleBody, db: Session = Depends(get_db)):
    p = db.get(models.Post, pid)
    p.scheduled_for = body.scheduled_for; p.state = "scheduled"; db.commit()
    return p.serialize()


class PublishedBody(BaseModel):
    platform_post_id: str
    permalink: Optional[str] = None


@router.post("/{pid}/published")
def mark_published(pid: int, body: PublishedBody, db: Session = Depends(get_db)):
    p = db.get(models.Post, pid)
    p.platform_post_id = body.platform_post_id
    p.permalink = body.permalink
    p.published_at = datetime.now(timezone.utc)
    p.state = "measuring"
    db.commit()
    return p.serialize()


class MetricBody(BaseModel):
    views: int = 0
    likes: int = 0
    comments: int = 0
    shares: int = 0
    saves: int = 0
    reach: int = 0
    link_clicks: int = 0
    avg_watch_pct: Optional[float] = None


@router.post("/{pid}/metric")
def add_metric(pid: int, body: MetricBody, db: Session = Depends(get_db)):
    if not db.get(models.Post, pid):
        raise HTTPException(404, "post not found")
    m = models.PostMetric(post_id=pid, source="manual", **body.model_dump())
    db.add(m); db.commit()
    return m.serialize()


@router.get("/{pid}/publish-kit")
def publish_kit(pid: int, db: Session = Depends(get_db)):
    """Everything needed to post manually on the due platform (anti-ban, human cadence)."""
    p = db.get(models.Post, pid)
    if not p:
        raise HTTPException(404, "post not found")
    asset = db.get(models.Asset, p.asset_id) if p.asset_id else None
    tags = " ".join(p.hashtags_final or [])
    return {
        "platform": p.platform,
        "caption": (p.caption_final or "") + ("\n\n" + tags if tags else ""),
        "hashtags": p.hashtags_final or [],
        "asset_url": asset.public_url if asset else None,
        "share_link": f"{PUBLIC_BASE}/r/{p.link_slug}" if p.link_slug else None,
    }
