
const DATA_CSV = "/data/safaraa.csv";
const DAILY_JSON = "/data/daily.json";
const ACCESS_JSON = "/data/access.json";

const qs = (s, r=document)=> r.querySelector(s);
const qsa = (s, r=document)=> Array.from(r.querySelectorAll(s));

const fmtSAR = (n)=> (Number(n||0)).toLocaleString("ar-SA") + " ريال";

function applyReferralTemplate(message, referral){
  const msg = String(message || "");
  const rep = String(referral || "");
  return msg.split("#كود-الإحالة").join(rep);
}

function baseURL(){
  try{ return new URL("./", location.href); }catch{ return { href:"/" }; }
}

function shareLinkFor(row){
  if (row && row.share_url) return String(row.share_url).trim();
  try{
    const b = baseURL();
    return new URL(`ambassador.html?id=${encodeURIComponent(row.ambassador_id||"")}`, b).href;
  }catch{
    return location.href;
  }
}

function buildShareMessage(daily, referralLink){
  const link = String(referralLink || "").trim();
  let msg = applyReferralTemplate((daily && daily.message) || "شاركنا الأجر", link);
  if (link && !msg.includes(link)) msg = (msg.trim() + "\n" + link).trim();
  const img = (daily && daily.image_url) ? String(daily.image_url).trim() : "";
  if (img && !msg.includes(img)) msg = (msg.trim() + "\n" + img).trim();
  return msg.trim();
}

function parseDateFlexible(s){
  const v = String(s||"").trim();
  if (!v) return null;
  // ISO or YYYY-MM-DD
  const m = v.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m){
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysSince(date){
  if (!date) return null;
  const ms = Date.now() - date.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / (1000*60*60*24));
}

function cacheBust(url){ return `${url}?v=${Date.now()}`; }

function toast(msg){
  const host = qs("#toast"); if (!host) return;
  qs(".bubble", host).textContent = msg;
  host.classList.add("show");
  clearTimeout(window.__tmt);
  window.__tmt = setTimeout(()=> host.classList.remove("show"), 1200);
}

async function fetchText(url){
  const res = await fetch(cacheBust(url), { cache:"no-store" });
  if (!res.ok) throw new Error("تعذر تحميل البيانات.");
  return await res.text();
}
async function fetchJSON(url){
  const res = await fetch(cacheBust(url), { cache:"no-store" });
  if (!res.ok) return null;
  try{ return await res.json(); }catch{ return null; }
}

// CSV parser (quoted fields supported)
function parseCSV(text){
  const rows=[]; let row=[]; let cur=""; let inQ=false;
  for (let i=0;i<text.length;i++){
    const ch=text[i], nx=text[i+1];
    if (ch==='"'){
      if (inQ && nx==='"'){ cur+='"'; i++; }
      else inQ=!inQ;
      continue;
    }
    if (!inQ && (ch===',' || ch==='\n' || ch==='\r')){
      if (ch==='\r' && nx==='\n') i++;
      row.push(cur); cur="";
      if (ch==='\n' || ch==='\r'){
        if (row.some(c=> String(c).trim()!=="")) rows.push(row);
        row=[];
      }
      continue;
    }
    cur+=ch;
  }
  if (cur.length || row.length){
    row.push(cur);
    if (row.some(c=> String(c).trim()!=="")) rows.push(row);
  }
  if (!rows.length) return [];
  const header = rows[0].map(h=> String(h||"").trim());
  return rows.slice(1).map(r=>{
    const o={}; header.forEach((h,idx)=> o[h]=(r[idx]??"").toString().trim());
    return o;
  });
}
function toNumber(v){
  const n = Number(String(v??"").replace(/,/g,"").trim());
  return Number.isFinite(n)? n : 0;
}
function cleanRow(r){
  return {
    role: String(r.role??"").trim(),
    ambassador_id: String(r.ambassador_id??"").trim(),
    name: String(r.name??"").trim(),
    phone: String(r.phone??"").trim(),
    branch: String(r.branch??"").trim(),
    group: String(r.group??"").trim(),
    leader_name: String(r.leader_name??"").trim(),
    achieved_amount: toNumber(r.achieved_amount),
    active_boxes: toNumber(r.active_boxes),
    daily_target_boxes: toNumber(r.daily_target_boxes),
    daily_target_amount: toNumber(r.daily_target_amount),
    today_opened_boxes: toNumber(r.today_opened_boxes),
    today_amount: toNumber(r.today_amount),
    rank_on_ambassadors: toNumber(r.rank_on_ambassadors),
    rank_on_branch: toNumber(r.rank_on_branch),
    rank_on_ambassadors_of_branch: toNumber(r.rank_on_ambassadors_of_branch),
    coupon_code: String(r.coupon_code??"").trim(),
    coupon_unlock_rule: String(r.coupon_unlock_rule??"").trim(),
    share_url: String(r.share_url??"").trim(),
    updated_at: String(r.updated_at??"").trim(),
  };
}
async function loadRows(){
  const text = await fetchText(DATA_CSV);
  return parseCSV(text).map(cleanRow);
}
async function loadAccess(){
  const a = await fetchJSON(ACCESS_JSON);
  return a || { admin_code:"admin", branch_codes:{} };
}

