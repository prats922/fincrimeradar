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


def build_digest_html(entries):
    if not entries:
        return None

    total_added = sum(e["counts"]["ADDED"] for e in entries)
    total_delisted = sum(e["counts"]["DELISTED"] for e in entries)
    total_amended = sum(e["counts"]["AMENDED"] for e in entries)
    total_renamed = sum(e["counts"]["RENAMED"] for e in entries)

    rows = ""
    for e in entries:
        c = e["counts"]
        rows += f"""
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #E3E8E3;">
            <a href="{SITE}/delta/{e['date'].isoformat()}.html" style="color:#0B7A57;text-decoration:none;font-weight:600;">
              {e['date'].strftime('%d %b %Y')}
            </a>
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #E3E8E3;">{c['ADDED']}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #E3E8E3;">{c['DELISTED']}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #E3E8E3;">{c['AMENDED']}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #E3E8E3;">{c['RENAMED']}</td>
        </tr>"""

    period_start = entries[0]["date"].strftime("%d %b")
    period_end = entries[-1]["date"].strftime("%d %b %Y")

    return f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#F4F6F3;padding:24px;color:#0C1B2A;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
    <div style="background:#071912;padding:28px 32px;">
      <div style="color:#5DCAA5;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Weekly compliance digest</div>
      <div style="color:#ffffff;font-size:22px;font-weight:700;margin-top:8px;">{period_start} to {period_end}</div>
    </div>
    <div style="padding:28px 32px;">
      <p style="font-size:14px;line-height:1.6;color:#3D4E5C;">
        {len(entries)} tracked day{'s' if len(entries) != 1 else ''} this week, {total_added} new designations,
        {total_delisted} delistings, {total_amended} amendments and {total_renamed} identifier changes recorded
        across monitored sanctions regimes.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px;">
        <thead>
          <tr style="background:#F4F6F3;">
            <th style="padding:8px 14px;text-align:left;">Date</th>
            <th style="padding:8px 14px;text-align:left;">Added</th>
            <th style="padding:8px 14px;text-align:left;">Delisted</th>
            <th style="padding:8px 14px;text-align:left;">Amended</th>
            <th style="padding:8px 14px;text-align:left;">Renamed</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      <div style="margin-top:24px;">
        <a href="{SITE}/screen.html" style="background:#12B981;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block;">
          Screen a name now
        </a>
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
    files = recent_delta_files()
    if not files:
        print("No delta pages in the trailing window, nothing to send this week.")
        return

    entries = []
    for file_date, path in files:
        with open(path, encoding="utf-8") as f:
            page_html = f.read()
        entries.append({"date": file_date, "counts": extract_counts(page_html)})

    digest_html = build_digest_html(entries)
    if digest_html is None:
        print("No entries to summarise, nothing to send.")
        return

    period_end = entries[-1]["date"].strftime("%d %b %Y")
    subject = f"FinCrimeRadar weekly digest, week ending {period_end}"

    send_campaign(subject, digest_html)


if __name__ == "__main__":
    main()
