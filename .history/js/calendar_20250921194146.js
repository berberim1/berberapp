/* Gün + Hafta görünümü (overlay YOK) — v5 (canonical defaultHours + staff subcollection) */
import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  doc, getDoc, onSnapshot,
  collection, query, where, orderBy, Timestamp, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

/* =============== helpers =============== */
const DAY_TR = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
const DAY_TR_SHORT = ["Paz","Pzt","Sal","Çar","Per","Cum","Cmt"];
const fmtTR  = new Intl.DateTimeFormat("tr-TR",{weekday:"short", day:"2-digit", month:"short"});
const dShort = new Intl.DateTimeFormat("tr-TR",{day:"2-digit", month:"short"});
const monthTR = (d)=> d.toLocaleString("tr-TR",{month:"long",year:"numeric"});
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const pad = (n)=>String(n).padStart(2,"0");

const IDX_TO_KEY = {0:"sun",1:"mon",2:"tue",3:"wed",4:"thu",5:"fri",6:"sat"};
const KEY_TO_IDX = {sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};
const TR_TO_IDX = { "Pazar":0, "Pazartesi":1, "Salı":2, "Çarşamba":3, "Perşembe":4, "Cuma":5, "Cumartesi":6 };

function cellH(){
  const v = getComputedStyle(document.documentElement).getPropertyValue('--cellH') || "";
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 64;
}
function cssVarPx(name, scope=document.documentElement){
  const raw = getComputedStyle(scope).getPropertyValue(name) || "0";
  return parseFloat(raw);
}
function px(n){
  const dpr = window.devicePixelRatio || 1;
  return Math.round(n * dpr) / dpr;
}
/* saat <-> float */
function floatToHM(f){
  const h = Math.floor(f || 0);
  const m = Math.round(((f || 0) - h) * 60);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function timeStrToFloat(s){ const [h,m]=String(s||"").split(":").map(Number); return (h||0)+((m||0)/60); }
function initials(n){ return (n||"?").split(" ").filter(Boolean).map(w=>w[0]).slice(0,2).join("").toUpperCase(); }
function uniqueNames(names){
  const seen = new Set(); const out = [];
  for(const raw of names){
    const name = (raw||"").trim(); if(!name) continue;
    const key = name.toLowerCase(); if(seen.has(key)) continue;
    seen.add(key); out.push(name);
  }
  return out;
}

/* defaultHours (0..6 ⇒ {open:boolean, ranges:[{startMin,endMin}]}) ↔ UI helpers */
const pad2 = (n)=>String(n).padStart(2,"0");
const m2t = (x)=>`${pad2(Math.floor((x||0)/60))}:${pad2((x||0)%60)}`;
const t2m = (t)=>{ const [h=0,m=0] = String(t||"").split(":").map(n=>+n||0); return h*60+m; };

function defaultHoursToUI(defaultHoursObj){
  const ui = {};
  Object.keys(KEY_TO_IDX).forEach(k=> ui[k] = { enabled:false, start:"10:00", end:"19:00" });
  if (!defaultHoursObj || typeof defaultHoursObj !== "object") return ui;
  for (let i=0;i<=6;i++){
    const d = defaultHoursObj[i] || defaultHoursObj[IDX_TO_KEY[i]];
    if (!d || !d.open || !Array.isArray(d.ranges) || !d.ranges.length){
      ui[IDX_TO_KEY[i]] = { enabled:false, start:"10:00", end:"19:00" };
    } else {
      const r = d.ranges[0];
      ui[IDX_TO_KEY[i]] = { enabled:true, start:m2t(r.startMin), end:m2t(r.endMin) };
    }
  }
  return ui;
}
function uiToDefaultHours(ui){
  const out = {};
  Object.keys(KEY_TO_IDX).forEach(k=>{
    const idx = KEY_TO_IDX[k];
    const d = ui?.[k] || {};
    if (!d.enabled) out[idx] = { open:false, ranges:[] };
    else {
      const s = t2m(d.start || "10:00");
      const e = t2m(d.end   || "19:00");
      out[idx] = (e<=s) ? { open:false, ranges:[] } : { open:true, ranges:[{ startMin:s, endMin:e }] };
    }
  });
  return out;
}
function trHoursToUI(tr){
  const ui = {};
  Object.keys(KEY_TO_IDX).forEach(k=> ui[k] = { enabled:false, start:"10:00", end:"19:00" });
  if (!tr || typeof tr !== "object") return ui;
  Object.keys(tr).forEach(trKey=>{
    const idx = TR_TO_IDX[trKey]; if (idx == null) return;
    const k = IDX_TO_KEY[idx];
    const row = tr[trKey] || {};
    const enabled = (row.open === true) || (!!row.from && !!row.to);
    ui[k] = enabled ? { enabled:true, start:row.from || "10:00", end:row.to || "19:00" } : { enabled:false, start:"10:00", end:"19:00" };
  });
  return ui;
}
function computeHoursOverride(defaultWeek, staffUi){
  const staffAsDefault = uiToDefaultHours(staffUi);
  const out = {};
  for (let i=0;i<=6;i++){
    const base = defaultWeek?.[i] || { open:false, ranges:[] };
    const mine = staffAsDefault?.[i] || { open:false, ranges:[] };
    if (JSON.stringify(base) !== JSON.stringify(mine)){
      out[i] = mine;
    }
  }
  return Object.keys(out).length ? out : null;
}

/* =============== Modal Manager (overlay yok) =============== */
function closeAllModals() {
  // mini takvim
  const calPop = document.getElementById('calendarPopover');
  calPop?.classList.remove('open');
  document.getElementById('dateLabelWrap')?.setAttribute('aria-expanded','false');

  // personel popover
  document.getElementById('staffPop')?.classList.remove('open');

  // bildirim
  document.getElementById('notify')?.classList.remove('open');

  // profil (business) modal
  const bm = document.getElementById('bmModal');
  bm?.classList.remove('show');
  bm?.setAttribute('aria-hidden','true');

  // varsa switch-business
  const sb = document.querySelector('.sb-modal')?.parentElement;
  sb?.setAttribute('aria-hidden','true');
}
function openModal({ id, panelClassOpen='open', ariaTargetId }) {
  closeAllModals();
  const panel = document.getElementById(id);
  panel?.classList.add(panelClassOpen);
  (ariaTargetId ? document.getElementById(ariaTargetId) : panel)?.setAttribute('aria-hidden','false');
  panel?.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])')?.focus();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllModals(); });
