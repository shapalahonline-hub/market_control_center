"""The strategist brain. Reads catalog + performance, asks Claude (as head of
marketing) for a weekly plan, then auto-drafts content ideas for each pick —
which land in the review queue as drafts (status=draft, source=autopilot).

This is the 'automated marketing strategy + automated content' half of the loop;
the human gate is approving the drafts before they go to posting."""
import os
import json
import re
from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session
import models
from services import claude_service

STRAT_SYSTEM = (
    "Ты — руководитель маркетинга бренда Envizhl (товары для дома, продаётся на "
    "Kaspi.kz в Казахстане; бренд — единственный продавец на своих карточках). "
    "Раз в неделю ты решаешь, какие товары продвигать через короткие органические "
    "видео (Reels / TikTok / YouTube Shorts) и под какими углами. Думаешь как "
    "ростовой маркетолог: усиливаешь то, что уже заходит; тестируешь неопробованные "
    "товары с высоким потенциалом; держишь разнообразие категорий; не повторяешь "
    "прошлую неделю. Цель — досмотры и переходы в карточку Kaspi. Без воды, по делу."
)


def week_of(dt: datetime = None) -> str:
    dt = dt or datetime.now(timezone.utc)
    return (dt - timedelta(days=dt.weekday())).date().isoformat()


def _parse_json_object(text: str):
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    s, e = text.find("{"), text.rfind("}")
    if s >= 0 and e > s:
        text = text[s:e + 1]
    return json.loads(text)


def gather_signals(db: Session) -> dict:
    """Compact snapshot the strategist reasons over."""
    products = db.query(models.Product).filter(models.Product.active.is_(True)).all()
    stats = {p.id: {"posts": 0, "views": 0, "clicks": 0} for p in products}
    for post in db.query(models.Post).all():
        s = stats.get(post.product_id)
        if not s:
            continue
        s["posts"] += 1
        m = (db.query(models.PostMetric)
             .filter(models.PostMetric.post_id == post.id)
             .order_by(models.PostMetric.captured_at.desc()).first())
        if m:
            s["views"] += m.views or 0
            s["clicks"] += m.link_clicks or 0

    postmap = {p.id: p for p in db.query(models.Post).all()}
    prodmap = {p.id: p for p in products}
    winner_pids, winner_rows = set(), []
    for w in db.query(models.Winner).order_by(models.Winner.score.desc()).limit(8):
        post = postmap.get(w.post_id)
        if not post:
            continue
        winner_pids.add(post.product_id)
        pr = prodmap.get(post.product_id)
        winner_rows.append({"product": pr.title if pr else "—", "score": w.score})

    cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    recent_pids = {i.product_id for i in
                   db.query(models.ContentIdea).filter(models.ContentIdea.created_at >= cutoff)}

    catalog = []
    for p in products:
        s = stats[p.id]
        catalog.append({
            "id": p.id, "title": p.title, "category": p.category or "—",
            "price": int(p.price_kzt or 0), "posts": s["posts"], "views": s["views"],
            "winner": p.id in winner_pids, "recently_used": p.id in recent_pids,
        })
    return {"catalog": catalog, "winners": winner_rows,
            "untried": sum(1 for c in catalog if c["posts"] == 0),
            "total_products": len(catalog)}


def _format_signals(sig: dict) -> str:
    lines = []
    for c in sig["catalog"]:
        if c["winner"]:
            tag = "★винер"
        elif c["posts"]:
            tag = f"опробован·{c['views']}просм·{c['posts']}пост"
        else:
            tag = "новый"
        if c["recently_used"]:
            tag += "·недавно"
        lines.append(f'{c["id"]} | {c["title"]} | {c["category"]} | {c["price"]}₸ | {tag}')
    win = "; ".join(f'{w["product"]} ({w["score"]})' for w in sig["winners"]) or "пока нет"
    return (f'Каталог ({sig["total_products"]} товаров, из них {sig["untried"]} ещё не пробовали):\n'
            + "\n".join(lines) + f"\n\nНедавние винеры: {win}")


