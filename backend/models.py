"""Data model for the Market Control Center.

The spine is `Post` — ONE ROW PER PLATFORM. A `ContentIdea` (from Claude) fans
out into up to three Posts (instagram / tiktok / youtube), each moving through a
state machine: idea → asset_ready → approved → scheduled → published → measuring.
Two hard human gates: approve-before-publish and confirm-before-boost.
"""
from datetime import datetime, timezone
from sqlalchemy import (Column, Integer, String, Float, Boolean, DateTime,
                        ForeignKey, Text, JSON)
from database import Base


def utcnow():
    return datetime.now(timezone.utc)


# ── platform / state vocabularies (kept as plain strings for SQLite-friendliness)
PLATFORMS = ("instagram", "tiktok", "youtube")
POST_STATES = ("idea", "asset_ready", "approved", "scheduled", "publishing",
               "published", "measuring", "failed", "archived")


class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True)
    kaspi_sku = Column(String, index=True)
    title = Column(String, nullable=False)
    category = Column(String)
    kaspi_url = Column(String)        # the branded card link (sole seller → lands on us)
    image_url = Column(String)
    price_kzt = Column(Float, default=0)
    active = Column(Boolean, default=True)
    notes = Column(Text)
    created_at = Column(DateTime, default=utcnow)

    def serialize(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class ClaudeRun(Base):
    __tablename__ = "claude_runs"
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    prompt = Column(Text)
    model = Column(String)
    response_raw = Column(JSON)
    n_ideas = Column(Integer, default=0)
    cost_estimate = Column(Float, default=0)
    created_at = Column(DateTime, default=utcnow)


class ContentIdea(Base):
    __tablename__ = "content_ideas"
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"), index=True)
    angle = Column(String)            # e.g. "проблема→решение", "satisfying-организация"
    hook = Column(Text)               # the first-3-seconds line
    caption = Column(Text)
    hashtags = Column(JSON, default=list)
    target_platforms = Column(JSON, default=list)
    status = Column(String, default="draft")   # draft / approved / rejected / used
    source = Column(String, default="claude")  # claude / manual
    parent_idea_id = Column(Integer, ForeignKey("content_ideas.id"))  # variation tree
    claude_run_id = Column(Integer, ForeignKey("claude_runs.id"))
    created_at = Column(DateTime, default=utcnow)

    def serialize(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class Asset(Base):
    __tablename__ = "assets"
    id = Column(Integer, primary_key=True)
    content_idea_id = Column(Integer, ForeignKey("content_ideas.id"), index=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    kind = Column(String, default="video")     # video / image / thumbnail
    local_path = Column(String)
    public_url = Column(String)                # R2 / hosted, fetchable by IG
    duration_sec = Column(Float)
    aspect_ratio = Column(String, default="9:16")
    status = Column(String, default="requested")  # requested / generating / ready / failed
    source = Column(String, default="higgsfield") # higgsfield / manual_upload
    external_ref = Column(String)              # Higgsfield job_id / result_url
    created_at = Column(DateTime, default=utcnow)

    def serialize(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class Post(Base):
    """The spine — one row per platform."""
    __tablename__ = "posts"
    id = Column(Integer, primary_key=True)
    content_idea_id = Column(Integer, ForeignKey("content_ideas.id"), index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"))
    product_id = Column(Integer, ForeignKey("products.id"), index=True)
    platform = Column(String, nullable=False, index=True)   # instagram / tiktok / youtube
    caption_final = Column(Text)
    hashtags_final = Column(JSON, default=list)
    link_slug = Column(String)                 # → Link.slug for attribution
    state = Column(String, default="idea", index=True)
    publish_mode = Column(String, default="manual")  # manual / api
    scheduled_for = Column(DateTime)
    published_at = Column(DateTime)
    platform_post_id = Column(String)          # REQUIRED to boost a winner later
    permalink = Column(String)
    approved_at = Column(DateTime)
    is_boosted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)

    def serialize(self):
        d = {c.name: getattr(self, c.name) for c in self.__table__.columns}
        return d


class PostMetric(Base):
    """Time-series snapshots → growth curves + 24h view-velocity winner signal."""
    __tablename__ = "post_metrics"
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey("posts.id"), index=True)
    captured_at = Column(DateTime, default=utcnow, index=True)
    views = Column(Integer, default=0)
    likes = Column(Integer, default=0)
    comments = Column(Integer, default=0)
    shares = Column(Integer, default=0)
    saves = Column(Integer, default=0)
    reach = Column(Integer, default=0)
    watch_time_sec = Column(Float)             # YouTube only
    avg_watch_pct = Column(Float)
    link_clicks = Column(Integer, default=0)
    followers_gained = Column(Integer, default=0)
    source = Column(String, default="manual")  # manual / api
    raw = Column(JSON)

    def serialize(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class Winner(Base):
    __tablename__ = "winners"
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey("posts.id"), index=True)
    week_of = Column(String)                   # ISO week start (YYYY-MM-DD)
    score = Column(Float, default=0)
    reason = Column(String)
    action = Column(String, default="none")    # boost / variation / both / none
    boosted = Column(Boolean, default=False)
    variations_created = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)

    def serialize(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class StrategyRun(Base):
    """A weekly autonomous marketing plan from the strategist brain. `plan` holds
    the per-product picks (why + angles); ideas are then auto-drafted for review."""
    __tablename__ = "strategy_runs"
    id = Column(Integer, primary_key=True)
    week_of = Column(String, index=True)          # ISO Monday
    summary = Column(Text)                          # strategist's narrative rationale
    plan = Column(JSON, default=list)               # [{product_id,title,category,why,angles,n,platforms}]
    products_planned = Column(Integer, default=0)
    ideas_generated = Column(Integer, default=0)
    cost_estimate = Column(Float, default=0)
    trigger = Column(String, default="manual")      # manual / schedule
    status = Column(String, default="planned")      # planned / generated / failed
    error = Column(Text)
    created_at = Column(DateTime, default=utcnow)

    def serialize(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class AdCampaign(Base):
    """A paid boost behind a winning ORGANIC post (references the existing post object id)."""
    __tablename__ = "ad_campaigns"
    id = Column(Integer, primary_key=True)
    platform = Column(String, default="meta")  # meta / tiktok
    winner_id = Column(Integer, ForeignKey("winners.id"))
    source_post_id = Column(Integer, ForeignKey("posts.id"))
    external_campaign_id = Column(String)
    external_adset_id = Column(String)
    external_ad_id = Column(String)
    objective = Column(String, default="OUTCOME_ENGAGEMENT")
    name = Column(String)
    status = Column(String, default="PAUSED")  # PAUSED until human activates
    daily_budget_kzt = Column(Float, default=0)
    total_spend_kzt = Column(Float, default=0)
    start_at = Column(DateTime)
    end_at = Column(DateTime)
    created_at = Column(DateTime, default=utcnow)

    def serialize(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class AdInsight(Base):
    __tablename__ = "ad_insights"
    id = Column(Integer, primary_key=True)
    ad_campaign_id = Column(Integer, ForeignKey("ad_campaigns.id"), index=True)
    captured_at = Column(DateTime, default=utcnow)
    date_start = Column(String)
    date_stop = Column(String)
    spend_kzt = Column(Float, default=0)
    impressions = Column(Integer, default=0)
    clicks = Column(Integer, default=0)
    ctr = Column(Float, default=0)
    cpc_kzt = Column(Float, default=0)
    cpm_kzt = Column(Float, default=0)
    reach = Column(Integer, default=0)
    frequency = Column(Float, default=0)
    conversions = Column(Integer, default=0)
    roas = Column(Float)                       # nullable — proxy only, never precise
    actions = Column(JSON)

    def serialize(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class Link(Base):
    """First-party link-in-bio slug → the only between-post-and-sale signal."""
    __tablename__ = "links"
    id = Column(Integer, primary_key=True)
    slug = Column(String, unique=True, index=True)
    destination_url = Column(String)           # the Kaspi card
    product_id = Column(Integer, ForeignKey("products.id"))
    post_id = Column(Integer, ForeignKey("posts.id"))
    promo_code = Column(String)
    utm_source = Column(String)
    utm_medium = Column(String, default="organic_social")
    utm_campaign = Column(String)
    utm_content = Column(String)
    click_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)

    def serialize(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class Click(Base):
    __tablename__ = "clicks"
    id = Column(Integer, primary_key=True)
    link_id = Column(Integer, ForeignKey("links.id"), index=True)
    ts = Column(DateTime, default=utcnow)
    referrer = Column(String)
    ua = Column(String)
    ip_hash = Column(String)


class Connector(Base):
    __tablename__ = "connectors"
    id = Column(Integer, primary_key=True)
    platform = Column(String, index=True)      # meta / instagram / tiktok / youtube / higgsfield
    display_name = Column(String)
    account_id = Column(String)
    access_token = Column(Text)                # Fernet-encrypted at rest
    refresh_token = Column(Text)               # Fernet-encrypted at rest
    token_expires_at = Column(DateTime)
    scopes = Column(JSON, default=list)
    status = Column(String, default="disconnected")  # connected / disconnected / error
    last_synced_at = Column(DateTime)
    meta = Column(JSON, default=dict)          # page_id / ig_user_id / ad_account_id
    created_at = Column(DateTime, default=utcnow)

    def serialize(self, reveal=False):
        d = {c.name: getattr(self, c.name) for c in self.__table__.columns}
        # never leak tokens to the client
        d["access_token"] = bool(self.access_token)
        d["refresh_token"] = bool(self.refresh_token)
        return d


class Setting(Base):
    __tablename__ = "settings"
    key = Column(String, primary_key=True)
    value = Column(JSON)