document.addEventListener('mousedown', e => {
  const anyOpen =
    document.querySelector('.center-pop.open') ||
    document.getElementById('notify')?.classList.contains('open') ||
    document.getElementById('bmModal')?.classList.contains('show') ||
    document.getElementById('staffPop')?.classList.contains('open');
  if (!anyOpen) return;
  const inside =
    e.target.closest('#calendarPopover') ||
    e.target.closest('#notify') ||
    e.target.closest('#bmModal') ||
    e.target.closest('.sb-modal') ||
    e.target.closest('#staffPop') ||
    e.target.closest('#dateLabelWrap') ||
    e.target.closest('#bellBtn') ||
    e.target.closest('#topProfileBtn');
  if (!inside) closeAllModals();
});
window.openModal = openModal;
window.closeAllModals = closeAllModals;

/* Profil modalını doldurur (Türkçe alanlar) */
function setBusinessModalData({ name="", email="", business="" }) {
  const nameEl  = document.getElementById('bmName');
  const emailEl = document.getElementById('bmMail');
  const listEl  = document.getElementById('bmList');

  if (nameEl)  nameEl.textContent  = name || "—";
  if (emailEl) emailEl.textContent = email || "";

  if (listEl) {
    listEl.innerHTML = "";
    const item = document.createElement("div");
    item.className = "bm-item";
    item.innerHTML = `
      <div class="bm-dot"></div>
      <div class="bm-item-main">
        <div class="bm-biz">${business || 'İşletme'}</div>
        <div class="bm-sub">${name || '—'}</div>
      </div>`;
    listEl.appendChild(item);
  }
}
window.setBusinessModalData = setBusinessModalData;

/* =============== state =============== */
let current = new Date();
let view = "day";

let ADMIN_UID = "";
let BUSINESS_ID = "";
let OWNER_UID = "";
let OWNER = "Ben";

let BIZ_REF = null;
let AO_REF  = null;

let defaultWeek = {};         // businesses.defaultHours (0..6)
let bizHoursUI = {};          // UI (mon..sun) from defaultWeek

