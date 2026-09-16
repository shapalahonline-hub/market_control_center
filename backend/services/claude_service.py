"""Claude content engine — turns a product into organic short-video angles.

This is the FIRST human gate: Claude drafts ideas (status=draft); the operator
approves before any asset is generated. Real API calls; cheap; ships day one.
"""
import os
import json
import re
from dotenv import load_dotenv

load_dotenv()
_MODEL = os.getenv("CLAUDE_MODEL", "claude-opus-4-8")

SYSTEM = (
    "Ты — креативный директор для бренда Envizhl (товары для дома, продаётся на "
    "Kaspi.kz в Казахстане; бренд — единственный продавец на своих карточках). "
    "Делаешь короткие вертикальные видео (Reels / TikTok / YouTube Shorts), "
    "органика. Аудитория — Казахстан, RU/KZ. Цель ролика — досмотр и переход по "
    "ссылке в карточку Kaspi. Стиль НЕ глянцевый: демо, было→стало, satisfying-"
    "организация, проблема→решение, стайлинг, UGC-распаковка. Хук = первые 3 "
    "секунды, должен цеплять. Пиши живо, по-человечески, без воды."
)


def _build_prompt(product: dict, n: int, guidance: str = "") -> str:
    steer = (f"Маркетинговая установка стратега на эту неделю: {guidance}. "
             f"Обыграй её в идеях.\n\n" if guidance else "")
    return (
        f"Товар: «{product.get('title')}». Категория: {product.get('category') or '—'}. "
        f"Цена: {product.get('price_kzt') or '—'} ₸.\n\n"
        f"{steer}"
        f"Придумай {n} РАЗНЫХ идей коротких видео под этот товар. Каждая — отдельный "
        f"угол/формат. Верни СТРОГО JSON-массив без markdown, каждый элемент:\n"
        '{"angle": "короткое название формата (рус)", '
        '"hook": "текст/действие первых 3 секунд", '
        '"caption": "подпись к посту (рус, 1-2 предложения + CTA в карточку Kaspi)", '
        '"hashtags": ["#тег", "..."] (5-8 релевантных, микс RU/KZ/EN), '
        '"target_platforms": ["instagram","tiktok","youtube"] (где этот формат зайдёт лучше)}'
    )


def _parse_json_array(text: str):
    text = text.strip()
    # strip ```json fences if present
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    start = text.find("[")
    end = text.rfind("]")
    if start >= 0 and end > start:
        text = text[start:end + 1]
    return json.loads(text)


def generate_ideas(product: dict, n: int = 6, guidance: str = "") -> dict:
    """Returns {ideas: [...], raw, prompt, model, cost_estimate}.
    `guidance` (optional) lets the strategist steer the angles this week.
    Raises RuntimeError with a clear message if ANTHROPIC_API_KEY is missing."""
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY не задан в .env — Claude недоступен.")
    from anthropic import Anthropic
    client = Anthropic(api_key=key)
    prompt = _build_prompt(product, n, guidance)
    msg = client.messages.create(
        model=_MODEL, max_tokens=2000, system=SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
    ideas = _parse_json_array(text)
    # normalise
    clean = []
    for it in ideas:
        if not isinstance(it, dict):
            continue
        clean.append({
            "angle": str(it.get("angle", "")).strip()[:120],
            "hook": str(it.get("hook", "")).strip(),
            "caption": str(it.get("caption", "")).strip(),
            "hashtags": [str(h).strip() for h in (it.get("hashtags") or [])][:10],
            "target_platforms": [p for p in (it.get("target_platforms") or [])
                                 if p in ("instagram", "tiktok", "youtube")] or
                                ["instagram", "tiktok", "youtube"],
        })
    usage = getattr(msg, "usage", None)
    cost = 0.0
    if usage:
        # rough Opus pricing ($/Mtok): in 5 / out 25
        cost = (usage.input_tokens / 1e6) * 5 + (usage.output_tokens / 1e6) * 25
    return {"ideas": clean, "raw": text, "prompt": prompt,
            "model": _MODEL, "cost_estimate": round(cost, 4)}
