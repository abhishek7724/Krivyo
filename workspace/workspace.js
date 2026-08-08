const state = {
  process: null,
  guide: null,
  ai: null,
  rawSummary: null,
  screenshotUrls: {},
  capture: null,
  recentCaptures: [],
  guideOverrides: { edits: {}, excludedStepIds: [], screenshotScales: {} },
  user: null,
  auth: null,
  activeSourceStepId: null,
  view: "home",
  mode: "empty",
  observer: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
})[char]);

function toast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function source(id) { return state.process?.steps?.find(step => step.stepId === id) || null; }
function action(step) { return String(step?.action || "STEP").toUpperCase(); }
function screen(step) { return step?.screen?.page || step?.screen?.title || state.process?.applicationName || "Captured evidence"; }
function captureParam() { return new URLSearchParams(location.search).get("capture"); }
function requestedView() {
  const view = new URLSearchParams(location.search).get("view");
  return ["home", "recording", "guides", "tests", "knowledge", "analytics", "settings"].includes(view) ? view : null;
}

function emptyProcess() {
  return { captureId: "—", processId: "—", processingVersion: "—", applicationName: "No capture selected", steps: [] };
}

function fallbackGuide(process) {
  const steps = (process.steps || []).map((step, index) => ({
    sourceStepId: step.stepId,
    sequence: step.sequence ?? index + 1,
    title: step.title || `Step ${index + 1}`,
    description: step.description || step.title || "Recorded step",
    confidence: 1
  }));
  return {
    schemaVersion: "fallback",
    ai: { provider: "none", model: "—", promptVersion: "—" },
    steps,
    coverage: { sourceStepCount: steps.length, enhancedStepCount: steps.length, accountedStepIds: steps.map(s => s.sourceStepId), unassignedStepIds: [], coveragePercent: steps.length ? 100 : 0 }
  };
}

function fallbackAi(process) {
  return {
    schemaVersion: "fallback",
    ai: { provider: "none", model: "—", promptVersion: "—" },
    process: { name: process.applicationName || "Captured process", description: "AI process interpretation is not ready yet.", businessObjective: "—", application: process.applicationName || "—", module: "—", businessArea: "—", preconditions: [], testData: [], businessSteps: [] },
    coverage: { coveragePercent: 0 }
  };
}

async function workspaceRequest(payload) {
  const endpoint = window.KRIVYO_WORKSPACE_CONFIG?.workspaceApiUrl;
  if (!endpoint) throw new Error("Workspace API is not configured.");
  const supabase = state.auth?.getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (!accessToken) throw new Error("Your Krivyo session has expired. Sign in again.");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
    cache: "no-store",
    body: JSON.stringify(payload)
  });
  let result = null;
  try { result = await response.json(); } catch {}
  if (response.status === 401) {
    state.auth.rememberReturnTo(location.href);
    location.replace("/workspace/login.html");
    throw new Error("Authentication required.");
  }
  if (!response.ok) throw new Error(result?.details || result?.error || `Workspace API returned HTTP ${response.status}`);
  return result;
}

async function listLiveCaptures(limit = 20) {
  const result = await workspaceRequest({ action: "list", limit });
  return Array.isArray(result?.captures) ? result.captures : [];
}

async function loadLiveCapture(captureId) {
  const payload = await workspaceRequest({ action: "load", capture_id: captureId });
  if (!payload?.success || !payload?.process_model) throw new Error("Workspace API returned an incomplete capture.");
  return payload;
}

function formatCaptureDate(value) {
  const date = new Date(value || Date.now());
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Recently";
}

function normalizeOverrides(value) {
  const edits = value?.edits && typeof value.edits === "object" ? value.edits : {};
  const excludedStepIds = Array.isArray(value?.excludedStepIds) ? value.excludedStepIds.map(String) : [];
  const screenshotScales = value?.screenshotScales && typeof value.screenshotScales === "object" ? value.screenshotScales : {};
  return { edits, excludedStepIds, screenshotScales };
}

function effectiveGuideStep(step) {
  const edit = state.guideOverrides.edits?.[step.sourceStepId];
  return edit ? { ...step, ...edit } : step;
}