let STAFF_DOCS = [];          // [{id, data}]
let STAFF_NAMES = [];         // string[]
let selectedStaff = [];

let BOOKINGS = [];
let unsubBookings = null;

/* =============== AUTH =============== */
onAuthStateChanged(auth, async (user)=>{
  if(!user){ location.replace("admin-register-login.html#login"); return; }
  closeAllModals();
  ADMIN_UID = user.uid;

  await resolveBusinessAndLoad(user);

  injectBookingStyles();
  boot();
  watchBookingsForCurrent();
});

/* =============== businessId resolve + load canonical =============== */
async function resolveBusinessAndLoad(user){
  // businessId: roles → AO.businessId → uid
  try{
    const roleSnap = await getDoc(doc(db,"roles", user.uid));
    if (roleSnap.exists()){
      BUSINESS_ID = roleSnap.data()?.businessId || "";
    }
  }catch{}
  if (!BUSINESS_ID){
    try{
      const ao0 = await getDoc(doc(db,"adminOnboarding", user.uid));
      if (ao0.exists()) BUSINESS_ID = ao0.data()?.businessId || "";
    }catch{}
  }
  if (!BUSINESS_ID) BUSINESS_ID = user.uid;

  BIZ_REF = doc(db, "businesses", BUSINESS_ID);
  AO_REF  = doc(db, "adminOnboarding", user.uid);

  // initial data read
  const [bizSnap, aoSnap] = await Promise.all([getDoc(BIZ_REF), getDoc(AO_REF)]);
  const biz = bizSnap.exists() ? (bizSnap.data()||{}) : {};
  const ao  = aoSnap.exists()  ? (aoSnap.data()||{})   : {};

  OWNER_UID = biz?.ownerUid || user.uid;
  OWNER     = (biz?.owner?.name || ao?.owner?.name || ao?.step2?.adminName || "Admin").trim();

  // defaultHours → UI
  defaultWeek = biz?.defaultHours || {};
  if (!Object.keys(defaultWeek).length){
    // fallback eski TR workingHours → defaultHours
    const tr = ao?.step6?.workingHours || ao?.workingHours || {};
    const ui = trHoursToUI(tr);
    defaultWeek = uiToDefaultHours(ui);
    // best-effort merge et (biz'e yaz)
    try { await setDoc(BIZ_REF, { defaultHours: defaultWeek }, { merge:true }); } catch {}
  }
  bizHoursUI = defaultHoursToUI(defaultWeek);

  // staff realtime
  onSnapshot(collection(BIZ_REF,"staff"), (qs)=>{
    STAFF_DOCS = [];
    qs.forEach(d=> STAFF_DOCS.push({ id:d.id, data:d.data() || {} }));
    rebuildStaffNamesFromDocs(ao);
  });

  // business realtime (varsayılan saat değişimi)
  onSnapshot(BIZ_REF, (snap)=>{
    if (!snap.exists()) return;
    const data = snap.data() || {};
    const wk = data.defaultHours || {};
    const j1 = JSON.stringify(wk||{});
    const j2 = JSON.stringify(defaultWeek||{});
    if (j1 !== j2){
      defaultWeek = wk;
      bizHoursUI = defaultHoursToUI(defaultWeek);
      // personel görünümünü saatlere göre güncelle
      (view==="day") ? renderDay() : renderWeek();
      watchBookingsForCurrent();
    }
  });

  // profile modal infos
  const userEmail = user.email || "";
  const bizName   = biz?.business?.name || ao?.business?.name || ao?.step2?.businessName || "";
  setBusinessModalData({ name: OWNER, email: userEmail, business: bizName });
}

/* STAFF isim listesini oluştur + popover UI */
function rebuildStaffNamesFromDocs(aoRoot){
  const arr = [];
  const fromSub = STAFF_DOCS.map(x => (x.data?.name || "").trim()).filter(Boolean);

  if (fromSub.length){
    arr.push(...fromSub);
  } else {
    // fallback: AO step8.staff veya staff dizisi (eski)
    const rawStaff = Array.isArray(aoRoot?.step8?.staff) ? aoRoot.step8.staff
                   : (Array.isArray(aoRoot?.staff) ? aoRoot.staff : []);
    rawStaff.forEach(s => {
      const nm = (s?.name || "").trim(); if (nm) arr.push(nm);
    });
  }

  // sahibin görünmesi için ekle
  arr.unshift(OWNER);

  STAFF_NAMES = uniqueNames(arr);
  if (STAFF_NAMES.length === 0) STAFF_NAMES = [OWNER];
  if (!selectedStaff.length) selectedStaff = [...STAFF_NAMES];

  buildStaffPopover();
  (view==="day") ? renderDay() : renderWeek();
}

