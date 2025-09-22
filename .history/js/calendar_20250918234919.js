/* Gün + Hafta görünümü
   Firestore: adminOnboarding/{uid}
   step2.adminName, step6.workingHours, step8.staff[] (opsiyonel personel saatleri)
   + bookings: businessId, startAt, endAt, items[], totalPrice, staffName? (opsiyonel)
*/
import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  doc, getDoc,
  collection, query, where, orderBy, onSnapshot, Timestamp
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

/* HÜCRE YÜKSEKLİĞİNİ CSS'ten oku (ondalık kalsın) */
function cellH(){
  const v = getComputedStyle(document.documentElement).getPropertyValue('--cellH') || "";
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 64;
}
/* CSS değişkenini px cinsinden sayıya çevir */
function cssVarPx(name, scope=document.documentElement){
  const raw = getComputedStyle(scope).getPropertyValue(name) || "0";
  return parseFloat(raw);
}

/* Sub-pixel ölçüleri fiziksel piksele kilitle */
function px(n){
  const dpr = window.devicePixelRatio || 1;
  return Math.round(n * dpr) / dpr;
}

/* float(9.5) -> "09:30" | "09:00" */
function floatToHM(f){
  const h = Math.floor(f || 0);
  const m = Math.round(((f || 0) - h) * 60);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
/* "09:30" -> 9.5 */
function timeStrToFloat(s){ const [h,m]=String(s||"").split(":").map(Number); return (h||0)+((m||0)/60); }
function initials(n){ return (n||"?").split(" ").filter(Boolean).map(w=>w[0]).slice(0,2).join("").toUpperCase(); }

/* case-insensitive, trim’li tekilleştirme (ilk görüleni korur) */
function uniqueNames(names){
  const seen = new Set(); const out = [];
  for(const raw of names){
    const name = (raw||"").trim(); if(!name) continue;
    const key = name.toLowerCase(); if(seen.has(key)) continue;
    seen.add(key); out.push(name);
  }
  return out;
}

/* =============== Modal Manager =============== */
function closeAllModals() {
  // mini takvim
  const calPop = document.getElementById('calendarPopover');
  calPop?.classList.remove('open');
  document.getElementById('dateLabelWrap')?.setAttribute('aria-expanded','false');

  // personel popover
  document.getElementById('staffPop')?.classList.remove('open');

  // bildirim
  document.getElementById('notify')?.classList.remove('open');

  // business modal
  document.getElementById('bmOverlay')?.classList.remove('show');
  const bm = document.getElementById('bmModal');
  bm?.classList.remove('show');
  bm?.setAttribute('aria-hidden','true');

  // switch-business (sb-*)
  document.getElementById('sbOverlay')?.classList.remove('show');
  const sb = document.querySelector('.sb-modal')?.parentElement;
  sb?.setAttribute('aria-hidden','true');

  // genel backdrop
  document.getElementById('backdrop')?.classList.remove('show');
}
function openModal({ id, overlayId, panelClassOpen='open', ariaTargetId }) {
  closeAllModals();
  document.getElementById('backdrop')?.classList.add('show');
  if (overlayId) document.getElementById(overlayId)?.classList.add('show');
  const panel = document.getElementById(id);
  panel?.classList.add(panelClassOpen);
  (ariaTargetId ? document.getElementById(ariaTargetId) : panel)?.setAttribute('aria-hidden','false');
  // ilk odaklanabilir elemana fokus
  panel?.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])')?.focus();
}
// ESC ve dışarı tıkla
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllModals(); });
document.addEventListener('mousedown', e => {
  const anyOpen =
    document.querySelector('.center-pop.open') ||
    document.getElementById('notify')?.classList.contains('open') ||
    document.getElementById('bmModal')?.classList.contains('show') ||
    document.getElementById('sbOverlay')?.classList.contains('show') ||
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
// global kullanıma aç
window.openModal = openModal;
window.closeAllModals = closeAllModals;

/* Profil modalını doldurur */
function setBusinessModalData({ name="", email="", business="" }) {
  const nameEl  = document.getElementById('bmUserName');
  const emailEl = document.getElementById('bmUserEmail');
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
        <div class="bm-biz">${business || 'Business'}</div>
        <div class="bm-sub">${name || '—'}</div>
      </div>`;
    listEl.appendChild(item);
  }
}
window.setBusinessModalData = setBusinessModalData;

/* =============== state =============== */
let current = new Date();          // referans gün
let view = "day";                  // "day" | "week"
let OWNER = "Ben";
let STAFF = [];                    // [OWNER, ...çalışanlar]
let WORKING_HOURS = {};            // işletme geneli (TR gün anahtarları)
let STAFF_HOURS = {};              // personel bazlı saatler (varsa)
let selectedStaff = [];            // filtre (Personel & Kaynaklar)

/* RANDEVULAR */
let BOOKINGS = [];                 // aktif aralıktaki kayıtlar
let unsubBookings = null;          // onSnapshot unsubscribe
let ADMIN_UID = "";                // auth uid == businessId

/* =============== AUTH =============== */
onAuthStateChanged(auth, async (user)=>{
  if(!user){ location.replace("admin-register-login.html#login"); return; }
  closeAllModals();
  ADMIN_UID = user.uid;

  await loadFromFirestore(user.uid);

  // Profil modalını doldur
  try {
    const userEmail = user.email || "";
    const snapForBiz = await getDoc(doc(db, "adminOnboarding", user.uid));
    const dataForBiz = snapForBiz.exists() ? (snapForBiz.data() || {}) : {};
    const bizName =
      dataForBiz.step1?.businessName ||
      dataForBiz.step4?.businessName ||
      dataForBiz.business?.name ||
      dataForBiz.shopName ||
      "";
    setBusinessModalData({ name: OWNER, email: userEmail, business: bizName });
  } catch {
    setBusinessModalData({ name: OWNER, email: user.email || "", business: "" });
  }

  injectBookingStyles();
  boot();
  watchBookingsForCurrent();       // ilk sorgu
});

/* =============== yardımcılar (sahip ayıklama & ad birleştirme) =============== */
function isOwnerRecord(s, ownerName){
  const role = (s?.role || s?.position || "").toLowerCase();
  const nm   = (s?.name || "").trim().toLowerCase();
  const o    = (ownerName || "").trim().toLowerCase();
  return role === "sahip" || role === "owner" || role === "admin" || nm === o;
}
// “Admin / Owner / Sahip / owner adı” → tek bir kanonik isim (OWNER)
function canonicalName(name, ownerName){
  const t = String(name||"").trim().toLowerCase();
  if(!t) return "";
  if (t === "admin" || t === "owner" || t === "sahip" || t === String(ownerName||"").trim().toLowerCase()) {
    return ownerName; // tekilleştir
  }
  return String(name||"").trim();
}

/* =============== LOAD DATA (güncellendi) =============== */
async function loadFromFirestore(uid){
  const snap = await getDoc(doc(db,"adminOnboarding",uid));
  if(!snap.exists()){ console.warn("adminOnboarding yok"); return; }

  const data = snap.data() || {};
  const s2 = data.step2 || {};

  // ---- Sahip adı (önce step2, yoksa root.owner.name) ----
  OWNER =
    (s2.adminName || s2.ownerName || data.owner?.name || "Ben").trim();

  // ---- Dükkan çalışma saatleri (önce step6, yoksa root.workingHours) ----
  WORKING_HOURS =
    (data.step6?.workingHours || data.workingHours || {}) || {};

  // ---- Personel listesi (önce step8.staff, yoksa root.staff) ----
  const rawStaff = Array.isArray(data.step8?.staff)
    ? data.step8.staff
    : (Array.isArray(data.staff) ? data.staff : []);

  // sahip kaydını ayıkla + sadece isimleri çek
  const staffArr = rawStaff
    .filter(x => !isOwnerRecord(x, OWNER))
    .map(x => (typeof x?.name === "string" ? x.name.trim() : ""))
    .filter(Boolean);

  // Admin + personeller -> tekilleştir
  STAFF = uniqueNames([OWNER, ...staffArr]);
  if (STAFF.length === 0) STAFF = [OWNER];
  selectedStaff = [...STAFF];

  // ---- Personel bazlı saatler ----
  STAFF_HOURS = {};

  // 1) personel objelerinin içindeki çalışma saatleri
  rawStaff.forEach(s=>{
    const name = canonicalName(s?.name || "", OWNER);
    if(!name) return;
    const perHours = s.workingHours || s.weeklyHours || s.hours || s.staff_hours || {};
    if (perHours && typeof perHours === "object") {
      STAFF_HOURS[name] = perHours;
    }
  });

  // 2) üst seviye haritalar (hem root hem step8) → kanonik isme taşı
  const applyTopMap = (mapObj)=>{
    if (!mapObj || typeof mapObj !== "object") return;
    Object.keys(mapObj).forEach(keyName=>{
      const name = canonicalName(keyName, OWNER);
      if(!name) return;
      if (!STAFF.some(n => n.toLowerCase() === name.toLowerCase())) {
        STAFF.push(name); selectedStaff.push(name);
      }
      const hours = mapObj[keyName];
      if (hours && typeof hours === "object") {
        STAFF_HOURS[name] = hours;
      }
    });
  };
  applyTopMap(data.staff_hours || data.staffHours);
  applyTopMap(data.step8?.staff_hours || data.step8?.staffHours);

  // Personel & Kaynaklar popover’ını tazele
  buildStaffPopover();
}


/* =============== HOURS HELPERS =============== */
function hoursFor(name, d=current){
  const dayTR = DAY_TR[d.getDay()];
  const biz = WORKING_HOURS?.[dayTR] || {};
  const per = STAFF_HOURS?.[name]?.[dayTR] || {};

  // Öncelik: personel tanımı varsa onu kullan, yoksa işletme.
  const row = (typeof per.open === "boolean" || per.from || per.to) ? per : biz;

  // Açıklama:
  // - open === false ise kesin kapalı (from/to olsa bile)
  // - open === true ise açık
  // - open tanımlı değilse from & to varsa açık say.
  let open = false;
  if (row.open === false) open = false;
  else if (row.open === true) open = true;
  else open = !!row.from && !!row.to;

  const start = row.from ? timeStrToFloat(row.from) : (biz.from ? timeStrToFloat(biz.from) : 9);
  const end   = row.to   ? timeStrToFloat(row.to)   : (biz.to   ? timeStrToFloat(biz.to)   : 20);

  return { open, start, end };
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
function weekStart(d){ const s=new Date(d); s.setDate(s.getDate()-s.getDay()); return dayStart(s); }          // Pazardan
function weekEnd(d){ const s=weekStart(d); const e=new Date(s); e.setDate(e.getDate()+7); return e; }         // [start, end)

function fmtHM(date){ return `${pad(date.getHours())}:${pad(date.getMinutes())}`; }

function bookingStaffName(b){
  const raw = b.staffName || b.staff || b.assignedTo || OWNER;
  return canonicalName(raw, OWNER) || OWNER;
}

/* Firestore’dan aktif aralık için canlı dinleme */
function watchBookingsForCurrent(){
  if(!ADMIN_UID) return;
  unsubBookings?.();

  const rangeStart = (view==="day") ? dayStart(current) : weekStart(current);
  const rangeEnd   = (view==="day") ? dayEnd(current)   : weekEnd(current);

  const q = query(
    collection(db, "bookings"),
    where("businessId","==", ADMIN_UID),
    where("startAt", ">=", Timestamp.fromDate(rangeStart)),
    where("startAt", "<",  Timestamp.fromDate(rangeEnd)),
    orderBy("startAt","asc")
  );
  unsubBookings = onSnapshot(q, (qs)=>{
    BOOKINGS = qs.docs.map(d=>({ id:d.id, ...d.data() }));
    (view==="day") ? renderDay() : renderWeek();   // veri geldiğinde yeniden çiz
  }, (err)=>{
    console.error("[bookings] watch error:", err);
  });
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

  // sol başlık (saat kolonunun üstü boş kutu)
  const timeHead = document.createElement("div");
  timeHead.className = "time-head";
  row.appendChild(timeHead);

  const CH = cellH();
  const HOURS = VEND - VSTART;              // 8–24 = 16 saat
  const colH  = px(HOURS * CH) + "px";
  document.documentElement.style.setProperty("--calH", colH);

  // zaman kolonu
  const timeCol = document.createElement("div");
  timeCol.id = "timeCol";
  timeCol.className = "time-col";
  timeCol.style.height = colH;

  // 08..23 arası 16 satır
  for (let h = VSTART; h < VEND; h++) {
    const t = document.createElement("div");
    t.className = "time-cell";
    t.textContent = `${String(h).padStart(2,'0')}:00`;
    t.style.height = px(CH) + "px";
    timeCol.appendChild(t);
  }
  grid.appendChild(timeCol);

  // personeller (filtre)
  selectedStaff.forEach(name=>{
    const {open,start,end} = hoursFor(name, current);

    // header
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

    // column
    const c=document.createElement("div");
    c.className="staff-col";
    c.dataset.staff=name;
    c.style.height = colH;

    // saat çizgileri (8–24 arası 16 adet)
    for (let hh = VSTART; hh < VEND; hh++) {
      const cell=document.createElement("div");
      cell.className="hour-cell";
      cell.style.height = px(CH) + "px";
      c.appendChild(cell);
    }

    if(open){
      addOff(c, VSTART, start); // sabah kapalı
      addOff(c, end, VEND);     // akşam kapalı
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

  // —— HER ZAMAN 2 KİŞİ GÖRÜNÜR, FAZLASI SAĞA KAYAR
  {
    const cal   = document.querySelector('.calendar');
    const calW  = (cal?.clientWidth || 0);
    const timeW = cssVarPx('--timeW', document.documentElement) || 80;

    // her bir kişi: (takvim genişliği - saat sütunu) / 2
    // çok dar ekranlarda ezilmemesi için alt sınır
    const colW = Math.max(220, Math.floor((calW - timeW) / 2));

    // 2 kişi görünür; fazlası grid-auto-columns ile uzar
    const tpl  = `var(--timeW) repeat(2, ${colW}px)`;
    const auto = `${colW}px`;

    row.style.gridTemplateColumns  = tpl;
    grid.style.gridTemplateColumns = tpl;
    row.style.gridAutoColumns      = auto;
    grid.style.gridAutoColumns     = auto;

    // kritik: yeni personeller ALT SATIR yerine SAĞA eklensin
    row.style.gridAutoFlow  = 'column';
    grid.style.gridAutoFlow = 'column';

    // min görünür genişlik → yatay scroll
    const min = `calc(var(--timeW) + ${2*colW}px)`;
    row.style.minWidth  = min;
    grid.style.minWidth = min;

    // yatay kaydırmayı açık tut
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
      const start = b.startAt instanceof Timestamp ? b.startAt.toDate() : new Date(b.startAt);
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
  x.setDate(x.getDate() - x.getDay()); // Pazardan başlat
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

  // HEAD
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

  // GRID (seçili personeller için birer satır)
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

      const {open} = hoursFor(name, d);
      if(!open){ inner.classList.add("closed"); }
      col.appendChild(inner);
      grid.appendChild(col);
    }
  });

  // —— Varsayılan 3 satır görünsün, fazlasında dikey kaydırma (ÖNCEKİ 2 idi)
  const wkView = $("#weekView");
  const headH  = $("#wkHead").getBoundingClientRect().height || 0;
  const rowH = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--wkRowH')
  ) || 220;
  const visibleRows = 3; // <<< büyütüldü
  wkView.style.maxHeight = px(headH + visibleRows*rowH + 24) + "px";
  wkView.style.overflowY = (selectedStaff.length > visibleRows) ? "auto" : "visible";

  drawWeekBookings();
  scrollToStart();
}

/* Hafta görünümünde küçük yonga olarak göster */
function drawWeekBookings(){
  const ws = weekStart(current), we = weekEnd(current);

  const cellMap = {};
  $$(".wk-col-inner").forEach(el=>{
    cellMap[`${el.dataset.staff}__${el.dataset.date}`] = el;
  });

  BOOKINGS
    .filter(b=>{
      const d = b.startAt instanceof Timestamp ? b.startAt.toDate() : new Date(b.startAt);
      return d >= ws && d < we;
    })
    .forEach(b=>{
      const start = b.startAt instanceof Timestamp ? b.startAt.toDate() : new Date(b.startAt);
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
  watchBookingsForCurrent();        // aralığa göre Firestore sorgusunu güncelle
}

// View aç/kapa ve seçimleri
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
  STAFF.forEach(n=>{
    const id = "st_"+n.replace(/\s+/g,"_");
    const row=document.createElement("label");
    row.className="chk";
    row.innerHTML = `<input type="checkbox" id="${id}" class="staffChk" data-name="${n}" ${selectedStaff.includes(n)?"checked":""}>
                     <span>${n}</span><span class="dot"></span>`;
    list.appendChild(row);
  });

  // all toggle
  const all = $("#allChk");
  const boxes = ()=> $$(".staffChk");
  const syncAll = ()=>{ all.checked = boxes().every(b=>b.checked); };
  syncAll();

  all.addEventListener("change",()=>{
    boxes().forEach(b=> b.checked = all.checked);
  });

  // aç/kapa
  if(!btn.dataset.bound){
    btn.dataset.bound="1";
    btn.addEventListener("click",()=> pop.classList.toggle("open"));
    document.addEventListener("mousedown",(e)=>{
      if(pop.classList.contains("open") && !pop.contains(e.target) && !btn.contains(e.target))
        pop.classList.remove("open");
    });
  }

  // Uygula
  $("#applyStaff")?.addEventListener("click",()=>{
    const sel = boxes().filter(b=>b.checked).map(b=>b.dataset.name);
    selectedStaff = sel.length ? sel : [...STAFF];
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
    dateWrap.setAttribute('aria-expanded','true');
    calCursor = new Date(current.getFullYear(), current.getMonth(), 1);
    drawMini(calCursor);
    document.getElementById('backdrop')?.classList.add('show');
  }
});
document.addEventListener("mousedown",(e)=>{ 
  if(pop?.classList.contains("open") && !pop.contains(e.target) && !dateWrap.contains(e.target)){
    pop.classList.remove("open"); 
    dateWrap.setAttribute('aria-expanded','false');
    document.getElementById('backdrop')?.classList.remove('show');
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
        pop.classList.remove("open"); dateWrap.setAttribute('aria-expanded','false');
        document.getElementById('backdrop')?.classList.remove('show');
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

/* =============== BOOT =============== */
function boot(){
  current = new Date();
  setView("day");                // varsayılan: Gün
  drawMini(new Date(current.getFullYear(), current.getMonth(), 1));
}

/* Hücre yüksekliği değiştiğinde yeniden çiz (masaüstü) */
window.addEventListener("resize", ()=>{
  (view==="day") ? renderDay() : renderWeek();
}, { passive:true });
