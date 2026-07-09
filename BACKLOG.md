FinCrimeRadar Backlog Board
Three loops, rotating. Each working session picks one loop, clears or advances what's in it, then moves to the next. Don't run more than one loop per session, that's how things end up half finished.
Suggested cadence: fortnightly rotation, Polish → Build → Content → repeat. Polish goes first because it's the smallest and the most likely to get skipped if it's not first.
________________________________________
🔧 Polish Loop
Bug fixes, technical debt, structural cleanup. Nothing here should take more than one session to clear.
•    [ ] scripts/validate_output.py line 12: add explicit encoding='utf-8' to the open() call, currently defaults to cp1252 on Windows and fails on UTF-8 delta pages
•    [ ] Remove legacy ga-disable-G-FC1VMTE7JH references left in place after the Consent Mode migration, inline page IIFEs, kyc's trailing line, and disableGoogleAnalytics in site-chrome.js, all redundant now but harmless
•    [ ] site-chrome.js consolidation: 24 of 27 pages still hand-inline their nav/footer instead of using the shared partials system, only terms.html and scenario-lab.html use it. Same root cause as the nav bug and the GA duplication, worth doing once rather than patching each future change 24 times over
•    [ ] Confirm cookie consent banner and GA4 head block are genuinely identical across all pages post Consent Mode migration, spot check a few pages outside the ones already verified
Add items here the moment a fix is deferred rather than done, don't let them live only in memory notes.
________________________________________
🏗️ Build Loop
New tools, features, and platform capability. Naturally slower, needs a dedicated session rather than a squeezed-in half hour.
•    [ ] Scenario Lab: continue active build (Phase 0 complete, wired to FastAPI backend)
•    [ ] Freemium API tier with Stripe integration (on the horizon, not yet scoped)
•    [ ] API documentation page (on the horizon, not yet scoped)
________________________________________
📝 Content Loop
Knowledge Hub articles and guide series. Ship two to three parts of a series close together, then move to the next topic rather than leaving series unfinished.
Done:
•    ✅ MLRO Handbook, Part 1: Becoming SMF16 or SMF17
•    ✅ MLRO Handbook, Part 2: The Role, SARs and Enforcement
•    ✅ Crypto Guide, Part 1
Next up:
•    [ ] Crypto Guide, Part 2
•    [ ] Possible MLRO Handbook Part 3: resourcing benchmarks by firm size, FCA's move toward AML supervisor for professional services (flagged as a maybe in Part 2's closing note, not committed yet)
________________________________________
Not in the loop (separate track, own timing)
Business and legal items that don't fit the dev/content rotation, tracked here so they don't get lost, but not pulled into a fortnightly slot:
•    Trademark filing for FinCrimeRadar, once resources allow
•    LinkedIn slug reclaim (depends on trademark)
•    AdSense re-review, once genuine content depth exists, not on an arbitrary schedule
•    Anthropic Claude for Open Source Programme application
________________________________________
Update this file at the end of every session: tick what shipped, add what got deferred, before switching loops.