/* =============== yardımcılar (sahip ayıklama & ad birleştirme) =============== */
function isOwnerRecordByDoc(rec){
  const d = rec?.data || {};
  return (d.uid && OWNER_UID && d.uid === OWNER_UID) || (rec.id === OWNER_UID);
}
function canonicalName(name, ownerName){
  const t = String(name||"").trim().toLowerCase();
  const o = String(ownerName||"").trim().toLowerCase();
  if (!t) return "";
  if (t === "admin" || t === "owner" || t === "sahip" || t === o) return ownerName;
  return String(name||"").trim();
}

/* =============== HOURS: effective (defaultWeek + hoursOverride) =============== */
function effectiveDayForStaff(idx, staffName){
  // base
  const base = defaultWeek?.[idx] || { open:false, ranges:[] };

  // staff override
  let override = null;
  const who = STAFF_DOCS.find(rec => (rec.data?.name || "").trim().toLowerCase() === String(staffName||"").trim().toLowerCase());
  if (who && who.data?.hoursOverride && who.data.hoursOverride[idx] != null){
    override = who.data.hoursOverride[idx];
  }

  const eff = override ? override : base;
  if (!eff.open || !Array.isArray(eff.ranges) || !eff.ranges.length){
    return { open:false, start:10, end:19 };
  }
  const r = eff.ranges[0];
  return { open:true, start:(r.startMin/60), end:(r.endMin/60) };
}

function hoursFor(name, d=current){
  const idx = d.getDay(); // 0..6
  return effectiveDayForStaff(idx, name);
}

/* sabit günlük pencere 08:00–24:00 */
const VSTART = 8, VEND = 24;

/* Off band */
function addOff(container, fromH, toH){
  const CH = cellH();
  const s = Math.max(fromH, VSTART);
  const e = Math.min(toH, VEND);
  if(e<=s) return;
  const band=document.createElement("div");
  band.className="offband";
  band.style.top    = px((s - VSTART)*CH) + "px";
  band.style.height = px((e - s)*CH) + "px";
  container.appendChild(band);
}

/* =============== BOOKING: yardımcılar =============== */
function injectBookingStyles(){
  if(document.getElementById("bk-style")) return;
  const css = `
    .staff-col{position:relative}
    .booking{position:absolute;left:6px;right:6px;background:#0ea5e9;color:#fff;border-radius:10px;padding:6px 8px;
             box-shadow:0 8px 18px rgba(0,0,0,.18);font-weight:800;font-size:14px;line-height:1.2}
    .booking .b-time{font-size:12px;font-weight:700;opacity:.95}
    .wk-chip{display:inline-block;margin:4px 4px 0 0;background:#0ea5e9;color:#fff;border-radius:999px;
             padding:6px 10px;font-weight:800;font-size:12px;box-shadow:0 6px 12px rgba(0,0,0,.15)}
  `;
  const el=document.createElement("style"); el.id="bk-style"; el.textContent=css; document.head.appendChild(el);
}

function dayStart(d){ const x=new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0); return x; }
function dayEnd(d){ const x=new Date(d.getFullYear(), d.getMonth(), d.getDate()+1, 0,0,0,0); return x; }
function weekStart(d){ const s=new Date(d); s.setDate(s.getDate()-s.getDay()); return dayStart(s); }
function weekEnd(d){ const s=weekStart(d); const e=new Date(s); e.setDate(e.getDate()+7); return e; }

function fmtHM(date){ return `${pad(date.getHours())}:${pad(date.getMinutes())}`; }

function bookingStaffName(b){
  const raw = b.staffName || b.staff || b.assignedTo || OWNER;
  return canonicalName(raw, OWNER) || OWNER;
}

