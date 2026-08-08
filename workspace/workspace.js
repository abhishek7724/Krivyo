const DATA_PATHS = {
  process: "data/process-model.json",
  guide: "data/guide-model.json",
  ai: "data/ai-process-model.json",
  raw: "data/raw-session.json"
};

const state = {
  process: null,
  guide: null,
  ai: null,
  raw: null,
  selectedGuideIndex: 0,
  edits: new Map(),
  originals: new Map()
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function sourceStepById(id) {
  return (state.process?.steps || []).find((s) => s.stepId === id) || null;
}

function sourceAction(step) {
  return String(step?.action || step?.eventType || "STEP").toUpperCase();
}

function screenLabel(step) {
  const screen = step?.screen || {};
  return screen.section || screen.page || screen.title || state.process?.applicationName || "Recorded source";
}

function initHeader() {
  const p = state.process || {};
  const ai = state.ai || {};
  const guide = state.guide || {};
  const captureId = p.captureId || ai.source?.captureId || "Capture";
  const process = ai.process || {};
  $("#crumbCapture").textContent = captureId;
  $("#applicationName").textContent = process.application || p.applicationName || "Web application";
  $("#processTitle").textContent = process.name || p.name || "Recorded Process";
  $("#processDescription").textContent = process.description || "A reviewed capture transformed into reusable process knowledge.";
  $("#recordedCount").textContent = p.steps?.length || 0;
  $("#testCount").textContent = process.businessSteps?.length || 0;
  $("#aiModel").textContent = guide.ai?.model || ai.ai?.model || "AI";
  $("#coverageScore").textContent = `${guide.coverage?.coveragePercent ?? ai.coverage?.coveragePercent ?? 100}%`;
  $("#guideTabCount").textContent = guide.steps?.length || 0;
  $("#testTabCount").textContent = process.businessSteps?.length || 0;
  $("#recordingTabCount").textContent = p.steps?.length || 0;
}

function renderGuideList(filter = "") {
  const list = $("#guideStepList");
  const query = filter.trim().toLowerCase();
  list.innerHTML = "";
  (state.guide?.steps || []).forEach((step, index) => {
    const source = sourceStepById(step.sourceStepId);
    const haystack = `${step.title} ${step.description} ${sourceAction(source)}`.toLowerCase();
    if (query && !haystack.includes(query)) return;
    const button = document.createElement("button");
    button.className = `step-item${index === state.selectedGuideIndex ? " active" : ""}`;
    button.innerHTML = `<span class="step-index">${String(step.sequence).padStart(2,"0")}</span><span class="step-item-copy"><strong>${esc(step.title)}</strong><small>${esc(sourceAction(source))}</small></span>`;
    button.addEventListener("click", () => {
      state.selectedGuideIndex = index;
      renderGuideList($("#stepSearch").value);
      renderSelectedGuide();
    });
    list.appendChild(button);
  });
}

function currentGuideData() {
  const step = state.guide.steps[state.selectedGuideIndex];
  const edited = state.edits.get(step.sourceStepId);
  return edited ? { ...step, ...edited } : step;
}

function renderSelectedGuide() {
  const step = currentGuideData();
  if (!step) return;
  const source = sourceStepById(step.sourceStepId);
  const total = state.guide.steps.length;
  $("#selectedStepHeading").textContent = `Step ${step.sequence} of ${total}`;
  $("#selectedStepNumber").textContent = String(step.sequence).padStart(2,"0");
  $("#guideTitle").textContent = step.title;
  $("#guideDescription").textContent = step.description;
  $("#actionBadge").textContent = sourceAction(source);
  $("#screenContext").textContent = screenLabel(source);
  $("#guideConfidence").textContent = `${Math.round((step.confidence ?? 1) * 100)}% confidence`;
  $("#sourceStepId").textContent = step.sourceStepId;
  $("#editButton").textContent = "Edit wording";
  $("#guideTitle").contentEditable = "false";
  $("#guideDescription").contentEditable = "false";
}

function wireGuideEditing() {
  $("#editButton").addEventListener("click", () => {
    const title = $("#guideTitle");
    const desc = $("#guideDescription");
    const editing = title.contentEditable === "true";
    if (!editing) {
      title.contentEditable = "true";
      desc.contentEditable = "true";
      $("#editButton").textContent = "Save wording";
      title.focus();
      showToast("Editing is local in this workspace preview");
      return;
    }
    const step = state.guide.steps[state.selectedGuideIndex];
    state.edits.set(step.sourceStepId, { title: title.textContent.trim(), description: desc.textContent.trim() });
    title.contentEditable = "false";
    desc.contentEditable = "false";
    $("#editButton").textContent = "Edit wording";
    renderGuideList($("#stepSearch").value);
    showToast("Wording updated locally");
  });
  $("#restoreButton").addEventListener("click", () => {
    const step = state.guide.steps[state.selectedGuideIndex];
    state.edits.delete(step.sourceStepId);
    renderSelectedGuide();
    renderGuideList($("#stepSearch").value);
    showToast("Restored AI-enhanced wording");
  });
}

function testDataForStep(step) {
  const ids = new Set(step.sourceStepIds || []);
  return (state.ai.process?.testData || []).filter((item) => (item.sourceStepIds || []).some((id) => ids.has(id)));
}

function renderTest() {
  const p = state.ai.process || {};
  $("#testCaseName").textContent = p.name || "Generated Test Case";
  $("#businessObjective").textContent = p.businessObjective || "—";
  $("#testApplication").textContent = p.application || "—";
  $("#testModule").textContent = p.module || "—";
  $("#testBusinessArea").textContent = p.businessArea || "—";
  $("#testCoverage").textContent = `${state.ai.coverage?.coveragePercent ?? 100}%`;
  const pre = p.preconditions?.[0];
  $("#preconditionText").textContent = pre?.text || "No explicit precondition generated.";
  $("#preconditionConfidence").textContent = pre ? `${Math.round((pre.confidence ?? 0) * 100)}% confidence` : "—";

  const tbody = $("#testTableBody");
  tbody.innerHTML = "";
  (p.businessSteps || []).forEach((step) => {
    const data = testDataForStep(step);
    const basis = String(step.expectedResultBasis || "UNKNOWN").toLowerCase();
    const sourceCount = step.sourceStepIds?.length || 0;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${step.sequence}</td>
      <td><span class="test-step-title">${esc(step.title)}</span><span class="test-step-instruction">${esc(step.instruction)}</span></td>
      <td>${data.length ? data.map((d)=>`<span class="data-chip">${esc(d.field)}: ${esc(d.value)}</span>`).join("") : '<span class="test-step-instruction">—</span>'}</td>
      <td>${esc(step.expectedResult || "To be verified during execution.")}<br><span class="basis ${basis}">${esc(step.expectedResultBasis || "Unknown")}</span></td>
      <td><span class="evidence-link">${sourceCount} source step${sourceCount===1?"":"s"}</span></td>
      <td><span class="score-pill">${Math.round((step.confidence ?? 0) * 100)}%</span></td>`;
    tbody.appendChild(row);
  });
}

function renderRecording() {
  const timeline = $("#recordingTimeline");
  timeline.innerHTML = "";
  (state.process?.steps || []).forEach((step, index) => {
    const title = step.title || step.description || sourceAction(step);
    const desc = step.description || screenLabel(step);
    const div = document.createElement("div");
    div.className = "timeline-item";
    div.innerHTML = `<span class="timeline-num">${String(step.sequence ?? index+1).padStart(2,"0")}</span><div><strong>${esc(title)}</strong><p>${esc(desc)}</p></div><span class="timeline-action">${esc(sourceAction(step))}</span>`;
    timeline.appendChild(div);
  });
}

function renderDetails() {
  const p = state.process || {};
  const ai = state.ai || {};
  const guide = state.guide || {};
  const captureRows = [
    ["Capture ID", p.captureId], ["Process ID", p.processId], ["Application", p.applicationName],
    ["Processing version", p.processingVersion], ["Recorded steps", p.steps?.length], ["Raw events", state.raw?.events?.length ?? state.raw?.rawEvents?.length ?? "Preserved"]
  ];
  const aiRows = [
    ["Guide model", guide.ai?.model], ["Guide prompt", guide.ai?.promptVersion], ["Test model", ai.ai?.model],
    ["Process prompt", ai.ai?.promptVersion], ["Guide coverage", `${guide.coverage?.coveragePercent ?? 0}%`], ["Process coverage", `${ai.coverage?.coveragePercent ?? 0}%`]
  ];
  const renderDl = (id, rows) => { $(id).innerHTML = rows.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v ?? "—")}</dd></div>`).join(""); };
  renderDl("#captureDetails", captureRows);
  renderDl("#aiDetails", aiRows);
}

function activateTab(name) {
  $$(".tab").forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === name));
  history.replaceState(null, "", `#${name}`);
}