function visibleGuideSteps() {
  const excluded = new Set(state.guideOverrides.excludedStepIds || []);
  return (state.guide?.steps || []).filter(step => !excluded.has(step.sourceStepId));
}

function screenshotScale(sourceStepId) {
  const value = Number(state.guideOverrides.screenshotScales?.[sourceStepId] ?? 1);
  return Math.max(.6, Math.min(1, Number.isFinite(value) ? value : 1));
}

function renderCaptureLibrary() {
  const list = $("#workspaceCaptureList");
  const count = $("#captureLibraryCount");
  if (!list) return;
  const captures = state.recentCaptures || [];
  if (count) count.textContent = `${captures.length} capture${captures.length === 1 ? "" : "s"}`;
  if (!captures.length) {
    list.innerHTML = '<div class="workspace-capture-empty"><strong>No captures yet</strong><span>Complete your first capture from the Krivyo Chrome extension.</span></div>';
    return;
  }
  list.innerHTML = "";
  captures.forEach(capture => {
    const id = String(capture.capture_id || capture.id || "");
    const guide = String(capture.guide_status || "pending");
    const test = String(capture.test_status || "pending");
    const card = document.createElement("button");
    card.type = "button";
    card.className = "workspace-capture-item";
    card.innerHTML = `<span class="workspace-capture-mark">K</span><span class="workspace-capture-copy"><strong>${esc(capture.document_title || "Untitled capture")}</strong><small>${esc(capture.application_name || "Web application")} · ${Number(capture.step_count || 0)} steps · ${esc(formatCaptureDate(capture.created_at))}</small></span><span class="workspace-capture-ai"><em class="${guide}">Guide ${esc(guide)}</em><em class="${test}">Test ${esc(test)}</em></span><span class="workspace-capture-open">→</span>`;
    card.onclick = () => { if (id) location.href = `/workspace/?capture=${encodeURIComponent(id)}&view=recording`; };
    list.appendChild(card);
  });
}

function showLoadError(message) {
  $("#main").innerHTML = `<div style="padding:56px;max-width:760px"><p class="eyebrow">KRIVYO WORKSPACE</p><h1 style="font-size:42px;line-height:1.05;margin:8px 0 14px">This capture could not be opened.</h1><p style="font-size:16px;line-height:1.65;color:#667085">${esc(message)}</p><p style="margin-top:22px;color:#667085">Make sure you are signed in with the Krivyo account that owns this capture.</p><a href="/workspace/" class="button primary" style="display:inline-flex;margin-top:18px">Back to Workspace</a></div>`;
}

function viewName(view) {
  return ({ home: "Home", recording: "Capture", guides: "Guides", tests: "Test Cases", knowledge: "Knowledge", analytics: "Analytics", settings: "Settings" })[view] || "Home";
}

function activate(view, update = true) {
  if (!["home", "recording", "guides", "tests", "knowledge", "analytics", "settings"].includes(view)) view = "home";
  state.view = view;
  $$('[data-panel]').forEach(panel => panel.classList.toggle("active", panel.dataset.panel === view));
  $$('[data-view]').forEach(item => item.classList.toggle("active", item.dataset.view === view));
  $("#crumb").textContent = viewName(view);
  const processName = state.ai?.process?.name || state.capture?.document_title || state.process?.name || state.process?.captureId || "Workspace";
  $("#topContext").textContent = view === "home" ? "Your process intelligence workspace" : processName;
  if (view === "guides") setTimeout(() => setupGuideObserver(), 0);
  if (update) {
    const url = new URL(location.href);
    url.searchParams.set("view", view);
    history.replaceState(null, "", url);
  }
}