/* Firestore’dan aktif aralık için canlı dinleme (businessId -> BUSINESS_ID) */
function watchBookingsForCurrent(){
  if(!BUSINESS_ID) return;
  unsubBookings?.();

  const rangeStart = (view==="day") ? dayStart(current) : weekStart(current);
  const rangeEnd   = (view==="day") ? dayEnd(current)   : weekEnd(current);

  const q = query(
    collection(db, "bookings"),
    where("businessId","==", BUSINESS_ID),
    where("startAt", ">=", Timestamp.fromDate(rangeStart)),
    where("startAt", "<",  Timestamp.fromDate(rangeEnd)),
    orderBy("startAt","asc")
  );
  unsubBookings = onSnapshot(q, (qs)=>{
    BOOKINGS = qs.docs.map(d=>({ id:d.id, ...d.data() }));
    (view==="day") ? renderDay() : renderWeek();
  }, (err)=>{ console.error("[bookings] watch error:", err); });
}

/* =============== SCROLL HELPERS =============== */
function scrollToStart(){
  requestAnimationFrame(()=>{
    const cal = document.querySelector('.calendar');
    if (cal) { cal.scrollLeft = 0; requestAnimationFrame(()=> cal.scrollLeft = 0); }
    const week = document.getElementById('weekView');
    if (week) { week.scrollLeft = 0; requestAnimationFrame(()=> week.scrollLeft = 0); }
  });
}

/* =============== RENDER (DAY) =============== */
function renderDay(){
  $("#dayView").hidden = false;
  $("#weekView").hidden = true;

  $("#dateLabel").textContent = fmtTR.format(current);
  $("#dateRange").textContent = "";

  const row  = $("#staffRow");
  const grid = $("#dayGrid");
  row.innerHTML = "";
  grid.innerHTML = "";

  const timeHead = document.createElement("div");
  timeHead.className = "time-head";
  row.appendChild(timeHead);

  const CH = cellH();
  const HOURS = VEND - VSTART;
  const colH  = px(HOURS * CH) + "px";
  document.documentElement.style.setProperty("--calH", colH);

  const timeCol = document.createElement("div");
  timeCol.id = "timeCol";
  timeCol.className = "time-col";
  timeCol.style.height = colH;

  for (let h = VSTART; h < VEND; h++) {
    const t = document.createElement("div");
    t.className = "time-cell";
    t.textContent = `${String(h).padStart(2,'0')}:00`;
    t.style.height = px(CH) + "px";
    timeCol.appendChild(t);
  }
  grid.appendChild(timeCol);

  selectedStaff.forEach(name=>{
    const {open,start,end} = hoursFor(name, current);

    const h=document.createElement("div");
    h.className="staff-head";
    h.dataset.head=name;
    h.innerHTML = `
      <div class="avatar">${initials(name)}</div>
      <div class="meta">
        <div class="name">${name}</div>
        <div class="sub">${ open ? `${floatToHM(start)}–${floatToHM(end)}` : "Kapalı" }</div>
      </div>`;
    row.appendChild(h);

    const c=document.createElement("div");
    c.className="staff-col";
    c.dataset.staff=name;
    c.style.height = colH;

    for (let hh = VSTART; hh < VEND; hh++) {
      const cell=document.createElement("div");
      cell.className="hour-cell";
      cell.style.height = px(CH) + "px";
      c.appendChild(cell);
    }

    if(open){
      addOff(c, VSTART, start);
      addOff(c, end, VEND);
    }else{
      c.classList.add("closed");
      const full=document.createElement("div");
      full.className="offband";
      full.style.top="0";
      full.style.height=colH;
      c.appendChild(full);
    }

    grid.appendChild(c);
  });

  {
    const cal   = document.querySelector('.calendar');
    const calW  = (cal?.clientWidth || 0);
    const timeW = cssVarPx('--timeW', document.documentElement) || 80;

    const colW = Math.max(220, Math.floor((calW - timeW) / 2));

    const tpl  = `var(--timeW) repeat(2, ${colW}px)`;
    const auto = `${colW}px`;

    row.style.gridTemplateColumns  = tpl;
    grid.style.gridTemplateColumns = tpl;
    row.style.gridAutoColumns      = auto;
    grid.style.gridAutoColumns     = auto;

    row.style.gridAutoFlow  = 'column';
    grid.style.gridAutoFlow = 'column';

    const min = `calc(var(--timeW) + ${2*colW}px)`;
    row.style.minWidth  = min;
    grid.style.minWidth = min;

    if (cal) cal.style.overflowX = 'auto';
  }

  drawDayBookings();
  scrollToStart();
}

