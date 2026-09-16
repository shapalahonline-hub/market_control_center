from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
from services import claude_service

router = APIRouter(prefix="/api/winners", tags=["winners"])


def _week_of(dt: datetime) -> str:
    monday = dt - timedelta(days=dt.weekday())
    return monday.date().isoformat()


def _score(m: models.PostMetric) -> float:
    """24h-ish velocity + engagement quality. Views dominate, engagement rate lifts."""
    views = m.views or 0
    eng = (m.likes or 0) + (m.comments or 0) + 2 * (m.saves or 0) + 2 * (m.shares or 0)
    er = (eng / views) if views else 0
    return round(views * (1 + er) + (m.link_clicks or 0) * 50, 1)


@router.post("/compute")
def compute(db: Session = Depends(get_db)):
    """Score measuring posts; flag the top ones as this week's winners."""
    week = _week_of(datetime.now(timezone.utc))
    posts = db.query(models.Post).filter(models.Post.state.in_(("measuring", "published"))).all()
    scored = []
    for p in posts:
        m = (db.query(models.PostMetric).filter(models.PostMetric.post_id == p.id)
             .order_by(models.PostMetric.captured_at.desc()).first())
        if not m or not (m.views or 0):
            continue
        scored.append((p, _score(m)))
    scored.sort(key=lambda x: x[1], reverse=True)
    # winners = top 20% (min 1) above a floor
    cutoff = max(1, len(scored) // 5)
    created = 0
    for p, s in scored[:cutoff]:
        if s < 500:
            continue
        exists = (db.query(models.Winner)
                  .filter(models.Winner.post_id == p.id, models.Winner.week_of == week).first())
        if exists:
            exists.score = s; continue
        db.add(models.Winner(post_id=p.id, week_of=week, score=s,
                             reason="высокий охват + вовлечённость", action="boost"))
        created += 1
    db.commit()
    return {"week_of": week, "winners_created": created, "scored": len(scored)}


@router.get("")
def list_winners(db: Session = Depends(get_db)):
    rows = db.query(models.Winner).order_by(models.Winner.score.desc()).all()
    pmap = {p.id: p for p in db.query(models.Post).all()}
    prod = {p.id: p.title for p in db.query(models.Product).all()}
    out = []
    for w in rows:
        d = w.serialize()
        post = pmap.get(w.post_id)
        if post:
            d["platform"] = post.platform
            d["product_title"] = prod.get(post.product_id, "—")
            d["permalink"] = post.permalink
            d["caption"] = post.caption_final
            m = next(iter(db.query(models.PostMetric).filter(models.PostMetric.post_id == post.id)
                     .order_by(models.PostMetric.captured_at.desc()).limit(1)), None)
            d["metric"] = m.serialize() if m else None
        out.append(d)
    return out


@router.post("/{wid}/spin")
def spin_variation(wid: int, db: Session = Depends(get_db)):
    """Generate Claude variations of a winning angle (new draft ideas, variation tree)."""
    w = db.get(models.Winner, wid)
    post = db.get(models.Post, w.post_id) if w else None
    if not post:
        raise HTTPException(404, "winner/post not found")
    parent = db.get(models.ContentIdea, post.content_idea_id)
    product = db.get(models.Product, post.product_id)
    try:
        out = claude_service.generate_ideas(product.serialize(), 3)
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    run = models.ClaudeRun(product_id=product.id, prompt=out["prompt"], model=out["model"],
                           response_raw=out["ideas"], n_ideas=len(out["ideas"]),
                           cost_estimate=out["cost_estimate"])
    db.add(run); db.flush()
    children = []
    for it in out["ideas"]:
        c = models.ContentIdea(product_id=product.id, angle=it["angle"], hook=it["hook"],
                               caption=it["caption"], hashtags=it["hashtags"],
                               target_platforms=it["target_platforms"], status="draft",
                               source="claude", parent_idea_id=parent.id if parent else None,
                               claude_run_id=run.id)
        db.add(c); children.append(c)
    w.variations_created = (w.variations_created or 0) + len(children)
    w.action = "both" if w.boosted else "variation"
    db.commit()
    return {"variations": [c.serialize() for c in children]}
