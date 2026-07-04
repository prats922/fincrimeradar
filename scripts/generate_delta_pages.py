#!/usr/bin/env python3
"""
FinCrimeRadar Sanctions Delta Tracker: content factory core.

Daily flow:
  1. Fetch a slim export of the sanctions dataset (id, name, lists, change date)
  2. Diff against data/snapshot.json committed in the repo
  3. Classify: ADDED / DELISTED / AMENDED
  4. Render ONE grouped daily page at delta/YYYY-MM-DD.html
     with a practitioner action layer per change type
  5. Regenerate delta/index.html and append the new URL to sitemap.xml
  6. Save the new snapshot

Anomaly guardrail: if the diff exceeds MAX_SANE_CHANGES the job aborts
without publishing, because a huge diff means a source format change,
not a sanctions event.

VERIFY BEFORE FIRST RUN:
  - DATASET_URL must point at your slim export. With your OpenSanctions
    non-commercial key, prefer the per-dataset targets.simple.csv or an
    API-driven slim pull. Adjust parse_records() to match its columns.
"""

import csv, gzip, io, json, os, sys, html
from datetime import date, datetime, timezone

# ---------------- Configuration ----------------
DATASET_URL = os.environ.get(
    "DATASET_URL",
    "https://data.opensanctions.org/datasets/latest/sanctions/targets.simple.csv",
)
SNAPSHOT_PATH = "data/snapshot.json.gz"
DELTA_DIR = "delta"
SITEMAP_PATH = "sitemap.xml"
SITE = "https://fincrimeradar.org"
MAX_SANE_CHANGES = 2000  # guardrail: bigger diff = source anomaly, abort

TODAY = date.today().isoformat()

# ---------------- Practitioner action layer ----------------
# This judgement content is the uniqueness moat. Written once by an MLRO,
# rendered on every relevant page automatically.
ACTIONS = {
    "ADDED": (
        "Practitioner actions within 24 hours",
        [
            "Rescreen your live customer base and payment queues against the new designation, including known aliases.",
            "Check historic exposure: closed relationships and past transactions may still trigger reporting duties.",
            "For UK designations, assess whether an OFSI report is required and whether assets must be frozen immediately.",
            "Document the screening sweep and outcome, even if nil return. The audit trail is the control.",
        ],
    ),
    "DELISTED": (
        "Practitioner actions on delisting",
        [
            "Do not auto-clear. Verify the delisted identity matches your record precisely, including aliases and identifiers.",
            "Check whether the entity remains listed under any other regime before releasing restrictions.",
            "Retain all records relating to the prior designation. Delisting does not erase historic obligations.",
        ],
    ),
    "AMENDED": (
        "Practitioner actions on amendment",
        [
            "Review what changed: added aliases and identifiers widen your matching surface and may surface new hits.",
            "Rerun fuzzy screening if name variants were added. Yesterday's clear result may no longer hold.",
        ],
    ),
    "RENAMED": (
        "Practitioner actions on an identifier change",
        [
            "No new risk here. The source has reissued this record under a new identifier, the underlying designation has not changed.",
            "If your case management system references the old identifier, update the cross reference, do not treat this as a new designation event.",
        ],
    ),
}

# ---------------- Data handling ----------------

def fetch_records():
    import requests
    r = requests.get(DATASET_URL, timeout=120)
    r.raise_for_status()
    # Force UTF-8 decoding explicitly. requests falls back to Latin-1 per
    # old HTTP spec when a server does not declare charset in its
    # Content-Type header, which silently corrupts non-Latin names
    # (Cyrillic, Arabic, CJK) into mojibake without raising any error.
    r.encoding = "utf-8"
    return parse_records(r.text)


