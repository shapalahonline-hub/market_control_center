"""POST the curated catalog to the deployed MCC import endpoint."""
import json, urllib.request

BASE = "https://market-control-center-production.up.railway.app"
txt = open(r"C:\Users\Tard\Documents\work\market_control_center\scripts\_catalog_final_import.txt",
           encoding="utf-8").read()

def get_count():
    with urllib.request.urlopen(BASE + "/api/products", timeout=60) as r:
        return len(json.loads(r.read().decode("utf-8")))

before = get_count()
body = json.dumps({"text": txt}).encode("utf-8")
req = urllib.request.Request(BASE + "/api/products/import", data=body,
                             headers={"Content-Type": "application/json"}, method="POST")
with urllib.request.urlopen(req, timeout=120) as r:
    res = json.loads(r.read().decode("utf-8"))
after = get_count()
print(f"before={before} imported={res.get('imported')} after={after}")
