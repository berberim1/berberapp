/* eslint-disable no-console */
console.log("[staff] v25 — BH clamp + realtime + UI rehydrate (sabit) ");

import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  doc, getDoc, updateDoc, setDoc, serverTimestamp, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

/* ------------------------- helpers ------------------------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const pad = (n)=>String(n).padStart(2,"0");
function* quarterSteps(){ for(let h=0;h<24;h++){ for(let m=0;m<60;m+=15){ yield `${pad(h)}:${pad(m)}`; } } }
const timeLabel = (t)=>t;
const toMin = (t)=>{ const [h,m]=t.split(":").map(Number); return h*60+m; };
function diffLabel(a,b){ const mins=toMin(b)-toMin(a); if(mins<=0) return "-"; const h=(mins/60)|0,m=mins%60; return h?(m?`${h}sa ${m}dk`:`${h}sa`):`${m}dk`; }

/* ------------------------- nav ------------------------- */
async function mountRail(){
  try{
    const res = await fetch("bar-menu.html",{cache:"no-store"});
    const html = await res.text();
    const docu = new DOMParser().parseFromString(html,"text/html");
    const nav = docu.querySelector("nav.rail");
    const style = docu.querySelector("#bar-menu-css") || docu.querySelector("style");
    style && !$("#bar-menu-css") && document.head.appendChild(style.cloneNode(true));
    if(nav){
      $("#rail-mount")?.appendChild(nav.cloneNode(true));
      document.body.classList.add("has-rail");
      const current = (location.pathname.split("/").pop() || "staff.html");
      $$("nav.rail .rail__btn").forEach(a => { if ((a.getAttribute("href")||"").endsWith(current)) a.setAttribute("aria-current","page"); });
      const profileBtn = $("nav.rail #openProfile") || $("nav.rail .rail__bottom .avatar-btn");
      profileBtn?.addEventListener("click", (e)=>{ e.preventDefault(); openBm(); });
    }
  }catch(e){ console.warn("bar-menu yüklenemedi", e); }
}

/* ------------------------- model ------------------------- */
const DAYS = [
  { key:"sun", tr:"Pazar" },
  { key:"mon", tr:"Pazartesi" },
  { key:"tue", tr:"Salı" },
  { key:"wed", tr:"Çarşamba" },
  { key:"thu", tr:"Perşembe" },
  { key:"fri", tr:"Cuma" },
  { key:"sat", tr:"Cumartesi" },
];
const EMPTY_DAY = { enabled:false, start:"09:00", end:"18:00" };

let UID = null;
let ADMIN_NAME = "Admin";
let servicesAll = [];
let serviceCategories = [];
let srvQuery = "";
let srvCat = "";
let srvTempAssigned = new Set();

let staffRaw = [];     // Firestore’daki ham liste (step8.staff)
let staff = [];        // UI modeli
let topStaffHoursMap = {};
let bizHours = null;   // normalized {mon..sun}
let lastBizHoursJSON = null;
let selfUpdating = false;

let currentId = null;
let activeTab = "services";

