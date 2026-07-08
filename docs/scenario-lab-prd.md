# FinCrimeRadar Scenario Lab, Product Requirements Document

**Status:** Approved for Phase 0 build, backend route and data layer confirmed live
**Owner:** Pratik Zanke
**Version:** 1.4, schema addendum added, backend architecture confirmed against actual deployed code, resolved build issues logged, stale open items closed out
**Supersedes:** Draft PRD (eight module SaaS vision), PRD v1.0 (separate KYC and AML Screening categories), PRD v1.1/1.2 (uncorrected guide count), and PRD v1.3 (schema left implicit, backend framework unconfirmed), retained below as long term roadmap only, not as a build spec

---

## 1. Decision log

This section exists because the previous draft PRD assumed infrastructure that does not exist. Every decision below is final for Phase 0 and constrains everything that follows.

| # | Decision | Resolution |
|---|----------|------------|
| 1 | UBO tree | Built now, real interactive graph, not a mockup |
| 2 | Investigation Tools panel | Every toggle wired to real logic, none decorative |
| 3 | Launch scope | Single live category, two others shown locked |
| 4 | Visual identity | Dark forest green, matching the live site, not the light gold theme |
| 5 | Eight module vision | Retained as the public roadmap graphic, not as build scope |
| 6 | Launch category, resolved here | Combined KYC and sanctions investigation, because screening a beneficial owner before identifying them is operationally meaningless |
| 7 | KYC and AML Screening merge | Confirmed. Not two categories in sequence, one module where identification and screening are the same workflow |

Decision 7 supersedes the original decision 6 framing. The first draft of this document treated KYC/KYB and AML Screening as separate categories with screening unlocked second. That was wrong. In a real onboarding workflow you cannot screen an entity you have not yet identified, so the tool now teaches that dependency directly instead of pretending the two skills are independent. AML Screening no longer exists as a standalone tile or a standalone future unlock, its case data and scoring logic live inside this module as the screening action attached to every identified entity.

**Priority note, added at v1.3.** Google's AI Overview for FinCrimeRadar surfaced a present tense claim already live on the homepage, alert triage simulators, as an existing feature. It is not, this module is still pre build. That means the homepage currently overclaims ahead of the product. Two actions follow, not one, the homepage copy gets softened to a forward framed claim as an interim fix, and this module's build priority moves ahead of anything else in the roadmap, since the market signal confirms demand before a single case has shipped. The guide count referenced throughout this document is corrected to 16, the verified live figure, replacing the earlier uncorrected 17+.

---

## 2. Executive summary

Scenario Lab is a free, single page interactive training tool embedded into fincrimeradar.org. It takes the fuzzy matching and entity screening logic already running in production on your Render API and wraps it in a gamified investigation interface. Launch scope is one combined module, KYC and Sanctions Investigation, built around a real UBO ownership graph where every identified entity can then be screened against sanctions and PEP data. This mirrors the actual analyst workflow, identify first, screen second, rather than treating onboarding and screening as separate skills. Two further categories, Fraud Detection and Risk Scoring, are visible on the dashboard as locked tiles that communicate roadmap depth without costing build time now.

The tool ships with zero new infrastructure. No registration, no database, no authentication. Session state lives in the browser for the duration of a single sitting. This keeps your fixed cost profile flat, which matters because your entire monetisation model depends on that staying true until the Stripe API tier exists.

---

## 3. What this is not

Explicitly out of scope for this PRD, to stop scope creep before it starts.

- No user accounts, no login, no persistent progress across sessions
- No Supabase, no Postgres, no new database of any kind
- No Next.js or TypeScript migration, this ships inside your existing static Vercel frontend as a self contained component
- No AI narrative scoring, no LLM judge calls, no per user inference cost
- No badges, XP, leaderboards, or certifications
- No SAR Writing Lab, Crypto Crime Lab, or MLRO Simulator in this phase, these remain locked roadmap tiles only

If a future conversation reopens any of these, it needs its own PRD, not a scope amendment bolted onto this one.