/* Gün görünümünde randevuları sütunlarına bas */
function drawDayBookings(){
  const CH = cellH();
  const sDay = dayStart(current), eDay = dayEnd(current);

  BOOKINGS
    .filter(b => {
      const d = b.startAt instanceof Timestamp ? b.startAt.toDate() : new Date(b.startAt);
      return d >= sDay && d < eDay;
    })
    .forEach(b => {
      const start = b.startAt.toDate();
      const end   = b.endAt?.toDate?.() || new Date(start.getTime() + (b.totalMin||30)*60000);

      const stf = bookingStaffName(b);
      const col = $(`.staff-col[data-staff="${CSS.escape(stf)}"]`);
      if(!col) return;

      const sh = start.getHours() + start.getMinutes()/60;
      const eh = end.getHours() + end.getMinutes()/60;
      const top = (Math.max(sh, VSTART) - VSTART) * cellH();
      const h   = Math.max(14, (Math.min(eh, VEND) - Math.max(sh, VSTART)) * cellH() - 6);

      const el = document.createElement("div");
      el.className = "booking";
      const label = (b.items||[]).map(i=>i.name).join(", ") || "Randevu";
      el.innerHTML = `<div>${label}</div><div class="b-time">${pad(start.getHours())}:${pad(start.getMinutes())} – ${pad(end.getHours())}:${pad(end.getMinutes())}</div>`;
      el.style.top = px(top) + "px";
      el.style.height = px(h) + "px";
      col.appendChild(el);
    });
}

/* =============== RENDER (WEEK) =============== */
function startOfWeek(d){
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function endOfWeek(d){
  const s = startOfWeek(d);
  const e = new Date(s); e.setDate(s.getDate()+6);
  return e;
}

function renderWeek(){
  $("#dayView").hidden = true;
  $("#weekView").hidden = false;

  const s = startOfWeek(current), e = endOfWeek(current);
  $("#dateLabel").textContent = `${dShort.format(s)} – ${dShort.format(e)}`;
  $("#dateRange").textContent = "";

  const head = $("#wkHead");
  const grid = $("#wkGrid");
  head.innerHTML = "";
  grid.innerHTML = "";

  const left = document.createElement("div");
  left.className = "left";
  left.textContent = "";
  head.appendChild(left);

  for(let i=0;i<7;i++){
    const d=new Date(s); d.setDate(s.getDate()+i);
    const btn = document.createElement("button");
    btn.className = "wk-day-btn";
    btn.innerHTML = `<div class="date">${DAY_TR_SHORT[d.getDay()]} ${String(d.getDate()).padStart(2,"0")}</div>
                     <div class="sub"> </div>`;
    btn.addEventListener("click", ()=>{
      current = new Date(d);
      setView("day");
    });
    const day = document.createElement("div");
    day.className = "wk-day";
    day.appendChild(btn);
    head.appendChild(day);
  }

  selectedStaff.forEach(name=>{
    const staffCell = document.createElement("div");
    staffCell.className = "wk-staff";
    staffCell.innerHTML = `<div class="avatar">${initials(name)}</div><div>${name}</div>`;
    staffCell.dataset.staff = name;
    grid.appendChild(staffCell);

    for(let i=0;i<7;i++){
      const d=new Date(s); d.setDate(s.getDate()+i);
      const col = document.createElement("div");
      col.className = "wk-col";
      const inner = document.createElement("div");
      inner.className = "wk-col-inner";
      inner.dataset.staff = name;
      inner.dataset.date  = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

      const idx = d.getDay();
      const eff = effectiveDayForStaff(idx, name);
      if(!eff.open){ inner.classList.add("closed"); }
      col.appendChild(inner);
      grid.appendChild(col);
    }
  });

  const wkView = $("#weekView");
  const headH  = $("#wkHead").getBoundingClientRect().height || 0;
  const rowH = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--wkRowH')
  ) || 220;
  const visibleRows = 2;
  wkView.style.maxHeight = px(headH + visibleRows*rowH + 24) + "px";
  wkView.style.overflowY = (selectedStaff.length > visibleRows) ? "auto" : "visible";

  drawWeekBookings();
  scrollToStart();
}

