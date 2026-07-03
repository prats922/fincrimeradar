#!/usr/bin/env python3
"""CI gate: refuse to publish malformed pages. Checks the newest delta page
for basic structural integrity and absence of unescaped junk."""
import glob, sys, re

pages = sorted(glob.glob("delta/*.html"))
if not pages:
    print("No delta pages to validate.")
    sys.exit(0)

p = pages[-1]
h = open(p).read()
errors = []
for tag in ("html", "head", "body", "main", "h1"):
    if f"<{tag}" not in h or f"</{tag}>" not in h:
        errors.append(f"missing <{tag}> structure")
if h.count("<table") != h.count("</table>"):
    errors.append("unbalanced tables")
if "\u2014" in h:
    errors.append("em dash present in output")
if re.search(r"\{\w+\}", h):
    errors.append("unrendered template placeholder")

if errors:
    sys.exit(f"VALIDATION FAILED for {p}: " + "; ".join(errors))
print(f"{p} validated clean.")