/* ------------------------- mappers ------------------------- */
function normalizeDay(src){
  if (!src) return { ...EMPTY_DAY };
  const enabled =
    ("closed" in src) ? !src.closed :
    (typeof src.open === "boolean") ? !!src.open :
    (src.enabled != null) ? !!src.enabled : true;

  const start = src.start || src.from || src.open || "09:00";
  const end   = src.end   || src.to   || src.close || "18:00";
  return { enabled, start, end };
}
function normalizeHours(src){
  const out = {};
  DAYS.forEach(d=>{
    const tr = src?.[d.tr];
    const en = src?.[d.key];
    out[d.key] = normalizeDay(tr || en);
  });
  return out;
}
function toFirestoreDay(model){
  return model.enabled ? { open:true, from:model.start, to:model.end } : { open:false };
}
function denormalizeHours(model){
  const out={};
  DAYS.forEach(d=>{ const m=model?.[d.key] || EMPTY_DAY; out[d.tr] = toFirestoreDay(m); });
  return out;
}
function normalizeAnyHours(src){
  const raw = src?.workingHours || src?.weeklyHours || src?.hours || src?.staff_hours || src?.staffHours || src || {};
  return normalizeHours(raw);
}
function normalizeWithFallbackToBiz(src, biz){
  const n = normalizeAnyHours(src);
  const any = DAYS.some(d => (n?.[d.key]?.enabled));
  return any ? n : (biz ? JSON.parse(JSON.stringify(biz)) : n);
}
function buildTopStaffHoursMapFromStaffRaw(arr){
  const map = {};
  (arr || []).forEach(s=>{
    const name = (s?.name || "").trim();
    if(!name) return;
    const norm = normalizeAnyHours(s);
    map[name] = denormalizeHours(norm);
  });
  return map;
}
function makeId(name, phone, idx){
  const slug = (name||"personel").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"") || "personel";
  const anyPhone = (phone || "").replace(/\D/g,"");
  const tail = anyPhone.slice(-4) || String(idx);
  return `${slug}-${tail}`;
}

/* ------------------------- staff <-> UI ------------------------- */
function getDisplayName(s){ return s?.isOwner ? `${s.name} (Admin)` : (s?.name || "—"); }

function rebuildStaffFromRawPreserveSelection(){
  const keep = currentId;
  // ham listedeki kişileri UI modeline çevir
  let next = (staffRaw || []).map((s,idx)=>({
    id: makeId(s.name, s.phone || s.phoneE164, idx),
    name: s.name || `Çalışan ${idx+1}`,
    isOwner: false,
    role: s.role || s.position || "Personel",
    position: s.position || "",
    phone: s.phone || s.phoneE164 || "",
    rawIndex: idx,
    hours: normalizeWithFallbackToBiz(s, bizHours),
    services: new Set(
      Array.isArray(s.services) ? s.services :
      (Array.isArray(s.assignedServices) ? s.assignedServices : [])
    ),
  }));

  // owner’ı listenin başına ekle
  if (!next.some(s => (s.name||"").trim().toLowerCase() === (ADMIN_NAME||"").trim().toLowerCase())) {
    next.unshift({
      id: makeId(ADMIN_NAME, "", "0"),
      name: ADMIN_NAME,
      isOwner: true,
      role: "Sahip",
      rawIndex: -1,
      hours: bizHours || normalizeHours({}),
      services: new Set()
    });
  }

  // üst harita override
  Object.entries(topStaffHoursMap || {}).forEach(([name, hoursObj])=>{
    const who = next.find(x => (x.name||"").trim().toLowerCase() === name.trim().toLowerCase());
    if (!who) return;
    who.hours = normalizeHours(hoursObj);
  });

  staff = next;
  currentId = staff.some(s=>s.id===keep) ? keep : (staff[0]?.id || null);
  renderStaffList();
  renderTabs();
}

/* ------------------------- clamp (kritik) ------------------------- */
function disableOptionsBefore(selectEl, minTime){
  const min = toMin(minTime);
  Array.from(selectEl.options).forEach(o=>{ o.disabled = toMin(o.value) < min; });
}
function disableOptionsAfter(selectEl, maxTime){
  const max = toMin(maxTime);
  Array.from(selectEl.options).forEach(o=>{ o.disabled = toMin(o.value) > max; });
}
function moveEndAfterStart(endSel, startVal){
  const smin = toMin(startVal);
  for (const o of Array.from(endSel.options)){
    if (toMin(o.value) > smin){ endSel.value = o.value; return true; }
  }
  return false;
}
function moveStartBeforeMax(startSel, maxTime){
  const max = toMin(maxTime);
  for (let i = startSel.options.length - 1; i >= 0; i--){
    const o = startSel.options[i];
    if (toMin(o.value) < max){ startSel.value = o.value; return true; }
  }
  return false;
}