function setSession(role, token){
  sessionStorage.setItem("s_role", role);
  sessionStorage.setItem("s_token", token);
  sessionStorage.setItem("s_ts", String(Date.now()));
}
function clearSession(){
  sessionStorage.removeItem("s_role");
  sessionStorage.removeItem("s_token");
  sessionStorage.removeItem("s_ts");
}
function getSession(){
  return { role: sessionStorage.getItem("s_role") || "", token: sessionStorage.getItem("s_token") || "" };
}
function requireRole(expected){
  const s = getSession();
  if (!s.role || s.role !== expected){
    location.replace("index.html");
    return null;
  }
  return s;
}

async function loadDaily(){
  const d = await fetchJSON(DAILY_JSON);
  return d || { title:"رسالة اليوم", message:"شاركنا الأجر بدعم طالب قرآن 🌿", image_url:"", date:"" };
}
function pct(a,b){
  const A=Number(a||0), B=Number(b||0);
  if (!B) return 0;
  return Math.max(0, Math.min(100, (A/B)*100));
}
function setProgress(el, value, total){
  const bar = qs("i", el); if (!bar) return;
  bar.style.width = pct(value,total).toFixed(1) + "%";
}
function evalRule(rule, ctx){
  if (!rule) return false;
  const m = String(rule).match(/^\s*([a-zA-Z_]+)\s*(>=|<=|==|>|<)\s*([0-9]+(?:\.[0-9]+)?)\s*$/);
  if (!m) return false;
  const key=m[1], op=m[2], val=Number(m[3]);
  const map = { opened_boxes:ctx.active_boxes, today_opened_boxes:ctx.today_opened_boxes,
    today_amount:ctx.today_amount, achieved_amount:ctx.achieved_amount };
  const left = Number(map[key] ?? 0);
  switch(op){ case ">=":return left>=val; case "<=":return left<=val; case ">":return left>val;
    case "<":return left<val; case "==":return left===val; default:return false; }
}
function getParam(name){ return (new URLSearchParams(location.search).get(name) || "").trim(); }

function showError(msg){
  const card = qs("#errCard");
  const el = qs("#err");
  if (el) el.textContent = msg;
  if (card) card.classList.remove("hidden");
}

function skeletonOff(){
  qsa("[data-skel]").forEach(el=> el.classList.add("hidden"));
  qsa("[data-real]").forEach(el=> el.classList.remove("hidden"));
}