def build_plan(db: Session, n_products: int = 5) -> dict:
    """Ask Claude for this week's marketing plan. Returns {summary, picks, cost}."""
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY не задан — стратег недоступен.")
    sig = gather_signals(db)
    prompt = (
        _format_signals(sig)
        + f"\n\nСоставь план на ближайшую неделю: выбери {n_products} товаров для "
          "продвижения. Верни СТРОГО JSON без markdown:\n"
          '{"summary":"2-4 предложения: суть стратегии недели (рус)",'
          '"picks":[{"product_id":<id из каталога выше>,'
          '"why":"1 строка: почему именно этот товар сейчас",'
          '"angles":["угол/формат 1","угол 2"],'
          '"platforms":["instagram","tiktok","youtube"],'
          '"n":<сколько идей сгенерировать под товар, 2-4>}]}\n\n'
          "Баланс: усиль винеров, протестируй новые товары с высоким потенциалом, "
          "держи разнообразие категорий, НЕ бери помеченные ·недавно."
    )
    from anthropic import Anthropic
    client = Anthropic(api_key=key)
    model = os.getenv("CLAUDE_MODEL", "claude-opus-4-8")
    msg = client.messages.create(model=model, max_tokens=2000, system=STRAT_SYSTEM,
                                 messages=[{"role": "user", "content": prompt}])
    text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
    data = _parse_json_object(text)

    valid = {c["id"] for c in sig["catalog"]}
    picks = []
    for p in (data.get("picks") or []):
        try:
            pid = int(p.get("product_id"))
        except (TypeError, ValueError):
            continue
        if pid not in valid or any(pid == x["product_id"] for x in picks):
            continue
        picks.append({
            "product_id": pid,
            "why": str(p.get("why", "")).strip(),
            "angles": [str(a).strip() for a in (p.get("angles") or [])][:4],
            "platforms": [x for x in (p.get("platforms") or []) if x in models.PLATFORMS]
                         or list(models.PLATFORMS),
            "n": max(1, min(4, int(p.get("n") or 3))),
        })
    usage = getattr(msg, "usage", None)
    cost = ((usage.input_tokens / 1e6) * 5 + (usage.output_tokens / 1e6) * 25) if usage else 0.0
    return {"summary": str(data.get("summary", "")).strip(), "picks": picks, "cost": round(cost, 4)}


def run_autopilot(db: Session, n_products: int = 5, trigger: str = "manual") -> dict:
    """Build the plan, persist it, and auto-draft ideas for each pick."""
    plan = build_plan(db, n_products)
    run = models.StrategyRun(week_of=week_of(), summary=plan["summary"], plan=[],
                             trigger=trigger, status="planned", cost_estimate=plan["cost"],
                             products_planned=len(plan["picks"]))
    db.add(run); db.flush()

    prodmap = {p.id: p for p in db.query(models.Product).all()}
    total_ideas, total_cost, plan_json = 0, plan["cost"], []
    for pick in plan["picks"]:
        product = prodmap.get(pick["product_id"])
        if not product:
            continue
        guidance = "; ".join(pick["angles"]) or pick["why"]
        try:
            out = claude_service.generate_ideas(product.serialize(), pick["n"], guidance=guidance)
        except RuntimeError:
            continue
        crun = models.ClaudeRun(product_id=product.id, prompt=out["prompt"], model=out["model"],
                                response_raw=out["ideas"], n_ideas=len(out["ideas"]),
                                cost_estimate=out["cost_estimate"])
        db.add(crun); db.flush()
        for it in out["ideas"]:
            db.add(models.ContentIdea(
                product_id=product.id, angle=it["angle"], hook=it["hook"], caption=it["caption"],
                hashtags=it["hashtags"], target_platforms=it["target_platforms"] or pick["platforms"],
                status="draft", source="autopilot", claude_run_id=crun.id))
            total_ideas += 1
        total_cost += out["cost_estimate"]
        plan_json.append({**pick, "title": product.title, "category": product.category,
                          "price": int(product.price_kzt or 0), "ideas_made": len(out["ideas"])})

    run.plan = plan_json
    run.ideas_generated = total_ideas
    run.cost_estimate = round(total_cost, 4)
    run.status = "generated"
    db.commit()
    return run.serialize()