function clampHoursModelToBiz(model, bh){
  const summary = [];
  const out = JSON.parse(JSON.stringify(model || {}));

  DAYS.forEach(d=>{
    const m = out[d.key] || { ...EMPTY_DAY };
    const b = bh?.[d.key] || { enabled:false, start:"09:00", end:"18:00" };

    if (!b.enabled){
      if (m.enabled){ summary.push(`${d.tr}: dükkan kapalı → personel kapatıldı`); m.enabled=false; }
      out[d.key]=m; return;
    }
    if (!m.enabled){ out[d.key]=m; return; }

    const oldS=m.start, oldE=m.end;
    if (toMin(m.start) < toMin(b.start)) m.start = b.start;
    if (toMin(m.end)   > toMin(b.end))   m.end   = b.end;
    if (toMin(m.end) <= toMin(m.start)){ m.start=b.start; m.end=b.end; }

    if (oldS!==m.start || oldE!==m.end){
      const parts=[]; if(oldS!==m.start) parts.push(`başlangıç ${oldS}→${m.start}`); if(oldE!==m.end) parts.push(`bitiş ${oldE}→${m.end}`);
      summary.push(`${d.tr}: ${parts.join(", ")}`);
    }
    out[d.key]=m;
  });

  return { model: out, summary };
}

async function clampAllStaffToBusinessHours(newBH){
  const arr = [...staffRaw];
  const summaries = [];
  let changed = false;

  arr.forEach((s, idx)=>{
    const cur = normalizeWithFallbackToBiz(s, newBH);
    const { model: clamped, summary } = clampHoursModelToBiz(cur, newBH);
    if (summary.length) { changed = true; summaries.push(`- ${(s?.name||`Çalışan ${idx+1}`)}: ${summary.join(" • ")}`); }
    arr[idx] = { ...(arr[idx]||{}), hours: denormalizeHours(clamped) };
  });

  // Local state’i yenile ve UI’yi her durumda rehydrate et
  staffRaw = arr;
  rebuildStaffFromRawPreserveSelection();

  if (!changed) return;

  const mapForTop = buildTopStaffHoursMapFromStaffRaw(arr);
  try{
    selfUpdating = true;
    await updateDoc(doc(db,"adminOnboarding",UID), {
      "step8.staff": arr,
      "step8.staff_hours": mapForTop,
      "staff_hours": mapForTop,
      updatedAt: serverTimestamp()
    });
  }catch(e){
    try{
      selfUpdating = true;
      await setDoc(doc(db,"adminOnboarding",UID), {
        "step8.staff": arr,
        "step8.staff_hours": mapForTop,
        "staff_hours": mapForTop,
        updatedAt: serverTimestamp()
      }, { merge:true });
    }catch(e2){
      console.warn("[clamp] Firestore yazılamadı:", e2?.message || e2);
    }
  }finally{
    selfUpdating = false;
  }

  alert(
    "Dükkan saatlerindeki değişiklik nedeniyle bazı personel vardiyaları otomatik güncellendi:\n\n" +
    summaries.join("\n") +
    "\n\nNot: Personel saatleri hiçbir zaman dükkan saatlerinin dışına taşamaz."
  );
}

