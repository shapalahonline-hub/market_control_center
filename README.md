# Market Control Center · Envizhl

A standalone **organic-video content machine + marketing dashboard + Meta Ads connector**
for a Kazakhstan Kaspi.kz seller (brand Envizhl, sole seller on its own branded cards).

It runs the loop end to end:

```
Claude (angles · hooks · captions)
        ▼  [gate: approve idea]
Higgsfield Creative Studio (video)  ──or──  manual upload
        ▼  [gate: approve post]
Reels · TikTok · YouTube Shorts   →   link-in-bio → your Kaspi card (UTM + promo)
        ▼  weekly
Winner loop  →  paid boost on the same platform (Meta Ads, PAUSED until you confirm)
             →  spin winning angles into new variations (Claude)
```

Two **hard human gates** — approve before posting, confirm before spending — and a
**winners-per-month** north-star (95% of content flops; you measure winners, not followers).

---

## Stack

- **Backend** — FastAPI + SQLAlchemy 2 + SQLite (swap a Postgres `DATABASE_URL` for prod).
- **Frontend** — React + Vite + Tailwind, hand-built components in the warm "Claude" design language (no shadcn → zero setup risk).
- **Brains / connectors** — Claude (Anthropic SDK), Meta Marketing API (raw Graph), Higgsfield Cloud API (with a manual-upload escape hatch).
- **Attribution** — a first-party `/r/{slug}` redirector logs every click → the only post→sale signal (Kaspi is off-domain, so **ROAS is shown as a labelled proxy; cost-per-link-click is the real headline metric**).

## Screens

`Обзор` (KPIs + 30d activity + "needs you") · `Контент-конвейер` (kanban) · `Календарь`
(cadence guard) · `Аналитика` (per-platform) · `Винеры` (boost / spin) · `Реклама`
(Meta insights + boost) · `Коннекторы` (tokens, settings, product import).

---

## Run it locally

```bash
# 1. backend
cd backend
python -m venv .venv
.venv\Scripts\activate            # (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env            # fill in keys (all optional — app runs + seeds demo data without them)
uvicorn main:app --reload         # → http://localhost:8000  (seeds demo data on first run)

# 2. frontend (new terminal)
cd frontend
npm install
npm run dev                       # → http://localhost:5173  (proxies /api to :8000)
```

Open **http://localhost:5173**. The first backend start seeds realistic demo data so
every screen is alive before you connect anything.

### Production (single service)
`npm run build` in `frontend/`, then run the backend — it serves the built SPA from
`frontend/dist` (no CORS). Deploy as one Railway service (+ Railway Postgres); keep
APScheduler / `/api/jobs/run` alive with a cron or uptime ping.

---

## Connectors (what's live vs deferred)

| Connector | Status in v1 | What to add |
|---|---|---|
| **Claude** (ideas/hooks/captions) | **Live** | `ANTHROPIC_API_KEY` |
| **Meta Ads** — insights READ | **Live** (reads never spend) | System-User token + `META_AD_ACCOUNT_ID` |
| **Meta Ads** — boost WRITE | **Live, created `PAUSED`** — confirm in UI to spend | same token + `META_PAGE_ID` / `META_IG_USER_ID` |
| **Higgsfield** video | API wired + **manual-upload fallback** | `HIGGSFIELD_KEY_ID/SECRET` (else generate in the web Studio & upload) |
| **Posting** (Reels/TikTok/Shorts) | **Publish-kit / manual** for now | a future Claude routine / agent publishes (interface is ready) |
| **Redirector + clicks** | **Live, fully owned** | nothing |

**Meta token** = one non-expiring System User token (Business Settings → System Users),
assigned your Ad Account + Page + IG account, scopes `ads_read, ads_management,
business_management, pages_show_list, instagram_basic`. No App Review for your own business.
Tokens are Fernet-encrypted at rest (`FERNET_KEY`) and never committed.

> Safety: boosts are always created `PAUSED`; you verify budget/targeting and click
> **Запустить** (with a confirm) to actually spend. Test on a sandbox ad account or with a
> minimal budget first.

## Deferred to v2 (intentionally)
Multi-tenant auth, Facebook-Login OAuth for others, automated IG/TikTok/YouTube publishing
(needs App Review / audits — manual-first matches the anti-ban human-cadence rule), and
in-app long-form video stitching.

Source vision: Obsidian → *«Креатив — 2 мини-проекта»* (Мини-проект 2 «Контент-машина»).