/* Hafta görünümünde küçük yonga */
function drawWeekBookings(){
  const ws = weekStart(current), we = weekEnd(current);

  const cellMap = {};
  $$(".wk-col-inner").forEach(el=>{
    cellMap[`${el.dataset.staff}__${el.dataset.date}`] = el;
  });

  BOOKINGS
    .filter(b=>{
      const d = b.startAt.toDate();
      return d >= ws && d < we;
    })
    .forEach(b=>{
      const start = b.startAt.toDate();
      const stf   = bookingStaffName(b);
      const key   = `${stf}__${start.getFullYear()}-${pad(start.getMonth()+1)}-${pad(start.getDate())}`;
      const cell  = cellMap[key];
      if(!cell) return;

      const label = (b.items||[]).map(i=>i.name).join(", ") || "Randevu";
      const chip  = document.createElement("span");
      chip.className = "wk-chip";
      chip.textContent = `${fmtHM(start)} • ${label}`;
      cell.appendChild(chip);
    });
}

/* =============== VIEW SWITCH =============== */
function setView(next){
  view = next;
  $("#currentView").textContent = (view==="day" ? "Gün" : "Hafta");
  if(view==="day") renderDay(); else renderWeek();
  watchBookingsForCurrent();
}
(function bindViewSelect(){
  const chip = $("#viewChip");
  const pop  = $("#viewPop");
  chip?.addEventListener("click", ()=> pop.classList.toggle("open"));
  document.addEventListener("mousedown",(e)=>{
    if(pop?.classList.contains("open") && !pop.contains(e.target) && !chip.contains(e.target))
      pop.classList.remove("open");
  });
  $$(".view-item").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      $$(".view-item").forEach(i=>i.classList.remove("selected"));
      btn.classList.add("selected");
      const v = btn.dataset.view === "Hafta" ? "week" : "day";
      setView(v);
      pop.classList.remove("open");
    });
  });
})();

/* =============== PERSONEL & KAYNAKLAR =============== */
function buildStaffPopover(){
  const wrap = $("#staffChkWrap");
  const btn  = $("#staffBtn");
  const pop  = $("#staffPop");
  if(!wrap || !btn || !pop) return;

  wrap.innerHTML = `
    <label class="chk"><input type="checkbox" id="allChk" checked><span>Tümünü seç</span></label>
    <div id="staffChkList"></div>
  `;
  const list = $("#staffChkList");
  list.innerHTML = "";
  STAFF_NAMES.forEach(n=>{
    const id = "st_"+n.replace(/\s+/g,"_");
    const row=document.createElement("label");
    row.className="chk";
    row.innerHTML = `<input type="checkbox" id="${id}" class="staffChk" data-name="${n}" ${selectedStaff.includes(n)?"checked":""}>
                     <span>${n}</span><span class="dot"></span>`;
    list.appendChild(row);
  });

  const all = $("#allChk");
  const boxes = ()=> $$(".staffChk");
  const syncAll = ()=>{ all.checked = boxes().every(b=>b.checked); };
  syncAll();

  all.addEventListener("change",()=>{ boxes().forEach(b=> b.checked = all.checked); });

  if(!btn.dataset.bound){
    btn.dataset.bound="1";
    btn.addEventListener("click",()=> pop.classList.toggle("open"));
    document.addEventListener("mousedown",(e)=>{
      if(pop.classList.contains("open") && !pop.contains(e.target) && !btn.contains(e.target))
        pop.classList.remove("open");
    });
  }

  $("#applyStaff")?.addEventListener("click",()=>{
    const sel = boxes().filter(b=>b.checked).map(b=>b.dataset.name);
    selectedStaff = sel.length ? sel : [...STAFF_NAMES];
    pop.classList.remove("open");
    (view==="day") ? renderDay() : renderWeek();
    watchBookingsForCurrent();
  });

  list.addEventListener("change", syncAll);
}

