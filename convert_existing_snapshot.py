#!/usr/bin/env python3
"""
ONE TIME USE ONLY.

Converts an existing plain data/snapshot.json into the new gzip format
data/snapshot.json.gz, so the diff history is preserved instead of the
pipeline treating the next run as a fresh baseline.

Run this locally after downloading your current snapshot.json from the
repo, or run it once via a manual workflow_dispatch step, then delete
the old snapshot.json from the repo in the same commit.
"""
import gzip, json, os, sys

SRC = "data/snapshot.json"
DST = "data/snapshot.json.gz"

if not os.path.exists(SRC):
    sys.exit(f"ABORT: {SRC} not found. Nothing to convert.")

with open(SRC) as f:
    data = json.load(f)

with gzip.open(DST, "wt", encoding="utf-8") as f:
    json.dump(data, f)

old_size = os.path.getsize(SRC)
new_size = os.path.getsize(DST)
print(f"Converted {len(data)} records.")
print(f"{SRC}: {old_size/1_000_000:.2f} MB")
print(f"{DST}: {new_size/1_000_000:.2f} MB")
print(f"Reduction: {100*(1 - new_size/old_size):.1f} percent")
print(f"Delete {SRC} manually after confirming {DST} looks correct.")
