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
if re.search(r"\{\w+\}", h):
    errors.append("unrendered template placeholder")
if h.count("<table") != h.count("</table>"):
    errors.append("unbalanced tables")

# Em dash check applies to our own authored prose only, the eyebrow, the
# headline, the lede, the disclaimer, the practitioner action bullets.
# It deliberately excludes table cell content, since that is verbatim
# entity data pulled directly from OFAC, OFSI and other official sources.
# Official designation text legitimately uses em dashes as part of its
# actual wording, and rewriting or stripping that punctuation to satisfy
# a house style rule would mean altering government text we are supposed
# to display accurately and unaltered, a worse problem than the dash.
h_without_table_cells = re.sub(r"<td>.*?</td>", "", h, flags=re.DOTALL)
if "\u2014" in h_without_table_cells:
    errors.append("em dash present in our own authored content")

if errors:
    sys.exit(f"VALIDATION FAILED for {p}: " + "; ".join(errors))
print(f"{p} validated clean.")