def parse_records(text):
    """Adjust column names here to match the verified export format."""
    records = {}
    reader = csv.DictReader(io.StringIO(text))
    fieldnames_logged = False
    # Candidate column names in priority order, since the real export's
    # naming was not confirmed before first production run and the
    # original guesses for the lists field did not match, leaving it blank.
    # Confirmed against a real production fetch log: the export uses
    # "sanctions" for programme text and "dataset" (singular) for the
    # collection name. Older guesses (datasets, lists) never matched,
    # which is why the Lists column previously rendered empty.
    LIST_FIELDS = ["sanctions", "dataset", "program_ids", "datasets", "lists", "topics", "sources", "programs", "schemes"]
    for row in reader:
        if not fieldnames_logged:
            print("CSV columns detected:", list(row.keys()))
            fieldnames_logged = True
        rid = row.get("id") or row.get("entity_id")
        if not rid:
            continue
        lists_val = ""
        for field in LIST_FIELDS:
            if row.get(field):
                lists_val = row[field].strip()
                break
        records[rid] = {
            "name": (row.get("name") or "").strip(),
            "lists": lists_val,
            # A sorted, order independent view of the same field, used only
            # for equality comparison in diff(). Confirmed on real production
            # data that OpenSanctions sometimes reorders the same semicolon
            # separated entries between fetches with zero actual content
            # change, which was previously counted as a false amendment.
            "lists_key": tuple(sorted(p.strip() for p in lists_val.split(";") if p.strip())),
            "changed": (row.get("last_change") or row.get("changed") or "").strip(),
        }
    return records


def load_snapshot():
    if not os.path.exists(SNAPSHOT_PATH):
        return None
    with gzip.open(SNAPSHOT_PATH, "rt", encoding="utf-8") as f:
        return json.load(f)


def _content_equal(old_rec, new_rec):
    """Compares two records ignoring pure reordering of the lists field
    and ignoring the internal lists_key helper itself."""
    if old_rec.get("name") != new_rec.get("name"):
        return False
    if old_rec.get("lists_key") != new_rec.get("lists_key"):
        return False
    return True


def diff(old, new):
    added_ids = [k for k in new if k not in old]
    delisted_ids = [k for k in old if k not in new]
    amended_ids = [
        k for k in new
        if k in old and not _content_equal(old[k], new[k])
    ]

    # ID churn detection: an entity delisted under one id and added under a
    # different id with an exactly matching name is almost always the same
    # real world record being reissued by the source under a new identifier
    # scheme, confirmed on real production data (OpenSanctions Russia MFA
    # dataset reissue), not a genuine delisting plus a genuine new
    # designation. Pull exact name matches into their own category instead
    # of double counting them as both ADDED and DELISTED.
    added_by_name = {}
    for k in added_ids:
        added_by_name.setdefault(new[k]["name"].strip().lower(), []).append(k)

    renamed_pairs = []
    still_delisted = []
    for k in delisted_ids:
        name_key = old[k]["name"].strip().lower()
        candidates = added_by_name.get(name_key)
        if candidates:
            new_id = candidates.pop()
            if not candidates:
                del added_by_name[name_key]
            renamed_pairs.append({"old_id": k, "new_id": new_id, "name": old[k]["name"]})
        else:
            still_delisted.append(k)

    remaining_added_ids = [k for ids in added_by_name.values() for k in ids]

    added = [dict(id=k, **new[k]) for k in remaining_added_ids]
    delisted = [dict(id=k, **old[k]) for k in still_delisted]
    amended = [dict(id=k, **new[k]) for k in amended_ids if k not in {p["new_id"] for p in renamed_pairs}]

    return {"ADDED": added, "DELISTED": delisted, "AMENDED": amended, "RENAMED": renamed_pairs}


# ---------------- Rendering ----------------

def esc(s):
    return html.escape(s or "")


def render_group(kind, items):
    if not items:
        return ""
    title, steps = ACTIONS[kind]
    rows = "\n".join(
        f'<tr><td><a href="/screen.html?q={esc(i["name"])}" class="delta-name">{esc(i["name"])}</a></td>'
        f"<td>{esc(i['lists'])}</td></tr>"
        for i in sorted(items, key=lambda x: x["name"])[:400]
    )
    actions = "\n".join(f"<li>{esc(s)}</li>" for s in steps)
    label = {"ADDED": "New designations", "DELISTED": "Delistings", "AMENDED": "Amendments"}[kind]
    return f"""
<section class="delta-group delta-{kind.lower()}">
  <h2>{label} ({len(items)})</h2>
  <table class="delta-table">
    <thead><tr><th>Entity</th><th>Lists</th></tr></thead>
    <tbody>{rows}</tbody>
  </table>
  <div class="delta-actions card">
    <h3>{esc(title)}</h3>
    <ul>{actions}</ul>
  </div>
</section>"""