function initSummary() {
  const process = state.process || emptyProcess();
  const aiProcess = state.ai?.process || {};
  const guideCount = visibleGuideSteps().length;
  const testCount = aiProcess.businessSteps?.length || 0;
  const coverage = state.ai?.coverage?.coveragePercent ?? 0;
  const captures = state.recentCaptures || [];
  const readyGuides = captures.filter(item => item.guide_status === "ready").length;
  const readyTests = captures.filter(item => item.test_status === "ready").length;
  $("#metricGuides").textContent = readyGuides;
  $("#metricCases").textContent = readyTests;
  $("#metricCoverage").textContent = `${coverage}%`;
  $("#metricRecorded").textContent = process.steps?.length || 0;
  $("#metricTest").textContent = `${testCount} execution steps`;
  $("#orbitGuide").textContent = `${guideCount} steps`;
  $("#orbitTest").textContent = `${testCount} steps`;
  $("#homeTitle").textContent = aiProcess.name || state.capture?.document_title || process.name || "Latest capture";
  $("#homeDesc").textContent = aiProcess.description || process.description || "Reviewed process capture";
  $("#homeApp").textContent = process.applicationName || aiProcess.application || "Web application";
  $("#homeCapture").textContent = state.capture?.created_at ? new Date(state.capture.created_at).toLocaleDateString() : `${process.steps?.length || 0} recorded steps`;
  $("#guideCount").textContent = guideCount;
  $("#testCount").textContent = testCount;
  $("#guideTitlePage").textContent = aiProcess.name || state.capture?.document_title || process.name || "Process Guide";
  $("#guideSubtitle").textContent = `${guideCount} guide steps · scroll naturally · source evidence remains unchanged.`;
  $("#stepsCount").textContent = `${guideCount} step${guideCount === 1 ? "" : "s"}`;
}

function renderRecording() {
  const list = $("#recordingList");
  if (!list) return;
  const process = state.process || {};
  const steps = process.steps || [];
  $("#recordingTitle").textContent = state.capture?.document_title || process.name || "Recorded process";
  $("#recordingSubtitle").textContent = `${steps.length} source steps · ${process.applicationName || "Web application"} · this source capture is never changed by Guide edits.`;
  const cloud = $("#recordingCloudState");
  if (cloud) cloud.textContent = state.capture?.status === "ready" ? "● Saved · AI ready" : "● Saved · AI processing";
  list.innerHTML = "";
  steps.forEach((step, index) => {
    const path = step?.evidence?.screenshot || null;
    const url = path ? state.screenshotUrls?.[path] : null;
    const card = document.createElement("article");
    card.className = "card recording-step";
    const shot = url ? `<img src="${esc(url)}" alt="Screenshot for step ${index + 1}"/>` : '<div class="recording-shot-empty">No screenshot available for this source step.</div>';
    card.innerHTML = `<div class="recording-step-head"><div><span class="recording-step-index">${String(step.sequence || index + 1).padStart(2, "0")}</span><span><strong>${esc(step.title || `Step ${index + 1}`)}</strong><small>${esc(action(step))}</small></span></div><span>${esc(screen(step))}</span></div><div class="recording-shot">${shot}</div><div class="recording-step-copy"><h3>${esc(step.title || `Step ${index + 1}`)}</h3><p>${esc(step.description || "Recorded browser action.")}</p></div>`;
    list.appendChild(card);
  });
}

function stepMatchesFilter(step, filter) {
  if (!filter) return true;
  const src = source(step.sourceStepId);
  const effective = effectiveGuideStep(step);
  return `${effective.title} ${effective.description} ${action(src)}`.toLowerCase().includes(filter.toLowerCase());
}

function renderStepList(filter = "") {
  const list = $("#stepList");
  if (!list) return;
  const visible = visibleGuideSteps();
  list.innerHTML = "";
  visible.forEach(step => {
    if (!stepMatchesFilter(step, filter.trim())) return;
    const src = source(step.sourceStepId);
    const effective = effectiveGuideStep(step);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `step-btn${state.activeSourceStepId === step.sourceStepId ? " active" : ""}`;
    button.dataset.sourceStepId = step.sourceStepId;
    button.innerHTML = `<span class="step-index">${String(step.sequence).padStart(2, "0")}</span><span><strong>${esc(effective.title)}</strong><small>${esc(action(src))}</small></span>`;
    button.onclick = () => scrollToGuideStep(step.sourceStepId);
    list.appendChild(button);
  });
  renderExcludedSteps();
}

