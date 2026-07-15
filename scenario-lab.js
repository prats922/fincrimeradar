/**
 * FinCrimeRadar Scenario Lab
 * Self contained vanilla JS module. No framework, no build step dependency.
 * Ships against the static cases.json payload for Phase 0, per PRD section 7.
 *
 * Public entry point: initScenarioLab(rootEl, options)
 * options.apiBase  optional string, if set fetches `${apiBase}/scenario-lab/cases`
 *                   instead of the local /scenario-lab/data/cases.json file. Leave
 *                   unset until the Render endpoint in routes_scenario_lab.py is deployed.
 */
(function () {
  "use strict";

  const LOCKED_MODULES = [
    {
      key: "risk_scoring",
      title: "Risk Scoring",
      description: "Standalone deep dive into the risk calculator already running inside Investigation Tools.",
    },
  ];

  function initScenarioLab(rootEl, options) {
    options = options || {};
    const state = {
      cases: [],
      kycCases: [],
      fraudCases: [],
      caseIndex: 0,
      currentCase: null,
      nodeState: {}, // nodeId -> { identified: bool, screened: bool }
      selectedNodeId: null,
      riskToolOn: false,
      fuzzyThreshold: 50,
      pepHintOn: false,
      treeContainer: null,
      nodeDetail: null,
      maxRevealed: 0, // fraud module: highest evidence step revealed
      selected: 0, // fraud module: currently displayed step
      decisionMade: false, // fraud module: decision already committed for this case
      results: [], // { caseId, correct: bool }
      startedAt: null,
      currentModule: null, // "kyc" or "fraud", set by renderCasePicker
      pendingAdvanceTimeout: null, // cancelled by "Back to case list"
      requested: JSON.parse(localStorage.getItem("sl_requested_modules") || "{}"),
    };

    rootEl.innerHTML = "";
    rootEl.classList.add("scenario-lab");

    const header = document.createElement("div");
    header.className = "sl-header";
    header.innerHTML = [
      "<h1>Scenario Lab</h1>",
      "<p>Practice real AML investigation decisions. Identify entities, screen them against sanctions and PEP data, then decide.</p>",
    ].join("");
    rootEl.appendChild(header);

    const dashboard = document.createElement("div");
    dashboard.className = "sl-dashboard";
    rootEl.appendChild(dashboard);

    const workspace = document.createElement("div");
    workspace.className = "sl-workspace";
    rootEl.appendChild(workspace);

    state.dashboardEl = dashboard;

    fetchCases(options.apiBase)
      .then((cases) => {
        // Fraud cases carry an explicit "module" field; KYC's five original
        // cases predate that field, so its absence still means KYC rather
        // than requiring every existing case entry to be touched.
        state.kycCases = cases.filter((c) => (c.module || "kyc") === "kyc");
        state.fraudCases = cases.filter((c) => c.module === "fraud");
        renderDashboard(dashboard, workspace, state);
      })
      .catch((err) => {
        dashboard.innerHTML =
          '<p style="color:var(--sl-danger)">Scenario Lab could not load its case data. Refresh the page, or check the console for details.</p>';
        console.error("Scenario Lab load error:", err);
      });
  }

  async function fetchCases(apiBase) {
    const url = apiBase ? apiBase.replace(/\/$/, "") + "/scenario-lab/cases" : "/scenario-lab/data/cases.json";
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error("Cases request failed with status " + res.status);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Cases payload was empty or malformed");
    }
    return data;
  }

  function renderDashboard(dashboard, workspace, state) {
    dashboard.innerHTML = "";

    const kycTile = document.createElement("div");
    kycTile.className = "sl-tile active";
    kycTile.innerHTML = [
      "<div>",
      "<h3>KYC and Sanctions Investigation</h3>",
      "<p>Build the ownership tree, screen every entity, then decide across five fixed cases.</p>",
      "</div>",
    ].join("");
    kycTile.addEventListener("click", () => startModule(dashboard, workspace, state));
    dashboard.appendChild(kycTile);

    const fraudTile = document.createElement("div");
    fraudTile.className = "sl-tile active";
    fraudTile.innerHTML = [
      "<div>",
      "<h3>Fraud Detection</h3>",
      "<p>Step through live account activity, watch the risk signal shift with every new fact, then decide across four cases.</p>",
      "</div>",
    ].join("");
    fraudTile.addEventListener("click", () => startFraudModule(dashboard, workspace, state));
    dashboard.appendChild(fraudTile);

    LOCKED_MODULES.forEach((mod) => {
      const tile = document.createElement("div");
      tile.className = "sl-tile locked";
      tile.innerHTML = [
        '<span class="sl-badge">Coming soon</span>',
        "<div>",
        "<h3>" + escapeHtml(mod.title) + "</h3>",
        "<p>" + escapeHtml(mod.description) + "</p>",
        "</div>",
      ].join("");
      appendRequestControl(tile, mod.key, state);
      dashboard.appendChild(tile);
    });
  }

  function appendRequestControl(container, moduleKey, state) {
    const alreadyRequested = !!state.requested[moduleKey];
    const btn = document.createElement("button");
    btn.className = "sl-request-btn";
    btn.textContent = alreadyRequested ? "Requested" : "Request this module";
    btn.disabled = alreadyRequested;
    btn.addEventListener("click", () => {
      fireRequestEvent(moduleKey);
      state.requested[moduleKey] = true;
      localStorage.setItem("sl_requested_modules", JSON.stringify(state.requested));
      btn.disabled = true;
      btn.textContent = "Requested";
      showInlineBanner(container);
    });
    container.appendChild(btn);
  }

  function showInlineBanner(container) {
    const existing = container.querySelector(".sl-inline-banner");
    if (existing) return;
    const banner = document.createElement("div");
    banner.className = "sl-inline-banner";
    banner.innerHTML =
      "<span>Ships to this dashboard when it is built.</span><button aria-label=\"Dismiss\">&times;</button>";
    banner.querySelector("button").addEventListener("click", () => banner.remove());
    container.appendChild(banner);
  }

  function fireRequestEvent(moduleKey) {
    if (typeof window.gtag === "function") {
      window.gtag("event", "scenario_request", { module: moduleKey });
    } else {
      console.info("scenario_request event (gtag unavailable):", moduleKey);
    }
  }

  // ---- Per-case progress, shared by both modules ----
  // Keyed by entity_id in localStorage, same persistence pattern as
  // sl_requested_modules. Read fresh on every call rather than cached on
  // state, the data is small and this guarantees the case picker never
  // shows stale status after a decision updates it.
  function readCaseProgress() {
    return JSON.parse(localStorage.getItem("sl_case_progress") || "{}");
  }

  function recordCaseProgress(entityId, correct) {
    const progress = readCaseProgress();
    progress[entityId] = { attempted: true, correct: correct };
    localStorage.setItem("sl_case_progress", JSON.stringify(progress));
  }

  function caseStatus(entityId) {
    const p = readCaseProgress()[entityId];
    if (!p || !p.attempted) return { label: "Not started", cls: "not-started" };
    if (p.correct) return { label: "Completed", cls: "completed" };
    return { label: "Attempted, review again", cls: "attempted" };
  }

  // ---- Case picker, shared by both modules ----
  // Entry point for a module from the dashboard, and the destination of
  // "Back to case list" from mid-sequence. Free selection rather than a
  // forced 1-2-3 order: clicking any tile sets state.caseIndex directly
  // and hands off to that module's existing loadCase/loadFraudCase, so
  // auto-advance afterwards continues in array order from wherever the
  // analyst chose to start, exactly like the original sequential flow.
  function renderCasePicker(workspace, state, moduleKey) {
    state.currentModule = moduleKey;
    const cases = moduleKey === "kyc" ? state.kycCases : state.fraudCases;
    state.cases = cases;
    workspace.dataset.total = String(cases.length);

    workspace.innerHTML = "";
    const picker = document.createElement("div");
    picker.className = "sl-case-picker";
    const title = moduleKey === "kyc" ? "KYC and Sanctions Investigation" : "Fraud Detection";
    picker.innerHTML = [
      "<h2>" + title + "</h2>",
      "<p>Choose any case to start. Progress on each one is saved on this device.</p>",
    ].join("");
    workspace.appendChild(picker);
    picker.prepend(backToDashboardButton(workspace, state));

    const grid = document.createElement("div");
    grid.className = "sl-case-grid";
    cases.forEach((c, idx) => {
      const status = caseStatus(c.entity_id);
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "sl-case-tile";
      tile.innerHTML = [
        '<span class="sl-case-badge ' + status.cls + '">' + status.label + "</span>",
        "<h3>Case " + c.case_number + ": " + escapeHtml(c.title) + "</h3>",
        '<p class="sl-case-tile-briefing">' + escapeHtml(c.briefing) + "</p>",
      ].join("");
      tile.addEventListener("click", () => {
        state.caseIndex = idx;
        if (moduleKey === "kyc") {
          loadCase(workspace, state);
        } else {
          loadFraudCase(workspace, state);
        }
      });
      grid.appendChild(tile);
    });
    picker.appendChild(grid);
  }

  // Cancels any pending auto-advance and returns to the case picker for
  // whichever module is currently active, without touching state.results
  // so accuracy on the eventual completion screen still reflects every
  // decision made this session, not just ones made in picker order.
  function backToCaseList(workspace, state) {
    if (state.pendingAdvanceTimeout) {
      clearTimeout(state.pendingAdvanceTimeout);
      state.pendingAdvanceTimeout = null;
    }
    renderCasePicker(workspace, state, state.currentModule);
  }

  function appendBackToCaseListControl(workspace, state, afterEl) {
    const btn = document.createElement("button");
    btn.className = "sl-request-btn";
    btn.textContent = "Back to case list";
    btn.style.marginTop = "12px";
    btn.addEventListener("click", () => backToCaseList(workspace, state));
    afterEl.insertAdjacentElement("afterend", btn);
  }

  function startModule(dashboard, workspace, state) {
    state.results = [];
    state.startedAt = Date.now();
    dashboard.style.display = "none";
    workspace.classList.add("visible");
    renderCasePicker(workspace, state, "kyc");
  }

  function loadCase(workspace, state) {
    const c = state.cases[state.caseIndex];
    state.currentCase = c;
    state.nodeState = {};
    state.selectedNodeId = null;
    state.riskToolOn = false;
    state.fuzzyThreshold = 50;
    state.pepHintOn = false;
    c.nodes.forEach((n) => {
      state.nodeState[n.id] = { identified: false, screened: false };
    });

    workspace.innerHTML = "";

    const caseHeader = document.createElement("div");
    caseHeader.className = "sl-case-header";
    caseHeader.innerHTML = [
      "<h2>Case " + c.case_number + " of " + workspace.dataset.total + ": " + escapeHtml(c.title) + "</h2>",
      "<p>" + escapeHtml(c.briefing) + "</p>",
      '<div class="sl-case-meta"><span>Entities: ' + c.nodes.length + "</span></div>",
    ].join("");
    workspace.appendChild(caseHeader);

    const mainGrid = document.createElement("div");
    mainGrid.className = "sl-main-grid";
    workspace.appendChild(mainGrid);

    const treePanel = document.createElement("div");
    treePanel.className = "sl-tree-panel";
    treePanel.innerHTML = "<h3>Ownership structure</h3>";
    const svgHolder = document.createElement("div");
    treePanel.appendChild(svgHolder);
    const nodeDetail = document.createElement("div");
    nodeDetail.className = "sl-node-detail empty";
    nodeDetail.textContent = "Select a node to identify the entity.";
    treePanel.appendChild(nodeDetail);
    mainGrid.appendChild(treePanel);

    const toolsPanel = document.createElement("div");
    toolsPanel.className = "sl-tools-panel";
    mainGrid.appendChild(toolsPanel);

    state.treeContainer = svgHolder;
    state.nodeDetail = nodeDetail;

    renderTree(svgHolder, c, state, nodeDetail);
    renderToolsPanel(toolsPanel, c, state);

    const footer = document.createElement("div");
    footer.className = "sl-action-footer";
    workspace.appendChild(footer);

    const banner = document.createElement("div");
    banner.className = "sl-decision-banner";
    workspace.appendChild(banner);

    renderActionFooter(footer, banner, workspace, state, c);
  }

  // ---- Force directed layout, hand rolled, no external dependency ----
  //
  // Node captions render as full label text below each circle (see
  // renderTree), and SVG <text> never wraps on its own. The physics sim
  // below only ever knew about circle radii, not label width, so two
  // nodes with long labels (e.g. "Shareholder (Son of Designated
  // Official)") could end up close enough that their captions collided
  // even though the circles themselves never touched. SPRING_LENGTH now
  // scales with the longest label in the case, and a post-simulation
  // repair pass guarantees no two nodes end up closer than that floor,
  // regardless of how the spring/repulsion forces settled.
  function estimateMinSeparation(nodes) {
    const AVG_CHAR_WIDTH = 5.4; // conservative estimate at 12px DM Sans
    const maxLabelLen = nodes.reduce((max, n) => Math.max(max, (n.label || "").length), 8);
    return clamp(maxLabelLen * AVG_CHAR_WIDTH * 0.75, 90, 200);
  }

  function resolveMinSeparation(nodes, positions, minSeparation, width, height) {
    const REPAIR_PASSES = 12;
    for (let pass = 0; pass < REPAIR_PASSES; pass++) {
      let moved = false;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = positions[nodes[i].id];
          const b = positions[nodes[j].id];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          if (dist < minSeparation) {
            const push = (minSeparation - dist) / 2;
            dx /= dist;
            dy /= dist;
            a.x -= dx * push;
            a.y -= dy * push;
            b.x += dx * push;
            b.y += dy * push;
            moved = true;
          }
        }
      }
      nodes.forEach((n) => {
        const p = positions[n.id];
        p.x = Math.max(40, Math.min(width - 40, p.x));
        p.y = Math.max(40, Math.min(height - 40, p.y));
      });
      if (!moved) break;
    }
  }

  function computeLayout(nodes, edges, width, height) {
    const positions = {};
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2;
      positions[n.id] = {
        x: width / 2 + Math.cos(angle) * (width / 4),
        y: height / 2 + Math.sin(angle) * (height / 4),
      };
    });

    const REPULSION = 2200;
    const minSeparation = estimateMinSeparation(nodes);
    const SPRING_LENGTH = Math.max(Math.min(width, height) * 0.32, minSeparation);
    const SPRING_STRENGTH = 0.02;
    const CENTER_STRENGTH = 0.01;
    const ITERATIONS = 250;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const forces = {};
      nodes.forEach((n) => (forces[n.id] = { x: 0, y: 0 }));

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = positions[nodes[i].id];
          const b = positions[nodes[j].id];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let distSq = dx * dx + dy * dy || 0.01;
          const force = REPULSION / distSq;
          const dist = Math.sqrt(distSq);
          dx /= dist;
          dy /= dist;
          forces[nodes[i].id].x += dx * force;
          forces[nodes[i].id].y += dy * force;
          forces[nodes[j].id].x -= dx * force;
          forces[nodes[j].id].y -= dy * force;
        }
      }

      edges.forEach((e) => {
        const a = positions[e.from];
        const b = positions[e.to];
        if (!a || !b) return;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const diff = dist - SPRING_LENGTH;
        dx /= dist;
        dy /= dist;
        const force = diff * SPRING_STRENGTH;
        forces[e.from].x += dx * force;
        forces[e.from].y += dy * force;
        forces[e.to].x -= dx * force;
        forces[e.to].y -= dy * force;
      });

      nodes.forEach((n) => {
        const p = positions[n.id];
        forces[n.id].x += (width / 2 - p.x) * CENTER_STRENGTH;
        forces[n.id].y += (height / 2 - p.y) * CENTER_STRENGTH;
      });

      nodes.forEach((n) => {
        const p = positions[n.id];
        p.x += forces[n.id].x;
        p.y += forces[n.id].y;
        p.x = Math.max(40, Math.min(width - 40, p.x));
        p.y = Math.max(40, Math.min(height - 40, p.y));
      });
    }

    resolveMinSeparation(nodes, positions, minSeparation, width, height);

    return positions;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // Truncates textEl's content to fit within maxWidth, measured against the
  // font actually applied by CSS (so this adapts automatically to the
  // desktop vs. mobile font-size media query), rather than guessing from
  // character count. Returns the text actually rendered. textEl must
  // already be attached to the document, getBBox() needs live layout.
  function truncateToWidth(textEl, fullText, maxWidth) {
    textEl.textContent = fullText;
    if (textEl.getBBox().width <= maxWidth) return fullText;
    let lo = 0;
    let hi = fullText.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      textEl.textContent = fullText.slice(0, mid).trimEnd() + "…";
      if (textEl.getBBox().width <= maxWidth) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    const truncated = lo > 0 ? fullText.slice(0, lo).trimEnd() + "…" : "…";
    textEl.textContent = truncated;
    return truncated;
  }

  // A screening match only surfaces when its confidence clears the current
  // fuzzy matching threshold. Below the threshold it reads as no match.
  function matchSurfaced(node, state) {
    if (!node.screening) return false;
    if (node.screening.result === "no_match") return false;
    return node.screening.match_confidence >= state.fuzzyThreshold;
  }

  // A node indicates a PEP connection when its screening data flags one,
  // whether via an explicit pep flag, a pep result, or a PEP list source.
  function isPepConnected(node) {
    const s = node.screening;
    if (!s) return false;
    if (s.pep === true) return true;
    if (typeof s.result === "string" && s.result.toLowerCase().indexOf("pep") !== -1) return true;
    if (typeof s.list_source === "string" && s.list_source.toUpperCase().indexOf("PEP") !== -1) return true;
    return false;
  }

  function renderTree(container, caseData, state, nodeDetail) {
    const width = 480;
    const height = 280;
    const positions = computeLayout(caseData.nodes, caseData.edges, width, height);

    // Distance from each node to its nearest neighbour caps how wide that
    // node's caption is allowed to render before truncating, so two
    // adjacent labels can never overlap regardless of length.
    const nearestDist = {};
    caseData.nodes.forEach((n) => {
      let min = Infinity;
      caseData.nodes.forEach((m) => {
        if (m.id === n.id) return;
        const dx = positions[n.id].x - positions[m.id].x;
        const dy = positions[n.id].y - positions[m.id].y;
        min = Math.min(min, Math.sqrt(dx * dx + dy * dy));
      });
      nearestDist[n.id] = Number.isFinite(min) ? min : width * 0.6;
    });

    const svgns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgns, "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("class", "sl-tree-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Ownership structure diagram");

    // Text elements needing a post-attach measurement pass (getBBox only
    // returns real values once the SVG is in the live document), collected
    // while building so we do one pass at the end rather than re-querying.
    const captionJobs = [];
    const edgeLabelJobs = [];

    caseData.edges.forEach((e) => {
      const a = positions[e.from];
      const b = positions[e.to];
      if (!a || !b) return;
      const line = document.createElementNS(svgns, "line");
      line.setAttribute("x1", a.x);
      line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x);
      line.setAttribute("y2", b.y);
      line.setAttribute("class", "sl-edge-line");
      svg.appendChild(line);

      // Unit vector perpendicular to the line's actual angle, used below to
      // push the label off the stroke on diagonal edges too, not just
      // near-horizontal ones, and to search outward if that first position
      // still collides with a node caption once those are finalized.
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const baseX = (a.x + b.x) / 2;
      const baseY = (a.y + b.y) / 2;

      const halo = document.createElementNS(svgns, "rect");
      halo.setAttribute("class", "sl-edge-label-bg");
      svg.appendChild(halo);

      const label = document.createElementNS(svgns, "text");
      label.setAttribute("x", baseX + nx * 9);
      label.setAttribute("y", baseY + ny * 9);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dominant-baseline", "central");
      label.setAttribute("class", "sl-edge-label");
      label.textContent = e.ownership_pct + "%";
      svg.appendChild(label);

      edgeLabelJobs.push({ label, halo, baseX, baseY, nx, ny });
    });

    caseData.nodes.forEach((n) => {
      const p = positions[n.id];
      const ns = state.nodeState[n.id];
      const g = document.createElementNS(svgns, "g");
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", "Entity node " + (ns.identified ? n.label : "unidentified"));

      // Native SVG tooltip, full label always available on hover/focus,
      // regardless of whether the on-canvas caption below ends up truncated.
      const title = document.createElementNS(svgns, "title");
      title.textContent = ns.identified ? n.label : "Unidentified entity";
      g.appendChild(title);

      const circle = document.createElementNS(svgns, "circle");
      circle.setAttribute("cx", p.x);
      circle.setAttribute("cy", p.y);
      circle.setAttribute("r", 26);
      let cls = "sl-node-circle";
      if (ns.identified) cls += " identified";
      if (ns.identified && n.flag === "shell_suspected") cls += " shell-flag";
      if (ns.screened) {
        cls += matchSurfaced(n, state) ? " screened-match" : " screened-clean";
      }
      circle.setAttribute("class", cls);
      g.appendChild(circle);

      if (ns.identified && n.flag === "shell_suspected") {
        const icon = document.createElementNS(svgns, "path");
        const d =
          "M " + (p.x - 9) + " " + (p.y + 34) + " l 9 -8 l 9 8";
        icon.setAttribute("d", d);
        icon.setAttribute("class", "sl-node-shell-icon");
        g.appendChild(icon);
      }

      const text = document.createElementNS(svgns, "text");
      text.setAttribute("x", p.x);
      text.setAttribute("y", p.y + 4);
      text.setAttribute("text-anchor", "middle");
      text.textContent = ns.identified ? initials(n.label) : "?";
      g.appendChild(text);

      const caption = document.createElementNS(svgns, "text");
      caption.setAttribute("x", p.x);
      caption.setAttribute("y", p.y + 44);
      caption.setAttribute("text-anchor", "middle");
      caption.setAttribute("class", "sl-edge-label");
      const fullCaption = ns.identified ? n.label : "Unidentified entity";
      caption.textContent = fullCaption;
      g.appendChild(caption);

      // Cap caption width at the gap to the nearest node, minus a small
      // clearance margin, floored and ceilinged to keep it legible.
      captionJobs.push({
        el: caption,
        full: fullCaption,
        maxWidth: clamp(nearestDist[n.id] - 16, 60, 170),
      });

      // PEP hint mode: reveal an inline badge on any node whose screening
      // data indicates a PEP connection, hidden when the toggle is off, and
      // never shown before the analyst has identified that node, otherwise
      // the tree would hand out the answer before any investigation happens.
      if (ns.identified && state.pepHintOn && isPepConnected(n)) {
        const badge = document.createElementNS(svgns, "text");
        badge.setAttribute("x", p.x + 30);
        badge.setAttribute("y", p.y - 22);
        badge.setAttribute("text-anchor", "middle");
        badge.setAttribute("class", "sl-pep-badge");
        badge.style.fill = "var(--sl-warning)";
        badge.style.fontSize = "9px";
        badge.style.fontWeight = "700";
        badge.textContent = "PEP";
        g.appendChild(badge);
      }

      g.style.cursor = "pointer";
      const select = () => selectNode(n.id, caseData, state, container, nodeDetail);
      g.addEventListener("click", select);
      g.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter" || evt.key === " ") {
          evt.preventDefault();
          select();
        }
      });

      svg.appendChild(g);
    });

    container.innerHTML = "";
    container.appendChild(svg);

    // Measurement pass, only meaningful once the SVG is attached to the
    // live document so getBBox() reflects the font CSS actually applied
    // (desktop 12px vs. the mobile 20px media query bump). Captions are
    // truncated first, so their final boxes can be treated as fixed
    // obstacles when placing edge labels next, otherwise a short edge
    // between two nodes routinely lands its percentage label on top of
    // one of their captions.
    captionJobs.forEach((job) => truncateToWidth(job.el, job.full, job.maxWidth));

    const obstacles = caseData.nodes
      .map((n) => {
        const p = positions[n.id];
        return { x: p.x - 26, y: p.y - 26, width: 52, height: 52 };
      })
      .concat(
        captionJobs.map((job) => {
          const b = job.el.getBBox();
          return { x: b.x, y: b.y, width: b.width, height: b.height };
        })
      );

    // Compass directions searched at each radius, perpendicular-to-edge
    // first (keeps the common case visually tidy), then the remaining
    // compass points as fallback for geometries where the perpendicular
    // axis alone can't clear a wide caption sitting off to one side.
    function overlapArea(rect, o) {
      const ox = Math.max(0, Math.min(rect.x + rect.width, o.x + o.width) - Math.max(rect.x, o.x));
      const oy = Math.max(0, Math.min(rect.y + rect.height, o.y + o.height) - Math.max(rect.y, o.y));
      return ox * oy;
    }

    edgeLabelJobs.forEach((job) => {
      const size = job.label.getBBox(); // width/height only; stable under re-centering since anchor/baseline are both "middle"
      const halfW = size.width / 2 + 5;
      const halfH = size.height / 2 + 2;
      const directions = [
        { dx: job.nx, dy: job.ny },
        { dx: -job.nx, dy: -job.ny },
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0.707, dy: -0.707 },
        { dx: -0.707, dy: -0.707 },
        { dx: 0.707, dy: 0.707 },
        { dx: -0.707, dy: 0.707 },
      ];
      // Ceiling is generous because the mobile media query renders this
      // same text noticeably larger within the same fixed viewBox, so
      // obstacles take up proportionally more room and need a wider
      // search radius to clear at that scale, not just at desktop size.
      const radii = [9, 16, 24, 34, 46, 60, 76, 94];

      let chosenX = job.baseX + job.nx * 9;
      let chosenY = job.baseY + job.ny * 9;
      let bestOverlap = Infinity;
      let found = false;

      for (let r = 0; r < radii.length && !found; r++) {
        for (let d = 0; d < directions.length; d++) {
          const x = job.baseX + directions[d].dx * radii[r];
          const y = job.baseY + directions[d].dy * radii[r];
          const rect = { x: x - halfW, y: y - halfH, width: halfW * 2, height: halfH * 2 };
          const totalOverlap = obstacles.reduce((sum, o) => sum + overlapArea(rect, o), 0);
          if (totalOverlap < bestOverlap) {
            bestOverlap = totalOverlap;
            chosenX = x;
            chosenY = y;
          }
          if (totalOverlap === 0) {
            found = true;
            break;
          }
        }
      }

      job.label.setAttribute("x", chosenX);
      job.label.setAttribute("y", chosenY);

      const box = job.label.getBBox();
      const padX = 5;
      const padY = 2;
      job.halo.setAttribute("x", box.x - padX);
      job.halo.setAttribute("y", box.y - padY);
      job.halo.setAttribute("width", box.width + padX * 2);
      job.halo.setAttribute("height", box.height + padY * 2);
      job.halo.setAttribute("rx", 3);
    });
  }

  function initials(label) {
    return label
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase();
  }

  function selectNode(nodeId, caseData, state, treeContainer, nodeDetail) {
    state.selectedNodeId = nodeId;
    const ns = state.nodeState[nodeId];
    if (!ns.identified) {
      ns.identified = true;
    }
    renderTree(treeContainer, caseData, state, nodeDetail);
    renderNodeDetail(nodeDetail, caseData, state, nodeId);
    refreshActionFooterState(state);
    refreshRiskScore(state);
  }

  function renderNodeDetail(nodeDetail, caseData, state, nodeId) {
    const node = caseData.nodes.find((n) => n.id === nodeId);
    const ns = state.nodeState[nodeId];
    nodeDetail.classList.remove("empty");
    nodeDetail.innerHTML = "";

    const title = document.createElement("h4");
    title.textContent = node.label;
    nodeDetail.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "sl-node-meta";
    const metaParts = [capitalize(node.type.replace(/_/g, " ")), node.jurisdiction];
    if (node.ownership_pct != null) metaParts.push(node.ownership_pct + "% ownership");
    if (node.flag === "shell_suspected") metaParts.push("Shell structure indicators present");
    meta.textContent = metaParts.join(" \u00b7 ");
    nodeDetail.appendChild(meta);

    if (node.screening === null) {
      const note = document.createElement("p");
      note.style.fontSize = "0.85rem";
      note.style.color = "var(--sl-text-muted)";
      note.textContent = "This entity has no screening requirement in this case.";
      nodeDetail.appendChild(note);
      return;
    }

    const screenBtn = document.createElement("button");
    screenBtn.className = "sl-btn";
    screenBtn.textContent = ns.screened ? "Screened" : "Screen this entity";
    screenBtn.disabled = ns.screened;
    screenBtn.addEventListener("click", () => {
      ns.screened = true;
      renderNodeDetail(nodeDetail, caseData, state, nodeId);
      // Re-render tree via closure is awkward here, so dispatch a custom event
      nodeDetail.dispatchEvent(new CustomEvent("sl:node-screened", { bubbles: true }));
    });
    nodeDetail.appendChild(screenBtn);

    if (ns.screened) {
      const result = document.createElement("div");
      const surfaced = matchSurfaced(node, state);
      result.className = "sl-screening-result " + (surfaced ? "match" : "clean");
      if (!surfaced) {
        result.textContent =
          node.screening.result === "no_match"
            ? "No match against sanctions or PEP data."
            : "No match surfaced at the current fuzzy matching threshold.";
      } else {
        result.innerHTML = [
          "Possible match, ",
          node.screening.match_confidence + "% confidence, ",
          "source: " + escapeHtml(node.screening.list_source) + ". ",
          "Customer DOB " + escapeHtml(node.screening.dob_customer) + " vs list DOB " + escapeHtml(node.screening.dob_match) + ".",
        ].join("");
      }
      nodeDetail.appendChild(result);
    }
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ---- Investigation Tools panel, risk calculator ----
  function renderToolsPanel(container, caseData, state) {
    container.innerHTML = '<h3>Investigation tools</h3>';

    const toggleRow = document.createElement("div");
    toggleRow.className = "sl-toggle-row";
    toggleRow.innerHTML = "<span>Live risk score</span>";
    const toggle = document.createElement("div");
    toggle.className = "sl-toggle";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-checked", "false");
    toggleRow.appendChild(toggle);
    container.appendChild(toggleRow);

    const scoreArea = document.createElement("div");
    scoreArea.style.display = "none";
    container.appendChild(scoreArea);

    toggle.addEventListener("click", () => {
      state.riskToolOn = !state.riskToolOn;
      toggle.classList.toggle("on", state.riskToolOn);
      toggle.setAttribute("aria-checked", String(state.riskToolOn));
      scoreArea.style.display = state.riskToolOn ? "block" : "none";
      if (state.riskToolOn) updateRiskScoreDisplay(scoreArea, caseData, state);
    });

    // Fuzzy matching threshold slider. Moving it recomputes, in real time,
    // which screened matches clear the confidence threshold and stay visible.
    const fuzzyRow = document.createElement("div");
    fuzzyRow.className = "sl-toggle-row";
    fuzzyRow.innerHTML = "<span>Fuzzy matching threshold</span>";
    const fuzzyValue = document.createElement("span");
    fuzzyValue.className = "sl-slider-value";
    fuzzyValue.textContent = state.fuzzyThreshold + "%";
    fuzzyRow.appendChild(fuzzyValue);
    container.appendChild(fuzzyRow);

    const fuzzySlider = document.createElement("input");
    fuzzySlider.type = "range";
    fuzzySlider.min = "0";
    fuzzySlider.max = "100";
    fuzzySlider.step = "1";
    fuzzySlider.value = String(state.fuzzyThreshold);
    fuzzySlider.className = "sl-slider";
    fuzzySlider.style.width = "100%";
    fuzzySlider.setAttribute("aria-label", "Fuzzy matching threshold");
    fuzzySlider.addEventListener("input", () => {
      state.fuzzyThreshold = Number(fuzzySlider.value);
      fuzzyValue.textContent = state.fuzzyThreshold + "%";
      refreshMatchVisibility(state);
    });
    container.appendChild(fuzzySlider);

    // PEP hint mode. Same switch pattern as the risk score toggle, reveals a
    // PEP badge in the tree for any node whose screening indicates a PEP link.
    const pepRow = document.createElement("div");
    pepRow.className = "sl-toggle-row";
    pepRow.innerHTML = "<span>PEP hint mode</span>";
    const pepToggle = document.createElement("div");
    pepToggle.className = "sl-toggle";
    pepToggle.setAttribute("role", "switch");
    pepToggle.setAttribute("aria-checked", "false");
    pepRow.appendChild(pepToggle);
    container.appendChild(pepRow);

    pepToggle.addEventListener("click", () => {
      state.pepHintOn = !state.pepHintOn;
      pepToggle.classList.toggle("on", state.pepHintOn);
      pepToggle.setAttribute("aria-checked", String(state.pepHintOn));
      refreshMatchVisibility(state);
    });

    container._scoreArea = scoreArea;
    container._caseData = caseData;
    state.toolsPanel = container;
  }

  // Re-render the tree and any open node detail so fuzzy threshold and PEP
  // hint changes take effect immediately, mirroring the risk score refresh.
  function refreshMatchVisibility(state) {
    if (!state.currentCase || !state.treeContainer) return;
    renderTree(state.treeContainer, state.currentCase, state, state.nodeDetail);
    if (state.selectedNodeId) {
      renderNodeDetail(state.nodeDetail, state.currentCase, state, state.selectedNodeId);
    }
  }

  function refreshRiskScore(state) {
    if (!state.riskToolOn || !state.toolsPanel) return;
    updateRiskScoreDisplay(state.toolsPanel._scoreArea, state.toolsPanel._caseData, state);
  }

  const JURISDICTION_RISK = {
    UK: 1,
    BVI: 4,
    default: 2,
  };

  function computeRiskScore(caseData, state) {
    let score = 0;
    const breakdown = [];
    caseData.nodes.forEach((n) => {
      const ns = state.nodeState[n.id];
      if (!ns.identified) return;
      const jRisk = JURISDICTION_RISK[n.jurisdiction] ?? JURISDICTION_RISK.default;
      score += jRisk;
      breakdown.push(n.label + " jurisdiction (" + n.jurisdiction + "): +" + jRisk);
      if (n.flag === "shell_suspected") {
        score += 5;
        breakdown.push(n.label + " shell structure indicator: +5");
      }
    });
    // Ownership layer depth, one point per edge in the identified graph
    const identifiedIds = new Set(
      caseData.nodes.filter((n) => state.nodeState[n.id].identified).map((n) => n.id)
    );
    const depthEdges = caseData.edges.filter(
      (e) => identifiedIds.has(e.from) && identifiedIds.has(e.to)
    ).length;
    if (depthEdges > 0) {
      score += depthEdges * 2;
      breakdown.push("Ownership layers identified: +" + depthEdges * 2);
    }
    return { score, breakdown };
  }

  function updateRiskScoreDisplay(scoreArea, caseData, state) {
    const { score, breakdown } = computeRiskScore(caseData, state);
    let band = "low";
    if (score >= 12) band = "high";
    else if (score >= 6) band = "medium";

    scoreArea.innerHTML = [
      '<div class="sl-risk-score ' + band + '">' + score + "</div>",
      '<div class="sl-risk-breakdown">' + breakdown.map(escapeHtml).join("<br>") + "</div>",
    ].join("");
  }

  // ---- Action footer, disposition logic ----
  function nodesRequiringScreening(caseData) {
    return caseData.nodes.filter((n) => n.screening !== null);
  }

  function allRequiredScreeningsDone(caseData, state) {
    return nodesRequiringScreening(caseData).every((n) => state.nodeState[n.id].screened);
  }

  function renderActionFooter(footer, banner, workspace, state, caseData) {
    footer.innerHTML = "";
    const label = document.createElement("span");
    label.style.color = "var(--sl-text-muted)";
    label.style.fontSize = "0.85rem";
    label.textContent = allRequiredScreeningsDone(caseData, state)
      ? "All required screening complete. Make your decision."
      : "Identify and screen every flagged entity before deciding.";
    footer.appendChild(label);

    const btnRow = document.createElement("div");
    btnRow.className = "sl-action-buttons";
    ["approve", "reject", "request_more_info"].forEach((disposition) => {
      const btn = document.createElement("button");
      btn.className = "sl-btn";
      btn.textContent = displayLabel(disposition);
      btn.disabled = !allRequiredScreeningsDone(caseData, state);
      btn.addEventListener("click", () => decide(disposition, footer, banner, workspace, state, caseData));
      btnRow.appendChild(btn);
    });
    footer.appendChild(btnRow);

    footer._label = label;
    footer._caseData = caseData;

    // Listen for screening completions bubbling up from node detail cards.
    // Guarded so this attaches once per workspace element, not once per case load.
    if (!workspace._slScreeningListenerAttached) {
      workspace.addEventListener("sl:node-screened", () => refreshActionFooterState(state));
      workspace._slScreeningListenerAttached = true;
    }
  }

  function refreshActionFooterState(state) {
    // Re-render is triggered from the sl:node-screened listener context;
    // find the current footer in the DOM and update its buttons directly.
    document.querySelectorAll(".sl-action-footer").forEach((footer) => {
      const caseData = footer._caseData;
      if (!caseData) return;
      const ready = allRequiredScreeningsDone(caseData, state);
      footer.querySelectorAll("button").forEach((b) => (b.disabled = !ready));
      if (footer._label) {
        footer._label.textContent = ready
          ? "All required screening complete. Make your decision."
          : "Identify and screen every flagged entity before deciding.";
      }
    });
  }

  // Renders caseData.related_guide, if present, as a small secondary card
  // inside the decision banner, below the rationale text. Deliberately
  // muted relative to the correct/incorrect feedback itself, this is a
  // pointer to further reading, not part of the verdict.
  function appendRelatedGuide(banner, caseData) {
    const guide = caseData.related_guide;
    if (!guide) return;
    const card = document.createElement("div");
    card.className = "sl-related-guide";
    card.innerHTML =
      '<span class="sl-related-guide-label">Related guide</span>' +
      '<a class="sl-related-guide-link" href="' + escapeHtml(guide.url) + '">' + escapeHtml(guide.title) + "</a>" +
      '<p class="sl-related-guide-reason">' + escapeHtml(guide.reason) + "</p>";
    banner.appendChild(card);
  }

  function displayLabel(disposition) {
    if (disposition === "approve") return "Approve";
    if (disposition === "reject") return "Reject";
    return "Request more information";
  }

  function decide(disposition, footer, banner, workspace, state, caseData) {
    const isCorrect = caseData.correct_disposition.includes(disposition);

    state.results.push({ caseId: caseData.entity_id, correct: isCorrect });
    recordCaseProgress(caseData.entity_id, isCorrect);

    banner.className = "sl-decision-banner show " + (isCorrect ? "correct" : "incorrect");
    banner.textContent = (isCorrect ? "Correct. " : "Not quite. ") + caseData.rationale;
    appendRelatedGuide(banner, caseData);

    footer.querySelectorAll("button").forEach((b) => (b.disabled = true));

    appendBackToCaseListControl(workspace, state, banner);

    state.pendingAdvanceTimeout = setTimeout(() => {
      state.pendingAdvanceTimeout = null;
      state.caseIndex += 1;
      if (state.caseIndex < state.cases.length) {
        loadCase(workspace, state);
      } else {
        renderCompletionScreen(workspace, state);
      }
    }, 2600);
  }

  // Returns to the dashboard from a completion screen, re-rendering it so
  // any "Requested" state picked up since page load still shows correctly.
  // Needed now that two modules are reachable from the same dashboard:
  // without it, finishing one module would strand the analyst on its
  // completion card with no way back to the other.
  function backToDashboardButton(workspace, state) {
    const btn = document.createElement("button");
    btn.className = "sl-request-btn";
    btn.textContent = "Back to dashboard";
    btn.style.marginBottom = "16px";
    btn.addEventListener("click", () => {
      workspace.classList.remove("visible");
      workspace.innerHTML = "";
      state.dashboardEl.style.display = "";
      renderDashboard(state.dashboardEl, workspace, state);
    });
    return btn;
  }

  // What's still locked after finishing a module. Reads LOCKED_MODULES
  // directly rather than naming a specific module, so this stays correct
  // on its own as modules unlock over time.
  function appendNextModuleTeaser(container, state) {
    if (LOCKED_MODULES.length === 0) return;
    const mod = LOCKED_MODULES[0];
    const nextTile = document.createElement("div");
    nextTile.className = "sl-tile locked";
    nextTile.style.marginTop = "16px";
    nextTile.innerHTML = [
      '<span class="sl-badge">Coming soon</span>',
      "<div><h3>" + escapeHtml(mod.title) + "</h3><p>" + escapeHtml(mod.description) + "</p></div>",
    ].join("");
    appendRequestControl(nextTile, mod.key, state);
    container.appendChild(nextTile);
  }

  function pickUpRestButton(workspace, state, moduleKey) {
    const btn = document.createElement("button");
    btn.className = "sl-btn";
    btn.textContent = "Pick up the rest";
    btn.style.marginTop = "16px";
    btn.addEventListener("click", () => renderCasePicker(workspace, state, moduleKey));
    return btn;
  }

  // Shared by both completion screens. The case picker means a session can
  // now end here after only some of the module's cases, not just after all
  // of them in order, so this only ever calls it "complete" when every case
  // in the module was actually attempted this session (results.length vs.
  // state.cases.length, not just having reached the end of the array via
  // auto-advance). Otherwise the heading, copy, and stats are honest about
  // a partial session, and a direct link back to the picker covers the rest.
  function renderCompletionBody(complete, workspace, state, moduleKey, fullIntro) {
    const attempted = state.results.length;
    const totalCases = state.cases.length;
    const correct = state.results.filter((r) => r.correct).length;
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    const elapsedSeconds = Math.round((Date.now() - state.startedAt) / 1000);
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    const isFullSession = attempted >= totalCases;

    const heading = isFullSession
      ? moduleKey === "kyc"
        ? "Module complete"
        : "Session complete"
      : "Cases complete for this session";

    const remaining = totalCases - attempted;
    const intro = isFullSession
      ? fullIntro
      : attempted +
        " of " +
        totalCases +
        " cases attempted this session, " +
        remaining +
        " case" +
        (remaining === 1 ? "" : "s") +
        " still untried.";

    complete.innerHTML = [
      "<h2>" + heading + "</h2>",
      "<p>" + intro + "</p>",
      '<div class="sl-stats">',
      '<div><div class="sl-stat-value">' + accuracy + '%</div><div class="sl-stat-label">Accuracy</div></div>',
      '<div><div class="sl-stat-value">' +
        minutes +
        "m " +
        seconds +
        's</div><div class="sl-stat-label">Time elapsed</div></div>',
      "</div>",
    ].join("");

    if (!isFullSession) {
      complete.appendChild(pickUpRestButton(workspace, state, moduleKey));
    }
  }

  function renderCompletionScreen(workspace, state) {
    workspace.innerHTML = "";
    const complete = document.createElement("div");
    complete.className = "sl-complete";
    workspace.appendChild(complete);
    renderCompletionBody(complete, workspace, state, "kyc", "KYC and Sanctions Investigation, all five cases.");
    complete.prepend(backToDashboardButton(workspace, state));
    appendNextModuleTeaser(complete, state);
  }

  // ---- Fraud Detection module ----
  // Mounted from the same dashboard and workspace shell as the KYC module
  // above, reusing its sl-tree-panel/sl-tools-panel card shells, sl-btn
  // buttons, sl-node-detail wrapper, and sl-decision-banner feedback rather
  // than a second copy of any of them. A fraud case is a sequence of
  // evidence events with a decision at the end, not a relationship graph,
  // so it carries its own header_scene and timeline fields in cases.json
  // instead of nodes/edges, while still using the shared entity_id,
  // case_number, correct_disposition, rationale and related_guide fields
  // KYC's cases already use. related_guide is optional: { title, url, reason },
  // rendered as a secondary card under the decision banner when present.
  // Future cases (Risk Scoring, Cases 5/6) should follow the same
  // related_guide shape. Cases are told apart by the "module" field split out in
  // initScenarioLab. Only genuinely new UI, the header scene, the evidence
  // stepper, and the risk bar, gets its own fd- prefixed rules in
  // scenario-lab.css, and those still reference the --sl- custom
  // properties directly rather than a parallel token layer.

  function startFraudModule(dashboard, workspace, state) {
    state.results = [];
    state.startedAt = Date.now();
    dashboard.style.display = "none";
    workspace.classList.add("visible");
    renderCasePicker(workspace, state, "fraud");
  }

  function loadFraudCase(workspace, state) {
    const c = state.cases[state.caseIndex];
    state.currentCase = c;
    state.maxRevealed = 0;
    state.selected = 0;
    state.decisionMade = false;

    workspace.innerHTML = "";

    const caseHeader = document.createElement("div");
    caseHeader.className = "sl-case-header";
    caseHeader.innerHTML = [
      "<h2>Case " + c.case_number + ": " + escapeHtml(c.title) + "</h2>",
      "<p>" + escapeHtml(c.briefing) + "</p>",
    ].join("");
    workspace.appendChild(caseHeader);

    // The header scene sits above the timeline and stays fixed through
    // every step and the final decision, so it is rendered once here and
    // never touched again by the stepper below.
    const scenePanel = document.createElement("div");
    scenePanel.className = "sl-tree-panel";
    workspace.appendChild(scenePanel);
    renderHeaderScene(scenePanel, c.header_scene);

    const timelinePanel = document.createElement("div");
    timelinePanel.className = "sl-tools-panel";
    workspace.appendChild(timelinePanel);

    const stepperEl = document.createElement("div");
    stepperEl.className = "fd-stepper";
    timelinePanel.appendChild(stepperEl);

    const riskPanel = document.createElement("div");
    riskPanel.className = "fd-risk-panel";
    riskPanel.innerHTML = [
      '<div class="fd-risk-row"><span class="fd-risk-caption">Risk signal</span><span class="fd-risk-value"></span></div>',
      '<div class="fd-risk-track"><div class="fd-risk-fill"></div></div>',
    ].join("");
    timelinePanel.appendChild(riskPanel);

    const bodyEl = document.createElement("div");
    bodyEl.className = "sl-node-detail";
    timelinePanel.appendChild(bodyEl);

    state.stepperEl = stepperEl;
    state.riskPanel = riskPanel;
    state.bodyEl = bodyEl;
    state.workspace = workspace;

    renderFraudStepper(state);
    renderFraudRisk(state);
    renderFraudStepBody(state);
  }

  // Nodes are grouped into columns by topological depth, how many hops
  // from a node with no incoming edge, so a fan-in shape, several sources
  // converging on one node, works the same as a simple chain without any
  // bespoke per-case layout code.
  function computeSceneColumns(nodes, edges) {
    const incoming = {};
    nodes.forEach((n) => (incoming[n.id] = []));
    edges.forEach((e) => {
      if (incoming[e.to]) incoming[e.to].push(e.from);
    });

    const levelCache = {};
    function levelOf(id) {
      if (levelCache[id] != null) return levelCache[id];
      const preds = incoming[id] || [];
      const lvl = preds.length === 0 ? 0 : 1 + Math.max.apply(null, preds.map(levelOf));
      levelCache[id] = lvl;
      return lvl;
    }
    nodes.forEach((n) => levelOf(n.id));

    const columns = [];
    nodes.forEach((n) => {
      const lvl = levelCache[n.id];
      if (!columns[lvl]) columns[lvl] = [];
      columns[lvl].push(n);
    });
    return columns;
  }

  function renderHeaderScene(container, scene) {
    const svgns = "http://www.w3.org/2000/svg";
    const width = 640;
    const columns = computeSceneColumns(scene.nodes, scene.edges);
    const maxColumnSize = columns.reduce((max, col) => Math.max(max, col.length), 1);
    // 76px keeps a stacked column's caption (node radius 20 + label at +34
    // + sublabel at +47) clear of the next node's circle, which starts at
    // +ROW_HEIGHT-20. Anything under about 71px causes the sublabel text
    // to visually collide with the circle below it.
    const ROW_HEIGHT = 76;
    const MARGIN_Y = 34;
    const height = Math.max(160, maxColumnSize * ROW_HEIGHT + MARGIN_Y * 2 - ROW_HEIGHT);

    const positions = {};
    const marginX = 76;
    const colSpacing = columns.length > 1 ? (width - marginX * 2) / (columns.length - 1) : 0;
    columns.forEach((col, colIndex) => {
      const x = columns.length > 1 ? marginX + colIndex * colSpacing : width / 2;
      const rowSpacing = col.length > 1 ? (height - MARGIN_Y * 2) / (col.length - 1) : 0;
      col.forEach((n, rowIndex) => {
        const y = col.length > 1 ? MARGIN_Y + rowIndex * rowSpacing : height / 2;
        positions[n.id] = { x: x, y: y };
      });
    });

    const svg = document.createElementNS(svgns, "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("class", "sl-tree-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Case overview diagram");

    const defs = document.createElementNS(svgns, "defs");
    defs.innerHTML =
      '<marker id="fd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path d="M0,0L10,5L0,10z" class="fd-scene-arrow-fill"></path></marker>';
    svg.appendChild(defs);

    scene.edges.forEach((e) => {
      const a = positions[e.from];
      const b = positions[e.to];
      if (!a || !b) return;
      const r = 20;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len;
      const uy = dy / len;

      const line = document.createElementNS(svgns, "line");
      line.setAttribute("x1", a.x + ux * r);
      line.setAttribute("y1", a.y + uy * r);
      line.setAttribute("x2", b.x - ux * (r + 8));
      line.setAttribute("y2", b.y - uy * (r + 8));
      line.setAttribute("class", "sl-edge-line fd-scene-edge-line");
      svg.appendChild(line);

      if (e.label) {
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2 - 10;
        const label = document.createElementNS(svgns, "text");
        label.setAttribute("x", midX);
        label.setAttribute("y", midY);
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("class", "sl-edge-label");
        label.textContent = e.label;
        svg.appendChild(label);
      }
    });

    scene.nodes.forEach((n) => {
      const p = positions[n.id];
      const color = n.color || "teal";

      const circle = document.createElementNS(svgns, "circle");
      circle.setAttribute("cx", p.x);
      circle.setAttribute("cy", p.y);
      circle.setAttribute("r", 20);
      circle.setAttribute("class", "fd-scene-node-circle " + color);
      svg.appendChild(circle);

      const icon = document.createElementNS(svgns, "path");
      icon.setAttribute("d", sceneIconPath(color, p.x, p.y));
      icon.setAttribute("class", "fd-scene-node-icon " + color);
      svg.appendChild(icon);

      const label = document.createElementNS(svgns, "text");
      label.setAttribute("x", p.x);
      label.setAttribute("y", p.y + 34);
      label.setAttribute("class", "fd-scene-label");
      label.textContent = n.label;
      svg.appendChild(label);

      if (n.sublabel) {
        const sub = document.createElementNS(svgns, "text");
        sub.setAttribute("x", p.x);
        sub.setAttribute("y", p.y + 47);
        sub.setAttribute("class", "fd-scene-sublabel");
        sub.textContent = n.sublabel;
        svg.appendChild(sub);
      }
    });

    container.innerHTML = "";
    container.appendChild(svg);
  }

  // Small glyph per node color: a person mark for a clean or neutral
  // entity (teal), a document mark for an account or holding entity under
  // review (amber), an alert mark for the escalated outcome (red).
  // Coordinates are offsets from the node's own center.
  function sceneIconPath(color, cx, cy) {
    if (color === "amber") {
      return (
        "M " + (cx - 6) + " " + (cy - 6) + " h 12 v 12 h -12 z " +
        "M " + (cx - 6) + " " + (cy - 2) + " h 12"
      );
    }
    if (color === "red") {
      return (
        "M " + cx + " " + (cy - 7) + " l 7 12 h -14 z " +
        "M " + cx + " " + (cy - 1) + " v 3 " +
        "M " + cx + " " + (cy + 4) + " v 0.5"
      );
    }
    return (
      "M " + cx + " " + (cy - 7) + " a 3 3 0 1 1 0.01 0 z " +
      "M " + (cx - 6) + " " + (cy + 7) + " a 6 6 0 0 1 12 0"
    );
  }

  const FRAUD_STEP_ICONS = {
    login:
      '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
    transfer:
      '<path d="M17 3l4 4-4 4"/><path d="M21 7H8a4 4 0 0 0-4 4v1"/><path d="M7 21l-4-4 4-4"/><path d="M3 17h13a4 4 0 0 0 4-4v-1"/>',
    device: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
    decision: '<path d="M4 22V4a1 1 0 0 1 1-1h12l-2 5 2 5H7a1 1 0 0 0-1 1v8"/>',
  };

  function fraudStepIconSvg(key) {
    const inner = FRAUD_STEP_ICONS[key] || '<circle cx="12" cy="12" r="4"/>';
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      inner +
      "</svg>"
    );
  }

  function fraudDecisionIndex(caseData) {
    return caseData.timeline.length;
  }

  function renderFraudStepper(state) {
    const c = state.currentCase;
    const total = fraudDecisionIndex(c) + 1;
    state.stepperEl.innerHTML = "";

    for (let i = 0; i < total; i++) {
      const isDecision = i === fraudDecisionIndex(c);
      const iconKey = isDecision ? "decision" : c.timeline[i].icon;
      const label = isDecision ? "Decision" : c.timeline[i].title;

      const btn = document.createElement("button");
      btn.type = "button";
      const isLocked = i > state.maxRevealed + 1;
      let cls = "fd-step";
      if (i <= state.maxRevealed) cls += " viewed";
      if (i === state.selected) cls += " active";
      if (isLocked) cls += " locked";
      btn.className = cls;
      btn.setAttribute("aria-label", label + (isLocked ? " (not yet reached)" : ""));
      btn.disabled = isLocked;
      btn.innerHTML = [
        '<span class="fd-step-marker">' + fraudStepIconSvg(iconKey) + "</span>",
        '<span class="fd-step-label">' + escapeHtml(label) + "</span>",
      ].join("");
      btn.addEventListener("click", () => selectFraudStep(state, i));
      state.stepperEl.appendChild(btn);
    }
  }

  // Gated here, not just visually: a step beyond maxRevealed + 1 simply
  // never advances, and the button for it is also rendered disabled above,
  // matching the same defense-in-depth principle KYC's screening gate uses.
  function selectFraudStep(state, index) {
    if (index > state.maxRevealed + 1) return;
    if (index > state.maxRevealed) state.maxRevealed = index;
    state.selected = index;
    renderFraudStepper(state);
    renderFraudRisk(state);
    renderFraudStepBody(state);
  }

  function currentFraudRiskValue(state) {
    const c = state.currentCase;
    const idx = state.selected === fraudDecisionIndex(c) ? c.timeline.length - 1 : state.selected;
    return c.timeline[idx].risk;
  }

  function fraudRiskBand(value) {
    if (value >= 70) return "red";
    if (value >= 30) return "amber";
    return "green";
  }

  function renderFraudRisk(state) {
    const value = currentFraudRiskValue(state);
    const band = fraudRiskBand(value);
    const valueEl = state.riskPanel.querySelector(".fd-risk-value");
    const fillEl = state.riskPanel.querySelector(".fd-risk-fill");
    valueEl.textContent = value + " / 100";
    valueEl.className = "fd-risk-value " + band;
    fillEl.className = "fd-risk-fill " + band;
    fillEl.style.width = value + "%";
  }

  function renderFraudStepBody(state) {
    const c = state.currentCase;
    state.bodyEl.innerHTML = "";

    if (state.selected === fraudDecisionIndex(c)) {
      renderFraudDecisionPanel(state);
      return;
    }

    const step = c.timeline[state.selected];
    state.bodyEl.innerHTML = [
      '<div class="fd-evidence-time">' + escapeHtml(step.time) + "</div>",
      "<h4>" + escapeHtml(step.title) + "</h4>",
      '<p class="fd-evidence-body">' + escapeHtml(step.body) + "</p>",
    ].join("");

    const nextBtn = document.createElement("button");
    nextBtn.className = "sl-btn";
    nextBtn.textContent = state.selected === fraudDecisionIndex(c) - 1 ? "Continue to decision" : "Next";
    nextBtn.addEventListener("click", () => selectFraudStep(state, state.selected + 1));
    state.bodyEl.appendChild(nextBtn);
  }

  // Disposition buttons and the correct/incorrect rationale are gated here
  // in JS, not just visually: this panel only ever builds the buttons once
  // maxRevealed has actually reached the decision step in order, the same
  // discipline scenario-lab.js uses to keep KYC's screening results behind
  // ns.identified rather than a CSS only hide.
  function renderFraudDecisionPanel(state) {
    const c = state.currentCase;
    const reachedNaturally = state.maxRevealed === fraudDecisionIndex(c);

    if (!reachedNaturally) {
      state.bodyEl.innerHTML = '<p class="fd-decision-intro">Review every event above before deciding.</p>';
      return;
    }

    state.bodyEl.innerHTML = '<p class="fd-decision-intro">All evidence reviewed. What is your disposition?</p>';

    const btnRow = document.createElement("div");
    btnRow.className = "fd-decision-buttons";
    c.disposition_options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "sl-btn";
      btn.textContent = opt.label;
      btn.disabled = state.decisionMade;
      btn.addEventListener("click", () => decideFraud(state, opt.key));
      btnRow.appendChild(btn);
    });
    state.bodyEl.appendChild(btnRow);

    const banner = document.createElement("div");
    banner.className = "sl-decision-banner";
    state.bodyEl.appendChild(banner);
    state.fraudBanner = banner;
  }

  function decideFraud(state, dispositionKey) {
    const c = state.currentCase;
    if (state.decisionMade) return; // defense in depth against a stray double click
    if (state.selected !== fraudDecisionIndex(c) || state.maxRevealed !== fraudDecisionIndex(c)) return;

    state.decisionMade = true;
    const isCorrect = c.correct_disposition.includes(dispositionKey);
    state.results.push({ caseId: c.entity_id, correct: isCorrect });
    recordCaseProgress(c.entity_id, isCorrect);

    state.bodyEl.querySelectorAll(".fd-decision-buttons button").forEach((b) => (b.disabled = true));

    const banner = state.fraudBanner;
    banner.className = "sl-decision-banner show " + (isCorrect ? "correct" : "incorrect");
    banner.textContent = (isCorrect ? "Correct. " : "Not quite. ") + c.rationale;
    appendRelatedGuide(banner, c);

    appendBackToCaseListControl(state.workspace, state, banner);

    state.pendingAdvanceTimeout = setTimeout(() => {
      state.pendingAdvanceTimeout = null;
      state.caseIndex += 1;
      if (state.caseIndex < state.cases.length) {
        loadFraudCase(state.workspace, state);
      } else {
        renderFraudCompletionScreen(state.workspace, state);
      }
    }, 3200);
  }

  function renderFraudCompletionScreen(workspace, state) {
    workspace.innerHTML = "";
    const complete = document.createElement("div");
    complete.className = "sl-complete";
    workspace.appendChild(complete);
    const totalCases = state.cases.length;
    renderCompletionBody(
      complete,
      workspace,
      state,
      "fraud",
      "Fraud Detection preview, " + totalCases + " case" + (totalCases === 1 ? "" : "s") + "."
    );
    complete.prepend(backToDashboardButton(workspace, state));
    appendNextModuleTeaser(complete, state);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  window.initScenarioLab = initScenarioLab;
})();
