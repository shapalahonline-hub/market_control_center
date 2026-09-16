import os
import hashlib
from datetime import datetime, timezone
from urllib.parse import urlencode, urlparse, parse_qs, urlunparse

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Depends
from fastapi.responses import RedirectResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from database import Base, engine, get_db
import models
from routers import (products, content, posts, winners, ads, links,
                     connectors, dashboard, strategy)

load_dotenv()
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Market Control Center", version="0.1.0")

for r in (products.router, content.router, posts.router, winners.router, ads.router,
          links.router, connectors.router, connectors.settings_router, dashboard.router,
          strategy.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "market-control-center"}


# ── First-party link-in-bio redirector (the only post→sale signal) ──────────
@app.get("/r/{slug}")
def redirect(slug: str, request: Request, db: Session = Depends(get_db)):
    link = db.query(models.Link).filter(models.Link.slug == slug).first()
    if not link or not link.destination_url:
        return RedirectResponse("https://kaspi.kz/shop/", status_code=302)
    ip = request.client.host if request.client else ""
    db.add(models.Click(
        link_id=link.id, ts=datetime.now(timezone.utc),
        referrer=request.headers.get("referer"), ua=request.headers.get("user-agent", "")[:300],
        ip_hash=hashlib.sha256((ip + "mcc").encode()).hexdigest()[:16]))
    link.click_count = (link.click_count or 0) + 1
    db.commit()
    # append UTM
    u = urlparse(link.destination_url)
    q = parse_qs(u.query)
    for k, v in (("utm_source", link.utm_source), ("utm_medium", link.utm_medium),
                 ("utm_campaign", link.utm_campaign), ("utm_content", link.utm_content)):
        if v:
            q[k] = [v]
    dest = urlunparse(u._replace(query=urlencode({k: vs[0] for k, vs in q.items()})))
    return RedirectResponse(dest, status_code=302)


# ── Jobs (winner compute / metric pull) — call from a cron or manually ──────
@app.post("/api/jobs/run")
def run_jobs(db: Session = Depends(get_db)):
    return winners.compute(db)


# ── Serve the built SPA in prod (Vite proxies /api in dev) ──────────────────
_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("r/"):
            return JSONResponse({"detail": "not found"}, status_code=404)
        index = os.path.join(_DIST, "index.html")
        return FileResponse(index)


@app.on_event("startup")
def _startup():
    try:
        from seed import seed_if_empty
        seed_if_empty()
    except Exception as e:  # never block startup on seed
        print("seed skipped:", e)
    try:
        from services import scheduler
        scheduler.start()
    except Exception as e:  # never block startup on the scheduler
        print("scheduler skipped:", e)