function renderExcludedSteps() {
  const box = $("#excludedStepsBox");
  if (!box) return;
  const excluded = new Set(state.guideOverrides.excludedStepIds || []);
  const steps = (state.guide?.steps || []).filter(step => excluded.has(step.sourceStepId));
  box.classList.toggle("has-items", steps.length > 0);
  if (!steps.length) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="excluded-title"><span>Excluded from Guide/PDF</span><span>${steps.length}</span></div>`;
  steps.forEach(step => {
    const effective = effectiveGuideStep(step);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "excluded-step";
    button.innerHTML = `<span>${esc(effective.title)}</span><span>Restore</span>`;
    button.onclick = async () => {
      state.guideOverrides.excludedStepIds = state.guideOverrides.excludedStepIds.filter(id => id !== step.sourceStepId);
      await persistGuideOverrides("Step restored to Guide and PDF");
      renderGuideExperience();
    };
    box.appendChild(button);
  });
}

function guidePageHtml(step, index, total) {
  const src = source(step.sourceStepId);
  const effective = effectiveGuideStep(step);
  const path = src?.evidence?.screenshot || null;
  const url = path ? state.screenshotUrls?.[path] : null;
  const scale = screenshotScale(step.sourceStepId);
  const percent = Math.round(scale * 100);
  const shot = url
    ? `<img src="${esc(url)}" alt="Screenshot for ${esc(effective.title)}" style="--shot-width:${percent}%"/>`
    : '<div class="pdf-shot-empty">Screenshot unavailable for this step.</div>';
  return `<article class="pdf-step-page guide-scroll-step" id="guide-step-${esc(step.sourceStepId)}" data-source-step-id="${esc(step.sourceStepId)}">
    <div class="pdf-step-header">
      <div class="pdf-step-meta"><span class="pdf-step-number">${String(step.sequence).padStart(2, "0")}</span><span class="pdf-step-meta-copy"><strong>${esc(state.capture?.document_title || state.ai?.process?.name || "Process Guide")}</strong><small>STEP ${index + 1} OF ${total} · ${esc(action(src))}</small></span></div>
      <div class="pdf-step-tools no-print">
        <div class="zoom-group" title="Screenshot size used in the PDF"><button type="button" data-zoom-out="${esc(step.sourceStepId)}" aria-label="Zoom screenshot out">−</button><span>${percent}%</span><button type="button" data-zoom-in="${esc(step.sourceStepId)}" aria-label="Zoom screenshot in">+</button></div>
        <button class="tool-btn" type="button" data-zoom-reset="${esc(step.sourceStepId)}">Fit</button>
        <button class="tool-btn" type="button" data-edit-step="${esc(step.sourceStepId)}">Edit</button>
        <button class="tool-btn danger-text" type="button" data-delete-step="${esc(step.sourceStepId)}">Delete</button>
      </div>
    </div>
    <div class="pdf-shot-wrap"><div class="pdf-browser-bar"><i></i><i></i><i></i><span>${esc(state.process?.applicationName || "Application")} · ${esc(screen(src))}</span></div><div class="pdf-shot-canvas">${shot}</div></div>
    <div class="pdf-copy"><label>Step title</label><h2 data-step-title="${esc(step.sourceStepId)}" contenteditable="false">${esc(effective.title)}</h2><label>Instruction</label><p data-step-description="${esc(step.sourceStepId)}" contenteditable="false">${esc(effective.description)}</p></div>
    <div class="pdf-step-footer"><span>↳ Linked to source</span><code>${esc(step.sourceStepId)}</code><strong>${Math.round((step.confidence ?? 1) * 100)}% confidence</strong></div>
  </article>`;
}

function renderGuidePages() {
  const container = $("#guideScroll");
  if (!container) return;
  const steps = visibleGuideSteps();
  if (!steps.length) {
    container.innerHTML = '<div class="guide-scroll-empty"><strong>No guide steps remain.</strong><p>Restore an excluded step from the left rail or reset guide changes.</p></div>';
    return;
  }
  container.innerHTML = steps.map((step, index) => guidePageHtml(step, index, steps.length)).join("");
  wireGuidePageActions();
  setupGuideObserver();
}

function renderGuideExperience() {
  initSummary();
  renderStepList($("#stepSearch")?.value || "");
  renderGuidePages();
}

function scrollToGuideStep(sourceStepId) {
  const element = document.getElementById(`guide-step-${sourceStepId}`);
  if (!element) return;
  state.activeSourceStepId = sourceStepId;
  updateActiveStepRail();
  element.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateActiveStepRail() {
  $$(".step-btn").forEach(button => button.classList.toggle("active", button.dataset.sourceStepId === state.activeSourceStepId));
  const active = $(`.step-btn[data-source-step-id="${CSS.escape(state.activeSourceStepId || "")}"]`);
  active?.scrollIntoView({ block: "nearest" });
  $$(".guide-scroll-step").forEach(page => page.classList.toggle("active-page", page.dataset.sourceStepId === state.activeSourceStepId));
}

function setupGuideObserver() {
  state.observer?.disconnect();
  const pages = $$(".guide-scroll-step");
  if (!pages.length) return;
  state.observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting);
    if (!visible.length) return;
    visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
    const id = visible[0].target.dataset.sourceStepId;
    if (id && id !== state.activeSourceStepId) {
      state.activeSourceStepId = id;
      updateActiveStepRail();
    }
  }, { root: null, rootMargin: "-18% 0px -58% 0px", threshold: [0, .05, .2, .45] });
  pages.forEach(page => state.observer.observe(page));
  if (!state.activeSourceStepId || !pages.some(page => page.dataset.sourceStepId === state.activeSourceStepId)) {
    state.activeSourceStepId = pages[0].dataset.sourceStepId;
    updateActiveStepRail();
  }
}

async function persistGuideOverrides(successMessage = "Guide changes saved") {
  if (!state.capture?.capture_id && !state.process?.captureId) return;
  const captureId = state.capture?.capture_id || state.process.captureId;
  try {
    await workspaceRequest({ action: "save_guide_overrides", capture_id: captureId, overrides: state.guideOverrides });
    toast(successMessage);
  } catch (error) {
    console.error(error);
    toast(`Could not save guide changes: ${error.message}`);
  }
}

function wireGuidePageActions() {
  $$('[data-edit-step]').forEach(button => {
    button.onclick = async () => {
      const id = button.dataset.editStep;
      const title = $(`[data-step-title="${CSS.escape(id)}"]`);
      const description = $(`[data-step-description="${CSS.escape(id)}"]`);
      const editing = title?.contentEditable === "true";
      if (!editing) {
        title.contentEditable = "true";
        description.contentEditable = "true";
        button.textContent = "Save";
        title.focus();
        return;
      }
      const original = state.guide.steps.find(step => step.sourceStepId === id);
      state.guideOverrides.edits[id] = {
        title: (title.textContent || original?.title || "Step").trim().slice(0, 300),
        description: (description.textContent || original?.description || "").trim().slice(0, 5000)
      };
      title.contentEditable = "false";
      description.contentEditable = "false";
      button.textContent = "Edit";
      await persistGuideOverrides("Step wording saved");
      renderStepList($("#stepSearch")?.value || "");
    };
  });

  $$('[data-delete-step]').forEach(button => {
    button.onclick = async () => {
      const id = button.dataset.deleteStep;
      const step = state.guide.steps.find(item => item.sourceStepId === id);
      if (!step) return;
      if (!confirm(`Delete “${effectiveGuideStep(step).title}” from the Guide and PDF?\n\nThe original source recording remains unchanged.`)) return;
      if (!state.guideOverrides.excludedStepIds.includes(id)) state.guideOverrides.excludedStepIds.push(id);
      await persistGuideOverrides("Step removed from Guide and PDF");
      renderGuideExperience();
    };
  });

  $$('[data-zoom-out]').forEach(button => button.onclick = () => changeScreenshotScale(button.dataset.zoomOut, -.1));
  $$('[data-zoom-in]').forEach(button => button.onclick = () => changeScreenshotScale(button.dataset.zoomIn, .1));
  $$('[data-zoom-reset]').forEach(button => button.onclick = () => setScreenshotScale(button.dataset.zoomReset, 1));
}

async function setScreenshotScale(id, value) {
  state.guideOverrides.screenshotScales[id] = Math.max(.6, Math.min(1, Math.round(value * 10) / 10));
  await persistGuideOverrides("Screenshot size saved");
  renderGuidePages();
  renderStepList($("#stepSearch")?.value || "");
  setTimeout(() => scrollToGuideStep(id), 0);
}

function changeScreenshotScale(id, delta) {
  return setScreenshotScale(id, screenshotScale(id) + delta);
}

function wireGuide() {
  $("#stepSearch").oninput = event => renderStepList(event.target.value);
  $("#collapseSteps").onclick = () => {
    document.body.classList.toggle("steps-collapsed");
    localStorage.setItem("krivyo.stepsCollapsed", document.body.classList.contains("steps-collapsed") ? "1" : "0");
  };
  $("#restoreAll").onclick = async () => {
    if (!confirm("Reset all Guide edits, deleted steps and screenshot zoom settings back to the AI-generated guide?")) return;
    state.guideOverrides = { edits: {}, excludedStepIds: [], screenshotScales: {} };
    await persistGuideOverrides("Guide reset to AI-generated version");
    renderGuideExperience();
  };
}

function testDataFor(step) {
  const ids = new Set(step.sourceStepIds || []);
  return (state.ai?.process?.testData || []).filter(item => (item.sourceStepIds || []).some(id => ids.has(id)));
}

function renderTest() {
  const process = state.ai?.process || {};
  $("#testTitle").textContent = process.name || "Generated Test Case";
  $("#testObjective").textContent = process.businessObjective || "—";
  $("#testApp").textContent = process.application || "—";
  $("#testModule").textContent = process.module || "—";
  $("#testArea").textContent = process.businessArea || "—";
  $("#testCoverage").textContent = `${state.ai?.coverage?.coveragePercent ?? 0}%`;
  const precondition = process.preconditions?.[0];
  $("#precondition").textContent = precondition?.text || "No explicit precondition generated.";
  $("#preConfidence").textContent = precondition ? `${Math.round((precondition.confidence ?? 0) * 100)}% confidence` : "—";
  const body = $("#testBody");
  body.innerHTML = "";
  (process.businessSteps || []).forEach(step => {
    const data = testDataFor(step);
    const basis = String(step.expectedResultBasis || "UNKNOWN").toLowerCase();
    const sourceCount = step.sourceStepIds?.length || 0;
    const row = document.createElement("tr");
    row.innerHTML = `<td>${step.sequence}</td><td><span class="t-title">${esc(step.title)}</span><span class="t-inst">${esc(step.instruction)}</span></td><td>${data.length ? data.map(item => `<span class="data-chip">${esc(item.field)}: ${esc(item.value)}</span>`).join("") : '<span class="t-inst">—</span>'}</td><td>${esc(step.expectedResult || "To be verified during execution.")}<br><span class="basis ${basis}">${esc(step.expectedResultBasis || "Unknown")}</span></td><td><span class="source-link">${sourceCount} source step${sourceCount === 1 ? "" : "s"}</span></td><td><span class="score">${Math.round((step.confidence ?? 0) * 100)}%</span></td>`;
    body.appendChild(row);
  });
}

function renderDetails() {
  const process = state.process || {};
  const ai = state.ai || {};
  const guide = state.guide || {};
  const rows1 = [["Capture ID", process.captureId], ["Process ID", process.processId], ["Application", process.applicationName], ["Processing version", process.processingVersion], ["Recorded steps", process.steps?.length], ["Raw events", state.rawSummary?.eventCount ?? (state.rawSummary?.present ? "Preserved" : "—")]];
  const rows2 = [["Guide model", guide.ai?.model], ["Guide prompt", guide.ai?.promptVersion], ["Process model", ai.ai?.model], ["Process prompt", ai.ai?.promptVersion], ["Guide coverage", `${guide.coverage?.coveragePercent ?? 0}%`], ["Process coverage", `${ai.coverage?.coveragePercent ?? 0}%`]];
  const draw = (id, rows) => $(id).innerHTML = rows.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value ?? "—")}</dd></div>`).join("");
  draw("#captureDetails", rows1);
  draw("#aiDetails", rows2);
}

