import secrets
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from database import get_db
import models
from services import claude_service, higgsfield

router = APIRouter(prefix="/api/content", tags=["content"])


def _slug():
    return secrets.token_urlsafe(5).replace("_", "").replace("-", "")[:7]


# ── Claude idea generation (gate #0 — operator approves ideas) ──────────────
class GenBody(BaseModel):
    product_id: int
    n: int = 6


@router.post("/ideas/generate")
def generate(body: GenBody, db: Session = Depends(get_db)):
    product = db.get(models.Product, body.product_id)
    if not product:
        raise HTTPException(404, "product not found")
    try:
        out = claude_service.generate_ideas(product.serialize(), body.n)
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    run = models.ClaudeRun(product_id=product.id, prompt=out["prompt"], model=out["model"],
                           response_raw=out["ideas"], n_ideas=len(out["ideas"]),
                           cost_estimate=out["cost_estimate"])
    db.add(run); db.flush()
    created = []
    for it in out["ideas"]:
        idea = models.ContentIdea(
            product_id=product.id, angle=it["angle"], hook=it["hook"], caption=it["caption"],
            hashtags=it["hashtags"], target_platforms=it["target_platforms"],
            status="draft", source="claude", claude_run_id=run.id)
        db.add(idea); created.append(idea)
    db.commit()
    return {"run_cost": out["cost_estimate"], "ideas": [i.serialize() for i in created]}


@router.get("/needs-asset")
def needs_asset(db: Session = Depends(get_db)):
    """The creative agent's worklist: ideas (draft/approved) that don't yet have a
    finished video. The agent generates one and attaches it via /asset/manual."""
    ready = {a.content_idea_id for a in
             db.query(models.Asset).filter(models.Asset.status == "ready")}
    ideas = (db.query(models.ContentIdea)
             .filter(models.ContentIdea.status.in_(("draft", "approved")))
             .order_by(models.ContentIdea.created_at.desc()).all())
    prod = {p.id: p for p in db.query(models.Product).all()}
    out = []
    for i in ideas:
        if i.id in ready:
            continue
        p = prod.get(i.product_id)
        out.append({
            "idea_id": i.id, "product_id": i.product_id,
            "product_title": p.title if p else "—",
            "product_image": p.image_url if p else None,
            "product_category": p.category if p else None,
            "product_kaspi_url": p.kaspi_url if p else None,
            "angle": i.angle, "hook": i.hook, "caption": i.caption,
            "target_platforms": i.target_platforms or [],
        })
    return out


@router.get("/ideas")
def list_ideas(status: Optional[str] = None, product_id: Optional[int] = None,
               db: Session = Depends(get_db)):
    q = db.query(models.ContentIdea)
    if status:
        q = q.filter(models.ContentIdea.status == status)
    if product_id:
        q = q.filter(models.ContentIdea.product_id == product_id)
    ideas = q.order_by(models.ContentIdea.created_at.desc()).all()
    pmap = {p.id: p.title for p in db.query(models.Product).all()}
    out = []
    for i in ideas:
        d = i.serialize(); d["product_title"] = pmap.get(i.product_id, "—"); out.append(d)
    return out


@router.post("/ideas/{iid}/approve")
def approve_idea(iid: int, db: Session = Depends(get_db)):
    i = db.get(models.ContentIdea, iid)
    i.status = "approved"; db.commit(); return i.serialize()


@router.post("/ideas/{iid}/reject")
def reject_idea(iid: int, db: Session = Depends(get_db)):
    i = db.get(models.ContentIdea, iid)
    i.status = "rejected"; db.commit(); return i.serialize()


# ── Fan an approved idea into per-platform posts (+ tracking links) ─────────
class FanoutBody(BaseModel):
    platforms: Optional[List[str]] = None


@router.post("/ideas/{iid}/fanout")
def fanout(iid: int, body: FanoutBody, db: Session = Depends(get_db)):
    idea = db.get(models.ContentIdea, iid)
    if not idea:
        raise HTTPException(404, "idea not found")
    product = db.get(models.Product, idea.product_id)
    platforms = body.platforms or idea.target_platforms or list(models.PLATFORMS)
    # don't double-fan: skip platforms this idea already has a post for
    existing = {p.platform for p in db.query(models.Post)
                .filter(models.Post.content_idea_id == iid)}
    posts = []
    for plat in platforms:
        if plat not in models.PLATFORMS or plat in existing:
            continue
        slug = _slug()
        link = models.Link(slug=slug, destination_url=(product.kaspi_url if product else None),
                           product_id=idea.product_id, utm_source=plat,
                           utm_medium="organic_social", utm_campaign=idea.angle,
                           utm_content=f"idea{idea.id}")
        db.add(link)
        post = models.Post(content_idea_id=idea.id, product_id=idea.product_id, platform=plat,
                           caption_final=idea.caption, hashtags_final=idea.hashtags,
                           link_slug=slug, state="idea")
        db.add(post); db.flush(); link.post_id = post.id
        posts.append(post)
    idea.status = "used"
    db.commit()
    return {"posts": [p.serialize() for p in posts]}


# ── Asset: manual upload (URL) or request Higgsfield generation ────────────
class AssetIn(BaseModel):
    public_url: str
    duration_sec: Optional[float] = None
    aspect_ratio: str = "9:16"


@router.post("/ideas/{iid}/asset/manual")
def attach_manual_asset(iid: int, body: AssetIn, db: Session = Depends(get_db)):
    idea = db.get(models.ContentIdea, iid)
    if not idea:
        raise HTTPException(404, "idea not found")
    asset = models.Asset(content_idea_id=iid, product_id=idea.product_id, kind="video",
                         public_url=body.public_url, duration_sec=body.duration_sec,
                         aspect_ratio=body.aspect_ratio, status="ready", source="manual_upload")
    db.add(asset); db.flush()
    for post in db.query(models.Post).filter(models.Post.content_idea_id == iid,
                                             models.Post.state == "idea").all():
        post.asset_id = asset.id; post.state = "asset_ready"
    db.commit()
    return asset.serialize()


@router.post("/ideas/{iid}/asset/request")
def request_asset(iid: int, db: Session = Depends(get_db)):
    idea = db.get(models.ContentIdea, iid)
    product = db.get(models.Product, idea.product_id) if idea else None
    if not idea:
        raise HTTPException(404, "idea not found")
    job = higgsfield.request_video(product.image_url if product else "",
                                   f"{idea.angle}. {idea.hook}")
    asset = models.Asset(content_idea_id=iid, product_id=idea.product_id, kind="video",
                         status="generating" if job["mode"] == "api" else "requested",
                         source="higgsfield" if job["mode"] == "api" else "manual_upload",
                         external_ref=job.get("job_id"))
    db.add(asset); db.commit()
    return {"asset": asset.serialize(), "job": job}
