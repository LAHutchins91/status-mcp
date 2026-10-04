export function renderLanding(input: { supabaseUrl: string; supabaseAnonKey: string; appBaseUrl: string; connectLead: string }) {
  const supabaseUrl = JSON.stringify(input.supabaseUrl);
  const supabaseAnonKey = JSON.stringify(input.supabaseAnonKey);
  const appBaseUrl = JSON.stringify(input.appBaseUrl);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Status</title>
  <link rel="icon" href="/icon.svg">
  <style>
    :root{color-scheme:light;--bg:#f3f6f8;--text:#10202c;--muted:#526170;--line:#d5dee6;--accent:#0e7490;--card:#fff}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:18px/1.55 ui-sans-serif,system-ui,sans-serif}
    main{max-width:980px;margin:0 auto;padding:28px 20px 72px}a{color:var(--accent)}
    nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:36px}.brand{font-weight:800;letter-spacing:-.03em}
    h1{font-size:clamp(40px,7vw,68px);line-height:.95;letter-spacing:-.045em;margin:8px 0 16px}
    .muted{color:var(--muted)} .card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px}
    .grid{display:grid;grid-template-columns:1.2fr .8fr;gap:22px}.plans{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    button,.btn{font:inherit;border-radius:12px;padding:12px 16px;border:1px solid var(--line);background:#fff;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
    .primary{background:var(--accent);color:#fff;border-color:var(--accent)} button:disabled{opacity:.55;cursor:wait}
    label{display:block;margin:12px 0 4px} input,textarea,select{width:100%;padding:10px;border:1px solid var(--line);border-radius:10px;font:inherit;background:#fff}
    textarea{min-height:90px} .row{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px} .error{color:#8d1d18} .ok{color:#0e7490}
    article.item{border-top:1px solid var(--line);padding:10px 0} [hidden]{display:none!important}
    footer{display:flex;gap:16px;flex-wrap:wrap;margin-top:48px;color:var(--muted)}
    @media(max-width:760px){.grid,.plans{grid-template-columns:1fr}}
  </style>
</head>
<body>
<main>
  <nav><div class="brand">Status</div><span class="muted" id="servicePill">Approved incident wording only</span></nav>
  <section class="grid">
    <div>
      <p class="muted" id="heroEyebrow">Incident updates that stay approved</p>
      <h1 id="heroTitle">Do not invent an incident update.</h1>
      <p id="heroDescription">Status keeps a team's approved incident states and the exact customer-facing wording, including which cause and which timeline may be stated. An assistant can look them up, and it must refuse an ETA, a cause, or a workaround that is not in that set.</p>
      ${input.connectLead}
      <div class="row" id="signedOutActions"><button class="primary" id="googleBtn" type="button">Continue with Google</button><a class="btn" href="#plans">See trial and Pro</a></div>
      <div class="card" id="accountCard" hidden>
        <p class="muted">Signed in</p>
        <p id="userEmail"></p>
        <p id="subscriptionStatus" class="muted">Checking account…</p>
        <div class="row"><button id="signOutBtn" type="button">Sign out</button><button id="portalBtn" type="button">Manage billing</button><a class="btn primary" id="workspaceLink" href="/app">Open status workspace</a></div>
      </div>
      <p id="notice" class="ok" role="status"></p>
      <p id="error" class="error" role="alert"></p>
    </div>
    <aside class="card" id="salesAside">
      <p><strong>Incident states</strong><br><span class="muted">The customer-facing update the team already signed off.</span></p>
      <p><strong>Causes</strong><br><span class="muted">A specific incident, and the only cause that may be stated.</span></p>
      <p><strong>Timelines and workarounds</strong><br><span class="muted">An ETA or a step, verbatim or not at all.</span></p>
      <p><strong>Statement limits</strong><br><span class="muted">Which channel may say any of that, and how wide the audience may be.</span></p>
    </aside>
  </section>
  <section id="plans">
    <h2>14-day trial, then Pro</h2>
    <p class="muted">Monthly and yearly checkout are handled by Stripe. Checkout shows the plan terms. Status does not print a price.</p>
    <div class="plans">
      <article class="card"><h3>Monthly</h3><p>A 14-day trial, then Pro, billed each month.</p><ul><li>Incident states</li><li>Approved causes</li><li>Timelines and workarounds</li><li>Statement limits</li></ul><button class="checkout" data-plan="monthly" type="button">Start monthly trial</button></article>
      <article class="card"><h3>Yearly</h3><p>The same 14-day trial, then Pro, billed once a year.</p><ul><li>Everything in Monthly</li><li>One annual billing cycle</li><li>Same refusal rules</li></ul><button class="primary checkout" data-plan="annual" type="button">Start yearly trial</button></article>
    </div>
  </section>
  <section id="workspace" hidden>
    <h2>Your status board</h2>
    <p class="muted">Save only wording the team has approved. An assistant will not invent a cause, an ETA, or a workaround that is missing here.</p>
    <div class="grid">
      <form id="boardForm" class="card"><h3>New board</h3><label for="boardName">Name</label><input id="boardName" required maxlength="200"><label for="boardDescription">Description</label><textarea id="boardDescription" maxlength="4000"></textarea><button class="primary" type="submit">Create board</button></form>
      <div class="card"><h3>Boards</h3><label for="boardSelect">Open</label><select id="boardSelect"><option value="">Choose a board</option></select><div id="boardList"></div></div>
    </div>
    <div id="policy" hidden>
      <form id="stateForm" class="card"><h3>Incident state</h3><input id="stateRevision" type="hidden"><label>Name<input id="stateName" required maxlength="200"></label><label>Internal summary<input id="stateSummary" required maxlength="500"></label><label>Customer-facing wording<textarea id="stateWording" required maxlength="8000"></textarea></label><button class="primary" type="submit">Save incident state</button></form>
      <form id="causeForm" class="card"><h3>Approved cause</h3><input id="causeRevision" type="hidden"><label>Name<input id="causeName" required maxlength="200"></label><label>Incident phrases, one per line<textarea id="causeTerms" required></textarea></label><label>Decision<select id="causeDecision"><option>STATE</option><option>WITHHOLD</option></select></label><label>Only approved wording<textarea id="causeWording" required maxlength="4000"></textarea></label><button class="primary" type="submit">Save cause</button></form>
      <form id="limitForm" class="card"><h3>Statement limit</h3><input id="limitRevision" type="hidden"><label>Name<input id="limitName" required></label><label>Channel<input id="limitChannel" required placeholder="status-page"></label><label>Audience ladder, one per line<textarea id="limitLadder" required></textarea></label><label>Widest audience<input id="limitMax" required></label><label><input id="limitCause" type="checkbox"> May state a cause</label><label><input id="limitTimeline" type="checkbox"> May state a timeline</label><label><input id="limitWorkaround" type="checkbox"> May state a workaround</label><label>Notes<textarea id="limitNotes"></textarea></label><button class="primary" type="submit">Save statement limit</button></form>
      <form id="statementForm" class="card"><h3>Timeline or workaround</h3><input id="statementRevision" type="hidden"><label>Kind<select id="statementKind"><option>TIMELINE</option><option>WORKAROUND</option></select></label><label>Name<input id="statementName" required></label><label>Exact statement<textarea id="statementBody" required maxlength="2000"></textarea></label><button class="primary" type="submit">Save statement</button></form>
      <div class="card"><h3>On this board</h3><div id="policyList"></div></div>
    </div>
    <p id="workspaceMessage" role="status"></p>
  </section>
  <footer><a href="/connect">Connect an assistant</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Support</a><a href="/data">Your data</a><a href="/health">System health</a></footer>
</main>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/dist/umd/supabase.js"></script>
<script>
(function(){
  var SUPABASE_URL=${supabaseUrl}, SUPABASE_ANON_KEY=${supabaseAnonKey}, APP_BASE_URL=${appBaseUrl};
  var token="", current=null, isPro=false, ready=false, client=null, selected="";
  function el(id){return document.getElementById(id)}
  function showError(msg){el("error").textContent=msg}
  function clearError(){el("error").textContent=""}
  function lines(id){return el(id).value.split(/\\n/).map(function(x){return x.trim()}).filter(Boolean)}
  function renderAccess(pro, accountReady){
    isPro=pro; ready=accountReady;
    el("plans").hidden=pro;
    el("salesAside").hidden=pro;
    el("workspace").hidden=!(pro&&location.pathname==="/app");
    el("workspaceLink").hidden=!pro;
    if(pro&&location.pathname==="/app") void loadBoards();
  }
  function setSignedOut(){token="";current=null;el("accountCard").hidden=true;el("signedOutActions").hidden=false;renderAccess(false,true);el("subscriptionStatus").textContent=""}
  function setSignedIn(session){
    current=session; token=session.access_token||"";
    el("userEmail").textContent=(session.user&&session.user.email)||"Signed in";
    el("accountCard").hidden=false; el("signedOutActions").hidden=true;
    void loadProfile(session);
  }
  async function loadProfile(session){
    try{
      var r=await fetch(SUPABASE_URL+"/rest/v1/profiles?id=eq."+encodeURIComponent(session.user.id)+"&select=plan,subscription_status",{headers:{apikey:SUPABASE_ANON_KEY,Authorization:"Bearer "+token}});
      var rows=await r.json();
      var p=rows&&rows[0];
      var pro=Boolean(p&&(p.subscription_status==="trialing"||p.subscription_status==="active"));
      renderAccess(pro,true);
      el("subscriptionStatus").textContent=pro?(p.subscription_status==="trialing"?"Status Pro · Trial in progress":"Status Pro · Active"):"Signed in · start a 14-day trial below";
    }catch(e){renderAccess(false,false);el("subscriptionStatus").textContent="Unable to confirm your subscription."}
  }
  async function boardApi(path, options){
    var opts=options||{}; opts.headers=Object.assign({"Content-Type":"application/json",Authorization:"Bearer "+token},opts.headers||{});
    var r=await fetch(path,opts); var text=await r.text(); var data=text?JSON.parse(text):null;
    if(!r.ok) throw new Error((data&&data.error)||"Request could not complete.");
    return data.data;
  }
  function item(title, body, onEdit){
    var box=document.createElement("article"); box.className="item";
    var h=document.createElement("strong"); h.textContent=title; box.appendChild(h);
    var p=document.createElement("p"); p.textContent=body; box.appendChild(p);
    if(onEdit){var b=document.createElement("button"); b.type="button"; b.textContent="Edit"; b.onclick=onEdit; box.appendChild(b)}
    return box;
  }
  async function loadBoards(){
    var rows=await boardApi("/api/workspace/boards");
    var select=el("boardSelect"); select.replaceChildren(new Option("Choose a board",""));
    rows.forEach(function(board){select.add(new Option(board.name,board.id))});
    if(selected) select.value=selected;
  }
  async function loadPolicy(){
    if(!selected){el("policy").hidden=true;return}
    el("policy").hidden=false;
    var states=await boardApi("/api/workspace/states?includeRetired=true&boardId="+encodeURIComponent(selected));
    var causes=await boardApi("/api/workspace/causes?includeRetired=true&boardId="+encodeURIComponent(selected));
    var limits=await boardApi("/api/workspace/statement-limits?includeRetired=true&boardId="+encodeURIComponent(selected));
    var statements=await boardApi("/api/workspace/statements?includeRetired=true&boardId="+encodeURIComponent(selected));
    var list=el("policyList"); list.replaceChildren();
    states.forEach(function(row){list.appendChild(item(row.name+" · rev "+row.revision,row.summary+"\\n"+row.wording,function(){el("stateName").value=row.name;el("stateSummary").value=row.summary;el("stateWording").value=row.wording;el("stateRevision").value=row.revision}))});
    causes.forEach(function(row){list.appendChild(item(row.name+" · "+row.decision,row.wording,function(){el("causeName").value=row.name;el("causeTerms").value=row.matchTerms.join("\\n");el("causeDecision").value=row.decision;el("causeWording").value=row.wording;el("causeRevision").value=row.revision}))});
    limits.forEach(function(row){list.appendChild(item(row.channel+" · max "+row.maxAudience,row.notes||row.audienceLadder.join(", "),function(){el("limitName").value=row.name;el("limitChannel").value=row.channel;el("limitLadder").value=row.audienceLadder.join("\\n");el("limitMax").value=row.maxAudience;el("limitCause").checked=row.allowCause;el("limitTimeline").checked=row.allowTimeline;el("limitWorkaround").checked=row.allowWorkaround;el("limitNotes").value=row.notes||"";el("limitRevision").value=row.revision}))});
    statements.forEach(function(row){list.appendChild(item(row.kind+" · "+row.name,row.statement,function(){el("statementKind").value=row.kind;el("statementName").value=row.name;el("statementBody").value=row.statement;el("statementRevision").value=row.revision}))});
    if(!list.childNodes.length) list.textContent="Nothing approved on this board yet.";
  }
  function rev(id){var n=Number(el(id).value);return n>0?n:undefined}
  el("boardSelect").onchange=function(){selected=this.value;void loadPolicy().catch(function(e){el("workspaceMessage").textContent=e.message})};
  el("boardForm").onsubmit=async function(e){e.preventDefault();try{var row=await boardApi("/api/workspace/boards",{method:"POST",body:JSON.stringify({name:el("boardName").value.trim(),description:el("boardDescription").value.trim()||undefined})});selected=row.id;this.reset();await loadBoards();await loadPolicy();el("workspaceMessage").textContent="Board created."}catch(err){el("workspaceMessage").textContent=err.message}};
  el("stateForm").onsubmit=async function(e){e.preventDefault();try{await boardApi("/api/workspace/states",{method:"POST",body:JSON.stringify({boardId:selected,name:el("stateName").value,summary:el("stateSummary").value,wording:el("stateWording").value,expectedRevision:rev("stateRevision")})});el("stateRevision").value="";await loadPolicy();el("workspaceMessage").textContent="Incident state saved."}catch(err){el("workspaceMessage").textContent=err.message}};
  el("causeForm").onsubmit=async function(e){e.preventDefault();try{await boardApi("/api/workspace/causes",{method:"POST",body:JSON.stringify({boardId:selected,name:el("causeName").value,matchTerms:lines("causeTerms"),decision:el("causeDecision").value,wording:el("causeWording").value,expectedRevision:rev("causeRevision")})});el("causeRevision").value="";await loadPolicy();el("workspaceMessage").textContent="Cause saved."}catch(err){el("workspaceMessage").textContent=err.message}};
  el("limitForm").onsubmit=async function(e){e.preventDefault();try{await boardApi("/api/workspace/statement-limits",{method:"POST",body:JSON.stringify({boardId:selected,name:el("limitName").value,channel:el("limitChannel").value,audienceLadder:lines("limitLadder"),maxAudience:el("limitMax").value,allowCause:el("limitCause").checked,allowTimeline:el("limitTimeline").checked,allowWorkaround:el("limitWorkaround").checked,notes:el("limitNotes").value,expectedRevision:rev("limitRevision")})});el("limitRevision").value="";await loadPolicy();el("workspaceMessage").textContent="Statement limit saved."}catch(err){el("workspaceMessage").textContent=err.message}};
  el("statementForm").onsubmit=async function(e){e.preventDefault();try{await boardApi("/api/workspace/statements",{method:"POST",body:JSON.stringify({boardId:selected,kind:el("statementKind").value,name:el("statementName").value,statement:el("statementBody").value,expectedRevision:rev("statementRevision")})});el("statementRevision").value="";await loadPolicy();el("workspaceMessage").textContent="Statement saved."}catch(err){el("workspaceMessage").textContent=err.message}};
  function resume(){
    try{var saved=sessionStorage.getItem("statusPluginReturn");if(!saved)return false;sessionStorage.removeItem("statusPluginReturn");var pending=JSON.parse(saved);if(!pending||Date.now()-pending.createdAt>600000)return false;location.assign(pending.id?"/oauth/consent?authorization_id="+encodeURIComponent(pending.id):"/connections");return true}catch(e){return false}
  }
  async function init(){
    if(!SUPABASE_URL||!SUPABASE_ANON_KEY||!window.supabase){setSignedOut();showError("Google sign-in is not configured yet.");return}
    client=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{flowType:"implicit",persistSession:true,detectSessionInUrl:true,autoRefreshToken:true}});
    client.auth.onAuthStateChange(function(_e,session){if(session){if(resume())return;setSignedIn(session)}else setSignedOut()});
    var result=await client.auth.getSession();
    var session=result&&result.data?result.data.session:null;
    if(session){if(resume())return;setSignedIn(session)}else setSignedOut();
  }
  el("googleBtn").onclick=async function(){clearError();if(!client){showError("Google sign-in is not configured yet.");return}this.disabled=true;try{var r=await client.auth.signInWithOAuth({provider:"google",options:{redirectTo:APP_BASE_URL}});if(r.error)throw r.error}catch(e){this.disabled=false;showError(e.message||String(e))}};
  el("signOutBtn").onclick=async function(){if(client)await client.auth.signOut();setSignedOut();location.href="/"};
  el("portalBtn").onclick=async function(){try{var r=await fetch("/billing/portal",{method:"POST",headers:{Authorization:"Bearer "+token}});var d=await r.json();if(!r.ok)throw Error(d.error||"Unable to open billing");location.href=d.url}catch(e){showError(e.message)}};
  document.querySelectorAll(".checkout").forEach(function(btn){btn.onclick=async function(){clearError();if(!token){showError("Sign in with Google first, then start the trial.");return}if(isPro||!ready){showError("Refresh your subscription status before starting checkout.");return}btn.disabled=true;try{var r=await fetch("/billing/checkout",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({plan:btn.getAttribute("data-plan")})});var d=await r.json();if(!r.ok)throw Error(d.error||"Unable to start checkout");location.href=d.url}catch(e){btn.disabled=false;showError(e.message)}}});
  var checkout=new URLSearchParams(location.search).get("checkout");
  if(checkout==="success") el("notice").textContent="Checkout completed. Your subscription is being confirmed.";
  if(checkout==="cancelled") showError("Checkout was cancelled. No changes were made.");
  init();
})();
</script>
</body></html>`;
}
