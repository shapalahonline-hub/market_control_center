# Posting Agent — playbook (the "openclaw" routine)

Agent-based publishing for the Market Control Center. A Claude routine with browser
access drives the platform web UIs (Instagram / TikTok / YouTube) to publish approved
posts — **no official posting APIs, no app review**. It uses the accounts already
logged into the browser.

This is a *playbook*, not app code: the app exposes a publish queue + state machine;
the agent (a scheduled Claude-in-Chrome routine, or a human in a pinch) executes it.

## Prereqs
- The target platform account is **logged in** in the controlled browser
  (Instagram @envizhl.kz is; TikTok / YouTube need their own login first).
- The post has a **ready video asset** (`asset.public_url`). Until AI video-gen lands,
  attach the video manually (Pipeline → «Ассет») — the agent only ever sees posts that
  already have a real asset.

## API (base = the deployed app)
- `GET  /api/posts/publish-queue` → due posts, each: `{post_id, platform, product_title,
  caption, hashtags[], asset_url, share_link, scheduled_for}`
- `POST /api/posts/{id}/claim` → lock it (`state → publishing`). 409 if already taken.
- `POST /api/posts/{id}/published` `{platform_post_id, permalink}` → done (`→ measuring`).
- `POST /api/posts/{id}/fail` `{reason}` → back off (`→ failed`), human can retry.

## The loop
```
queue = GET /posts/publish-queue
for item in queue:
    if claim(item.post_id) == 409: continue          # someone else has it
    try:
        download item.asset_url
        publish on item.platform (steps below)        # upload + paste caption
        url = the new post's permalink/id
        POST /posts/{id}/published {platform_post_id: url, permalink: url}
    except anything:
        POST /posts/{id}/fail {reason: "<what broke>"}
    human-cadence pause 3–10 min between posts        # don't burst → anti-ban
```
Run it on a schedule (e.g. a few times a day) — NOT all at once. Bursty automated
posting is exactly what platforms flag (we already saw Meta throttle rapid actions).

## Per-platform steps

### Instagram (Reels) — primary, account logged in
1. `instagram.com` → new post (➕) → **Reels** → select the downloaded video.
2. Cover/trim screen → Next. Paste `caption` (already includes hashtags) into the
   caption box.
3. Share. Grab the resulting permalink (`instagram.com/reel/...`) for `published`.

### TikTok — needs login first
1. `tiktok.com/upload` → select video → paste `caption`.
2. Post. Capture the video URL.

### YouTube (Shorts) — needs login first
1. `youtube.com` → Create → Upload video (vertical ≤ 60s = Short) → select.
2. Title = first line of `caption`; description = full `caption`. Visibility: Public.
3. Publish; capture the watch URL.

## Notes / guardrails
- **One claim before each upload** — the `publishing` state is the lock; never upload a
  post you didn't successfully claim.
- **Verify before marking published** — only call `/published` after the post is actually
  live and you have its real URL. If unsure, call `/fail` instead.
- **Caption is ready-to-paste** — don't regenerate; it already has the hook + hashtags +
  the `/r/<slug>` Kaspi link (put the share_link in bio/first comment per platform norms).
- **Stop on friction** — captcha, "unusual activity", login wall → `/fail` and surface to
  the human; do not fight bot-detection.
- The published post then flows to `measuring`; the **analysis agent** (Phase 3) later
  scrapes its metrics back in.