/* ------------------------- UI: list + tabs ------------------------- */
function renderStaffList(){
  const ul = $("#staffList"); if(!ul) return;
  ul.innerHTML="";
  staff.forEach(s=>{
    const li=document.createElement("li");
    li.className="staff-item"; li.dataset.id=s.id;
    if(s.id===currentId) li.setAttribute("aria-current","true");
    const initial = (s.name?.[0] || "?").toUpperCase();
    const subRole = s.isOwner ? "Sahip (Admin)" : (s.role || s.position || "Personel");
    li.innerHTML = `<div class="avatar">${initial}</div>
                    <div><div>${getDisplayName(s)}</div><div class="role">${subRole}</div></div>`;
    li.addEventListener("click",()=>{
      currentId=s.id;
      $("#panelTitle").textContent=getDisplayName(s);
      $("#staffName").textContent=getDisplayName(s);
      $("#srvStaffName") && ($("#srvStaffName").textContent=getDisplayName(s));
      snapshotAssignedToTemp();
      renderTabs(); renderStaffList();
    });
    ul.appendChild(li);
  });
}
function bindTabs(){
  $$(".tab").forEach(tb=>{
    tb.addEventListener("click",()=>{ activeTab=tb.dataset.tab; renderTabs(); });
  });
}
function renderTabs(){
  $$(".tab").forEach(tb=>tb.setAttribute("aria-selected", tb.dataset.tab===activeTab));
  $("#tab-services").hidden = activeTab!=="services";
  $("#tab-hours").hidden    = activeTab!=="hours";
  if(activeTab==="hours") renderStaffHoursView(); else renderServicesTab();
}

/* ------------------------- UI: Services ------------------------- */
function formatPriceTry(v){ if (!Number.isFinite(v)) return ""; return `₺${v.toFixed(0)}`; }
function formatDuration(v){ if (!Number.isFinite(v) || v<=0) return ""; return `${v} dk`; }
function buildCategoryOptions(){
  const sel = $("#srvCatFilter"); if(!sel) return;
  const seen = new Set(); serviceCategories = [];
  servicesAll.forEach(s=>{ const c = s.category || "Genel"; if (!seen.has(c)){ seen.add(c); serviceCategories.push(c); } });
  sel.innerHTML = `<option value="">Tüm Kategoriler</option>` + serviceCategories.map(c=>`<option value="${c}">${c}</option>`).join("");
  sel.value = srvCat || "";
}
function currentStaff(){ return staff.find(s => s.id === currentId); }
function snapshotAssignedToTemp(){
  const who = currentStaff(); srvTempAssigned = new Set(who?.services || []);
  $("#srvAssignedCount") && ($("#srvAssignedCount").textContent = String(srvTempAssigned.size));
  $("#srvStaffName") && ($("#srvStaffName").textContent = getDisplayName(who));
}
function filterServices(list){
  return list.filter(s=>{
    if (srvCat && (s.category || "Genel") !== srvCat) return false;
    if (srvQuery){
      const q = srvQuery.toLowerCase();
      if (!((s.name||"").toLowerCase().includes(q) || (s.category||"").toLowerCase().includes(q))) return false;
    }
    return true;
  });
}
function renderServicesTab(){
  const wrap = $("#tab-services"); if(!wrap) return;
  if(!currentId && staff[0]) currentId = staff[0].id;
  const who = currentStaff();
  if (!who){ wrap.innerHTML = `<div class="muted">Önce bir personel seçin.</div>`; return; }

  $("#srvStaffName") && ($("#srvStaffName").textContent = getDisplayName(who));
  buildCategoryOptions();

  const listEl = $("#srvList");
  const emptyEl = $("#srvEmpty");

  if (!servicesAll || servicesAll.length===0){
    if (emptyEl) emptyEl.style.display = "block";
    if (listEl) listEl.innerHTML = "";
    return;
  } else { if (emptyEl) emptyEl.style.display = "none"; }

  if (!(who.services instanceof Set)){
    who.services = new Set(Array.isArray(who.services) ? who.services : []);
  }
  snapshotAssignedToTemp();

  const filtered = filterServices(servicesAll);
  listEl.innerHTML = "";

  filtered.forEach(s=>{
    const li = document.createElement("li");
    li.className = "svc-item";
    li.dataset.id = s.id;

    const checked = srvTempAssigned.has(s.id) ? "checked" : "";
    const disabledCls = s.active ? "" : ' style="opacity:.6"';
    const priceTxt = formatPriceTry(s.price);
    const durTxt = formatDuration(s.duration);
    const meta = [durTxt, priceTxt].filter(Boolean).join(" • ");
    const cat = s.category || "Genel";

    li.innerHTML = `
      <label${disabledCls} style="display:flex; align-items:center; gap:10px; width:100%; cursor:pointer;">
        <input type="checkbox" class="srv-check" data-id="${s.id}" ${checked}>
        <div style="flex:1 1 auto">
          <div style="font-weight:600">${s.name}</div>
          <div class="muted" style="font-size:12px">${meta || "—"}</div>
        </div>
        <span class="chip">${cat}</span>
      </label>
    `;
    listEl.appendChild(li);
  });

  $("#srvAssignedCount") && ($("#srvAssignedCount").textContent = String(srvTempAssigned.size));
}

