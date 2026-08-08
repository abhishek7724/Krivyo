
const state={
  process:null,guide:null,ai:null,rawSummary:null,screenshotUrls:{},capture:null,recentCaptures:[],user:null,auth:null,
  selected:0,edits:new Map(),view:'home',mode:'empty'
};
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2400)}
function source(id){return state.process?.steps?.find(s=>s.stepId===id)||null}
function action(s){return String(s?.action||'STEP').toUpperCase()}
function screen(s){return s?.screen?.page||s?.screen?.title||state.process?.applicationName||'Captured evidence'}
function captureParam(){return new URLSearchParams(location.search).get('capture')}
function requestedView(){const p=new URLSearchParams(location.search).get('view');return ['home','recording','guides','tests','knowledge','analytics','settings'].includes(p)?p:null}

function emptyProcess(){
  return {captureId:'—',processId:'—',processingVersion:'—',applicationName:'No capture selected',steps:[]};
}
function fallbackGuide(process){
  const steps=(process.steps||[]).map((s,i)=>({
    sourceStepId:s.stepId,sequence:s.sequence??i+1,
    title:s.title||`Step ${i+1}`,description:s.description||s.title||'Recorded step',confidence:1
  }));
  return {schemaVersion:'fallback',ai:{provider:'none',model:'—',promptVersion:'—'},steps,
    coverage:{sourceStepCount:steps.length,enhancedStepCount:steps.length,
      accountedStepIds:steps.map(s=>s.sourceStepId),unassignedStepIds:[],coveragePercent:steps.length?100:0}};
}
function fallbackAi(process){
  return {schemaVersion:'fallback',ai:{provider:'none',model:'—',promptVersion:'—'},
    process:{name:process.applicationName||'Captured process',description:'AI process interpretation is not ready yet.',
      businessObjective:'—',application:process.applicationName||'—',module:'—',businessArea:'—',
      preconditions:[],testData:[],businessSteps:[]},coverage:{coveragePercent:0}};
}
async function workspaceRequest(payload){
  const endpoint=window.KRIVYO_WORKSPACE_CONFIG?.workspaceApiUrl;
  if(!endpoint)throw new Error('Workspace API is not configured.');
  const supabase=state.auth?.getSupabaseClient();
  const {data}=await supabase.auth.getSession();
  const accessToken=data?.session?.access_token;
  if(!accessToken)throw new Error('Your Krivyo session has expired. Sign in again.');
  const response=await fetch(endpoint,{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${accessToken}`},cache:'no-store',
    body:JSON.stringify(payload)
  });
  let result=null;try{result=await response.json()}catch{}
  if(response.status===401){state.auth.rememberReturnTo(location.href);location.replace('/workspace/login.html');throw new Error('Authentication required.');}
  if(!response.ok)throw new Error(result?.details||result?.error||`Workspace API returned HTTP ${response.status}`);
  return result;
}
async function listLiveCaptures(limit=20){
  const result=await workspaceRequest({action:'list',limit});
  return Array.isArray(result?.captures)?result.captures:[];
}
function formatCaptureDate(value){
  const d=new Date(value||Date.now());
  return Number.isFinite(d.getTime())?d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'Recently';
}
function renderCaptureLibrary(){
  const list=$('#workspaceCaptureList'),count=$('#captureLibraryCount');
  if(!list)return;
  const captures=state.recentCaptures||[];
  if(count)count.textContent=`${captures.length} capture${captures.length===1?'':'s'}`;
  if(!captures.length){list.innerHTML='<div class="workspace-capture-empty"><strong>No captures yet</strong><span>Complete your first capture from the Krivyo Chrome extension.</span></div>';return;}
  list.innerHTML='';
  captures.forEach(c=>{
    const id=String(c.capture_id||c.id||'');
    const card=document.createElement('button');card.type='button';card.className='workspace-capture-item';
    const guide=String(c.guide_status||'pending'),test=String(c.test_status||'pending');
    card.innerHTML=`<span class="workspace-capture-mark">K</span><span class="workspace-capture-copy"><strong>${esc(c.document_title||'Untitled capture')}</strong><small>${esc(c.application_name||'Web application')} · ${Number(c.step_count||0)} steps · ${esc(formatCaptureDate(c.created_at))}</small></span><span class="workspace-capture-ai"><em class="${guide}">Guide ${esc(guide)}</em><em class="${test}">Test ${esc(test)}</em></span><span class="workspace-capture-open">→</span>`;
    card.onclick=()=>{if(id)location.href=`/workspace/?capture=${encodeURIComponent(id)}&view=recording`};
    list.appendChild(card);
  });
}
async function loadLiveCapture(captureId){
  const payload=await workspaceRequest({action:'load',capture_id:captureId});
  if(!payload?.success||!payload?.process_model)throw new Error('Workspace API returned an incomplete capture.');
  return payload;
}

function showLoadError(message){
  $('#main').innerHTML=`<div style="padding:56px;max-width:760px">
    <p class="eyebrow">KRIVYO WORKSPACE</p>
    <h1 style="font-size:42px;line-height:1.05;margin:8px 0 14px">This capture could not be opened.</h1>
    <p style="font-size:16px;line-height:1.65;color:#667085">${esc(message)}</p>
    <p style="margin-top:22px;color:#667085">Make sure you are signed in with the Krivyo account that owns this capture.</p>
    <a href="/workspace/" class="button primary" style="display:inline-flex;margin-top:18px">Back to Workspace</a>
  </div>`;
}

function viewName(v){return ({home:'Home',recording:'Capture',guides:'Guides',tests:'Test Cases',knowledge:'Knowledge',analytics:'Analytics',settings:'Settings'})[v]||'Home'}
function initSummary(){const p=state.process,a=state.ai?.process||{},g=state.guide?.steps?.length||0,t=a.businessSteps?.length||0,c=state.ai?.coverage?.coveragePercent??0;
  const captures=state.recentCaptures||[],readyGuides=captures.filter(x=>x.guide_status==='ready').length,readyTests=captures.filter(x=>x.test_status==='ready').length;$('#metricGuides').textContent=readyGuides;$('#metricCases').textContent=readyTests;$('#metricCoverage').textContent=`${c}%`;$('#metricRecorded').textContent=p.steps?.length||0;$('#metricTest').textContent=`${t} execution steps`;$('#orbitGuide').textContent=`${g} steps`;$('#orbitTest').textContent=`${t} steps`;
  $('#homeTitle').textContent=a.name||p.name||'Latest capture';$('#homeDesc').textContent=a.description||p.description||'Reviewed process capture';$('#homeApp').textContent=p.applicationName||a.application||'Web application';$('#homeCapture').textContent=state.capture?.created_at?new Date(state.capture.created_at).toLocaleDateString():`${p.steps?.length||0} recorded steps`;$('#guideCount').textContent=g;$('#testCount').textContent=t;
  $('#guideTitlePage').textContent=a.name||p.name||'Process Guide';$('#guideSubtitle').textContent=`AI-enhanced wording across ${g} reviewed steps. Sequence and evidence remain source-controlled.`;$('#stepsCount').textContent=`${g} steps`;
  $('#aiContextTitle').textContent=a.name||p.name||'Latest capture';$('#aiContextMeta').textContent=`${p.steps?.length||0} recorder steps · ${t} test steps`;
  if(state.mode==='live')toast(`Live capture ${p.captureId} loaded securely`)
}
function activate(v,update=true){if(!['home','recording','guides','tests','knowledge','analytics','settings'].includes(v))v='home';state.view=v;$$('[data-panel]').forEach(x=>x.classList.toggle('active',x.dataset.panel===v));$$('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v));$('#crumb').textContent=viewName(v);$('#topContext').textContent=v==='home'?'Your process intelligence workspace':(state.ai.process?.name||state.process.name||state.process.captureId);renderSuggestions(v);if(update){const u=new URL(location.href);u.searchParams.set('view',v);history.replaceState(null,'',u)} }
function renderSuggestions(v){const map={home:['Summarize this process','What did Krivyo generate?','Which outputs are ready?'],recording:['Summarize the recorded process','Which steps contain entered data?','Show the source evidence'],guides:['Improve this step wording','Show the original recorder wording','Which guide steps contain test data?'],tests:['Which expected results are inferred?','Show the test data used','Which test steps group multiple source steps?'],knowledge:['How will this become process knowledge?','What related processes could connect here?','Explain source traceability'],analytics:['Find manual-data hotspots','Which steps repeat most?','Find automation candidates'],settings:['What data is stored in cloud?','Are screenshots uploaded?','Explain AI provenance']};$('#suggestions').innerHTML=(map[v]||map.home).map(x=>`<button data-prompt="${esc(x)}">${esc(x)}</button>`).join('');wirePromptButtons()}
function guideData(){const s=state.guide?.steps?.[state.selected];if(!s)return null;const e=state.edits.get(s.sourceStepId);return e?{...s,...e}:s}
function renderSteps(filter=''){const list=$('#stepList');list.innerHTML='';const f=filter.trim().toLowerCase();(state.guide?.steps||[]).forEach((s,i)=>{const src=source(s.sourceStepId),title=state.edits.get(s.sourceStepId)?.title||s.title;if(f&&!`${title} ${s.description} ${action(src)}`.toLowerCase().includes(f))return;const b=document.createElement('button');b.className=`step-btn${i===state.selected?' active':''}`;b.innerHTML=`<span class="step-index">${String(s.sequence).padStart(2,'0')}</span><span><strong>${esc(title)}</strong><small>${esc(action(src))}</small></span>`;b.onclick=()=>{state.selected=i;renderSteps($('#stepSearch').value);renderGuide()};list.appendChild(b)})}
function renderGuide(){const s=guideData();if(!s)return;const src=source(s.sourceStepId),total=state.guide.steps.length;$('#stepLabel').textContent=`STEP ${String(s.sequence).padStart(2,'0')} OF ${String(total).padStart(2,'0')}`;$('#stepNo').textContent=String(s.sequence).padStart(2,'0');$('#guideStepTitle').textContent=s.title;$('#guideStepDesc').textContent=s.description;$('#actionBadge').textContent=action(src);$('#screenContext').textContent=`${state.process.applicationName||'Application'} · ${screen(src)}`;$('#sourceId').textContent=s.sourceStepId;$('#confidence').textContent=`${Math.round((s.confidence??1)*100)}% confidence`;$('#editStep').textContent='Edit wording';$('#guideStepTitle').contentEditable='false';$('#guideStepDesc').contentEditable='false';const path=src?.evidence?.screenshot||null,url=path?state.screenshotUrls?.[path]:null,img=$('#guideScreenshot'),fallback=$('#guideScreenshotFallback');if(url){img.src=url;img.classList.add('visible');fallback.style.display='none'}else{img.removeAttribute('src');img.classList.remove('visible');fallback.style.display='grid'}}
function wireGuide(){ $('#editStep').onclick=()=>{const t=$('#guideStepTitle'),d=$('#guideStepDesc'),editing=t.contentEditable==='true';if(!editing){t.contentEditable='true';d.contentEditable='true';$('#editStep').textContent='Save wording';t.focus();return}const s=state.guide.steps[state.selected];state.edits.set(s.sourceStepId,{title:t.textContent.trim(),description:d.textContent.trim()});t.contentEditable='false';d.contentEditable='false';$('#editStep').textContent='Edit wording';renderSteps($('#stepSearch').value);toast('Guide wording updated locally')};
  $('#restoreStep').onclick=()=>{const s=state.guide.steps[state.selected];state.edits.delete(s.sourceStepId);renderGuide();renderSteps($('#stepSearch').value);toast('Restored AI wording')};$('#restoreAll').onclick=()=>{state.edits.clear();renderSteps($('#stepSearch').value);renderGuide();toast('All local edits restored')};$('#stepSearch').oninput=e=>renderSteps(e.target.value)}
function renderRecording(){const list=$('#recordingList');if(!list)return;const p=state.process||{},steps=p.steps||[];$('#recordingTitle').textContent=state.capture?.document_title||p.name||'Recorded process';$('#recordingSubtitle').textContent=`${steps.length} source steps · ${p.applicationName||'Web application'} · screenshots stored privately in your Workspace.`;const cloud=$('#recordingCloudState');if(cloud)cloud.textContent=state.capture?.status==='ready'?'● Saved · AI ready':'● Saved · AI processing';list.innerHTML='';steps.forEach((step,i)=>{const path=step?.evidence?.screenshot||null,url=path?state.screenshotUrls?.[path]:null,card=document.createElement('article');card.className='card recording-step';const shot=url?`<img src="${esc(url)}" alt="Screenshot for step ${i+1}"/>`:`<div class="recording-shot-empty">No screenshot available for this source step.</div>`;card.innerHTML=`<div class="recording-step-head"><div><span class="recording-step-index">${String(step.sequence||i+1).padStart(2,'0')}</span><span><strong>${esc(step.title||`Step ${i+1}`)}</strong><small>${esc(action(step))}</small></span></div><span>${esc(screen(step))}</span></div><div class="recording-shot">${shot}</div><div class="recording-step-copy"><h3>${esc(step.title||`Step ${i+1}`)}</h3><p>${esc(step.description||'Recorded browser action.')}</p></div>`;list.appendChild(card)})}
function testDataFor(step){const ids=new Set(step.sourceStepIds||[]);return (state.ai.process?.testData||[]).filter(x=>(x.sourceStepIds||[]).some(id=>ids.has(id)))}
function renderTest(){const p=state.ai.process||{};$('#testTitle').textContent=p.name||'Generated Test Case';$('#testObjective').textContent=p.businessObjective||'—';$('#testApp').textContent=p.application||'—';$('#testModule').textContent=p.module||'—';$('#testArea').textContent=p.businessArea||'—';$('#testCoverage').textContent=`${state.ai.coverage?.coveragePercent??100}%`;const pre=p.preconditions?.[0];$('#precondition').textContent=pre?.text||'No explicit precondition generated.';$('#preConfidence').textContent=pre?`${Math.round((pre.confidence??0)*100)}% confidence`:'—';const body=$('#testBody');body.innerHTML='';(p.businessSteps||[]).forEach(s=>{const data=testDataFor(s),basis=String(s.expectedResultBasis||'UNKNOWN').toLowerCase(),n=s.sourceStepIds?.length||0,tr=document.createElement('tr');tr.innerHTML=`<td>${s.sequence}</td><td><span class="t-title">${esc(s.title)}</span><span class="t-inst">${esc(s.instruction)}</span></td><td>${data.length?data.map(d=>`<span class="data-chip">${esc(d.field)}: ${esc(d.value)}</span>`).join(''):'<span class="t-inst">—</span>'}</td><td>${esc(s.expectedResult||'To be verified during execution.')}<br><span class="basis ${basis}">${esc(s.expectedResultBasis||'Unknown')}</span></td><td><span class="source-link">${n} source step${n===1?'':'s'}</span></td><td><span class="score">${Math.round((s.confidence??0)*100)}%</span></td>`;body.appendChild(tr)})}
function renderDetails(){const p=state.process,a=state.ai,g=state.guide,rows1=[['Capture ID',p.captureId],['Process ID',p.processId],['Application',p.applicationName],['Processing version',p.processingVersion],['Recorded steps',p.steps?.length],['Raw events',state.rawSummary?.eventCount??(state.rawSummary?.present?'Preserved':'—')]],rows2=[['Guide model',g.ai?.model],['Guide prompt',g.ai?.promptVersion],['Process model',a.ai?.model],['Process prompt',a.ai?.promptVersion],['Guide coverage',`${g.coverage?.coveragePercent??0}%`],['Process coverage',`${a.coverage?.coveragePercent??0}%`]];const draw=(id,rows)=>$(id).innerHTML=rows.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v??'—')}</dd></div>`).join('');draw('#captureDetails',rows1);draw('#aiDetails',rows2)}
function exportCsv(){const rows=[['Sequence','Title','Instruction','Test Data','Expected Result','Basis','Source Step IDs','Confidence']];for(const s of state.ai.process?.businessSteps||[]){rows.push([s.sequence,s.title,s.instruction,testDataFor(s).map(d=>`${d.field}=${d.value}`).join(' | '),s.expectedResult||'To be verified during execution',s.expectedResultBasis,(s.sourceStepIds||[]).join(' | '),Math.round((s.confidence||0)*100)+'%'])}const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n'),blob=new Blob([csv],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${state.process.captureId||'krivyo'}-test-script.csv`;a.click();URL.revokeObjectURL(url);toast('Test script CSV exported')}
function wireNav(){$$('[data-view]').forEach(b=>b.onclick=()=>activate(b.dataset.view));$$('[data-open]').forEach(b=>b.onclick=()=>activate(b.dataset.open));$('#collapseNav').onclick=()=>document.body.classList.toggle('nav-collapsed');$('#collapseAi').onclick=()=>document.body.classList.toggle('ai-collapsed')}
function wirePalette(){const p=$('#palette'),open=()=>{p.classList.add('open');$('#commandSearch').focus()},close=()=>p.classList.remove('open');$('#commandButton').onclick=open;$('.palette-bg').onclick=close;$$('[data-command]').forEach(b=>b.onclick=()=>{activate(b.dataset.command);close()});document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();open()}if(e.key==='Escape')close()})}
function wirePromptButtons(){$$('[data-prompt]',$('#suggestions')).forEach(b=>b.onclick=()=>{$('#aiInput').value=b.dataset.prompt;$('#aiInput').focus()})}
function wireAi(){wirePromptButtons();$('#composer').onsubmit=e=>{e.preventDefault();const text=$('#aiInput').value.trim();if(!text)return;const msg=document.createElement('div');msg.className='message';msg.innerHTML=`<span class="msg-orb" style="background:#EAF3F1;color:#1A4B44">A</span><div><p>${esc(text)}</p></div>`;$('#conversation').appendChild(msg);$('#aiInput').value='';toast('Secure workspace AI chat connects in the next backend step')}}
function wireMisc(){$('#exportCsv').onclick=exportCsv;$('#downloadPdf').onclick=()=>toast('Enhanced PDF generation is the next guide milestone');$('#runTest').onclick=()=>toast('UAT execution is a later Test Cases milestone');$('#newCapture').onclick=()=>toast('The Chrome extension remains the capture entry point')}