function wireTabs() {
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => activateTab(tab.dataset.tab)));
  const initial = location.hash.replace("#", "");
  if (["guide","test","recording","details"].includes(initial)) activateTab(initial);
}

function exportTestCsv() {
  const rows = [["Sequence","Title","Instruction","Test Data","Expected Result","Basis","Source Step IDs","Confidence"]];
  for (const step of state.ai.process?.businessSteps || []) {
    const data = testDataForStep(step).map((d)=>`${d.field}=${d.value}`).join(" | ");
    rows.push([step.sequence,step.title,step.instruction,data,step.expectedResult || "To be verified during execution",step.expectedResultBasis,(step.sourceStepIds||[]).join(" | "),Math.round((step.confidence||0)*100)+"%"]);
  }
  const csv = rows.map((r)=>r.map((v)=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${state.process.captureId || "krivyo"}-test-script.csv`; a.click();
  URL.revokeObjectURL(url);
  showToast("Test script CSV exported");
}

function wireCommandPalette() {
  const palette = $("#commandPalette");
  const open = () => { palette.classList.add("open"); palette.setAttribute("aria-hidden","false"); $("#commandSearch").focus(); };
  const close = () => { palette.classList.remove("open"); palette.setAttribute("aria-hidden","true"); };
  $("#commandButton").addEventListener("click", open);
  $(".command-backdrop").addEventListener("click", close);
  $$('[data-command-tab]').forEach((button)=>button.addEventListener("click",()=>{ activateTab(button.dataset.commandTab); close(); }));
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); open(); }
    if (e.key === "Escape") close();
  });
}

function wireMisc() {
  $("#stepSearch").addEventListener("input", (e) => renderGuideList(e.target.value));
  $("#exportCsvButton").addEventListener("click", exportTestCsv);
  $("#shareButton").addEventListener("click", ()=>showToast("Sharing will be enabled with Krivyo accounts"));
  $("#exportGuideButton").addEventListener("click", ()=>showToast("Enhanced PDF generator is the next connection"));
  $("#downloadEnhancedButton").addEventListener("click", ()=>showToast("Enhanced PDF generator is the next connection"));
  $$('[data-toast]').forEach((el)=>el.addEventListener("click",()=>showToast(el.dataset.toast)));
  $("#collapseSteps").addEventListener("click", ()=>showToast("Compact step navigation will be enabled in the responsive workspace"));
}

async function init() {
  try {
    [state.process, state.guide, state.ai, state.raw] = await Promise.all([
      loadJson(DATA_PATHS.process), loadJson(DATA_PATHS.guide), loadJson(DATA_PATHS.ai), loadJson(DATA_PATHS.raw)
    ]);
    initHeader();
    renderGuideList();
    renderSelectedGuide();
    renderTest();
    renderRecording();
    renderDetails();
    wireGuideEditing();
    wireTabs();
    wireCommandPalette();
    wireMisc();
  } catch (error) {
    console.error(error);
    document.body.innerHTML = `<div style="padding:40px;font-family:system-ui"><h1>Krivyo Workspace</h1><p>Could not load workspace data. Run this folder through a local/static web server rather than opening index.html directly.</p><pre>${esc(error.message)}</pre></div>`;
  }
}

document.addEventListener("DOMContentLoaded", init);