function exportCsv() {
  const rows = [["Sequence", "Title", "Instruction", "Test Data", "Expected Result", "Basis", "Source Step IDs", "Confidence"]];
  for (const step of state.ai?.process?.businessSteps || []) {
    rows.push([step.sequence, step.title, step.instruction, testDataFor(step).map(item => `${item.field}=${item.value}`).join(" | "), step.expectedResult || "To be verified during execution", step.expectedResultBasis, (step.sourceStepIds || []).join(" | "), `${Math.round((step.confidence || 0) * 100)}%`]);
  }
  const csv = rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${state.process?.captureId || "krivyo"}-test-script.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
  toast("Test script CSV exported");
}

function exportGuidePdf() {
  if (!visibleGuideSteps().length) { toast("There are no Guide steps to export."); return; }
  const previousTitle = document.title;
  document.title = `${state.capture?.document_title || state.ai?.process?.name || "Krivyo Process Guide"}`;
  toast("Opening PDF print view — choose Save as PDF");
  setTimeout(() => {
    window.print();
    setTimeout(() => { document.title = previousTitle; }, 500);
  }, 120);
}

function openDiscardDialog() {
  if (!state.capture?.capture_id) { toast("No saved capture is selected."); return; }
  const dialog = $("#discardDialog");
  dialog.classList.add("open");
  dialog.setAttribute("aria-hidden", "false");
}