---

## 4. Target user

Same audience your Knowledge Hub already serves: AML analysts, sanctions analysts, compliance officers, MLROs, and students preparing for ICA or ACAMS exams. No persona segmentation, no role selection screen. One tool, one entry point.

---

## 5. Launch module, Combined KYC and Sanctions Investigation Simulator

### 5.1 Case structure

Three cases per session, fixed sequence, no branching logic in Phase 0. Every case now follows the same two step logic regardless of how many entities it contains, identify the entity or entities first, then screen each one, then decide. This is deliberate, it teaches the dependency directly rather than describing it in copy.

**Case 1, Alpha Corp UBO structure**
Multi entity case. Primary shareholder holds 26 percent through a shell company registered in the British Virgin Islands. The user must build out the UBO tree to identify all three entities before the screen action becomes available on each node. Screening the individual beneficial owner returns a fuzzy match against a sanctioned individual. Correct disposition is reject or request more information, driven jointly by the shell structure and the screening hit, neither fact alone is sufficient justification.

**Case 2, document authenticity flag with a clean screening result**
Single entity case. Retail customer ID document where the MRZ text font does not match standard passport typography. Screening this customer returns no match against sanctions or PEP data. Correct disposition is still request more information. This case exists specifically to teach that a clean screening result does not close an investigation, the document defect is an independent red flag that screening cannot see.

**Case 3, clean onboarding across the board**
Tech Startup Beta LLC, all UBOs local and fully verified, business operations match public profile. Screening every identified entity returns clean. Correct disposition is approve, the only case where identification and screening both clear without qualification.

### 5.2 UBO tree and node level screening, real build specification

This is the centrepiece of the launch module. The tree is not decorative, it is the mechanism that gates screening, and screening is not a separate step, it is an action performed on each node once identified.

**Rendering**
Force directed graph, not a static image. Root node is the applicant entity. Child nodes represent shareholders, with edge labels showing ownership percentage. Nodes that resolve to a shell company jurisdiction get a distinct visual treatment, not colour alone, since colour blind accessibility matters on a compliance tool. Use a shape or icon difference alongside colour.

**Data model per case**
```
{
  "entity_id": "alpha-corp-001",
  "name": "Alpha Corp",
  "nodes": [
    { "id": "n1", "label": "Alpha Corp", "type": "applicant", "jurisdiction": "UK", "screening": null },
    { "id": "n2", "label": "Shell Company", "type": "corporate_shareholder", "jurisdiction": "BVI", "flag": "shell_suspected", "screening": null },
    { "id": "n3", "label": "Beneficial Owner", "type": "individual", "jurisdiction": "UK", "ownership_pct": 26,
      "screening": { "match_confidence": 88, "list_source": "UK OFSI", "dob_customer": "1985", "dob_match": "1952", "result": "possible_match" } }
  ],
  "edges": [
    { "from": "n2", "to": "n1", "ownership_pct": 26 },
    { "from": "n3", "to": "n2", "ownership_pct": 100 }
  ]
}
```
The `screening` field is `null` until the user triggers the screen action on that node, at which point the pre authored result attached to the case data is revealed. This is not a live call to the production matching engine for Phase 0, it is a static, pre computed result per node, since case data itself is static. Wiring this to a live call against the real Render endpoint is a reasonable Phase 1 upgrade once the static version is proven, not a Phase 0 requirement.

**Interactivity**
Clicking a node surfaces a side panel with jurisdiction risk context, sourced from your existing Knowledge Hub content rather than new copy, this is where the Knowledge Hub integration idea from the old draft PRD earns its place cheaply. No new content commissioning required for launch, link to existing guides. A screen entity button appears on any node that has not yet been screened, revealing its `screening` result once clicked. Nodes without a `screening` object populated in the case data are treated as not applicable and can be marked as such without a screening action being available, this covers cases like Case 2 where only one entity exists to begin with.

