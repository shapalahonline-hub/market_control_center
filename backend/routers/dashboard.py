from datetime import datetime, timezone, timedelta
from collections import defaultdict
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
import models

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _latest_metric_map(db):
    out = {}
    for m in db.query(models.PostMetric).order_by(models.PostMetric.captured_at.asc()).all():
        out[m.post_id] = m   # later overwrites → latest wins
    return out


@router.get("")
def overview(db: Session = Depends(get_db)):
    now = datetime.utcnow()  # SQLite returns naive datetimes — compare naive-to-naive
    d7, d30 = now - timedelta(days=7), now - timedelta(days=30)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    posts = db.query(models.Post).all()
    latest = _latest_metric_map(db)

    posts_7 = sum(1 for p in posts if p.published_at and p.published_at >= d7)
    posts_30 = sum(1 for p in posts if p.published_at and p.published_at >= d30)
    views_30 = sum((latest[p.id].views or 0) for p in posts
                   if p.id in latest and p.published_at and p.published_at >= d30)
    reach_30 = sum((latest[p.id].reach or 0) for p in posts
                   if p.id in latest and p.published_at and p.published_at >= d30)

    clicks_30 = (db.query(models.Click).filter(models.Click.ts >= d30).count())
    winners_month = (db.query(models.Winner).filter(models.Winner.created_at >= month_start).count())

    camps = db.query(models.AdCampaign).all()
    active_boosts = sum(1 for c in camps if c.status == "ACTIVE")
    spend_mtd = 0.0
    cpcs = []
    for c in camps:
        ins = (db.query(models.AdInsight).filter(models.AdInsight.ad_campaign_id == c.id).all())
        for i in ins:
            if i.captured_at and i.captured_at >= month_start:
                spend_mtd += (i.spend_kzt or 0)
            if i.cpc_kzt:
                cpcs.append(i.cpc_kzt)
    avg_cpc = round(sum(cpcs) / len(cpcs), 1) if cpcs else None

    # 30-day timeseries: clicks/day (real) + views recorded/day
    days = [(d30 + timedelta(days=i)).date().isoformat() for i in range(31)]
    clk = defaultdict(int); vws = defaultdict(int)
    for c in db.query(models.Click).filter(models.Click.ts >= d30).all():
        clk[c.ts.date().isoformat()] += 1
    for m in db.query(models.PostMetric).filter(models.PostMetric.captured_at >= d30).all():
        vws[m.captured_at.date().isoformat()] += (m.views or 0)
    series = [{"date": d, "clicks": clk.get(d, 0), "views": vws.get(d, 0)} for d in days]

    # "Needs you"
    needs = []
    n_ideas = db.query(models.ContentIdea).filter(models.ContentIdea.status == "draft").count()
    if n_ideas:
        needs.append({"kind": "ideas", "count": n_ideas, "label": "идей на одобрение", "to": "/pipeline"})
    n_appr = db.query(models.Post).filter(models.Post.state == "asset_ready").count()
    if n_appr:
        needs.append({"kind": "approve", "count": n_appr, "label": "постов готовы к одобрению", "to": "/pipeline"})
    n_boost = db.query(models.AdCampaign).filter(models.AdCampaign.status == "PAUSED").count()
    if n_boost:
        needs.append({"kind": "boost", "count": n_boost, "label": "бустов на паузе — проверь и запусти", "to": "/ads"})

    # top winners
    prod = {p.id: p.title for p in db.query(models.Product).all()}
    pmap = {p.id: p for p in posts}
    top = []
    for w in db.query(models.Winner).order_by(models.Winner.score.desc()).limit(3).all():
        post = pmap.get(w.post_id)
        top.append({"id": w.id, "score": w.score, "platform": post.platform if post else None,
                    "product": prod.get(post.product_id) if post else None,
                    "caption": post.caption_final if post else None, "boosted": w.boosted})

    return {
        "kpis": {
            "winners_month": winners_month, "posts_7": posts_7, "posts_30": posts_30,
            "views_30": views_30, "reach_30": reach_30, "clicks_30": clicks_30,
            "active_boosts": active_boosts, "spend_mtd": round(spend_mtd), "avg_cpc": avg_cpc,
        },
        "series": series, "needs_you": needs, "top_winners": top,
    }