/* events */
function bindServicesEvents(){
  const listEl = $("#srvList");
  const searchEl = $("#srvSearch");
  const catEl = $("#srvCatFilter");
  const selectAllEl = $("#srvSelectAll");
  const clearEl = $("#srvClear");
  const saveEls = [$("#srvSave"), $("#srvSaveBottom")];
  const cancelEl = $("#srvCancel");

  listEl?.addEventListener("change", (e)=>{
    const t = e.target;
    if (t?.classList.contains("srv-check")){
      const id = t.dataset.id;
      if (t.checked) srvTempAssigned.add(id); else srvTempAssigned.delete(id);
      $("#srvAssignedCount") && ($("#srvAssignedCount").textContent = String(srvTempAssigned.size));
    }
  });

  let searchDeb;
  searchEl?.addEventListener("input", ()=>{
    clearTimeout(searchDeb);
    searchDeb = setTimeout(()=>{ srvQuery = (searchEl.value||"").trim(); renderServicesTab(); }, 120);
  });

  catEl?.addEventListener("change", ()=>{ srvCat = catEl.value || ""; renderServicesTab(); });

  selectAllEl?.addEventListener("change", ()=>{
    const visible = Array.from($("#srvList").querySelectorAll(".srv-check"));
    if (selectAllEl.checked){
      visible.forEach(cb=>srvTempAssigned.add(cb.dataset.id));
      visible.forEach(cb=>cb.checked = true);
    }else{
      visible.forEach(cb=>srvTempAssigned.delete(cb.dataset.id));
      visible.forEach(cb=>cb.checked = false);
    }
    $("#srvAssignedCount") && ($("#srvAssignedCount").textContent = String(srvTempAssigned.size));
  });

  clearEl?.addEventListener("click", ()=>{
    $("#srvList").querySelectorAll(".srv-check").forEach(cb=>{ cb.checked=false; srvTempAssigned.delete(cb.dataset.id); });
    $("#srvAssignedCount") && ($("#srvAssignedCount").textContent = String(srvTempAssigned.size));
    if (selectAllEl) selectAllEl.checked = false;
  });

  saveEls.forEach(btn=>btn?.addEventListener("click", saveServiceAssignments));
  cancelEl?.addEventListener("click", ()=>{ snapshotAssignedToTemp(); renderServicesTab(); });
}

async function saveServiceAssignments(){
  const who = currentStaff(); if (!who) return;
  const arr = [...staffRaw];
  const idx = who.rawIndex;

  const assigned = Array.from(srvTempAssigned);
  who.services = new Set(assigned);

  if (idx >= 0){
    arr[idx] = { ...(arr[idx]||{}), name: arr[idx]?.name || who.name, role: arr[idx]?.role || who.role, hours: denormalizeHours(who.hours), position: arr[idx]?.position || who.role, services: assigned };
  }else{
    arr.push({ name: who.name || ADMIN_NAME, role: who.role || "Sahip", position: who.role || "Sahip", hours: denormalizeHours(who.hours), services: assigned });
  }

  const mapForTop = buildTopStaffHoursMapFromStaffRaw(arr);
  try{
    await updateDoc(doc(db,"adminOnboarding",UID), {
      "step8.staff": arr,
      "step8.staff_hours": mapForTop,
      "staff_hours": mapForTop,
      updatedAt: serverTimestamp()
    });
    staffRaw = arr;
    alert("Hizmet atamaları kaydedildi.");
  }catch(e){
    try{
      await setDoc(doc(db,"adminOnboarding",UID), {
        "step8.staff": arr,
        "step8.staff_hours": mapForTop,
        "staff_hours": mapForTop,
        updatedAt: serverTimestamp()
      }, { merge:true });
      staffRaw = arr;
      alert("Hizmet atamaları kaydedildi.");
    }catch(e2){
      alert("Kaydedilemedi: " + (e2?.message || e2));
    }
  }
  rebuildStaffFromRawPreserveSelection();
}