/* =============== DATE NAV =============== */
$("#prevDay")?.addEventListener("click",()=>{
  current.setDate(current.getDate() + (view==="week" ? -7 : -1));
  (view==="day") ? renderDay() : renderWeek();
  watchBookingsForCurrent();
});
$("#nextDay")?.addEventListener("click",()=>{
  current.setDate(current.getDate() + (view==="week" ? 7 : 1));
  (view==="day") ? renderDay() : renderWeek();
  watchBookingsForCurrent();
});

/* =============== TODAY =============== */
$("#todayBtn")?.addEventListener("click", ()=>{
  const now = new Date();
  current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  (view==="day") ? renderDay() : renderWeek();
  watchBookingsForCurrent();
});

/* =============== MINI CAL =============== */
const pop = $("#calendarPopover");
const dateWrap = $("#dateLabelWrap");
let calCursor = new Date(current.getFullYear(), current.getMonth(), 1);
dateWrap?.addEventListener("click",()=>{
  const willOpen = !pop.classList.contains("open");
  closeAllModals();
  if (willOpen) {
    pop.classList.add("open");
    dateWrap.setAttribute("aria-expanded","true");
    calCursor = new Date(current.getFullYear(), current.getMonth(), 1);
    drawMini(calCursor);
  }
});
document.addEventListener("mousedown",(e)=>{
  if(pop?.classList.contains("open") && !pop.contains(e.target) && !dateWrap.contains(e.target)){
    pop.classList.remove("open");
    dateWrap.setAttribute("aria-expanded","false");
  }
});
$("#calPrev")?.addEventListener("click",(e)=>{ e.stopPropagation(); calCursor.setMonth(calCursor.getMonth()-1); drawMini(calCursor); });
$("#calNext")?.addEventListener("click",(e)=>{ e.stopPropagation(); calCursor.setMonth(calCursor.getMonth()+1); drawMini(calCursor); });

function drawMini(ref){
  const mini=$("#miniCal"); if(!mini) return;
  mini.innerHTML = "";
  $("#calMonthLabel").textContent = monthTR(ref);
  const y=ref.getFullYear(), m=ref.getMonth();
  const start=new Date(y,m,1), end=new Date(y,m+1,0);
  const lead=start.getDay(), total=lead+end.getDate(), cells=Math.ceil(total/7)*7;
  const today=new Date(); today.setHours(0,0,0,0);

  for(let i=0;i<cells;i++){
    const day=i-lead+1; const cell=document.createElement("div"); cell.className="cell";
    if(day>0 && day<=end.getDate()){
      const d=new Date(y,m,day); const eq = d.toDateString()===current.toDateString();
      cell.textContent = day;
      if(today.toDateString()===d.toDateString()) cell.classList.add("today");
      if(eq) cell.classList.add("selected");
      cell.addEventListener("click",()=>{
        current=new Date(y,m,day);
        (view==="day") ? renderDay() : renderWeek();
        pop.classList.remove("open");
        dateWrap.setAttribute("aria-expanded","false");
        watchBookingsForCurrent();
      });
    }else cell.style.visibility="hidden";
    mini.appendChild(cell);
  }
}

/* =============== NOTIFY & LOGOUT =============== */
$("#bellBtn")?.addEventListener("click",()=>{
  openModal({ id:'notify', panelClassOpen:'open' });
});
$("#notifyClose")?.addEventListener("click",closeAllModals);

$("#bmLogout")?.addEventListener("click", async ()=>{
  try { await signOut(auth); } catch {}
  location.href="index.html";
});

/* =============== RAIL PROFİL TETİKLEYİCİ =============== */
document.addEventListener('click', (e)=>{
  const trigger = e.target.closest('.avatar-btn, #bmOpen, #topProfileBtn, [data-open="bm"], #railProfile, [data-role="profile"]');
  if(!trigger) return;
  e.preventDefault();
  e.stopPropagation();
  const bm = document.getElementById('bmModal');
  bm?.classList.add('show');
  bm?.setAttribute('aria-hidden','false');
}, true);
$("#bmClose")?.addEventListener('click', closeAllModals);

/* =============== BOOT =============== */
function boot(){
  current = new Date();
  setView("day");
  drawMini(new Date(current.getFullYear(), current.getMonth(), 1));
}

/* Hücre yüksekliği değiştiğinde yeniden çiz (masaüstü) */
window.addEventListener("resize", ()=>{
  (view==="day") ? renderDay() : renderWeek();
}, { passive:true });