// Login
async function initLogin(){
  if (!qs("[data-page='login']")) return;

  // Always start fresh on login page
  clearSession();

  const roleAmb = qs("#roleAmb"), roleBranch = qs("#roleBranch"), roleAdmin = qs("#roleAdmin");
  const codeEl = qs("#loginCode");

  let role = "ambassador";
  const setRole = (r)=>{
    role = r;
    roleAmb.classList.toggle("active", r==="ambassador");
    roleBranch.classList.toggle("active", r==="branch");
    roleAdmin.classList.toggle("active", r==="admin");
    codeEl.focus();
  };
  roleAmb.addEventListener("click", ()=> setRole("ambassador"));
  roleBranch.addEventListener("click", ()=> setRole("branch"));
  roleAdmin.addEventListener("click", ()=> setRole("admin"));

  const doLogin = async ()=>{
    const code = (codeEl.value || "").trim();
    if (!code){ toast("اكتب الرمز"); return; }

    const access = await loadAccess();

    if (role === "admin"){
      if (code !== (access.admin_code || "admin")){ toast("رمز الإدارة غير صحيح"); return; }
      setSession("admin", code);
      location.href = "admin.html";
      return;
    }

    if (role === "branch"){
      const branchName = (access.branch_codes || {})[code];
      if (!branchName){ toast("رمز الفرع غير معروف"); return; }
      setSession("branch", code);
      location.href = `branch.html?code=${encodeURIComponent(code)}`;
      return;
    }

    // ambassador
    setSession("ambassador", code);
    location.href = `ambassador.html?id=${encodeURIComponent(code)}`;
  };

  qs("#loginBtn").addEventListener("click", doLogin);
  codeEl.addEventListener("keydown", (e)=>{ if (e.key==="Enter") doLogin(); });

  qs("#exAmb").addEventListener("click", ()=>{ setRole("ambassador"); codeEl.value="83923"; doLogin(); });
  qs("#exBranch").addEventListener("click", ()=>{ setRole("branch"); codeEl.value="0123"; doLogin(); });
  qs("#exAdmin").addEventListener("click", ()=>{ setRole("admin"); codeEl.value="admin"; doLogin(); });

  // Daily preview on login
  try{
    const daily = await loadDaily();
    const elT = qs("#dailyTitle"), elM = qs("#dailyMsg"), elI = qs("#dailyImg");
    if (elT) elT.textContent = daily.title || "رسالة اليوم";
    if (elM) elM.textContent = daily.message || "";
    if (elI && daily.image_url){ elI.src = daily.image_url; elI.classList.remove("hidden"); }
  }catch{}
}

// Home
async function initHome(){
  if (!qs("[data-page='home']")) return;
  const daily = await loadDaily();
  qs("#dailyTitle").textContent = daily.title || "رسالة اليوم";
  qs("#dailyMsg").textContent = daily.message || "";
  if (daily.image_url){
    const img = qs("#dailyImg");
    img.src = daily.image_url;
    img.classList.remove("hidden");
  }
  skeletonOff();
}

