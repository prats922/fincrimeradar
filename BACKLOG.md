# FinCrimeRadar Backlog Board

Three loops, rotating. Each working session picks one loop, clears or advances what's in it, then moves to the next. Don't run more than one loop per session, that's how things end up half finished.

Suggested cadence: fortnightly rotation, Polish → Build → Content → repeat. Polish goes first because it's the smallest and the most likely to get skipped if it's not first.

---

## 🔧 Polish Loop
Bug fixes, technical debt, structural cleanup. Nothing here should take more than one session to clear.

**Done:**
- ✅ `scripts/validate_output.py` line 12: added explicit `encoding='utf-8'` to the `open()` call, was defaulting to cp1252 on Windows and failing on UTF-8 delta pages
- ✅ Removed legacy `ga-disable-G-FC1VMTE7JH` references left in place after the Consent Mode migration, inline page IIFEs, kyc's trailing line, and `disableGoogleAnalytics` in `site-chrome.js`, confirmed redundant under Consent Mode (analytics_storage denied already blocks GA) before removing

**Next up:**
- [ ] `site-chrome.js` consolidation: 24 of 27 pages still hand-inline their nav/footer instead of using the shared partials system, only `terms.html` and `scenario-lab.html` use it. Same root cause as the nav bug and the GA duplication, worth doing once rather than patching each future change 24 times over
- [ ] Confirm cookie consent banner and GA4 head block are genuinely identical across all pages post Consent Mode migration, spot check a few pages outside the ones already verified
- [ ] **Retrofit end-of-guide cheat sheet onto existing guides.** Component proven live on `mlro-handbook-part1.html` (dark forest green brand palette, mapped to real `brand.css` custom properties, verified bit-for-bit). Needs a bespoke populated version, not a copy-paste, on: MLRO Handbook Part 2, Crypto Guide Part 1, and the AML/PEP/SAR/FATF series (8 guides). Each one needs its own 3-4 key point panels and process strip pulled from that guide's actual content, same discipline as building the original. Treat as one guide per work session, not a single big batch edit, quality drops fast on mechanical repetition.

*Add items here the moment a fix is deferred rather than done, don't let them live only in memory notes.*

---

## 🏗️ Build Loop
New tools, features, and platform capability. Naturally slower, needs a dedicated session rather than a squeezed-in half hour.

- [ ] Scenario Lab: continue active build (Phase 0 complete, KYC/KYB module live with 5 verified cases)
- [ ] **Scenario Lab, Fraud Detection module** — 6 cases from the master spec doc, verified against the same accuracy bar as the KYC module before use. Case 4 (Smurfing/structuring) needs rewriting: as specced it cites a "mandatory £10,000 automatic currency reporting limit", that's a US Bank Secrecy Act (CTR) concept, no UK equivalent exists at that threshold, UK AML runs on suspicion-based SAR filing not automatic reporting triggers. Rewrite around genuine UK structuring red flags before building. Cases 1, 2, 3, 5, 6 read as sound on first pass but haven't had a full accuracy pass yet, do that before implementation, not after.
- [ ] **Scenario Lab, Risk Scoring module** — 6 cases from the master spec doc, same verification standard. Case 6 (crypto mixer) currently names Tornado Cash as a sanctioned mixer example, it was delisted by OFAC in March 2025 following the Fifth Circuit's Van Loon ruling and remains the largest mixer on Ethereum by volume today, not designated. Do not name it, or any specific mixer, as a current sanctions example, crypto mixer designations have proven contested and reversible. Build the case around the underlying red flag pattern (heavy mixer usage immediately preceding a large withdrawal) instead of a named entity's current status. Cases 1, 2, 3, 4, 5 read as sound on first pass but need the same close read before implementation.
- [ ] **Guide chatbot** — needs a full scoping session before build starts. RAG over Knowledge Hub content (MLRO Handbook, AML/PEP/SAR/FATF/Crypto guides), embedded on guide pages so visitors can ask questions answered strictly from FinCrimeRadar's own content, not a general model. Proposed shape: retrieval layer over chunked Knowledge Hub content, new endpoint on `fincrimeradar-api` (FastAPI/Render, reuses existing infra), generation via Claude API, hard constraint to only answer from retrieved content with a visible fallback ("not covered in our guides, consult a professional") when nothing relevant is retrieved. Has ongoing API usage cost, unlike the rest of the stack. Sequence against Scenario Lab before starting, don't run both as concurrent Build loop items.
- [ ] Freemium API tier with Stripe integration (on the horizon, not yet scoped)
- [ ] API documentation page (on the horizon, not yet scoped)

---

## 📝 Content Loop
Knowledge Hub articles and guide series. Ship two to three parts of a series close together, then move to the next topic rather than leaving series unfinished.

**Standing requirement, applies to every guide from here on:** every guide ends with a branded cheat sheet summary component (title, 3-4 key point panels, optional process strip), matching the pattern proven on `mlro-handbook-part1.html`. Colors always mapped to `brand.css` custom properties, never hardcoded hex. No emoji in labels, matches the rest of the site's voice. This is not optional for new guides going forward.

**Done:**
- ✅ MLRO Handbook, Part 1: Becoming SMF16 or SMF17 (includes cheat sheet component)
- ✅ MLRO Handbook, Part 2: The Role, SARs and Enforcement
- ✅ Crypto Guide, Part 1
- ✅ Crypto Guide, Part 2

**Next up:**
- [ ] **Cross-jurisdictional MLRO/SMF17 comparison (UK + UAE first)** — needs a dedicated scoping session before drafting starts, bigger lift than a standard guide part. Practitioner-grounded comparison of MLRO equivalent roles, personal liability frameworks, and enforcement patterns across FCA (UK) and CBUAE (UAE) to start, scoped to expand toward MAS, AUSTRAC, FIU India, and BNM later if it lands well. Differentiator is the practitioner footprint across all six regimes and that it's free, not the raw concept, similar paid/partial versions exist elsewhere (Comsure's terminology piece, The MLRO Ltd's paid UAE cross-regulatory advisory). Do not start drafting until scoping session defines structure, sourcing standard for non-UK regulatory claims, and how much of each jurisdiction's material is genuinely verifiable versus secondary sourced. Include cheat sheet component.
- [ ] Possible MLRO Handbook Part 3: resourcing benchmarks by firm size, FCA's move toward AML supervisor for professional services (flagged as a maybe in Part 2's closing note, not committed yet)

---

## Not in the loop (separate track, own timing)
Business and legal items that don't fit the dev/content rotation, tracked here so they don't get lost, but not pulled into a fortnightly slot:

- Trademark filing for FinCrimeRadar, once resources allow
- LinkedIn slug reclaim (depends on trademark)
- AdSense re-review, once genuine content depth exists, not on an arbitrary schedule
- Anthropic Claude for Open Source Programme application

---

*Update this file at the end of every session: tick what shipped, add what got deferred, before switching loops.*
