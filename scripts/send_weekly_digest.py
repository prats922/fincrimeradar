#!/usr/bin/env python3
"""
FinCrimeRadar weekly compliance digest.

Scans the delta tracker's own output for the past 7 days, builds a
short HTML summary, and sends it as a real campaign through Brevo to
the list the newsletter signup form actually feeds now that
api/subscribe.js exists.

Required environment variables, set as GitHub Actions secrets:
  BREVO_API_KEY    same key used by the subscribe endpoint
  BREVO_LIST_ID    same list id used by the subscribe endpoint
  BREVO_SENDER_EMAIL   a verified sender address in your Brevo account
  BREVO_SENDER_NAME    display name for the sender, for example FinCrimeRadar

Design choices, and why:
  - Reads the delta pages already committed by the tracker rather than
    recomputing anything, this script has zero opinion on sanctions
    data, it only summarises what the tracker already published.
  - Sends via the Email Campaigns API, not the transactional SMTP
    endpoint, because this is a genuine one to many newsletter send to
    a list, not a per user transactional email.
  - Fails loudly and exits non zero on any Brevo error, this runs
    unattended on a schedule and a silent failure here would mean
    subscribers simply never receive anything with nobody noticing,
    exactly the failure mode that broke the signup form for months.
  - Reads a hidden metadata comment the tracker embeds in every page it
    writes, recording whether that day's run was a manual override.
    A subscriber seeing an unusually large amendment count with no
    explanation has no way to distinguish a deliberate one time
    correction from a data anomaly or a bug, this closes that gap by
    naming the exact day and threshold used, directly in the email.
"""

import glob
import html as html_escape
import os
import re
import sys
from datetime import date, datetime, timedelta

import requests

DELTA_DIR = "delta"
SITE = "https://fincrimeradar.org"
WINDOW_DAYS = 7

META_PATTERN = re.compile(
    r"<!--\s*fincrimeradar-meta:\s*trigger=(\S+)\s+override_active=(yes|no)\s+threshold=(\d+)\s*-->"
)

# Append new guides to the end of this list when they ship. get_featured_guides()
# always returns the last 3, so the newest guide rotates in and the oldest
# of the three rotates out automatically.
GUIDE_LIBRARY = [
    {
        "title": "The MLRO Handbook",
        "hook": "Who can become SMF16/17, the FCA's real approval bar, and where personal MLRO liability has actually been tested.",
        "url": "https://www.fincrimeradar.org/mlro-handbook-part1.html",
    },
    {
        "title": "The Crypto Guide",
        "hook": "What actually changes under the incoming FSMA cryptoasset regime, and what to do before the October 2027 deadline.",
        "url": "https://www.fincrimeradar.org/crypto-guide-part1.html",
    },
    {
        "title": "Knowledge Hub",
        "hook": "Practitioner-written guides on AML, sanctions, PEPs, and financial crime compliance, all free.",
        "url": "https://www.fincrimeradar.org/knowledge.html",
    },
]


def get_featured_guides():
    return GUIDE_LIBRARY[-3:]


def recent_delta_files():
    """Every delta/YYYY-MM-DD.html file dated within the trailing window."""
    cutoff = date.today() - timedelta(days=WINDOW_DAYS)
    found = []
    for path in sorted(glob.glob(f"{DELTA_DIR}/*.html")):
        m = re.search(r"(\d{4}-\d{2}-\d{2})\.html$", path)
        if not m:
            continue
        try:
            file_date = datetime.strptime(m.group(1), "%Y-%m-%d").date()
        except ValueError:
            continue
        if file_date >= cutoff:
            found.append((file_date, path))
    return sorted(found)


def extract_counts(page_html):
    """Pulls the four category counts straight out of a rendered delta
    page's own headings, rather than re-parsing raw data a second time.
    Returns a dict, missing categories default to zero."""
    counts = {"ADDED": 0, "DELISTED": 0, "AMENDED": 0, "RENAMED": 0}
    patterns = {
        "ADDED": r"New designations \((\d+)\)",
        "DELISTED": r"Delistings \((\d+)\)",
        "AMENDED": r"Amendments \((\d+)\)",
        "RENAMED": r"Identifier changes \((\d+)\)",
    }
    for key, pattern in patterns.items():
        m = re.search(pattern, page_html)
        if m:
            counts[key] = int(m.group(1))
    return counts


def extract_meta(page_html):
    """Reads the tracker's own trigger and override metadata comment.
    Older pages written before this comment existed simply won't match,
    defaulting to unknown trigger and no override, which is the correct
    safe assumption for historical pages rather than a false flag."""
    m = META_PATTERN.search(page_html)
    if not m:
        return {"trigger": "unknown", "override_active": False, "threshold": None}
    trigger, override_flag, threshold = m.groups()
    return {
        "trigger": trigger,
        "override_active": override_flag == "yes",
        "threshold": int(threshold),
    }