/* ------------------------- UI: Çalışan saatleri ------------------------- */
function getCurrentStaff(){ return staff.find(s=>s.id===currentId); }
function renderStaffHoursView(){
  if(!currentId && staff[0]) currentId = staff[0].id;
  const wrap = $("#tab-hours"); if(!wrap) return;
  const who = getCurrentStaff();
  wrap.innerHTML="";

  const model = who?.hours || {};
  const box = document.createElement("div"); box.className="hours";
  DAYS.forEach(d=>{
    const st=model[d.key] || EMPTY_DAY;
    const row=document.createElement("div"); row.className="row"+(st.enabled?"":" off");
    row.innerHTML = `
      <div class="day">${d.tr}</div>
      <div class="range">${st.enabled ? `${timeLabel(st.start)} – ${timeLabel(st.end)}` : '<span class="muted">Çalışmıyor</span>'}</div>
      <div style="text-align:right"><span class="chip">${st.enabled ? diffLabel(st.start, st.end) : '-'}</span></div>`;
    box.appendChild(row);
  });
  const go=document.createElement("div"); go.className="go-shifts";
  go.innerHTML='<button class="btn" id="openModal2">Vardiyaları Düzenle</button>';
  wrap.appendChild(box); wrap.appendChild(go);
  setTimeout(()=>$("#openModal2")?.addEventListener("click",openStaffModal),0);

  $("#panelTitle").textContent = getDisplayName(who);
  $("#staffName").textContent  = getDisplayName(who);
}

/* modal */
const staffModal = $("#modal");
const staffGrid  = $("#editGrid");

function buildSelect(v){
  const sel=document.createElement("select"); sel.className="sel";
  for(const t of quarterSteps()){ const o=document.createElement("option"); o.value=t; o.textContent=timeLabel(t); sel.appendChild(o); }
  sel.value=v; return sel;
}
function enforceBusinessBoundsForRow(row){
  const dayKey = row.dataset.key;
  const bh = bizHours?.[dayKey];
  const toggle = row.querySelector(".switch");
  const [startSel, endSel] = row.querySelectorAll("select.sel");
  if (!bh) return;

  if (!bh.enabled){
    toggle.checked = false; toggle.disabled = true;
    startSel.disabled = true; endSel.disabled = true;
    return;
  }
  disableOptionsBefore(startSel, bh.start);
  disableOptionsAfter(endSel, bh.end);

  if (toMin(startSel.value) < toMin(bh.start)) startSel.value = bh.start;
  if (toMin(endSel.value)   > toMin(bh.end))   endSel.value   = bh.end;

  if (toMin(endSel.value) <= toMin(startSel.value)){
    if (!moveEndAfterStart(endSel, startSel.value)) {
      moveStartBeforeMax(startSel, bh.end);
      moveEndAfterStart(endSel, startSel.value);
    }
  }
  startSel.addEventListener("change", ()=>{
    if (toMin(startSel.value) < toMin(bh.start)) startSel.value = bh.start;
    if (toMin(startSel.value) >= toMin(bh.end))  moveStartBeforeMax(startSel, bh.end);
    if (toMin(endSel.value) <= toMin(startSel.value)) moveEndAfterStart(endSel, startSel.value);
  });
  endSel.addEventListener("change", ()=>{
    if (toMin(endSel.value) > toMin(bh.end)) endSel.value = bh.end;
    if (toMin(endSel.value) <= toMin(startSel.value)) moveEndAfterStart(endSel, startSel.value);
  });
}
function renderStaffModal(){
  const who = getCurrentStaff(); if(!who) return;
  const model = who.hours || {};
  staffGrid.innerHTML="";
  DAYS.forEach(d=>{
    const st=model[d.key] || EMPTY_DAY;
    const row=document.createElement("div"); row.className="mrow"; row.dataset.key=d.key;

    const name=document.createElement("div"); name.textContent=d.tr; name.style.fontWeight="600";

    const toggleWrap=document.createElement("div");
    const toggle=document.createElement("input"); toggle.type="checkbox"; toggle.className="switch"; toggle.checked=!!st.enabled;
    toggleWrap.appendChild(toggle);

    const startSel=buildSelect(st.start||"09:00");
    const endSel  =buildSelect(st.end  ||"18:00");
    const setEnabled=en=>{ startSel.disabled=endSel.disabled=!en; };
    setEnabled(st.enabled); toggle.addEventListener("change",()=>setEnabled(toggle.checked));

    row.appendChild(name); row.appendChild(toggleWrap); row.appendChild(startSel); row.appendChild(endSel);
    staffGrid.appendChild(row);

    enforceBusinessBoundsForRow(row);
  });
  $("#staffName").textContent = getDisplayName(who);
}
function openStaffModal(){ renderStaffModal(); staffModal.style.display="flex"; }
$("#closeModal")?.addEventListener("click",()=>{ staffModal.style.display="none"; });
$("#cancelModal")?.addEventListener("click",()=>{ staffModal.style.display="none"; });

