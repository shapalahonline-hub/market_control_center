"""Autonomous weekly trigger for the strategist. An hourly tick re-reads settings
(so toggling works without a restart) and fires run_autopilot once per week at the
configured local weekday+hour. Restart-safe and idempotent (one run/week)."""
from datetime import datetime

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

from database import SessionLocal
import models
from services import strategy_service

_sched = None

DEFAULTS = {
    "autopilot_enabled": False,
    "autopilot_weekday": 0,        # 0 = Monday
    "autopilot_hour": 9,           # local hour
    "autopilot_n_products": 5,
    "timezone": "Asia/Almaty",
}


def _settings(db):
    rows = {s.key: s.value for s in db.query(models.Setting).all()}
    return {**DEFAULTS, **rows}


def _tick():
    db = SessionLocal()
    try:
        cfg = _settings(db)
        if not cfg.get("autopilot_enabled"):
            return
        tz = ZoneInfo(cfg.get("timezone") or "Asia/Almaty") if ZoneInfo else None
        now = datetime.now(tz)
        if now.weekday() != int(cfg.get("autopilot_weekday", 0)) or \
           now.hour != int(cfg.get("autopilot_hour", 9)):
            return
        week = strategy_service.week_of()
        if (db.query(models.StrategyRun)
                .filter(models.StrategyRun.week_of == week,
                        models.StrategyRun.trigger == "schedule").first()):
            return  # already ran this week
        strategy_service.run_autopilot(db, int(cfg.get("autopilot_n_products", 5)),
                                       trigger="schedule")
        print("autopilot: scheduled weekly run complete", week)
    except Exception as e:  # never let the tick crash the worker
        print("autopilot tick error:", e)
    finally:
        db.close()


def start():
    global _sched
    if _sched is not None:
        return
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        _sched = BackgroundScheduler(daemon=True)
        _sched.add_job(_tick, "interval", hours=1, id="autopilot_tick",
                       coalesce=True, max_instances=1)
        _sched.start()
        print("autopilot scheduler started (hourly tick)")
    except Exception as e:
        print("scheduler start skipped:", e)
