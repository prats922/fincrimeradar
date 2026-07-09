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
      key: "fraud_detection",
      title: "Fraud Detection",
      description: "Spot transaction patterns and behavioural red flags across a simulated account history.",
    },
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
      caseIndex: 0,
      currentCase: null,
      nodeState: {}, // nodeId -> { identified: bool, screened: bool }
      selectedNodeId: null,
      riskToolOn: false,
      fuzzyThreshold: 50,
      pepHintOn: false,
      treeContainer: null,
      nodeDetail: null,
      results: [], // { caseId, correct: bool }
      startedAt: null,
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

    fetchCases(options.apiBase)
      .then((cases) => {
        state.cases = cases;
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

    const activeTile = document.createElement("div");
    activeTile.className = "sl-tile active";
    activeTile.innerHTML = [
      "<div>",
      "<h3>KYC and Sanctions Investigation</h3>",
      "<p>Build the ownership tree, screen every entity, then decide across five fixed cases.</p>",
      "</div>",
    ].join("");
    activeTile.addEventListener("click", () => startModule(dashboard, workspace, state));
    dashboard.appendChild(activeTile);

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

  function startModule(dashboard, workspace, state) {
    state.caseIndex = 0;
    state.results = [];
    state.startedAt = Date.now();
    workspace.dataset.total = String(state.cases.length);
    dashboard.style.display = "none";
    workspace.classList.add("visible");
    loadCase(workspace, state);
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
    const SPRING_LENGTH = Math.min(width, height) * 0.32;
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

    return positions;
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

    const svgns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgns, "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("class", "sl-tree-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Ownership structure diagram");

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

      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const label = document.createElementNS(svgns, "text");
      label.setAttribute("x", midX);
      label.setAttribute("y", midY - 4);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "sl-edge-label");
      label.textContent = e.ownership_pct + "%";
      svg.appendChild(label);
    });

    caseData.nodes.forEach((n) => {
      const p = positions[n.id];
      const ns = state.nodeState[n.id];
      const g = document.createElementNS(svgns, "g");
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", "Entity node " + (ns.identified ? n.label : "unidentified"));

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
      caption.textContent = ns.identified ? n.label : "Unidentified entity";
      g.appendChild(caption);

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

  function displayLabel(disposition) {
    if (disposition === "approve") return "Approve";
    if (disposition === "reject") return "Reject";
    return "Request more information";
  }

  function decide(disposition, footer, banner, workspace, state, caseData) {
    const isCorrect = caseData.correct_disposition.includes(disposition);

    state.results.push({ caseId: caseData.entity_id, correct: isCorrect });

    banner.className = "sl-decision-banner show " + (isCorrect ? "correct" : "incorrect");
    banner.textContent = (isCorrect ? "Correct. " : "Not quite. ") + caseData.rationale;

    footer.querySelectorAll("button").forEach((b) => (b.disabled = true));

    setTimeout(() => {
      state.caseIndex += 1;
      if (state.caseIndex < state.cases.length) {
        loadCase(workspace, state);
      } else {
        renderCompletionScreen(workspace, state);
      }
    }, 2600);
  }

  function renderCompletionScreen(workspace, state) {
    const total = state.results.length;
    const correct = state.results.filter((r) => r.correct).length;
    const accuracy = Math.round((correct / total) * 100);
    const elapsedSeconds = Math.round((Date.now() - state.startedAt) / 1000);
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;

    workspace.innerHTML = "";
    const complete = document.createElement("div");
    complete.className = "sl-complete";
    complete.innerHTML = [
      "<h2>Module complete</h2>",
      "<p>KYC and Sanctions Investigation, all five cases.</p>",
      '<div class="sl-stats">',
      '<div><div class="sl-stat-value">' + accuracy + '%</div><div class="sl-stat-label">Accuracy</div></div>',
      '<div><div class="sl-stat-value">' +
        minutes +
        "m " +
        seconds +
        's</div><div class="sl-stat-label">Time elapsed</div></div>',
      "</div>",
    ].join("");
    workspace.appendChild(complete);

    const nextTile = document.createElement("div");
    nextTile.className = "sl-tile locked";
    nextTile.style.marginTop = "16px";
    nextTile.innerHTML = [
      '<span class="sl-badge">Coming soon</span>',
      "<div><h3>Fraud Detection</h3><p>The most likely next build. Tell us if you want it prioritised.</p></div>",
    ].join("");
    appendRequestControl(nextTile, "fraud_detection", state);
    complete.appendChild(nextTile);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  window.initScenarioLab = initScenarioLab;
})();
