"""Strategist API: run the autopilot (plan + auto-draft), read the current plan
and history. The drafted ideas land in the review queue (/api/content/ideas?status=draft)."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
import models
from services import strategy_service

router = APIRouter(prefix="/api/strategy", tags=["strategy"])


class RunBody(BaseModel):
    n_products: int = 5


@router.post("/run")
def run_now(body: RunBody, db: Session = Depends(get_db)):
    """Trigger the strategist now: build the week's plan and auto-draft ideas."""
    try:
        return strategy_service.run_autopilot(db, max(1, min(10, body.n_products)), trigger="manual")
    except RuntimeError as e:
        raise HTTPException(400, str(e))


@router.get("/latest")
def latest(db: Session = Depends(get_db)):
    run = (db.query(models.StrategyRun)
           .order_by(models.StrategyRun.created_at.desc()).first())
    pending = (db.query(models.ContentIdea)
               .filter(models.ContentIdea.status == "draft").count())
    return {"run": run.serialize() if run else None, "pending_review": pending}


@router.get("/runs")
def history(db: Session = Depends(get_db)):
    rows = (db.query(models.StrategyRun)
            .order_by(models.StrategyRun.created_at.desc()).limit(10).all())
    return [r.serialize() for r in rows]