def render_renamed(items):
    if not items:
        return ""
    title, steps = ACTIONS["RENAMED"]
    rows = "\n".join(
        f'<tr><td><a href="/screen.html?q={esc(i["name"])}" class="delta-name">{esc(i["name"])}</a></td>'
        f"<td>{esc(i['old_id'])}</td><td>{esc(i['new_id'])}</td></tr>"
        for i in sorted(items, key=lambda x: x["name"])[:400]
    )
    actions = "\n".join(f"<li>{esc(s)}</li>" for s in steps)
    return f"""
<section class="delta-group delta-renamed">
  <h2>Identifier changes ({len(items)})</h2>
  <table class="delta-table">
    <thead><tr><th>Entity</th><th>Old identifier</th><th>New identifier</th></tr></thead>
    <tbody>{rows}</tbody>
  </table>
  <div class="delta-actions card">
    <h3>{esc(title)}</h3>
    <ul>{actions}</ul>
  </div>
</section>"""


def render_page(changes):
    total = sum(len(v) for v in changes.values())
    body = "".join(render_group(k, changes[k]) for k in ("ADDED", "DELISTED", "AMENDED"))
    body += render_renamed(changes.get("RENAMED", []))
    return f"""<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sanctions List Changes {TODAY} | FinCrimeRadar Delta Tracker</title>
<meta name="description" content="Daily record of global sanctions watchlist changes for {TODAY}: {total} designations, delistings and amendments, with MLRO action guidance.">
<link rel="canonical" href="{SITE}/delta/{TODAY}.html">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/brand.css">
<link rel="stylesheet" href="/delta.css">
</head>
<body>
<main class="delta-page">
  <p class="eyebrow">Sanctions Delta Tracker</p>
  <h1>Watchlist changes: {TODAY}</h1>
  <p class="delta-lede">{total} change{'s' if total != 1 else ''} recorded across monitored regimes today.
  Compiled automatically from official public sources, with practitioner guidance from a working MLRO.
  Screen any name directly by clicking it.</p>
  {body}
  <p class="delta-disclaimer">Decision support, not legal advice. Always verify against the official source list before acting.</p>
</main>
<script defer src="/brand.js"></script>
</body>
</html>"""


def update_sitemap(url):
    with open(SITEMAP_PATH) as f:
        sm = f.read()
    if url in sm:
        return
    entry = f"  <url><loc>{url}</loc><lastmod>{TODAY}</lastmod></url>\n"
    sm = sm.replace("</urlset>", entry + "</urlset>")
    with open(SITEMAP_PATH, "w") as f:
        f.write(sm)


# ---------------- Main ----------------

def main():
    os.makedirs(DELTA_DIR, exist_ok=True)
    os.makedirs("data", exist_ok=True)

    new = fetch_records()
    if len(new) < 10000:
        sys.exit(f"ABORT: fetched only {len(new)} records, source looks broken")

    old = load_snapshot()
    if old is None:
        # First run: establish baseline only, publish nothing
        with gzip.open(SNAPSHOT_PATH, "wt", encoding="utf-8") as f:
            json.dump(new, f)
        print(f"Baseline snapshot created with {len(new)} records. No page published.")
        return

    changes = diff(old, new)
    total = sum(len(v) for v in changes.values())
    if total > MAX_SANE_CHANGES:
        breakdown = ", ".join(f"{k}={len(v)}" for k, v in changes.items())
        sys.exit(
            f"ABORT: {total} changes exceeds sanity threshold. Source anomaly suspected.\n"
            f"Breakdown: {breakdown}\n"
            f"Note: identifier churn and pure field reordering are already filtered "
            f"into RENAMED and excluded from AMENDED before this count runs, so a "
            f"large ADDED or DELISTED number here is less likely to be noise than it "
            f"used to be. Inspect actual entity names before overriding regardless."
        )
    if total == 0:
        print("No changes today.")
        return

    with open(f"{DELTA_DIR}/{TODAY}.html", "w") as f:
        f.write(render_page(changes))
    update_sitemap(f"{SITE}/delta/{TODAY}.html")
    with gzip.open(SNAPSHOT_PATH, "wt", encoding="utf-8") as f:
        json.dump(new, f)
    print(f"Published {DELTA_DIR}/{TODAY}.html with {total} changes.")


if __name__ == "__main__":
    main()