$("#saveModal")?.addEventListener("click", async ()=>{
  const who = getCurrentStaff(); if(!who) return;

  let ok = true;
  const updated = {};
  staffGrid.querySelectorAll(".mrow").forEach(r=>{
    const key = r.dataset.key;
    const bh = bizHours?.[key];
    const toggle = r.querySelector(".switch");
    const [s,e] = r.querySelectorAll("select.sel");

    let en = toggle.checked;
    if (bh){
      if (!bh.enabled){ en = false; }
      else if (en){
        if (toMin(s.value) < toMin(bh.start)) s.value = bh.start;
        if (toMin(e.value) > toMin(bh.end))   e.value = bh.end;
      }
    }
    if (en && toMin(s.value) >= toMin(e.value)){
      if (!moveEndAfterStart(e, s.value)) ok = false;
    }
    updated[key] = { enabled: en, start: s.value, end: e.value };
  });

  if (!ok) { alert("Çalışan için: Bitiş saati başlangıçtan sonra olmalı."); return; }

  // Firestore’a yaz
  const idx = (who.rawIndex >= 0) ? who.rawIndex : staffRaw.length;
  const nextRaw = [...staffRaw];
  nextRaw[idx] = { ...(nextRaw[idx]||{}), name: who.name, role: who.role, position: (nextRaw[idx]?.position || who.role),
                   hours: denormalizeHours(updated), services: Array.from(who.services || []) };

  const mapForTop = buildTopStaffHoursMapFromStaffRaw(nextRaw);
  try{
    await updateDoc(doc(db,"adminOnboarding",UID), {
      "step8.staff": nextRaw,
      "step8.staff_hours": mapForTop,
      "staff_hours": mapForTop,
      updatedAt: serverTimestamp()
    });
  }catch(e){
    await setDoc(doc(db,"adminOnboarding",UID), {
      "step8.staff": nextRaw,
      "step8.staff_hours": mapForTop,
      "staff_hours": mapForTop,
      updatedAt: serverTimestamp()
    }, { merge:true });
  }

  staffRaw = nextRaw;
  rebuildStaffFromRawPreserveSelection();

  staffModal.style.display="none";
});

/* ------------------------- Add/Delete (değişmedi) ------------------------- */
/* … (ekleme/silme kodlarınız aynı kalabilir; burada yer kısıtından kesiyorum) … */

