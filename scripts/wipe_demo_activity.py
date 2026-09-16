"""Wipe seeded demo ACTIVITY from the deployed Postgres, keeping the real
catalog (products), connectors and settings. Reads the DB URL from env MCC_DB_URL."""
import os, psycopg2

url = os.environ["MCC_DB_URL"]
con = psycopg2.connect(url)
cur = con.cursor()

KEEP = ["products", "connectors", "settings"]
# children-first so FK constraints are satisfied
WIPE = ["clicks", "ad_insights", "ad_campaigns", "winners", "post_metrics",
        "links", "posts", "assets", "content_ideas", "claude_runs"]

def counts():
    out = {}
    for t in KEEP + WIPE:
        cur.execute(f"SELECT COUNT(*) FROM {t}")
        out[t] = cur.fetchone()[0]
    return out

before = counts()
print("BEFORE")
for t in KEEP + WIPE:
    print(f"  {before[t]:>5}  {t}")

for t in WIPE:
    cur.execute(f"DELETE FROM {t}")
con.commit()

after = counts()
print("\nAFTER")
for t in KEEP + WIPE:
    print(f"  {after[t]:>5}  {t}")
con.close()
print("\nkept products:", after["products"], "| activity rows now:",
      sum(after[t] for t in WIPE))