// Ambassador
async function initAmbassador(){
  if (!qs("[data-page='ambassador']")) return;
  const sess = requireRole("ambassador");
  if (!sess) return;
  const id = getParam("id");
  const phone = getParam("phone");
  try{
    const [rows, daily] = await Promise.all([loadRows(), loadDaily()]);
    const ambassadors = rows.filter(r=> r.role === "ambassador");
    let me = null;
    if (id) me = ambassadors.find(r=> r.ambassador_id === id);
    if (!me && phone) me = ambassadors.find(r=> r.phone === phone);

    if (!me) { showError("لم يتم العثور على سفير مطابق للرابط. استخدم: ?id=رقم_السفير"); return; }

    if (sess.token && id && sess.token !== id){
      showError("غير مصرح: يلزم تسجيل الخروج ثم الدخول برمز السفير الصحيح.");
      return;
    }

    qs("#who").textContent = me.name;
    qs("#sub").textContent = [me.branch, me.group].filter(Boolean).join(" • ");
    qs("#updated").textContent = me.updated_at ? `آخر تحديث: ${me.updated_at}` : "";

    qs("#k_achieved").textContent = fmtSAR(me.achieved_amount);
    qs("#k_boxes").textContent = me.active_boxes.toLocaleString("ar-SA");
    qs("#k_today").textContent = fmtSAR(me.today_amount);
    qs("#k_today_boxes").textContent = me.today_opened_boxes.toLocaleString("ar-SA");

    qs("#goalBoxesText").textContent = `فتح ${me.daily_target_boxes.toLocaleString("ar-SA")} صناديق سهمية فعّالة`;
    qs("#goalAmountText").textContent = `تحقيق ${me.daily_target_amount.toLocaleString("ar-SA")} ريال`;
    qs("#goalBoxesMeta").textContent = `${Math.min(me.today_opened_boxes, me.daily_target_boxes).toLocaleString("ar-SA")} / ${me.daily_target_boxes.toLocaleString("ar-SA")}`;
    qs("#goalAmountMeta").textContent = `${Math.min(me.today_amount, me.daily_target_amount).toLocaleString("ar-SA")} / ${me.daily_target_amount.toLocaleString("ar-SA")}`;
    setProgress(qs("#pBoxes"), me.today_opened_boxes, me.daily_target_boxes);
    setProgress(qs("#pAmount"), me.today_amount, me.daily_target_amount);

    const unlocked = evalRule(me.coupon_unlock_rule, me);
    qs("#couponNote").textContent = unlocked && me.coupon_code ? "كوبونك جاهز ✅" : "سيفتح الكوبون عند تحقق الهدف";
    qs("#couponCode").textContent = unlocked && me.coupon_code ? me.coupon_code : ("******-******-" + (me.ambassador_id||"00000"));

    qs("#rankA").textContent = me.rank_on_ambassadors ? me.rank_on_ambassadors.toLocaleString("ar-SA") : "—";
    qs("#rankB").textContent = me.rank_on_ambassadors_of_branch ? me.rank_on_ambassadors_of_branch.toLocaleString("ar-SA") : "—";
    qs("#rankBr").textContent = me.rank_on_branch ? me.rank_on_branch.toLocaleString("ar-SA") : "—";

    qs("#dailyMsg").textContent = daily.message || "";
    if (daily.image_url){
      const img = qs("#dailyImg");
      img.src = daily.image_url;
      img.classList.remove("hidden");
    }

    // Today coach (tasks)
    const dateKey = (daily.date || new Date().toISOString().slice(0,10)).trim();
    const stateKey = `tasks_${me.ambassador_id||""}_${dateKey}`;
    const readState = ()=>{
      try{ return JSON.parse(localStorage.getItem(stateKey) || "{}") || {}; }catch{ return {}; }
    };
    const writeState = (st)=>{
      try{ localStorage.setItem(stateKey, JSON.stringify(st||{})); }catch{}
    };

    const autoBoxesDone = me.daily_target_boxes>0 && me.today_opened_boxes>=me.daily_target_boxes;
    const autoAmountDone = me.daily_target_amount>0 && me.today_amount>=me.daily_target_amount;

    const renderTasks = ()=>{
      const st = readState();
      const tasks = [
        { key:"share", text:"شارك رسالة اليوم في 5 جهات", done: !!st.share },
        { key:"boxes", text:`افتح ${me.daily_target_boxes.toLocaleString("ar-SA")} صناديق فعّالة (اليوم: ${me.today_opened_boxes.toLocaleString("ar-SA")})`, done: autoBoxesDone, locked:true },
        { key:"amount", text:`حقق ${me.daily_target_amount.toLocaleString("ar-SA")} ريال (اليوم: ${me.today_amount.toLocaleString("ar-SA")})`, done: autoAmountDone, locked:true },
      ];
      const total = tasks.length;
      const done = tasks.filter(t=>t.done).length;
      const meta = qs("#tasksMeta");
      if (meta) meta.textContent = `خطة اليوم • تم إنجاز ${done} من ${total} • تاريخ: ${dateKey}`;
      const ul = qs("#tasksList");
      if (!ul) return;
      ul.innerHTML = "";
      tasks.forEach(t=>{
        const li = document.createElement("li");
        li.className = "cell";
        li.innerHTML = `
          <div>
            <div class="value">${t.text}</div>
            <div class="label">${t.locked ? "تتحدث تلقائيًا من بيانات اليوم" : "اضغط للتحديد"}</div>
          </div>
          <div style="text-align:left">
            <div class="value">${t.done ? "✅" : "⬜️"}</div>
          </div>`;
        if (!t.locked){
          li.style.cursor = "pointer";
          li.addEventListener("click", ()=>{
            const ns = readState();
            ns[t.key] = !ns[t.key];
            writeState(ns);
            renderTasks();
          });
        }
        ul.appendChild(li);
      });
      if (done === total) toast("ممتاز! خلصت خطة اليوم ✅");
    };
    renderTasks();

    // Sharing
    const doCopy = async ()=>{
      const msg = buildShareMessage(daily, shareLinkFor(me));
      try{ await navigator.clipboard.writeText(msg); toast("تم النسخ ✅"); }
      catch{ alert("انسخ الرسالة:\n\n" + msg); }
    };
    const doWhatsApp = ()=>{
      const msg = buildShareMessage(daily, shareLinkFor(me));
      const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    };
    const doShare = async ()=>{
      const msg = buildShareMessage(daily, shareLinkFor(me));
      if (navigator.share){
        try{ await navigator.share({ text: msg }); toast("تمت المشاركة ✅"); return; }catch{}
      }
      await doCopy();
    };

    const shareBtn = qs("#shareBtn");
    if (shareBtn) shareBtn.addEventListener("click", doShare);
    const copyBtn = qs("#copyBtn");
    if (copyBtn) copyBtn.addEventListener("click", doCopy);
    const waBtn = qs("#waBtn");
    if (waBtn) waBtn.addEventListener("click", doWhatsApp);

    qs("#refreshBtn").addEventListener("click", ()=> location.reload());
    const lo = qs("#logoutBtn");
    if (lo) lo.addEventListener("click", ()=>{ clearSession(); location.replace("index.html"); });
    skeletonOff();
  }catch(e){
    showError(e.message || "حدث خطأ غير متوقع");
  }
}