function renderSignedInUser(user){
  if(!user)return;
  const name=state.auth?.userDisplayName(user)||user.email||'Krivyo User';
  const initial=state.auth?.userInitial(user)||'K';
  const avatar=$('#profileAvatar');
  const nameEl=$('#profileName');
  const emailEl=$('#profileEmail');
  if(avatar)avatar.textContent=initial;
  if(nameEl)nameEl.textContent=name;
  if(emailEl)emailEl.textContent=user.email||'Workspace member';
}

function wireAuthentication(){
  const button=$('#signOutButton');
  if(!button||!state.auth)return;
  button.onclick=async()=>{
    button.disabled=true;
    button.textContent='Signing out…';
    try{
      await state.auth.signOutUser();
    }catch(error){
      console.error(error);
      button.disabled=false;
      button.textContent='Sign out';
      toast('Could not sign out');
    }
  };
}

let artifactPollTimer=null;
function startArtifactPolling(captureId){
  if(artifactPollTimer)clearInterval(artifactPollTimer);
  let attempts=0;
  artifactPollTimer=setInterval(async()=>{
    attempts++;
    if(attempts>30){clearInterval(artifactPollTimer);artifactPollTimer=null;return}
    if(state.capture?.guide_status==='ready'&&state.capture?.test_status==='ready'){clearInterval(artifactPollTimer);artifactPollTimer=null;return}
    try{
      const live=await loadLiveCapture(captureId);
      state.capture=live.capture||state.capture;
      state.guide=live.guide_model||state.guide;
      state.ai=live.ai_process_model||state.ai;
      state.screenshotUrls=live.screenshot_urls||state.screenshotUrls;
      initSummary();renderRecording();renderSteps();renderGuide();renderTest();renderDetails();
    }catch(error){console.debug('AI artifact refresh unavailable:',error.message)}
  },3000)
}
async function init(){
  try{
    state.auth=await import('./auth-client.js');
    state.user=await state.auth.requireAuthenticatedUser();
    if(!state.user)return;
    renderSignedInUser(state.user);

    const captureId=captureParam();
    state.recentCaptures=await listLiveCaptures(20);
    if(captureId){
      const live=await loadLiveCapture(captureId);
      state.capture=live.capture||null;
      state.process=live.process_model;
      state.guide=live.guide_model||fallbackGuide(state.process);
      state.ai=live.ai_process_model||fallbackAi(state.process);
      state.screenshotUrls=live.screenshot_urls||{};
      state.rawSummary=live.raw_summary||{present:false,eventCount:null};
      state.mode='live';
    }else if(state.recentCaptures.length){
      const latest=await loadLiveCapture(state.recentCaptures[0].capture_id);
      state.capture=latest.capture||state.recentCaptures[0];
      state.process=latest.process_model;
      state.guide=latest.guide_model||fallbackGuide(state.process);
      state.ai=latest.ai_process_model||fallbackAi(state.process);
      state.screenshotUrls=latest.screenshot_urls||{};
      state.rawSummary=latest.raw_summary||{present:false,eventCount:null};
      state.mode='live';
    }else{
      state.process=emptyProcess();
      state.guide=fallbackGuide(state.process);
      state.ai=fallbackAi(state.process);
      state.rawSummary={present:false,eventCount:null};state.screenshotUrls={};state.capture=null;
      state.mode='empty';
    }
    initSummary();renderCaptureLibrary();renderRecording();renderSteps();renderGuide();renderTest();renderDetails();
    wireGuide();wireNav();wirePalette();wireAi();wireMisc();wireAuthentication();
    activate(requestedView()||(captureId?'recording':'home'),false);if(captureId)startArtifactPolling(captureId);
  }catch(err){
    console.error(err);
    showLoadError(err instanceof Error?err.message:String(err));
  }
}
document.addEventListener('DOMContentLoaded',init);