**Build approach**
Client side rendering only, no backend graph storage needed since case data is static and small. A lightweight force directed layout library is sufficient, this does not need D3's full feature set for three fixed cases, but D3 is the correct choice if Phase 1 adds dynamically generated case structures later, so building on D3 now avoids a rewrite. The shipped build uses a small hand rolled force directed layout rather than D3 itself, functionally equivalent for three fixed cases, revisit only if Phase 1 genuinely needs dynamic layouts D3 handles natively.

**Schema addendum, confirmed against the shipped build, not implicit in the code block above.** The illustrative JSON in this section was only ever a tree shape example, not the full case object. The actual, confirmed, final schema per case:

- `case_number` (integer), `entity_id` (string slug), `name` (string), `title` (string, short case name shown in the case header), `briefing` (string, one or two sentences of scenario framing shown before the analyst starts investigating), `correct_disposition` (array of strings, always an array even for a single valid answer, `["approve"]` not `"approve"`), `rationale` (string, shown after the decision as feedback)
- Each node in `nodes`, `id`, `label`, `type`, `jurisdiction`, `flag` (optional string, present only where a red flag genuinely applies), `ownership_pct` (optional integer, present only on nodes with a stake to report), `screening` (`null` for entities never meant to be personally screened, such as the applicant entity itself, or a populated object for anyone who is screened, which may additionally carry an optional `pep` boolean, `true` where a disclosed PEP connection is part of the case, confirmed live on Case 3's second founder)
- Each edge in `edges`, `from`, `to`, `ownership_pct`, using `from`/`to` throughout, never `source`/`target`

**Known issue found and fixed during build.** The tree renderer originally applied its shell company visual flag, the dashed border, and the PEP hint badge based only on the node's own data, with no check on whether the analyst had actually clicked that node yet. That meant the shell structure answer and any PEP connection rendered visibly before any investigation happened, defeating the identify first, screen second mechanic this entire module exists to teach. Both are now gated behind the node's identified state, confirmed by direct test, neither tell appears until the analyst has clicked that specific node.

### 5.3 Investigation Tools panel, wired logic

Every toggle below changes what the user actually sees or how the case is scored. None are decorative. All three tools apply to the currently selected node, so they only become meaningful once at least one entity has been identified in the tree, which is itself the point.

**Fuzzy matching threshold**
A slider, not a binary toggle. Moving it recalculates a live match confidence score against the case's ownership chain using the same distinctive word boost logic your production screening engine runs. Lowering the threshold surfaces additional weak matches the user must then dismiss or escalate, raising it hides them. This directly teaches the exact trade off your production engine's limit=40 candidate pool ceiling represents, false negatives at high thresholds, noise at low ones.

**PEP hint mode** (renamed from Global PEP Database Access, the original name read as a live production data control rather than a training aid)
When enabled, any node in the UBO tree connected to a politically exposed person gets an inline badge showing that status. When disabled, the user must reason it out from jurisdiction and role data alone. This is a genuine difficulty toggle, not window dressing.

**Risk scoring calculator**
When enabled, a running numeric risk score appears, computed live from jurisdiction risk weighting, ownership layer depth, and shell company flags present in the current case. This previews the standalone Risk Scoring category, currently locked, and gives users a concrete reason to want it unlocked next.

### 5.4 Action footer

Three buttons, approve, reject, request more information, disabled until every node with a `screening` object in the case data has been screened. This is the mechanical enforcement of the merge, you cannot decide before you have identified and checked everyone who needs checking. On click, compare against the case's correct disposition, show a banner stating correct or incorrect with a one line rationale drawn from the case data, then advance automatically to the next case. On completion of all three, show a module complete screen with final accuracy and time elapsed, and a single call to action pointing at the locked Fraud Detection tile as the next likely build.

### 5.5 Request more scenarios control

Every locked tile, Fraud Detection and Risk Scoring, carries a request button instead of a passive coming soon badge. The module complete screen for the live module carries the same control, framed as request more cases in this module.

On click, fire a GA4 event, `scenario_request`, with a parameter identifying which module was requested. This is the entire tracking mechanism, no backend call, no new database, the aggregate lives in the existing GA dashboard. Set a localStorage flag per module on click so a repeat click from the same browser does not inflate the count, the confirmation still displays, the event does not refire. Show a dismissible inline banner on click, not a modal, reading something in the register of ships to this dashboard when it is built, no date promised, no generic thank you copy.

This directly powers the click through success metric in section 11, which until now had no concrete mechanism attached to it.

---

## 6. Dashboard structure

Three category tiles at the top, adapted from the reference mockup layout, one fewer than originally shown since AML Screening is no longer an independent tile. Only the combined KYC and Sanctions Investigation tile is clickable and shows live case data. Fraud Detection and Risk Scoring render as locked tiles with a coming soon badge. This still satisfies decision 5, the eight module vision stays visible as a roadmap statement, it just correctly reflects that screening and onboarding are one skill being taught together rather than two.

Session stats footer shows accuracy and time elapsed for the active module only. No cross category aggregate score, since categories are not launched simultaneously and an aggregate would be meaningless until they are.

---

## 7. Technical architecture, mapped to your actual stack

This is the section the previous draft PRD got fundamentally wrong. Here is what you actually have and what this feature needs from it.

**Frontend**
Static Vercel deployment, existing brand.css and brand.js design system. Scenario Lab ships as a self contained component, most likely a single JS module using your existing build pipeline, not a new framework. If component complexity in Phase 1 genuinely exceeds what vanilla JS can maintain cleanly, a scoped React island for this page alone is a reasonable escalation, a site wide Next.js migration is not.

**Backend, confirmed against the actual deployed service, not assumed.** `fincrimeradar-api` is FastAPI, not Flask, confirmed by reading `main.py` directly rather than inferring from `render.yaml`. `routes_scenario_lab.py` ships as a FastAPI `APIRouter`, wired into `main.py` via `app.include_router(...)`, exposing `GET /scenario-lab/cases`. It reads a `cases.json` sitting in the same directory as the route file itself, a separate copy from the frontend's `scenario-lab/data/cases.json`, the frontend copy is the source of truth, the backend copy is what actually gets served, propagate changes forward, never backward. Rate limiting is a small self contained in-memory sliding window, sixty requests per minute per client IP, no new dependency added to `requirements.txt`, this is a decision for a future session if `/api/screen` itself needs the same protection, not something to add silently as a side effect of one static fixture route.

**State**
Held entirely in browser memory for the session. No localStorage, no server side persistence. Refreshing the page resets progress. This is a deliberate Phase 0 constraint, not an oversight, revisit only if usage data from Phase 0 shows people wanting to resume sessions.

**Data**
Three cases, fully authored as static JSON, committed to the repo alongside CLAUDE.md. No dynamic case generation in Phase 0.

---

## 8. Visual identity

Dark theme, matching your live cinematic homepage, not the light gold and platinum direction. Forest green as primary brand colour, consistent with your existing hero treatment. Locked tiles use a muted, desaturated version of their eventual category colour so they read as genuinely inactive rather than broken. Active investigation panel and UBO tree share the same dark surface tokens as the rest of the site, no visual seam between Scenario Lab and the pages either side of it.

---

## 9. Security and data considerations

No real customer data anywhere in this feature, all case data is synthetic and clearly fictional entity names. The Scenario Lab endpoint being read only and unauthenticated is acceptable specifically because it returns no sensitive or production screening data, this must not be extended later to expose real sanctions match results without authentication being added first. Rate limiting is implemented, not merely recommended, sixty requests per minute per client IP, self contained, no new dependency, confirmed in section 7. This was a deliberate scope decision, the endpoint sits on the same Render service as production screening and must not become an unintentional load vector against the service that actually matters.

---

## 10. Testing scope

Realistic for a static, stateless feature, not enterprise CI/CD theatre this doesn't need yet.

- Manual QA pass by your wife on mobile browser, consistent with your existing QA pattern
- Verify UBO tree renders correctly at mobile width, this is the highest risk element given past CSS grid overflow issues on this exact kind of nested layout
- Verify each of the three cases scores correctly against all three possible dispositions, nine combinations total, checked manually
- Verify locked tiles are genuinely unclickable, not just styled to look locked
- Verify the disposition buttons stay disabled until every node with a screening object in the case data has actually been screened, and that Case 2 and Case 3 correctly treat their single or fully verified entities without a false gate
- Verify no node's shell flag styling or PEP badge appears before that specific node has been clicked and identified, this was a real, shipped bug once, not a hypothetical risk

---

## 11. Success metrics, Phase 0

- Module completion rate, percentage of visitors who start Case 1 and finish Case 3
- Average accuracy across completions
- Click through rate from a locked tile to the coming soon state, tracked via the request more scenarios control described in section 5.5, this tells you which category to build second, independent of any other planning
- LinkedIn post engagement on the launch announcement

---

## 12. Roadmap, retained from the original vision

Kept exactly as long term direction, not as committed scope.

**Phase 0, this document, now the priority build, not a queued item:** Combined KYC and Sanctions Investigation live, UBO tree with node level screening, two other categories locked. Accelerated following confirmed search demand for this exact capability, see the priority note in section 1.
**Phase 1:** Fraud Detection unlocked. Risk Scoring unlocked as a standalone deep dive, its calculator logic already exists inside the Phase 0 Investigation Tools panel, so this phase mainly extracts and expands what is already built rather than starting fresh.
**Phase 2:** Live screening calls against the production Render matching engine replacing the static pre authored screening results, if Phase 0 usage data shows people want dynamically generated cases rather than the same three on repeat.
**Phase 3, speculative:** SAR Writing Lab, Crypto Crime Lab, MLRO Decision Simulator, registration and progress tracking, only with either revenue from the Stripe tier or a clear traffic case for the infrastructure cost.

---

## 13. Open items before build starts

All three original items are resolved and confirmed against the live build, removed from this list. Genuinely open now:

- PEP hint mode currently has exactly one node across all three cases carrying a genuine PEP signal, Case 3's second founder. Decide whether that is sufficient for launch or whether a second instance elsewhere would demonstrate the toggle more convincingly
- `SETUP-NOTES.md`, the original build notes file for this feature, is stale, it describes files that have since been rewritten more than once. Its few genuinely useful decisions, Flask versus FastAPI now resolved in section 7, nav and footer placeholder handling, are captured here now, the file itself can be deleted from the frontend repo once confirmed
- Confirm the deployed Render endpoint responds correctly in production, not just against a local `uvicorn` run, before announcing this module as live anywhere public
- `review/filessimulation/` has been deleted, this item exists only to confirm no future session goes looking for it

---

## 14. Build log, issues found and resolved during development

Kept short and factual, this is institutional memory, not a retrospective essay. Full detail on any of these lives in the conversation history that produced them, not duplicated here.

- Pre-identification visual leak in the tree renderer, shell company and PEP indicators rendered before the analyst clicked the node, fixed by gating both behind identified state, see section 5.2
- Backend cache handling in `screening.py`, unrelated to Scenario Lab itself but discovered while wiring this module in, hardcoded `/tmp` paths broke local Windows testing entirely, and a cache write failure was silently discarding already successfully fetched sanctions and PEP data rather than merely failing to cache it. Both fixed, cross platform paths via `tempfile.gettempdir()`, cache write failures now log and continue rather than discard
- A CORS wildcard on the production API, unrelated to Scenario Lab, made two named allowed origins meaningless and left `/api/screen` callable from any website. Removed
- Case schema drift between three different files across two sessions, `source`/`target` versus `from`/`to`, a wrapped `{"cases": [...]}` object versus a bare array, an invented `case_id` versus the real `entity_id`. Resolved by always reading the actual committed file rather than a description of it before making a schema decision, the practice that should continue for any future work on this repo