// Branch
async function initBranch(){
  if (!qs("[data-page='branch']")) return;
  const sess = requireRole("branch");
  if (!sess) return;
  const code = getParam("code");
  const b = getParam("branch") || getParam("b");
  try{
    const [rows, daily, access] = await Promise.all([loadRows(), loadDaily(), loadAccess()]);
    const ambassadors = rows.filter(r=> r.role === "ambassador");

    let chosen = "";
    if (code){
      if (sess.token && sess.token !== code){
        showError("غير مصرح: يلزم تسجيل الخروج ثم الدخول برمز الفرع الصحيح.");
        return;
      }
      chosen = (access.branch_codes || {})[code] || "";
      if (!chosen){
        showError("رمز الفرع غير معروف.");
        return;
      }
    } else if (b) {
      // optional direct branch name (still locked by session)
      showError("استخدم رمز الفرع للدخول (مثال: ?code=0123).");
      return;
    } else {
      showError("استخدم: ?code=رمز_الفرع");
      return;
    }

    const inBranch = ambassadors.filter(r=> r.branch === chosen);
    if (!inBranch.length){ showError("لا توجد بيانات لهذا الفرع."); return; }

    qs("#branchName").textContent = chosen;

    const sum = (arr, key)=> arr.reduce((a,x)=> a + (Number(x[key])||0), 0);
    qs("#k_achieved").textContent = fmtSAR(sum(inBranch,"achieved_amount"));
    qs("#k_today").textContent = fmtSAR(sum(inBranch,"today_amount"));
    qs("#k_boxes").textContent = sum(inBranch,"active_boxes").toLocaleString("ar-SA");
    qs("#k_count").textContent = inBranch.length.toLocaleString("ar-SA");
    const ranks = inBranch.map(x=>x.rank_on_branch).filter(n=>n>0);
    qs("#k_rank").textContent = ranks.length ? Math.min(...ranks).toLocaleString("ar-SA") : "—";

    qs("#dailyMsg").textContent = daily.message || "";

    // segment
    const segO=qs("#segOverview"), segA=qs("#segAmb");
    const vO=qs("#viewOverview"), vA=qs("#viewAmb");
    const setSeg = (w)=>{
      const isO = w==="o";
      segO.classList.toggle("active", isO);
      segA.classList.toggle("active", !isO);
      vO.classList.toggle("hidden", !isO);
      vA.classList.toggle("hidden", isO);
    };
    segO.addEventListener("click", ()=> setSeg("o"));
    segA.addEventListener("click", ()=> setSeg("a"));

    const ul = qs("#ambList");
    ul.innerHTML = "";
    [...inBranch].sort((a,b)=> b.today_amount - a.today_amount).forEach(r=>{
      const li = document.createElement("li");
      li.className = "cell";
      li.innerHTML = `
        <div>
          <div class="value">${r.name}</div>
          <div class="label">${[r.group, r.leader_name].filter(Boolean).join(" • ")}</div>
        </div>
        <div style="text-align:left">
          <div class="value">${fmtSAR(r.today_amount)}</div>
          <div class="value small">${r.today_opened_boxes.toLocaleString("ar-SA")} صناديق</div>
        </div>`;
      li.addEventListener("click", ()=>{ toast("للدخول كسفير: سجّل خروج ثم ادخل برمز السفير"); });
      ul.appendChild(li);
    });

    qs("#branchInput").addEventListener("keydown", (e)=>{
      if (e.key==="Enter"){
        const v=(qs("#branchInput").value||"").trim();
        if (v) location.href = `branch.html?branch=${encodeURIComponent(v)}`;
      }
    });
    qs("#refreshBtn").addEventListener("click", ()=> location.reload());
    const lo = qs("#logoutBtn");
    if (lo) lo.addEventListener("click", ()=>{ clearSession(); location.replace("index.html"); });
    skeletonOff();
  }catch(e){
    showError(e.message || "حدث خطأ غير متوقع");
  }
}

