"""First-run demo data so every screen looks alive before any API is connected.
Only runs when the products table is empty."""
import random
import secrets
from datetime import datetime, timezone, timedelta

from database import SessionLocal
import models

NOW = datetime.now(timezone.utc)
random.seed(7)

PRODUCTS = [
    ("167557618", "Игровое кресло Envizhl NeonStrike, чёрный, мультиколор", "Кресла", 95000,
     "https://kaspi.kz/shop/p/-167557618/"),
    ("167552531", "Envizhl VELORA premium стайлер + подарок", "Стайлеры", 49500,
     "https://kaspi.kz/shop/p/-167552531/"),
    ("165023782", "Envizhl зеркало Organic Wave 60x160 см, напольное", "Зеркала", 169500,
     "https://kaspi.kz/shop/p/-165023782/"),
    ("165737291", "Envizhl Clean X1 белый + подарок", "Бытовая техника", 41000,
     "https://kaspi.kz/shop/p/-165737291/"),
    ("167395719", "Компьютерное кресло Envizhl Panda, чёрный", "Кресла", 73000,
     "https://kaspi.kz/shop/p/-167395719/"),
    ("162388198", "Envizhl люстра Aurora LED, потолочная", "Освещение", 22900,
     "https://kaspi.kz/shop/p/-162388198/"),
]

ANGLES = [
    ("проблема→решение", "Не можешь сидеть за компом дольше часа? Лови."),
    ("было→стало", "Эта комната до и после за 15 секунд."),
    ("satisfying-сборка", "Просто посмотри, как это собирается."),
    ("UGC-распаковка", "Что приехало с Kaspi за 95 000 ₸."),
    ("стайлинг комнаты", "3 способа вписать это в интерьер."),
    ("честный обзор", "Купил сам — рассказываю без приукрас."),
]
HASHTAGS = ["#kaspi", "#алматы", "#астана", "#envizhl", "#обзор", "#дом", "#kazakhstan", "#уют"]
PLATFORMS = ["instagram", "tiktok", "youtube"]


