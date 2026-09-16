# Creative Agent — playbook (AI video generation)

Turns the strategist's text ideas into real **product ad videos** using the Higgsfield
Marketing Studio MCP, then attaches each video to its idea so the human can review the
**finished creative** (not just text) before it goes to the publish queue.

This closes the gap in the loop: `brain idea → 🎬 AI video → human reviews creative →
approve → publish`.

## Engine
Higgsfield MCP (`mcp__…__*`). **~30 credits per ~6s 720p clip.** Check `balance`; use
`get_cost:true` to preflight; finite credits — **never bulk-generate without human OK.**

⚠️ **DO NOT use `marketing_studio_video` for our videos.** Its auto "UGC" mode *forcibly*
turns the clip into a **talking-head creator speaking ENGLISH**, ignoring both the
no-speech instruction and the Russian language (confirmed: it rewrote a Russian
no-speech prompt into an English spoken script). It also ignores `generate_audio:false`
when nested. **Wrong tool for our constraints.**

**Use a plain image-to-video model instead** (silent, controllable): `kling3_0`
(`sound:"off"`, ~7.5 cr/5s), `seedance_2_0` (`generate_audio:false`), or `grok_video_v15`.
Put `sound`/`generate_audio` at the TOP LEVEL of `params` (not nested).

### THE RECIPE (2-step) — gives engaging, on-brand, silent clips
1. **DON'T animate the raw Kaspi product card** — it's a flat catalog photo on a plain
   bg, so you just get a boring slow zoom (confirmed, user rejected it).
2. **Step 1 — build a scene** with `generate_image` (`nano_banana_2`), passing the Kaspi
   product image as a `medias` reference (`role:"image"`) so the real product is faithful,
   and a prompt that places it in a real **Almaty interior** with a **Kazakh/Slavic person**
   doing something visual (OOTD, demo, до→после). Photoreal, 9:16, no on-screen text.
   *Inspect the still (download + view) before spending on the video.*
3. **Step 2 — animate that still** with `kling3_0` `sound:"off"`, passing the image's
   `job_id` as `start_image`. Prompt = motion only (she half-turns, fixes hair, camera
   push-in) + "does NOT speak, mouth closed". Result: dynamic, silent, real-looking.
Proven: mirror OOTD reel (img job 822ceff6 → vid 1c3d1ebd) — engaging vs the card-zoom.

## API (the app)
- `GET /api/content/needs-asset` → ideas lacking a video, each: `{idea_id, product_id,
  product_title, product_image, product_category, product_kaspi_url, angle, hook,
  caption, target_platforms}`
- `POST /api/content/ideas/{idea_id}/asset/manual` `{public_url}` → attach the finished
  video (its posts move to `asset_ready`).

## The loop (per idea)
1. **Source a product image.** Prefer the real Kaspi photo: `media_import_url(product
   image URL)` → `media_id`. If the product image is a placeholder, grab the real one
   from the Kaspi card, or `generate_image(marketing_studio_image, …)` a clean product
   still as a fallback.
2. **Register the product in Marketing Studio** (once per product, reuse after):
   `show_marketing_studio(type='product', medias=[{value: media_id, role:'image'}],
   action='create')` → product UUID.
3. **Pick the preset from the idea's `angle`** (hooks/settings via
   `show_marketing_studio(type='hook'|'setting')`):
   - распаковка / unboxing → **Unboxing**
   - честный обзор / обзор → **Product Review**
   - демо / satisfying → **UGC** (or a motion hook like "Object flies into frame")
4. **Preflight + generate:** `generate_video(model='marketing_studio_video',
   product_ids:['<uuid>'], aspect_ratio:'9:16', duration:6, params:{resolution:'720p'},
   preset/hook_id/setting_id as chosen, prompt = the idea's hook)`. Poll until done;
   take the result video URL (`show_generations` / job result).
5. **Attach:** `POST /content/ideas/{idea_id}/asset/manual {public_url:<video_url>}`.
6. The idea now carries a real creative → it surfaces in **Авто-пилот / На проверку** for
   the human to approve or kill → approved → **Публикация** queue → posting agent.

## Hard constraints (KZ market)
- **NO HUMAN SPEAKING — ever.** Higgsfield's Russian text-to-speech / lip-sync is garbled
  and unusable. Do NOT put a spoken line or voiceover in the prompt. Make the video
  **silent** (`generate_audio: false`) — trending audio is added at posting — or rely on
  **on-screen Russian text + music/ambient**, never a talking creator. If a person is in
  frame they POSE / demo / react, mouth not forming speech.
- **NO PEOPLE / NO FACES.** AI-generated human faces & full-body motion hit the uncanny
  valley (confirmed — user rejected it). **Maximum human element = HANDS** interacting with
  the product (tracing a frame, placing, demoing). Prefer pure **product B-roll** (no
  humans at all): the product as hero in a styled scene, satisfying camera motion + light.
- **All text is Russian (KZ market).** Prompt in Russian; any on-screen caption in Russian
  (Kazakh on explicit request). Visuals = local Almaty interiors / context.
- Favour formats that need no speech: OOTD/примерочный, satisfying product B-roll,
  до→после, demo of features, unboxing — all carry on visuals alone.
- **Cost gate:** preflight + respect a per-run credit budget; report spend.
- **One video per idea** unless asked for variations; reuse Marketing Studio products
  across ideas of the same product.
- **Human still reviews** every generated creative — AI video isn't broadcast-perfect, so
  the gate stays. Reject → optionally regenerate with a different preset/hook.
- Vertical 9:16 only (Reels/TikTok/Shorts). Keep ≤15s.