// Admin
async function initAdmin(){
  if (!qs("[data-page='admin']")) return;
  const sess = requireRole("admin");
  if (!sess) return;
  const branchFilter = getParam("branch") || "";
  try{
    const [rows, daily] = await Promise.all([loadRows(), loadDaily()]);
    let ambassadors = rows.filter(r=> r.role === "ambassador");
    if (branchFilter){
      ambassadors = ambassadors.filter(r=> r.branch === branchFilter);
      qs("#filterBadge").textContent = `فلترة: ${branchFilter}`;
      qs("#filterBadge").classList.remove("hidden");
    }
    qs("#countTxt").textContent = ambassadors.length.toLocaleString("ar-SA");

    // daily generator
    qs("#dailyTitle").value = daily.title || "رسالة اليوم";
    qs("#dailyDate").value = daily.date || "";
    qs("#dailyImage").value = daily.image_url || "";
    qs("#dailyMessage").value = daily.message || "";

    const preview = ()=>{
      qs("#pTitle").textContent = qs("#dailyTitle").value || "رسالة اليوم";
      qs("#pMsg").textContent = qs("#dailyMessage").value || "";
      const im = qs("#pImg");
      const url = qs("#dailyImage").value.trim();
      if (url){ im.src=url; im.classList.remove("hidden"); } else im.classList.add("hidden");
    };
    ["dailyTitle","dailyDate","dailyImage","dailyMessage"].forEach(id=> qs("#"+id).addEventListener("input", preview));
    preview();

    qs("#copyDailyBtn").addEventListener("click", async ()=>{
      const obj = {
        title: qs("#dailyTitle").value || "رسالة اليوم",
        message: qs("#dailyMessage").value || "",
        image_url: qs("#dailyImage").value || "",
        date: qs("#dailyDate").value || ""
      };
      const txt = JSON.stringify(obj, null, 2);
      try{ await navigator.clipboard.writeText(txt); toast("تم نسخ daily.json ✅"); }
      catch{ alert(txt); }
    });

    // Alerts
    const segSt=qs("#segStalled"), segNe=qs("#segNear"), segTop=qs("#segTop");
    const vSt=qs("#viewStalled"), vNe=qs("#viewNear"), vTop=qs("#viewTop");
    const setSeg = (w)=>{
      const isSt = w==="st", isNe = w==="ne", isTop = w==="top";
      if (segSt) segSt.classList.toggle("active", isSt);
      if (segNe) segNe.classList.toggle("active", isNe);
      if (segTop) segTop.classList.toggle("active", isTop);
      if (vSt) vSt.classList.toggle("hidden", !isSt);
      if (vNe) vNe.classList.toggle("hidden", !isNe);
      if (vTop) vTop.classList.toggle("hidden", !isTop);
    };
    if (segSt) segSt.addEventListener("click", ()=> setSeg("st"));
    if (segNe) segNe.addEventListener("click", ()=> setSeg("ne"));
    if (segTop) segTop.addEventListener("click", ()=> setSeg("top"));

    const makeActions = (r)=>{
      const msg = buildShareMessage(daily, shareLinkFor(r));
      return {
        copy: async ()=>{
          try{ await navigator.clipboard.writeText(msg); toast("تم النسخ ✅"); }
          catch{ alert(msg); }
        },
        wa: ()=>{
          const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
          window.open(url, "_blank", "noopener,noreferrer");
        }
      };
    };
    const renderList = (el, items, kind)=>{
      if (!el) return;
      el.innerHTML = "";
      if (!items.length){
        const li=document.createElement("li"); li.className="cell";
        li.innerHTML = `<div><div class="value">لا يوجد</div><div class="label">—</div></div>`;
        el.appendChild(li);
        return;
      }
      items.forEach(r=>{
        const acts = makeActions(r);
        const li=document.createElement("li"); li.className="cell";
        const reason = r.__reason ? `<div class="label">${r.__reason}</div>` : "";
        li.innerHTML = `
          <div>
            <div class="value">${r.name}</div>
            <div class="label">${[r.branch, r.group].filter(Boolean).join(" • ")}</div>
            ${reason}
          </div>
          <div style="display:flex; gap:8px; align-items:center; justify-content:flex-end">
            <button class="iconBtn" data-act="copy"><span class="k">نسخ</span></button>
            <button class="iconBtn" data-act="wa"><span class="k">واتساب</span></button>
          </div>`;
        qs("[data-act='copy']", li).addEventListener("click", (e)=>{ e.stopPropagation(); acts.copy(); });
        qs("[data-act='wa']", li).addEventListener("click", (e)=>{ e.stopPropagation(); acts.wa(); });
        li.addEventListener("click", ()=>{ toast("للدخول كسفير: سجّل خروج ثم ادخل برمز السفير"); });
        el.appendChild(li);
      });
    };

    // stalled
    const stalled = ambassadors
      .map(r=>{
        const d = parseDateFlexible(r.updated_at);
        const ds = daysSince(d);
        const noToday = (r.today_amount<=0 && r.today_opened_boxes<=0);
        let reason = "";
        if (ds !== null && ds >= 3) reason = `آخر تحديث قبل ${ds} يوم`;
        else if (noToday) reason = "لم ينشط اليوم";
        if (!reason) return null;
        return { ...r, __reason: reason, __score: (ds!==null? ds : (noToday? 3:0)) };
      })
      .filter(Boolean)
      .sort((a,b)=> b.__score - a.__score)
      .slice(0, 12);

    // near to goal (amount or boxes)
    const near = ambassadors
      .map(r=>{
        const pA = r.daily_target_amount ? (r.today_amount / r.daily_target_amount) : 0;
        const pB = r.daily_target_boxes ? (r.today_opened_boxes / r.daily_target_boxes) : 0;
        const p = Math.max(pA, pB);
        if (!(p >= 0.85 && p < 1)) return null;
        const pctTxt = (p*100).toFixed(0) + "%";
        let reason = `قريب من الهدف (${pctTxt})`;
        if (pA >= pB && r.daily_target_amount) reason = `قريب من هدف المبلغ (${pctTxt})`;
        if (pB > pA && r.daily_target_boxes) reason = `قريب من هدف الصناديق (${pctTxt})`;
        return { ...r, __reason: reason, __score: p };
      })
      .filter(Boolean)
      .sort((a,b)=> b.__score - a.__score)
      .slice(0, 12);

    // top today
    const topA = [...ambassadors].sort((a,b)=> b.today_amount - a.today_amount).slice(0,12);
    topA.forEach(r=>{ r.__reason = `اليوم: ${fmtSAR(r.today_amount)} • ${r.today_opened_boxes.toLocaleString("ar-SA")} صناديق`; });

    renderList(qs("#stalledList"), stalled, "stalled");
    renderList(qs("#nearList"), near, "near");
    renderList(qs("#topTodayList"), topA, "top");

    const meta = qs("#alertsMeta");
    if (meta) meta.textContent = `متوقفين: ${stalled.length.toLocaleString("ar-SA")} • قريبين: ${near.length.toLocaleString("ar-SA")} • أفضل اليوم: ${topA.length.toLocaleString("ar-SA")}`;

    // top branches
    const by = new Map();
    ambassadors.forEach(r=>{
      const k=r.branch||"—";
      if(!by.has(k)) by.set(k,{branch:k,today:0,amb:0});
      const o=by.get(k); o.today+=r.today_amount; o.amb+=1;
    });
    const topB = Array.from(by.values()).sort((a,b)=> b.today - a.today).slice(0,10);
    const ulB = qs("#topBranches"); ulB.innerHTML="";
    topB.forEach(o=>{
      const li=document.createElement("li"); li.className="cell";
      li.innerHTML = `
        <div><div class="value">${o.branch}</div><div class="label">${o.amb.toLocaleString("ar-SA")} سفير</div></div>
        <div style="text-align:left"><div class="value">${fmtSAR(o.today)}</div><div class="chev">‹</div></div>`;
      li.addEventListener("click", ()=>{ toast("للدخول كفرع: سجّل خروج ثم ادخل برمز الفرع"); });
      ulB.appendChild(li);
    });

    // search
    const s=qs("#search"), out=qs("#searchOut");
    s.addEventListener("input", ()=>{
      const q=(s.value||"").trim(); out.innerHTML=""; if(!q) return;
      ambassadors.filter(r=> r.name.includes(q) || r.phone.includes(q) || r.ambassador_id.includes(q))
        .slice(0,8).forEach(r=>{
          const li=document.createElement("li"); li.className="cell";
          li.innerHTML = `<div><div class="value">${r.name}</div><div class="label">${r.branch}</div></div><div class="chev">‹</div>`;
          li.addEventListener("click", ()=>{ toast("للدخول كسفير: سجّل خروج ثم ادخل برمز السفير"); });
          out.appendChild(li);
        });
    });

    qs("#refreshBtn").addEventListener("click", ()=> location.reload());
    const lo = qs("#logoutBtn");
    if (lo) lo.addEventListener("click", ()=>{ clearSession(); location.replace("index.html"); });
    skeletonOff();
  }catch(e){
    showError(e.message || "حدث خطأ غير متوقع");
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  initLogin();
  initHome();
  initAmbassador();
  initBranch();
  initAdmin();
});