def build_digest_html(entries=None):
    # entries (delta-page data) is no longer required to build a digest.
    # The sanctions snapshot section that consumed it was removed 2026-07-20
    # because OpenSanctions cuts off the unauthenticated bulk endpoint the
    # delta tracker depends on, generate_delta_pages.py, on 2026-08-01, and
    # the workflow that produces delta pages is disabled ahead of that date.
    # Gating the whole digest on recent_delta_files() being non-empty (the
    # old behaviour) would silently stop the guides/Scenario Lab content
    # from sending too, once no delta page exists within the trailing
    # window, not just the sanctions section, which defeats the point of
    # decoupling this email from sanctions data. main() no longer applies
    # that gate. The parameter is kept, unused for now, in case a future
    # migration of generate_delta_pages.py to the authenticated OpenSanctions
    # API brings delta content back and this section is reinstated.
    period_end_date = date.today()
    period_start_date = period_end_date - timedelta(days=WINDOW_DAYS)
    period_start = period_start_date.strftime("%d %b")
    period_end = period_end_date.strftime("%d %b %Y")

    guides_html = ""
    for g in get_featured_guides():
        guides_html += f"""
        <div style="border:1px solid #E3E8E3;border-radius:8px;padding:16px 18px;margin-top:12px;">
          <div style="font-size:15px;font-weight:700;color:#0B7A57;">{g['title']}</div>
          <p style="font-size:13px;line-height:1.6;color:#3D4E5C;margin:6px 0 10px 0;">{g['hook']}</p>
          <a href="{g['url']}" style="color:#0B7A57;text-decoration:none;font-weight:600;font-size:13px;">Read the guide &rarr;</a>
        </div>"""

    return f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#F4F6F3;padding:24px;color:#0C1B2A;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
    <div style="background:#071912;padding:28px 32px;">
      <div style="color:#5DCAA5;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Weekly compliance digest</div>
      <div style="color:#ffffff;font-size:22px;font-weight:700;margin-top:8px;">{period_start} to {period_end}</div>
    </div>
    <div style="padding:28px 32px;">
      <div>
        <div style="color:#0B7A57;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">This week's guides</div>
        {guides_html}
      </div>
      <!-- RESERVED: "This week in financial crime" news roundup section goes here in a future update. Do not build yet. -->
      <div style="margin-top:28px;">
        <div style="color:#0B7A57;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">This week's tool</div>
        <div style="border:1px solid #E3E8E3;border-radius:8px;padding:16px 18px;margin-top:12px;">
          <div style="font-size:15px;font-weight:700;color:#0B7A57;">Scenario Lab</div>
          <p style="font-size:13px;line-height:1.6;color:#3D4E5C;margin:6px 0 10px 0;">Build the ownership tree, screen every entity, then make the call, approve, reject, or escalate. Two modules live now, KYC/KYB and Fraud Detection, 11 cases combined. Free, no signup.</p>
          <a href="{SITE}/scenario-lab.html" style="color:#0B7A57;text-decoration:none;font-weight:600;font-size:13px;">Try Scenario Lab &rarr;</a>
        </div>
      </div>
      <p style="font-size:12px;color:#66757F;margin-top:28px;">
        You are receiving this because you subscribed at fincrimeradar.org.
        Decision support, not legal advice.
      </p>
    </div>
  </div>
</body>
</html>"""


def send_campaign(subject, html_content):
    api_key = os.environ.get("BREVO_API_KEY")
    list_id = os.environ.get("BREVO_LIST_ID")
    sender_email = os.environ.get("BREVO_SENDER_EMAIL")
    sender_name = os.environ.get("BREVO_SENDER_NAME", "FinCrimeRadar")

    missing = [name for name, val in [
        ("BREVO_API_KEY", api_key),
        ("BREVO_LIST_ID", list_id),
        ("BREVO_SENDER_EMAIL", sender_email),
    ] if not val]
    if missing:
        sys.exit(f"ABORT: missing required environment variables: {', '.join(missing)}")

    headers = {
        "api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    create_payload = {
        "name": f"Weekly digest {date.today().isoformat()}",
        "subject": subject,
        "sender": {"name": sender_name, "email": sender_email},
        "type": "classic",
        "htmlContent": html_content,
        "recipients": {"listIds": [int(list_id)]},
    }

    r = requests.post(
        "https://api.brevo.com/v3/emailCampaigns",
        headers=headers,
        json=create_payload,
        timeout=30,
    )
    if r.status_code not in (200, 201):
        sys.exit(f"ABORT: Brevo campaign creation failed, status {r.status_code}: {r.text[:300]}")

    campaign_id = r.json().get("id")
    if not campaign_id:
        sys.exit(f"ABORT: Brevo did not return a campaign id: {r.text[:300]}")

    send_r = requests.post(
        f"https://api.brevo.com/v3/emailCampaigns/{campaign_id}/sendNow",
        headers=headers,
        timeout=30,
    )
    if send_r.status_code not in (200, 201, 204):
        sys.exit(
            f"ABORT: campaign {campaign_id} created but send failed, status "
            f"{send_r.status_code}: {send_r.text[:300]}"
        )

    print(f"Sent weekly digest, campaign id {campaign_id}.")


def main():
    # No longer gated on recent_delta_files() being non-empty. The digest's
    # content (guides, Scenario Lab) doesn't depend on delta pages since the
    # 2026-07-20 removal of the sanctions snapshot section, see the comment
    # in build_digest_html(). Sends every run regardless of sanctions
    # activity.
    digest_html = build_digest_html()

    period_end = date.today().strftime("%d %b %Y")
    subject = f"FinCrimeRadar weekly digest, week ending {period_end}"

    send_campaign(subject, digest_html)


if __name__ == "__main__":
    main()