def seed_if_empty():
    db = SessionLocal()
    try:
        if db.query(models.Product).count() > 0:
            return
        prods = []
        for sku, title, cat, price, url in PRODUCTS:
            p = models.Product(kaspi_sku=sku, title=title, category=cat, price_kzt=price,
                               kaspi_url=url, active=True,
                               image_url="https://placehold.co/600x800/F0E6E0/C15F3C?text=Envizhl")
            db.add(p); prods.append(p)
        db.flush()

        # connectors: meta present-but-disconnected, the rest disconnected
        db.add(models.Connector(platform="meta", display_name="Envizhl Business",
                                status="disconnected", meta={}))
        db.commit()

        states = ["idea", "asset_ready", "approved", "scheduled", "measuring", "measuring",
                  "measuring", "measuring", "published", "idea"]
        all_posts = []
        for k in range(10):
            prod = random.choice(prods)
            angle, hook = random.choice(ANGLES)
            tags = random.sample(HASHTAGS, 6)
            idea = models.ContentIdea(
                product_id=prod.id, angle=angle, hook=hook,
                caption=f"{hook} Ссылка в шапке профиля → Kaspi. {prod.title.split(',')[0]}.",
                hashtags=tags, target_platforms=random.sample(PLATFORMS, random.randint(1, 3)),
                status=random.choice(["draft", "draft", "approved", "used"]), source="claude")
            db.add(idea); db.flush()
            asset = None
            if k < 8:
                asset = models.Asset(content_idea_id=idea.id, product_id=prod.id, kind="video",
                                     public_url="https://example.com/clip.mp4", duration_sec=14,
                                     status="ready", source="manual_upload")
                db.add(asset); db.flush()
            for plat in idea.target_platforms:
                state = states[k] if k < len(states) else "idea"
                slug = secrets.token_urlsafe(5)[:7]
                pub_at = NOW - timedelta(days=random.randint(1, 26)) if state in ("measuring", "published") else None
                post = models.Post(
                    content_idea_id=idea.id, asset_id=asset.id if asset else None,
                    product_id=prod.id, platform=plat, caption_final=idea.caption,
                    hashtags_final=idea.hashtags, link_slug=slug, state=state,
                    scheduled_for=(NOW + timedelta(days=random.randint(1, 5))) if state == "scheduled" else None,
                    published_at=pub_at,
                    platform_post_id=(str(random.randint(10**16, 10**17)) if pub_at else None),
                    permalink=(f"https://{plat}.com/p/{slug}" if pub_at else None))
                db.add(post); db.flush()
                link = models.Link(slug=slug, destination_url=prod.kaspi_url, product_id=prod.id,
                                   post_id=post.id, utm_source=plat, utm_medium="organic_social",
                                   utm_campaign=angle, utm_content=f"idea{idea.id}")
                db.add(link); db.flush()
                all_posts.append((post, link, pub_at))

        # metrics over time + clicks for published posts
        db.flush()
        for post, link, pub_at in all_posts:
            if not pub_at:
                continue
            base = random.choice([800, 1500, 4200, 900, 12000, 30000, 2200, 700])
            days_live = max(1, (NOW - pub_at).days)
            for d in range(0, days_live, max(1, days_live // 4)):
                cap = pub_at + timedelta(days=d)
                grow = base * (0.4 + 0.6 * (d + 1) / days_live) * random.uniform(0.9, 1.2)
                views = int(grow)
                clicks = int(views * random.uniform(0.002, 0.006))
                db.add(models.PostMetric(
                    post_id=post.id, captured_at=cap, views=views,
                    likes=int(views * random.uniform(0.02, 0.08)),
                    comments=int(views * random.uniform(0.001, 0.006)),
                    shares=int(views * random.uniform(0.001, 0.01)),
                    saves=int(views * random.uniform(0.003, 0.02)),
                    reach=int(views * random.uniform(0.7, 0.95)),
                    link_clicks=clicks, avg_watch_pct=random.uniform(28, 62), source="manual"))
            total_clicks = int(base * random.uniform(0.002, 0.006))
            for _ in range(min(total_clicks, 40)):
                db.add(models.Click(link_id=link.id,
                                    ts=pub_at + timedelta(days=random.uniform(0, days_live)),
                                    referrer=f"https://{post.platform}.com/", ua="seed", ip_hash="seed"))

        db.commit()

        # winners + one boosted campaign with insights
        from routers.winners import compute as compute_winners
        compute_winners(db)
        top = db.query(models.Winner).order_by(models.Winner.score.desc()).first()
        if top:
            wp = db.get(models.Post, top.post_id)
            camp = models.AdCampaign(platform="meta", winner_id=top.id, source_post_id=wp.id,
                                     name=f"{wp.platform} · boost", status="ACTIVE",
                                     daily_budget_kzt=3000,
                                     start_at=NOW - timedelta(days=6))
            db.add(camp); db.flush()
            top.boosted = True; top.action = "boost"; wp.is_boosted = True
            for d in range(6):
                spend = random.uniform(2600, 3200)
                imp = int(spend * random.uniform(7, 12))
                clk = int(imp * random.uniform(0.012, 0.03))
                db.add(models.AdInsight(
                    ad_campaign_id=camp.id, captured_at=NOW - timedelta(days=5 - d),
                    date_start=(NOW - timedelta(days=5 - d)).date().isoformat(),
                    spend_kzt=spend, impressions=imp, clicks=clk,
                    ctr=round(clk / imp * 100, 2), cpc_kzt=round(spend / max(clk, 1), 1),
                    cpm_kzt=round(spend / imp * 1000, 1), reach=int(imp * 0.8),
                    frequency=round(random.uniform(1.1, 1.6), 2), roas=None))
            camp.total_spend_kzt = sum(i.spend_kzt for i in
                                       db.query(models.AdInsight).filter(models.AdInsight.ad_campaign_id == camp.id))
            db.commit()
        print("seeded demo data")
    finally:
        db.close()