function closeDiscardDialog() {
  const dialog = $("#discardDialog");
  dialog.classList.remove("open");
  dialog.setAttribute("aria-hidden", "true");
}

async function discardCurrentCapture() {
  const captureId = state.capture?.capture_id;
  if (!captureId) return;
  const button = $("#confirmDiscard");
  button.disabled = true;
  button.textContent = "Discarding…";
  try {
    await workspaceRequest({ action: "delete_capture", capture_id: captureId });
    closeDiscardDialog();
    location.replace("/workspace/");
  } catch (error) {
    console.error(error);
    toast(`Could not discard recording: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Discard recording";
  }
}

function wireDiscard() {
  $("#discardCaptureRecording")?.addEventListener("click", openDiscardDialog);
  $("#discardCaptureGuide")?.addEventListener("click", openDiscardDialog);
  $("#cancelDiscard")?.addEventListener("click", closeDiscardDialog);
  $("#confirmDiscard")?.addEventListener("click", discardCurrentCapture);
  $("#discardDialog")?.addEventListener("click", event => { if (event.target.id === "discardDialog") closeDiscardDialog(); });
}

function wireNav() {
  $$('[data-view]').forEach(button => button.onclick = () => activate(button.dataset.view));
  $$('[data-open]').forEach(button => button.onclick = () => activate(button.dataset.open));
  $("#collapseNav").onclick = () => {
    document.body.classList.toggle("nav-collapsed");
    localStorage.setItem("krivyo.navCollapsed", document.body.classList.contains("nav-collapsed") ? "1" : "0");
  };
}

function wirePalette() {
  const palette = $("#palette");
  const open = () => { palette.classList.add("open"); $("#commandSearch").focus(); };
  const close = () => palette.classList.remove("open");
  $("#commandButton").onclick = open;
  $(".palette-bg").onclick = close;
  $$('[data-command]').forEach(button => button.onclick = () => { activate(button.dataset.command); close(); });
  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); open(); }
    if (event.key === "Escape") { close(); closeDiscardDialog(); }
  });
}

function wireMisc() {
  $("#exportCsv").onclick = exportCsv;
  $("#downloadPdf").onclick = exportGuidePdf;
  $("#runTest").onclick = () => toast("UAT execution is a later Test Cases milestone");
  $("#newCapture").onclick = () => toast("Start a new capture from the Krivyo extension");
}

function renderSignedInUser(user) {
  if (!user) return;
  const name = state.auth?.userDisplayName(user) || user.email || "Krivyo User";
  const initial = state.auth?.userInitial(user) || "K";
  $("#profileAvatar").textContent = initial;
  $("#profileName").textContent = name;
  $("#profileEmail").textContent = user.email || "Workspace member";
}

function wireAuthentication() {
  const button = $("#signOutButton");
  if (!button || !state.auth) return;
  button.onclick = async () => {
    button.disabled = true;
    button.textContent = "Signing out…";
    try { await state.auth.signOutUser(); }
    catch (error) { console.error(error); button.disabled = false; button.textContent = "Sign out"; toast("Could not sign out"); }
  };
}

let artifactPollTimer = null;
function startArtifactPolling(captureId) {
  if (artifactPollTimer) clearInterval(artifactPollTimer);
  let attempts = 0;
  artifactPollTimer = setInterval(async () => {
    attempts += 1;
    if (attempts > 30) { clearInterval(artifactPollTimer); artifactPollTimer = null; return; }
    if (state.capture?.guide_status === "ready" && state.capture?.test_status === "ready") { clearInterval(artifactPollTimer); artifactPollTimer = null; return; }
    try {
      const live = await loadLiveCapture(captureId);
      state.capture = live.capture || state.capture;
      state.guide = live.guide_model || state.guide;
      state.ai = live.ai_process_model || state.ai;
      state.screenshotUrls = live.screenshot_urls || state.screenshotUrls;
      state.guideOverrides = normalizeOverrides(live.guide_overrides || state.guideOverrides);
      initSummary(); renderRecording(); renderGuideExperience(); renderTest(); renderDetails();
    } catch (error) { console.debug("AI artifact refresh unavailable:", error.message); }
  }, 3000);
}

async function init() {
  try {
    state.auth = await import("./auth-client.js");
    state.user = await state.auth.requireAuthenticatedUser();
    if (!state.user) return;
    renderSignedInUser(state.user);

    if (localStorage.getItem("krivyo.navCollapsed") === "1") document.body.classList.add("nav-collapsed");
    if (localStorage.getItem("krivyo.stepsCollapsed") === "1") document.body.classList.add("steps-collapsed");

    const captureId = captureParam();
    state.recentCaptures = await listLiveCaptures(20);
    if (captureId) {
      const live = await loadLiveCapture(captureId);
      state.capture = live.capture || null;
      state.process = live.process_model;
      state.guide = live.guide_model || fallbackGuide(state.process);
      state.ai = live.ai_process_model || fallbackAi(state.process);
      state.screenshotUrls = live.screenshot_urls || {};
      state.rawSummary = live.raw_summary || { present: false, eventCount: null };
      state.guideOverrides = normalizeOverrides(live.guide_overrides);
      state.mode = "live";
    } else if (state.recentCaptures.length) {
      const latest = await loadLiveCapture(state.recentCaptures[0].capture_id);
      state.capture = latest.capture || state.recentCaptures[0];
      state.process = latest.process_model;
      state.guide = latest.guide_model || fallbackGuide(state.process);
      state.ai = latest.ai_process_model || fallbackAi(state.process);
      state.screenshotUrls = latest.screenshot_urls || {};
      state.rawSummary = latest.raw_summary || { present: false, eventCount: null };
      state.guideOverrides = normalizeOverrides(latest.guide_overrides);
      state.mode = "live";
    } else {
      state.process = emptyProcess();
      state.guide = fallbackGuide(state.process);
      state.ai = fallbackAi(state.process);
      state.rawSummary = { present: false, eventCount: null };
      state.screenshotUrls = {};
      state.capture = null;
      state.guideOverrides = normalizeOverrides(null);
      state.mode = "empty";
    }

    const firstVisible = visibleGuideSteps()[0];
    state.activeSourceStepId = firstVisible?.sourceStepId || null;
    initSummary(); renderCaptureLibrary(); renderRecording(); renderGuideExperience(); renderTest(); renderDetails();
    wireGuide(); wireNav(); wirePalette(); wireMisc(); wireAuthentication(); wireDiscard();
    activate(requestedView() || (captureId ? "recording" : "home"), false);
    if (captureId) startArtifactPolling(captureId);
  } catch (error) {
    console.error(error);
    showLoadError(error instanceof Error ? error.message : String(error));
  }
}

document.addEventListener("DOMContentLoaded", init);
