"""Final curated import builder -> writes pipe-delimited import text + summary."""
import sqlite3, io, re
from collections import Counter

DB = r"C:\Users\Tard\Documents\work\warehouse\backend\data\warehouse.db"
con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
rows = con.execute("SELECT sku, model, brand, price, internal_id FROM products "
                   "WHERE in_archive=0 AND sku IS NOT NULL AND sku!=''").fetchall()

def clean(s):
    s = re.sub(r"\s+", " ", (s or "").strip())
    s = re.sub(r"\s*\bнекач\b\s*", " ", s, flags=re.I)
    s = re.sub(r"(?<!\dx)(?<!\*)\b\d{5,}\b", "", s)
    s = re.sub(r"\s{2,}", " ", s).strip(" -–")
    return s.replace("креслочерно", "кресло черно")

groups = {}
for r in rows:
    groups.setdefault((r["internal_id"] or f"sku:{r['sku']}").strip(), []).append(r)
def pick(g):
    branded = [x for x in g if "envizhl" in clean(x["model"]).lower()]
    return max(branded or g, key=lambda x: (len(clean(x["model"])), x["price"] or 0))
prods = [pick(g) for g in groups.values()]

DROP_KW = ["ремень","попсокет","держатель","jele","воздушн","набор шарик","шарик",
           "конструктор","майнкрафт","бэтмобиль","квадроцикл","снегоубороч","поперечин",
           "tucson","hyundai","лыжи","пульт","онигири","пуско-заряд","комплект титан",
           "порш 911","ferrari","порше","подставка для ноут","матрасник","подушка для шеи"]
DROP_SKU = {"146427914", "147837594"}            # LiXiang, Детский барьер
TITLE_OVERRIDE = {
    "120269099": "Офисное кресло BOSS, коричневый",
    "100676328": "Офисное кресло Псих, белый",
    "143661338": "Кресло Envizhl Heaven Rest",
    "160240464": "Офисное кресло Envizhl CoreMesh+, серый",
    "143573127": "Офисное кресло Envizhl Spine Flex, серый",
}
CATS = [  # Бытовая техника BEFORE Освещение so "швабра" won't hit "бра"
 ("Кресла", ["кресло","стул","табурет","банкет"]),
 ("Зеркала", ["зеркало","aura line","aura","aurum","luna"]),
 ("Столы", ["стол","столик","столешниц","подстолье","primedesk","desk"]),
 ("Хранение", ["стеллаж","шкаф","тумба","этажерка","полка","комод","вешалка"]),
 ("Бытовая техника", ["пылесос","блендер","посудомоеч","аэрогриль","душев","гарнитур",
                       "швабра","отпариват","увлажнит","чайник","аэрохокей"]),
 ("Электроника", ["монитор","клавиатур","мышь"]),
 ("Мебель", ["пуф","кушетка","диван","раскладушка","кровать","манеж"]),
 ("Освещение", ["люстра","светильник","лампа","торшер"]),
 ("Декор", ["занавеска","штора","ковер","картина","ваза"]),
 ("Игровые", ["игровой стол","бильярд"]),
]
def categorize(t):
    t = t.lower()
    for cat, kws in CATS:
        if any(k in t for k in kws):
            return cat
    return None

lines, kept = [], []
for p in prods:
    sku = str(p["sku"])
    if sku in DROP_SKU:
        continue
    title = TITLE_OVERRIDE.get(sku) or clean(p["model"])
    if not title:
        continue
    if any(k in title.lower() for k in DROP_KW):
        continue
    cat = categorize(title)
    if not cat:               # uncategorisable -> not part of curated home line
        continue
    price = int(p["price"] or 0)
    url = f"https://kaspi.kz/shop/p/-{sku}/"
    lines.append(f"{sku} | {title} | {cat} | {price} | {url}")
    kept.append((cat, price, title))

open(r"C:\Users\Tard\Documents\work\market_control_center\scripts\_catalog_final_import.txt",
     "w", encoding="utf-8").write("\n".join(lines))

buf = io.StringIO()
buf.write(f"FINAL CURATED: {len(lines)} products\n\nby category:\n")
for cat, n in Counter(c for c, _, _ in kept).most_common():
    buf.write(f"  {n:>3}  {cat}\n")
buf.write("\nfull list (price desc):\n")
for cat, price, title in sorted(kept, key=lambda x: -x[1]):
    buf.write(f"  {price:>7} | {cat:<16} | {title}\n")
open(r"C:\Users\Tard\Documents\work\market_control_center\scripts\_catalog_final_summary.txt",
     "w", encoding="utf-8").write(buf.getvalue())
print(f"built {len(lines)} lines")
