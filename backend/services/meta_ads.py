"""Meta (Facebook/Instagram) Ads connector.

READ insights (does NOT spend) and BOOST a winning organic post (the 4-call
chain), with everything created status=PAUSED until a human activates it.

Auth: ONE non-expiring System User token (Business Settings → System Users),
assigned the Ad Account + Page + IG account. No App Review needed for your own
business. Raw Graph API, version pinned.
"""
import os
import requests
from dotenv import load_dotenv

load_dotenv()
VERSION = os.getenv("META_GRAPH_VERSION", "v23.0")
BASE = f"https://graph.facebook.com/{VERSION}"

INSIGHT_FIELDS = ("spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,"
                  "actions,action_values,purchase_roas")


class MetaError(RuntimeError):
    pass


def _get(path: str, token: str, params: dict | None = None) -> dict:
    p = dict(params or {})
    p["access_token"] = token
    r = requests.get(f"{BASE}/{path}", params=p, timeout=30)
    if r.status_code >= 400:
        raise MetaError(f"Meta GET {path} {r.status_code}: {r.text[:300]}")
    return r.json()


def _post(path: str, token: str, data: dict) -> dict:
    d = dict(data)
    d["access_token"] = token
    r = requests.post(f"{BASE}/{path}", data=d, timeout=30)
    if r.status_code >= 400:
        raise MetaError(f"Meta POST {path} {r.status_code}: {r.text[:300]}")
    return r.json()


def _flatten_action(actions, key="link_click"):
    for a in actions or []:
        if a.get("action_type") == key:
            try:
                return float(a.get("value"))
            except (TypeError, ValueError):
                return None
    return None


def get_insights(account_id: str, token: str, level: str = "campaign",
                 date_preset: str = "last_7d", time_increment: int | None = None) -> list[dict]:
    """Returns flattened insight rows. Reads only — never spends."""
    params = {"level": level, "fields": INSIGHT_FIELDS, "date_preset": date_preset, "limit": 200}
    if time_increment:
        params["time_increment"] = time_increment
    data = _get(f"act_{account_id}/insights", token, params)
    rows = []
    for r in data.get("data", []):
        actions = r.get("actions")
        roas = None
        if r.get("purchase_roas"):
            try:
                roas = float(r["purchase_roas"][0].get("value"))
            except Exception:
                roas = None
        rows.append({
            "date_start": r.get("date_start"), "date_stop": r.get("date_stop"),
            "campaign_id": r.get("campaign_id"), "adset_id": r.get("adset_id"),
            "ad_id": r.get("ad_id"), "name": r.get("campaign_name") or r.get("ad_name"),
            "spend": float(r.get("spend", 0) or 0),
            "impressions": int(float(r.get("impressions", 0) or 0)),
            "clicks": int(float(r.get("clicks", 0) or 0)),
            "ctr": float(r.get("ctr", 0) or 0),
            "cpc": float(r.get("cpc", 0) or 0),
            "cpm": float(r.get("cpm", 0) or 0),
            "reach": int(float(r.get("reach", 0) or 0)),
            "frequency": float(r.get("frequency", 0) or 0),
            "link_clicks": _flatten_action(actions, "link_click"),
            "roas": roas,
        })
    return rows


def create_boost(token: str, ad_account_id: str, page_id: str, ig_user_id: str | None,
                 platform_post_id: str, daily_budget_kzt: float, name: str,
                 is_instagram: bool = True) -> dict:
    """4-call chain → campaign → adset (KZ geo) → adcreative (existing post) → ad.
    Everything PAUSED. Returns the external ids. Budget is whole tenge."""
    acct = f"act_{ad_account_id}"
    # 1) campaign
    camp = _post(f"{acct}/campaigns", token, {
        "name": f"BOOST · {name}", "objective": "OUTCOME_ENGAGEMENT",
        "status": "PAUSED", "special_ad_categories": "[]",
    })
    campaign_id = camp["id"]
    # 2) ad set — daily budget (minor units), geo = Kazakhstan
    adset = _post(f"{acct}/adsets", token, {
        "name": f"BOOST adset · {name}", "campaign_id": campaign_id,
        "daily_budget": int(round(daily_budget_kzt * 100)),
        "billing_event": "IMPRESSIONS", "optimization_goal": "POST_ENGAGEMENT",
        "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
        "targeting": '{"geo_locations":{"countries":["KZ"]}}',
        "status": "PAUSED",
    })
    adset_id = adset["id"]
    # 3) creative referencing the EXISTING organic post
    if is_instagram and ig_user_id:
        spec = ('{"page_id":"%s","instagram_user_id":"%s","source_instagram_media_id":"%s"}'
                % (page_id, ig_user_id, platform_post_id))
        creative = _post(f"{acct}/adcreatives", token, {
            "name": f"BOOST creative · {name}", "object_story_spec": spec,
        })
    else:
        creative = _post(f"{acct}/adcreatives", token, {
            "name": f"BOOST creative · {name}",
            "object_story_id": f"{page_id}_{platform_post_id}",
        })
    creative_id = creative["id"]
    # 4) ad — PAUSED
    ad = _post(f"{acct}/ads", token, {
        "name": f"BOOST ad · {name}", "adset_id": adset_id,
        "creative": '{"creative_id":"%s"}' % creative_id, "status": "PAUSED",
    })
    return {"campaign_id": campaign_id, "adset_id": adset_id,
            "creative_id": creative_id, "ad_id": ad["id"], "status": "PAUSED"}


def set_status(token: str, object_id: str, status: str) -> dict:
    """status ∈ ACTIVE / PAUSED — flip a campaign/adset/ad."""
    return _post(object_id, token, {"status": status})