/* ------------------------- Profile modal ------------------------- */
const bmOverlay = $("#bmOverlay");
const bmModal   = $("#bmModal");
const bmClose   = $("#bmClose");
const bmLogout  = $("#bmLogout");
function openBm(){ bmOverlay?.classList.add("show"); bmModal?.classList.add("show"); }
function closeBm(){ bmOverlay?.classList.remove("show"); bmModal?.classList.remove("show"); }
bmOverlay?.addEventListener("click",closeBm);
bmClose?.addEventListener("click",closeBm);
document.addEventListener("keydown",(e)=>{ if(e.key==="Escape") closeBm(); });
bmLogout?.addEventListener("click", async ()=>{ try{ await signOut(auth); }catch{} location.href="admin-register-login.html#login?return_to=staff.html"; });

/* ------------------------- AUTH + realtime ------------------------- */
setPersistence(auth, browserLocalPersistence).catch(()=>{});

onAuthStateChanged(auth, async (user)=>{
  if(!user){ location.href="admin-register-login.html#login?return_to=staff.html"; return; }
  UID = user.uid;

  try{
    const rootRef  = doc(db,"adminOnboarding",UID);
    const rootSnap = await getDoc(rootRef);
    const root     = rootSnap.exists() ? rootSnap.data() : null;

    servicesAll = Array.isArray(root?.services) ? root.services : [];
    ADMIN_NAME = (root?.step2?.adminName || root?.step2?.ownerName || root?.owner?.name || "Admin").trim();

    bizHours   = normalizeHours(
      root?.businessHours ||
      root?.step6?.businessHours ||
      root?.step6?.workingHours ||
      root?.workingHours
    );
    lastBizHoursJSON = JSON.stringify(bizHours || {});

    staffRaw   = Array.isArray(root?.step8?.staff) ? root.step8.staff
               : (Array.isArray(root?.staff) ? root.staff : []);

    topStaffHoursMap = root?.step8?.staff_hours || root?.step8?.staffHours
                    || root?.staff_hours       || root?.staffHours
                    || {};

    mountRail();
    bindTabs();
    bindServicesEvents();

    rebuildStaffFromRawPreserveSelection();

    // Realtime: businessHours değişirse hemen clamp + rehydrate
    onSnapshot(rootRef, (snap)=>{
      if (!snap.exists()) return;
      const data = snap.data() || {};

      const newBH = normalizeHours(
        data.businessHours ||
        data.step6?.businessHours ||
        data.step6?.workingHours ||
        data.workingHours
      );
      const newBHJSON = JSON.stringify(newBH || {});
      const staffSnap = Array.isArray(data?.step8?.staff) ? data.step8.staff : (Array.isArray(data?.staff) ? data.staff : []);

      // dışarıdan (başka oturumdan) personel listesi değişmişse UI’yi yenile
      if (!selfUpdating && JSON.stringify(staffSnap) !== JSON.stringify(staffRaw)) {
        staffRaw = staffSnap;
        topStaffHoursMap = data?.step8?.staff_hours || data?.staff_hours || {};
        rebuildStaffFromRawPreserveSelection();
      }

      if (!selfUpdating && newBHJSON !== lastBizHoursJSON){
        lastBizHoursJSON = newBHJSON;
        bizHours = newBH || normalizeHours({});
        clampAllStaffToBusinessHours(bizHours);
      }
    });

  }catch(e){
    console.warn("[auth load] hata:", e?.message || e);
    servicesAll = [];
    staffRaw = [];
    bizHours   = normalizeHours({});
    lastBizHoursJSON = JSON.stringify(bizHours || {});
    staff = [{
      id:"admin",
      name:ADMIN_NAME,
      isOwner:true,
      role:"Sahip",
      rawIndex:-1,
      hours: bizHours,
      services:new Set()
    }];
    mountRail(); bindTabs(); bindServicesEvents(); renderStaffList(); renderTabs();
  }
});
