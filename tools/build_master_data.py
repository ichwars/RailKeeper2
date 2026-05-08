import argparse
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from urllib.error import HTTPError, URLError
from pathlib import Path

import pandas as pd


MANUFACTURER_CATEGORIES = [
    "Kategorie:Hersteller (DDR Modelle und Modelle der DR in der DDR)",
    "Kategorie:Hersteller (Modelleisenbahn)",
    "Kategorie:Ehemaliger Hersteller (Modelleisenbahn)",
    "Kategorie:Kleinserienhersteller (Modelleisenbahn)",
]


def slug(value: str) -> str:
    value = unicodedata.normalize("NFKD", value.strip())
    value = value.encode("ascii", "ignore").decode("ascii").lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def clean(value) -> str:
    if value is None:
        return ""
    value = str(value).replace("\u00a0", " ").strip()
    return re.sub(r"\s+", " ", value)


def entry(type_: str, label: str, sort_order: int, metadata=None, source_url=""):
    key = slug(label)
    return {
        "id": f"{type_}:{key}",
        "type": type_,
        "key": key,
        "label": label,
        "active": True,
        "sortOrder": sort_order,
        "sourceUrl": source_url,
        "metadata": metadata or {},
    }


def railway_entries(path: Path):
    df = pd.read_excel(path, header=None).fillna("")
    out = []
    section = ""
    for _, row in df.iloc[2:].iterrows():
        abbreviation = clean(row.iloc[1])
        name = clean(row.iloc[2])
        country = clean(row.iloc[3])
        epoch = clean(row.iloc[4])
        if abbreviation and not name and not country and not epoch:
            section = abbreviation
            continue
        if not abbreviation or not name:
            continue
        out.append(entry("railway_company", abbreviation, len(out), {
            "name": name,
            "country": country,
            "epoch": epoch,
            "section": section,
        }))
    return out


def epoch_entries(path: Path):
    lines = [clean(line) for line in path.read_text(encoding="utf-8").splitlines()]
    return [entry("epoch", line, i) for i, line in enumerate(lines) if line]


def category_entries(path: Path):
    df = pd.read_excel(path).fillna("")
    categories = []
    gattungen = []
    relations = []
    seen_categories = set()
    seen_gattungen = set()
    for _, row in df.iterrows():
        category = clean(row["Kategorie"])
        gattung = clean(row["Gattung"])
        if not category or not gattung:
            continue
        if category not in seen_categories:
            seen_categories.add(category)
            categories.append(entry("vehicle_category", category, len(categories)))
        if gattung not in seen_gattungen:
            seen_gattungen.add(gattung)
            gattungen.append(entry("vehicle_gattung", gattung, len(gattungen)))
        relations.append({
            "id": f"vehicle_category:{slug(category)}->vehicle_gattung:{slug(gattung)}",
            "parentType": "vehicle_category",
            "parentKey": slug(category),
            "childType": "vehicle_gattung",
            "childKey": slug(gattung),
            "sortOrder": len(relations),
        })
    return categories + gattungen, relations


def gauge_entries(path: Path):
    df = pd.read_excel(path, header=None).fillna("")
    out = []
    for _, row in df.iloc[2:].iterrows():
        gauge = clean(row.iloc[2])
        if not gauge:
            continue
        out.append(entry("gauge", gauge, len(out), {
            "scale": clean(row.iloc[3]),
            "designation": clean(row.iloc[4]),
            "trackWidth": clean(row.iloc[5]),
        }))
    return out


def wiki_api(params):
    params = {"format": "json", **params}
    url = "https://www.modellbau-wiki.de/w/api.php?" + urllib.parse.urlencode(params)
    last_error = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError) as error:
            last_error = error
            time.sleep(0.5 + attempt)
    raise last_error


def category_members(category):
    members = []
    params = {
        "action": "query",
        "list": "categorymembers",
        "cmtitle": category,
        "cmnamespace": "0",
        "cmlimit": "500",
    }
    while True:
        data = wiki_api(params)
        members.extend(item["title"] for item in data.get("query", {}).get("categorymembers", []))
        cont = data.get("continue") or data.get("query-continue", {}).get("categorymembers")
        if not cont:
            break
        params.update(cont)
        time.sleep(0.05)
    return members


def page_details(title):
    try:
        data = wiki_api({
            "action": "query",
            "prop": "revisions|extlinks",
            "titles": title,
            "rvprop": "content",
            "rvslots": "main",
            "ellimit": "50",
        })
    except Exception:
        return "", []
    page = next(iter(data.get("query", {}).get("pages", {}).values()))
    text = ""
    if page.get("revisions"):
        rev = page["revisions"][0]
        text = rev.get("slots", {}).get("main", {}).get("*", rev.get("*", ""))
    links = [item.get("*", "") for item in page.get("extlinks", [])]
    return text, links


def nominal_scales(text):
    values = set()
    for match in re.finditer(r"\[\[Nenngröße(?: [^\]|#]+)?(?:\|Nenngröße)?\s*([^\]|#]+)", text):
        value = clean(match.group(1))
        value = value.replace("Nenngröße", "").strip()
        if value:
            values.add(value)
    for match in re.finditer(r"\bSpur\s+([A-Za-z0-9][A-Za-z0-9mepf]*)\b", text):
        values.add(clean(match.group(1)))
    return sorted(values)


def website(links):
    ignored = ("wikipedia.org", "wikimedia.org", "modellbau-wiki.de")
    candidates = []
    for link in links:
        if link.startswith("//"):
            link = "https:" + link
        if any(part in link for part in ignored):
            continue
        if link.startswith("http://") or link.startswith("https://"):
            candidates.append(link)
    return candidates[0] if candidates else ""


def manufacturer_entries():
    source_by_title = {}
    for category in MANUFACTURER_CATEGORIES:
        for title in category_members(category):
            source_by_title.setdefault(title, []).append(category)

    out = []
    for index, title in enumerate(sorted(source_by_title, key=str.lower)):
        text, links = page_details(title)
        source_url = "https://www.modellbau-wiki.de/wiki/" + urllib.parse.quote(title.replace(" ", "_"))
        out.append(entry("manufacturer", title, index, {
            "wikiTitle": title,
            "sourceCategories": source_by_title[title],
            "nominalScales": nominal_scales(text),
            "website": website(links),
        }, source_url))
        time.sleep(0.05)
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--railway", required=True, type=Path)
    parser.add_argument("--epochs", required=True, type=Path)
    parser.add_argument("--category-gattung", required=True, type=Path)
    parser.add_argument("--gauge", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    entries = []
    relations = []
    entries.extend(railway_entries(args.railway))
    entries.extend(epoch_entries(args.epochs))
    cg_entries, cg_relations = category_entries(args.category_gattung)
    entries.extend(cg_entries)
    relations.extend(cg_relations)
    entries.extend(gauge_entries(args.gauge))
    entries.extend(manufacturer_entries())

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({
        "entries": entries,
        "relations": relations,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "entries": len(entries),
        "relations": len(relations),
        "byType": {type_: sum(1 for item in entries if item["type"] == type_) for type_ in sorted({item["type"] for item in entries})},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
