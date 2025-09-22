/* ===========================
   AYARLAR – Firestore + Business Hours MODAL
   v14.0 — Canonical "businesses" + AO mirror, Staff-sync FIX, images dual-write
   =========================== */

console.log("[settings] settings.js yüklendi (v14.0 canonical + staff-sync)");

import { auth, db, storage } from "./firebase.js?v=7";
import {
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  collection,
  getDocs,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import {
  ref as sRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

/* ===== helpers ===== */
const $ = (s, r = document) => r.querySelector(s);
const toast = $("#toast");

function showToast(msg = "Kaydedildi", type = "default") {
  if (!toast) return console.log("[toast]", msg);
  toast.textContent = msg;
  toast.classList.remove("success", "error");
  if (type === "success") toast.classList.add("success");
  if (type === "error") toast.classList.add("error");
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show", "success", "error"), 2000);
}

/* ===== Dirty ===== */
let DIRTY = false;
function setDirty(v = true) {
  DIRTY = v;
  const b = $("#saveBtn");
  if (b) {
    b.disabled = !DIRTY;
    b.classList.toggle("is-dirty", DIRTY);
  }
}
function attachDirtyWatchers() {
  document.querySelectorAll("input, select, textarea").forEach((el) => {
    el.addEventListener("input", () => setDirty(true));
    el.addEventListener("change", () => setDirty(true));
  });
  document.addEventListener("keydown", (e) => {
    const key = e.key?.toLowerCase?.();
    if ((e.ctrlKey || e.metaKey) && key === "s") {
      e.preventDefault();
      $("#saveBtn")?.click();
    }
  });
  window.addEventListener("beforeunload", (e) => {
    if (DIRTY) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

/* ===== Auth persistence ===== */
setPersistence(auth, browserLocalPersistence).catch((e) =>
  console.warn("[auth] setPersistence:", e?.message || e)
);

/* ===========================
   İl / İlçe / Mahalle (İstanbul)
   =========================== */
const DATA = {
  İstanbul: {
    Ümraniye: [
      "Atakent","Atatürk","Aşağıdudullu","Çakmak","Esenevler","Esenkent","Hekimbaşı","Ihlamurkuyu","İnkılap","İstiklal",
      "Kazım Karabekir","Namık Kemal","Parseller","Sarıkaya","Tantavi","Tatlısu","Tepeüstü","Yamanevler","Yukarıdudullu"
    ],
    Üsküdar: [
      "Altunizade","Aziz Mahmut Hüdayi","Bahçelievler","Beylerbeyi","Burhaniye","Bulgurlu","Cumhuriyet","Çengelköy","Ferah",
      "Güzeltepe","İcadiye","Kandilli","Kısıklı","Kuzguncuk","Küçük Çamlıca","Küçüksu","Mehmet Akif Ersoy","Mimar Sinan",
      "Salacak","Selami Ali","Sultantepe","Ünalan","Valide-i Atik","Yavuztürk","Zeynep Kamil"
    ],
  },
};
const city = $("#city"), dist = $("#district"), hood = $("#hood");
function fillCities(){ if(!city) return; city.length=0; city.add(new Option("İstanbul","İstanbul",true,true)); city.disabled=true; }
function fillDistricts(){
  if(!dist || !hood) return;
  dist.length=0; dist.add(new Option("İlçe seçin","",true,true)); dist.disabled=false;
  hood.length=0; hood.add(new Option("Mahalle seçin","",true,true)); hood.disabled=true;
  Object.keys(DATA["İstanbul"]).forEach((d)=>dist.add(new Option(d,d)));
}
function fillHoods(){
  if(!hood) return;
  hood.length=0; hood.add(new Option("Mahalle seçin","",true,true));
  hood.disabled=!dist.value; if(!dist.value) return;
  (DATA["İstanbul"]?.[dist.value]||[]).forEach((h)=>hood.add(new Option(h,h)));
}
function ensureOption(select,value,label){
  if(!select||!value) return;
  const exists=[...select.options].some((o)=>o.value===value);
  if(!exists) select.add(new Option(label??value,value));
  select.value=value;
}
city?.addEventListener("change", fillDistricts);
dist?.addEventListener("change", fillHoods);
fillCities();

/* ===========================
   STORAGE thumbs + lightbox (dual-write to businesses + AO)
   =========================== */
(function injectViewerCSS(){
  if(document.getElementById("img-viewer-css")) return;
  const css=`
  #imgViewer{position:fixed;inset:0;display:none;z-index:1000}
  #imgViewer.show{display:block}
  #imgViewer .iv__backdrop{position:absolute;inset:0;background:rgba(0,0,0,.45)}
  #imgViewer .iv__dialog{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
    background:#fff;padding:8px;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.35);
    max-width:960px;max-height:720px}
  #imgViewer .iv__img{display:block;max-width:920px;max-height:660px;width:auto;height:auto;border-radius:8px}
  #imgViewer .iv__close{position:absolute;top:-12px;right:-12px;width:32px;height:32px;border:0;border-radius:999px;
    background:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2);font-size:16px;line-height:32px}
  `;
  const s=document.createElement("style"); s.id="img-viewer-css"; s.textContent=css; document.head.appendChild(s);
})();
(function setupImageViewer() {
  let ov, img;
  function ensure() {
    if (ov) return;
    ov = document.createElement("div");
    ov.id = "imgViewer";
    ov.innerHTML = `
      <div class="iv__backdrop" data-close></div>
      <div class="iv__dialog" role="dialog" aria-modal="true">
        <img class="iv__img" alt="">
        <button class="iv__close" aria-label="Kapat">✕</button>
      </div>`;
    document.body.appendChild(ov);
    img = ov.querySelector(".iv__img");
    ov.querySelector(".iv__close").addEventListener("click", closeImageViewer);
    ov.addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) closeImageViewer(); });
    document.addEventListener("keydown", (e)=>{ if(e.key==="Escape") closeImageViewer(); });
  }
  window.openImageViewer = (url)=>{ ensure(); img.src = url; ov.classList.add("show"); document.body.style.overflow="hidden"; };
  window.closeImageViewer = ()=>{ if(!ov) return; ov.classList.remove("show"); document.body.style.overflow=""; };
})();

let UID = null;
let AO_REF = null;
let BIZ_REF = null;

function createThumb(url, kind) {
  const el = document.createElement("div");
  el.className = "thumb";
  el.innerHTML = `<img src="${url}" alt=""><button class="del" title="Sil">Sil</button>`;
  el.querySelector("img").addEventListener("click", () => openImageViewer(url));
  el.querySelector(".del").addEventListener("click", async () => {
    if (!UID) return showToast("Giriş gerekli");
    try {
      // Mirror + Canonical
      await Promise.all([
        updateDoc(AO_REF, { [`images.${kind}`]: arrayRemove(url), updatedAt: serverTimestamp() }).catch(()=>{}),
        updateDoc(BIZ_REF, { [`images.${kind}`]: arrayRemove(url), updatedAt: serverTimestamp() }).catch(()=>{}),
      ]);
      el.remove();
      setDirty(true);
      showToast("Görsel kaldırıldı", "success");
    } catch (e) {
      console.error("[remove image]", e);
      showToast("Silinemedi", "error");
    }
  });
  return el;
}
function renderThumbs(listEl, urls = [], kind) {
  if (!listEl) return;
  listEl.innerHTML = "";
  urls.forEach((u) => listEl.appendChild(createThumb(u, kind)));
}
function storagePath(uid, kind, file) {
  const ext = (file?.name?.split(".").pop() || "jpg").toLowerCase();
  const ts = Date.now();
  return `uploads/${uid}/${kind}_${ts}.${ext}`;
}
async function uploadImageToStorage(kind, file, uid) {
  const path = storagePath(uid, kind, file);
  const r = sRef(storage, path);
  await uploadBytes(r, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(r);

  // Dual-write (AO + businesses)
  await Promise.all([
    updateDoc(AO_REF, { [`images.${kind}`]: arrayUnion(url), updatedAt: serverTimestamp() })
      .catch(async () => setDoc(AO_REF, { images: { [kind]: [url] }, updatedAt: serverTimestamp() }, { merge: true })),
    updateDoc(BIZ_REF, { [`images.${kind}`]: arrayUnion(url), updatedAt: serverTimestamp() })
      .catch(async () => setDoc(BIZ_REF, { images: { [kind]: [url] }, updatedAt: serverTimestamp() }, { merge: true })),
  ]);

  return url;
}
function bindUploader(kind) {
  const btn = document.querySelector(`[data-upload="${kind}"]`);
  const input = document.querySelector(`[data-input="${kind}"]`);
  const list = document.getElementById(kind + "Thumbs");
  if (!btn || !input || !list) return;

  btn.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const files = Array.from(input.files || []); if (!files.length) return;
    if (!UID) { showToast("Giriş gerekli"); input.value = null; return; }

    for (const f of files) {
      const loadingTile = document.createElement("div");
      loadingTile.className = "thumb";
      loadingTile.innerHTML = `<div class="loading">Yükleniyor…</div>`;
      list.appendChild(loadingTile);
      try {
        const url = await uploadImageToStorage(kind, f, UID);
        const thumb = createThumb(url, kind);
        list.replaceChild(thumb, loadingTile);
        setDirty(true);
      } catch {
        list.removeChild(loadingTile);
        showToast("Görsel yüklenemedi", "error");
      }
    }
    input.value = null;
  });
}
["cover", "salon", "model"].forEach(bindUploader);

/* ===========================
   Hizmetler UI (template fix)
   =========================== */
const serviceListEl = document.getElementById("serviceList");
let services = [];

function svcRowTemplate(s, idx) {
  const name = s.name ?? "";
  const min = Number.isFinite(Number(s.min)) ? Number(s.min) : "";
  const price = s.price === "" ? "" : Number.isFinite(Number(s.price)) ? Number(s.price) : "";
  return `
    <div class="tr row" data-row="${idx}">
      <div class="td" style="width:36px"><div class="grip" title="Sürükle"></div></div>
      <div class="td">
        <input class="input" value="${name}" data-k="name" data-i="${idx}" placeholder="Hizmet adı" />
      </div>
      <div class="td" style="width:120px">
        <input class="input" type="number" min="5" step="5"
               value="${min}" data-k="min" data-i="${idx}" placeholder="dk" />
      </div>
      <div class="td" style="width:120px">
        <input class="input" type="number" min="0" step="1"
               value="${price}" data-k="price" data-i="${idx}" placeholder="Ücret" />
      </div>
      <div class="td" style="width:160px">
        <button class="ico-btn" data-up="${idx}" title="Yukarı">
          <svg class="ico" viewBox="0 0 24 24"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
        </button>
        <button class="ico-btn" data-down="${idx}" title="Aşağı">
          <svg class="ico" viewBox="0 0 24 24"><path d="m19 12-7 7-7-7"/><path d="M12 5v14"/></svg>
        </button>
        <button class="ico-btn" data-del="${idx}" title="Sil">
          <svg class="ico" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>`;
}
function renderServices() {
  if (!serviceListEl) return;
  serviceListEl.innerHTML = services.map(svcRowTemplate).join("");
}
serviceListEl?.addEventListener("input", (e) => {
  const t = e.target; const k = t.dataset.k, i = +t.dataset.i;
  if (!k || Number.isNaN(i)) return;

  if (k === "min") {
    const val = Math.max(5, parseInt(t.value || 0));
    services[i][k] = Number.isFinite(val) ? val : 30;
    t.value = services[i][k];
  } else if (k === "price") {
    const raw = t.value.trim();
    if (raw === "") services[i][k] = "";
    else {
      const v = Number(raw);
      services[i][k] = Number.isFinite(v) ? v : 0;
      t.value = services[i][k];
    }
  } else services[i][k] = t.value;

  setDirty(true);
});
serviceListEl?.addEventListener("click", (e) => {
  const up = e.target.closest("[data-up]");
  const down = e.target.closest("[data-down]");
  const del = e.target.closest("[data-del]");
  if (up) { const i = +up.dataset.up; if (i > 0) { [services[i - 1], services[i]] = [services[i], services[i - 1]]; renderServices(); setDirty(true); } }
  if (down) { const i = +down.dataset.down; if (i < services.length - 1) { [services[i + 1], services[i]] = [services[i], services[i + 1]]; renderServices(); setDirty(true); } }
  if (del) { const i = +del.dataset.del; services.splice(i, 1); renderServices(); setDirty(true); }
});
$("#addQuick")?.addEventListener("click", () => { services.push({ name: "", min: 30, price: "" }); renderServices(); setDirty(true); });

/* ===========================
   Hakkımızda + Telefon
   =========================== */
const contactPhoneEl = $("#contactPhone");
function onlyDigits10(v){ return (v || "").replace(/\D/g, "").slice(0, 10); }
function bindPhoneMask() {
  if (!contactPhoneEl) return;
  let composing = false;
  contactPhoneEl.addEventListener("compositionstart", () => (composing = true));
  contactPhoneEl.addEventListener("compositionend", () => { composing = false; contactPhoneEl.value = onlyDigits10(contactPhoneEl.value); });
  contactPhoneEl.addEventListener("input", () => {
    if (composing) return;
    const digits = onlyDigits10(contactPhoneEl.value);
    if (digits !== contactPhoneEl.value) {
      const pos = contactPhoneEl.selectionStart || digits.length;
      contactPhoneEl.value = digits; contactPhoneEl.setSelectionRange(pos, pos);
    }
  });
  contactPhoneEl.addEventListener("paste", (e) => {
    e.preventDefault(); const text = (e.clipboardData || window.clipboardData).getData("text");
    const digits = onlyDigits10(text); document.execCommand("insertText", false, digits);
  });
  contactPhoneEl.addEventListener("blur", () => {
    const val = onlyDigits10(contactPhoneEl.value); contactPhoneEl.value = val;
    contactPhoneEl.toggleAttribute("aria-invalid", val.length !== 10);
    if (val && val.length !== 10) { showToast("Telefon 10 haneli olmalı (örn. 5XXXXXXXXX)", "error"); }
  });
}
bindPhoneMask();

/* ===========================
   FORMLAR
   =========================== */
const bizName = $("#bizName"),
  mapUrl = $("#mapUrl"),
  buildingNo = $("#buildingNo"),
  aboutText = $("#aboutText"),
  contactPhone = $("#contactPhone"),
  saveBtn = $("#saveBtn");

/* ===========================
   BUSINESS HOURS – State & Modal Flow
   =========================== */
const DAYS = [
  { k: "sun", label: "Pazar" },
  { k: "mon", label: "Pazartesi" },
  { k: "tue", label: "Salı" },
  { k: "wed", label: "Çarşamba" },
  { k: "thu", label: "Perşembe" },
  { k: "fri", label: "Cuma" },
  { k: "sat", label: "Cumartesi" },
];
function defaultHours(){
  return {
    mon:{closed:false, open:"09:00", close:"19:00"},
    tue:{closed:false, open:"09:00", close:"19:00"},
    wed:{closed:false, open:"09:00", close:"19:00"},
    thu:{closed:false, open:"09:00", close:"19:00"},
    fri:{closed:false, open:"09:00", close:"19:00"},
    sat:{closed:true,  open:"10:00", close:"19:00"},
    sun:{closed:true,  open:"10:00", close:"18:00"},
  };
}
let bizHours = defaultHours();
let hoursBackup = null;

/* === HTML bağla === */
const openHoursBtn = document.querySelector("#openBhModal, #openHoursBtn");
const bhSummary    = document.getElementById("bhSummary");
const bhModal      = document.getElementById("bhModal");
const bhListEl     = document.getElementById("bhList");

const bhDayModal   = document.getElementById("bhDayModal");
const bhDayTitle   = document.getElementById("bhDayTtl");
const bhOpenInput  = document.querySelector('[data-day-open]');
const bhCloseInput = document.querySelector('[data-day-close]');

const bhCopyModal  = document.getElementById("bhCopyModal");
const bhCopyList   = document.getElementById("bhCopyList");

let currentDetailDay = null;

/* ---- helpers ---- */
function hhmm(a){ return (a||"").padStart(5,"0"); }
function cmp(a,b){ return hhmm(a).localeCompare(hhmm(b)); }
function validateDay(d){ if(d.closed) return true; return d.open && d.close && cmp(d.open,d.close) < 0; }
function labelOf(k){ return DAYS.find(x=>x.k===k)?.label || k; }

function renderHoursSummary(){
  const wk = ["mon","tue","wed","thu","fri"].map(k=>bizHours[k]);
  const sameWeek = wk.every(d => !d.closed && d.open===wk[0].open && d.close===wk[0].close);
  const parts = [];
  if (sameWeek) parts.push(`Pzt–Cum ${wk[0].open} – ${wk[0].close}`);
  else parts.push("Hafta içi ayarlı");
  parts.push(bizHours.sat.closed ? "Cumartesi kapalı" : `Cumartesi ${bizHours.sat.open} – ${bizHours.sat.close}`);
  parts.push(bizHours.sun.closed ? "Pazar kapalı" : `Pazar ${bizHours.sun.open} – ${bizHours.sun.close}`);
  if (bhSummary) bhSummary.textContent = parts.join(" • ");
}

function renderHoursList(){
  if (!bhListEl) return;
  bhListEl.innerHTML = DAYS.map(({k,label})=>{
    const d = bizHours[k];
    const summary = d.closed ? "Kapalı" : `${d.open} - ${d.close}`;
    return `
      <div class="bh-item ${d.closed ? "is-closed":""}" data-day="${k}">
        <div class="toggle">
          <input type="checkbox" ${d.closed ? "" : "checked"} data-toggle="${k}">
        </div>
        <div class="name">${label}</div>
        <div data-summary>${summary}</div>
        <button class="chev" data-edit="${k}" title="Düzenle">
          <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </button>
      </div>`;
  }).join("");
}

function openModal(el){ el?.classList.add("show"); document.body.style.overflow="hidden"; }
function closeModal(el){ el?.classList.remove("show"); document.body.style.overflow=""; }

/* ---- Ana buton → modalı aç ---- */
openHoursBtn?.addEventListener("click", ()=>{
  hoursBackup = JSON.parse(JSON.stringify(bizHours));
  renderHoursList();
  openModal(bhModal);
});

/* ---- Ana modal içi delegasyon ---- */
bhModal?.addEventListener("click", (e)=>{
  // Header X
  if (e.target.closest(".picker__hd [data-close]")){
    if (hoursBackup) bizHours = hoursBackup;
    closeModal(bhModal);
    renderHoursSummary();
    return;
  }
  // Footer “Devam”
  if (e.target.closest(".picker__ft [data-close]")){
    closeModal(bhModal);
    renderHoursSummary();
    setDirty(true);
    return;
  }
  // “Saatleri Kopyala”
  if (e.target.closest('[data-open="bh-copy"]')){
    renderCopyList(currentDetailDay ?? "mon");
    openModal(bhCopyModal);
    return;
  }
});

/* Liste: toggle / edit */
bhListEl?.addEventListener("click", (e)=>{
  const tgl = e.target.closest("[data-toggle]");
  const ed  = e.target.closest("[data-edit]");
  if (tgl){
    const k = tgl.dataset.toggle;
    const checked = e.target.closest("input")?.checked ?? true;
    bizHours[k].closed = !checked;
    const row = e.target.closest(".bh-item");
    if (row) row.classList.toggle("is-closed", bizHours[k].closed);
    const sumEl = row?.querySelector("[data-summary]");
    if (sumEl) sumEl.textContent = bizHours[k].closed ? "Kapalı" : `${bizHours[k].open} - ${bizHours[k].close}`;
  }
  if (ed){
    const k = ed.dataset.edit;
    openDayDetail(k);
  }
});

/* ---- Gün detayı ---- */
function openDayDetail(k){
  currentDetailDay = k;
  if (bhDayTitle)   bhDayTitle.textContent = labelOf(k);
  if (bhOpenInput)  bhOpenInput.value  = bizHours[k].open  || "09:00";
  if (bhCloseInput) bhCloseInput.value = bizHours[k].close || "19:00";
  openModal(bhDayModal);
}
bhDayModal?.addEventListener("click", (e)=>{
  // Vazgeç
  if (e.target.closest("[data-close]") && !e.target.closest("[data-save-day]")){
    closeModal(bhDayModal);
    return;
  }
  // Kaydet
  if (e.target.closest("[data-save-day]")){
    const k = currentDetailDay;
    const d = { ...bizHours[k], open: bhOpenInput.value, close: bhCloseInput.value };
    if (!validateDay(d)){ showToast("Kapanış, açılıştan büyük olmalı", "error"); return; }
    bizHours[k] = d;
    const row = bhListEl.querySelector(`.bh-item[data-day="${k}"]`);
    const sumEl = row?.querySelector('[data-summary]');
    if (sumEl) sumEl.textContent = d.closed ? "Kapalı" : `${d.open} - ${d.close}`;
    closeModal(bhDayModal);
    renderCopyList(k);
    openModal(bhCopyModal);
  }
});

/* ---- Saatleri kopyala ---- */
function renderCopyList(sourceK){
  if (!bhCopyList) return;
  bhCopyList.innerHTML = DAYS.map(({k,label})=>{
    const disabled = k===sourceK ? "disabled" : "";
    return `
      <label class="copy-row">
        <input type="checkbox" ${disabled} data-copy-target="${k}">
        <span>${label}</span>
      </label>`;
  }).join("");
}
bhCopyModal?.addEventListener("click", (e)=>{
  if (e.target.closest("[data-apply-copy]")){
    const src = bizHours[currentDetailDay];
    bhCopyList.querySelectorAll('[data-copy-target]').forEach(cb=>{
      const k = cb.dataset.copyTarget;
      if (cb.disabled || !cb.checked) return;
      bizHours[k].open = src.open;
      bizHours[k].close = src.close;
      if (!bizHours[k].closed){
        const sumEl = bhListEl.querySelector(`.bh-item[data-day="${k}"] [data-summary]`);
        if (sumEl) sumEl.textContent = `${src.open} - ${src.close}`;
      }
    });
    closeModal(bhCopyModal);
    setDirty(true);
  }
  if (e.target.closest("[data-close]")) closeModal(bhCopyModal);
});

/* Özet chip tıklanınca da aç */
bhSummary?.addEventListener("click", ()=> openHoursBtn?.click());

/* ===========================
   AUTH + Prefill (businesses canonical + AO fallback)
   =========================== */
let lastData = {};

/* ====== STAFF SYNC – cache ====== */
let staffCache = [];         // { id, name, hours, raw, path: 'sub'|'array' }
let staffPath = null;        // 'sub' | 'array' | null
let staffLoaded = false;

function asArr(v){ if(!v) return []; return Array.isArray(v) ? v : [v]; }

function materializeData(biz, ao) {
  // Canonical (businesses) öncelik
  const b = biz || {};
  const a = ao  || {};

  const name = b?.business?.name || b?.name || a?.business?.name || a?.step2?.businessName || "İşletmeniz";

  // Konum
  const loc = b?.businessLocation || b?.location || a?.businessLocation || a?.step5?.businessLocation || {};
  const cityVal = loc.province || "İstanbul";
  const districtVal = loc.district || "";
  const hoodVal = loc.neighborhood || "";
  const buildingVal = loc.building || loc.buildingNo || "";
  const mapLink = loc.mapUrl || "";

  const about = b?.business?.about || b?.about || a?.business?.about || "";
  const phone = b?.business?.phone || b?.phone || a?.business?.phone || a?.step2?.phone || "";

  // Hizmetler
  const fromBiz = Array.isArray(b?.services) ? b.services : (Array.isArray(b?.catalog?.services) ? b.catalog.services : []);
  const fromRoot = Array.isArray(a?.services) ? a.services : [];
  const fromStep7 = (a?.step7?.services || []).map((n) => ({ name: n, min: 30, price: "" }));
  const merged = [...fromBiz, ...fromRoot, ...fromStep7];

  const uniq = []; const seen = new Set();
  merged.forEach((s) => {
    const nm = (s?.name || s || "").toString().trim();
    if (!nm || seen.has(nm.toLowerCase())) return;
    seen.add(nm.toLowerCase());
    if (typeof s === "string") uniq.push({ name: nm, min: 30, price: "" });
    else uniq.push({ name: s.name || "", min: s.min ?? s.minutes ?? s.duration ?? 30, price: s.price ?? "" });
  });

  // Saatler
  const hours = b?.businessHours || b?.workingHours || a?.businessHours || a?.step6?.businessHours || defaultHours();

  // Görseller
  const images = b?.images || a?.images || {};

  const ownerName = b?.owner?.name || a?.owner?.name || a?.step2?.adminName || "Kullanıcı";

  return {
    business: {
      name, about, phone,
      address: { city: cityVal || "İstanbul", district: districtVal, hood: hoodVal, buildingNo: buildingVal, mapUrl: mapLink }
    },
    services: uniq,
    businessHours: hours,
    images,
    ownerName
  };
}

async function prefillFromDocs(biz, ao) {
  lastData = { biz, ao };
  const data = materializeData(biz, ao);

  if (bizName) bizName.value = data.business.name || "";
  if (aboutText) aboutText.value = data.business.about || "";
  if (contactPhone) contactPhone.value = data.business.phone || "";

  fillCities(); ensureOption(city, data.business.address.city || "İstanbul");
  fillDistricts(); ensureOption(dist, data.business.address.district);
  fillHoods(); ensureOption(hood, data.business.address.hood);
  if (buildingNo) buildingNo.value = data.business.address.buildingNo || "";
  if (mapUrl) mapUrl.value = data.business.address.mapUrl || "";

  // Görseller
  renderThumbs($("#coverThumbs"), asArr(data.images?.cover), "cover");
  renderThumbs($("#salonThumbs"), asArr(data.images?.salon), "salon");
  renderThumbs($("#modelThumbs"), asArr(data.images?.model), "model");

  // Hizmetler
  services = data.services.length ? data.services : [
    { name: "Erkek Saç Kesimi", min: 30, price: 300 },
    { name: "Sakal", min: 20, price: 150 },
    { name: "Saç & sakal", min: 45, price: 400 },
  ];
  renderServices();

  // Saatler
  bizHours = { ...defaultHours(), ...data.businessHours };
  renderHoursSummary();

  const bmUserNameEl = $("#bmUserName");
  if (bmUserNameEl) bmUserNameEl.textContent = data.ownerName || "Kullanıcı";

  attachDirtyWatchers(); setDirty(false);
}

/* ===== STAFF SYNC – util ===== */
const DAY_KEYS = ["mon","tue","wed","thu","fri","sat","sun"];
const LABEL_BY_KEY = {mon:"Pazartesi",tue:"Salı",wed:"Çarşamba",thu:"Perşembe",fri:"Cuma",sat:"Cumartesi",sun:"Pazar"};
function t2m(t){ const [h=0,m=0] = (t||"").split(":").map(n=>+n||0); return h*60+m; }
function m2t(x){ const h = Math.floor(x/60), m = x%60; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`; }

function normalizeStaffHours(h){
  // Kabul edilen yapılar: {start,end,off} veya {open,close,closed}
  if (!h || typeof h !== "object") return null;
  const obj = {};
  DAY_KEYS.forEach(k=>{
    const d = h[k] || {};
    const start = d.start ?? d.open;
    const end   = d.end   ?? d.close;
    const off   = (d.off ?? d.closed) || false;
    obj[k] = { start: start || null, end: end || null, off: !!off, _raw: d };
  });
  return obj;
}

/* Çalışanları getir (adminOnboarding alt koleksiyon öncelikli, sonra AO.staff alanı) */
async function ensureStaffLoaded(){
  if (!UID || staffLoaded) return;
  try{
    const subSnap = await getDocs(collection(db, "adminOnboarding", UID, "staff"));
    if (!subSnap.empty){
      staffCache = [];
      subSnap.forEach(d=>{
        const data = d.data() || {};
        const hours = normalizeStaffHours(data.hours || data.workHours || data.workingHours);
        staffCache.push({
          id: d.id,
          name: data.name || data.fullName || "Çalışan",
          hours,
          raw: data,
          path: "sub",
        });
      });
      staffPath = "sub";
      staffLoaded = true;
      return;
    }
  }catch(e){ console.warn("[staff] subcollection okunamadı:", e?.message||e); }

  // Ana dokümandaki dizi
  const root = await getDoc(doc(db,"adminOnboarding",UID));
  const rd = root.exists() ? (root.data()||{}) : {};
  const arr = Array.isArray(rd.staff) ? rd.staff : (Array.isArray(rd.employees) ? rd.employees : []);
  if (arr.length){
    staffCache = arr.map((it, i)=>({
      id: it.id || String(i),
      name: it.name || it.fullName || "Çalışan",
      hours: normalizeStaffHours(it.hours || it.workHours || it.workingHours),
      raw: it,
      path: "array",
    }));
    staffPath = "array";
  } else {
    staffCache = [];
    staffPath = null;
  }
  staffLoaded = true;
}

/* İşletme saatleri → çalışan vardiyalarını clamp et */
function clampStaffToBusiness(bh, employees){
  const changes = [];
  const next = employees.map(emp=>{
    if (!emp.hours) return emp;
    const clone = JSON.parse(JSON.stringify(emp));

    DAY_KEYS.forEach(k=>{
      const e = clone.hours[k];
      const b = bh[k];
      if (!e || !b) return;

      if (b.closed) {
        if (!e.off) {
          changes.push({ name: emp.name, day: LABEL_BY_KEY[k], reason:"closed" });
          e.off = true; e.start = null; e.end = null;
        }
        return;
      }
      if (e.off) return;

      const bOpen  = t2m(b.open);
      const bClose = t2m(b.close);

      let s = (e.start != null) ? t2m(e.start) : null;
      let en = (e.end   != null) ? t2m(e.end)   : null;

      if (s == null && en == null) {
        e.start = b.open; e.end = b.close;
        changes.push({ name: emp.name, day: LABEL_BY_KEY[k], reason:"fill" });
        return;
      }

      if (s != null && s < bOpen){
        changes.push({name:emp.name, day:LABEL_BY_KEY[k], reason:"open", fromStart:e.start, toStart:b.open});
        e.start = b.open; s = bOpen;
      }
      if (en!= null && en> bClose){
        changes.push({name:emp.name, day:LABEL_BY_KEY[k], reason:"close", fromEnd:e.end, toEnd:b.close});
        e.end = b.close; en = bClose;
      }

      const invalidByBounds = (s!=null && s>bClose) || (en!=null && en<bOpen);
      if (invalidByBounds){
        e.start = b.open; e.end = b.close;
        changes.push({ name: emp.name, day: LABEL_BY_KEY[k], reason:"reset_bounds" });
        return;
      }

      if (s == null){
        e.start = b.open; s = bOpen;
        changes.push({name:emp.name, day:LABEL_BY_KEY[k], reason:"fill_open", toStart:b.open});
      }
      if (en== null){
        e.end = b.close; en = bClose;
        changes.push({name:emp.name, day:LABEL_BY_KEY[k], reason:"fill_close", toEnd:b.close});
      }

      if (s >= en){
        e.start = b.open; e.end = b.close;
        changes.push({ name: emp.name, day: LABEL_BY_KEY[k], reason:"order_reset" });
      }
    });

    return clone;
  });

  return { next, changes };
}

/* Çalışan vardiya değişiklik özetleyici */
window.formatChangeSummary ||= function(changes){
  return changes.map(c=>{
    if (c.reason === "closed")
      return `- ${c.name} • ${c.day}: Dükkan kapalı → personel kapatıldı`;
    if (c.reason === "fill")
      return `- ${c.name} • ${c.day}: Vardiya boştu → dükkan saatleriyle dolduruldu`;
    if (c.reason === "open")
      return `- ${c.name} • ${c.day}: Başlangıç ${c.fromStart} → ${c.toStart}`;
    if (c.reason === "close")
      return `- ${c.name} • ${c.day}: Bitiş ${c.fromEnd} → ${c.toEnd}`;
    if (c.reason === "reset_bounds")
      return `- ${c.name} • ${c.day}: Aralık dışarıda → işletme saatlerine çekildi`;
    if (c.reason === "fill_open")
      return `- ${c.name} • ${c.day}: Başlangıç boştu → ${c.toStart}`;
    if (c.reason === "fill_close")
      return `- ${c.name} • ${c.day}: Bitiş boştu → ${c.toEnd}`;
    if (c.reason === "order_reset")
      return `- ${c.name} • ${c.day}: Başlangıç ≥ Bitiş → dükkan saatlerine çekildi`;
    return `- ${c.name} • ${c.day}: Güncellendi`;
  }).join("\n");
};


function formatChangeSummary(changes){
  // küçük, okunaklı özet
  return changes.map(c=>{
    if (c.reason === "closed") return `- ${c.name} • ${c.day}: Dükkan kapalı → personel kapatıldı`;
    if (c.reason === "fill") return `- ${c.name} • ${c.day}: Vardiya boştu → ${c.day} ${"dükkan saatleriyle"} dolduruldu`;
    if (c.reason === "open") return `- ${c.name} • ${c.day}: Başlangıç ${c.fromStart} → ${c.toStart}`;
    if (c.reason === "close") return `- ${c.name} • ${c.day}: Bitiş ${c.fromEnd} → ${c.toEnd}`;
    if (c.reason === "reset_bounds") return `- ${c.name} • ${c.day}: Aralık dükkan sınırları dışındaydı → ${c.toStart||""}${c.toStart?" ":""}${c.toEnd||""}`;
    if (c.reason === "fill_open") return `- ${c.name} • ${c.day}: Başlangıç boştu → ${c.toStart}`;
    if (c.reason === "fill_close") return `- ${c.name} • ${c.day}: Bitiş boştu → ${c.toEnd}`;
    if (c.reason === "order_reset") return `- ${c.name} • ${c.day}: Başlangıç≥Bitiş → dükkan saatlerine çekildi`;
    return `- ${c.name} • ${c.day}: Güncellendi`;
  }).join("\n");
}

/* TR+EN step8 eşlikçi çıktılarını hazırla ve yaz (AO mirror + businesses canonical) */
async function persistStaff(nextEmployees){
  if (!UID) return;

  // EN şema üret (open/close/closed) & TR şema (step8 uyumlu)
  const enOf = (n) => ({
    mon: n.mon?.off ? {closed:true} : {closed:false, open:n.mon.start, close:n.mon.end},
    tue: n.tue?.off ? {closed:true} : {closed:false, open:n.tue.start, close:n.tue.end},
    wed: n.wed?.off ? {closed:true} : {closed:false, open:n.wed.start, close:n.wed.end},
    thu: n.thu?.off ? {closed:true} : {closed:false, open:n.thu.start, close:n.thu.end},
    fri: n.fri?.off ? {closed:true} : {closed:false, open:n.fri.start, close:n.fri.end},
    sat: n.sat?.off ? {closed:true} : {closed:false, open:n.sat.start, close:n.sat.end},
    sun: n.sun?.off ? {closed:true} : {closed:false, open:n.sun.start, close:n.sun.end},
  });
  const trOf = (n) => ({
    "Pazartesi": n.mon?.off ? {open:false} : {open:true, from:n.mon.start, to:n.mon.end},
    "Salı":      n.tue?.off ? {open:false} : {open:true, from:n.tue.start, to:n.tue.end},
    "Çarşamba":  n.wed?.off ? {open:false} : {open:true, from:n.wed.start, to:n.wed.end},
    "Perşembe":  n.thu?.off ? {open:false} : {open:true, from:n.thu.start, to:n.thu.end},
    "Cuma":      n.fri?.off ? {open:false} : {open:true, from:n.fri.start, to:n.fri.end},
    "Cumartesi": n.sat?.off ? {open:false} : {open:true, from:n.sat.start, to:n.sat.end},
    "Pazar":     n.sun?.off ? {open:false} : {open:true, from:n.sun.start, to:n.sun.end},
  });

  const step8List = nextEmployees.map(emp => ({
    name: emp.name,
    role: emp.raw?.role || emp.raw?.position || "Personel",
    position: emp.raw?.position || emp.raw?.role || "Personel",
    hours: trOf(emp.hours),
    services: Array.isArray(emp.raw?.services) ? emp.raw.services : [],
  }));
  const topMap = {}; step8List.forEach(s => { topMap[s.name] = s.hours; });

  // AO tarafı: subcollection veya array’e yaz + step8 mirror
  if (staffPath === "sub"){
    const batch = writeBatch(db);
    nextEmployees.forEach(emp=>{
      const ref = doc(db,"adminOnboarding",UID,"staff",emp.id);
      const mergedHours = { ...enOf(emp.hours), ...trOf(emp.hours) };
      const payload = { ...emp.raw, id: emp.id, name: emp.name, hours: mergedHours, updatedAt: serverTimestamp() };
      batch.set(ref, payload, { merge: true });
    });
    await batch.commit();
  } else if (staffPath === "array"){
    const arr = nextEmployees.map(emp=>{
      const mergedHours = { ...enOf(emp.hours), ...trOf(emp.hours) };
      return { ...emp.raw, id: emp.id, name: emp.name, hours: mergedHours };
    });
    await updateDoc(AO_REF, { staff: arr, updatedAt: serverTimestamp() })
      .catch(async ()=>{ await setDoc(AO_REF, { staff: arr, updatedAt: serverTimestamp() }, { merge: true }); });
  }

  await updateDoc(AO_REF, {
    "step8.staff": step8List,
    "step8.staff_hours": topMap,
    "staff_hours": topMap,
    updatedAt: serverTimestamp()
  }).catch(async ()=>{
    await setDoc(AO_REF, {
      step8: { staff: step8List, staff_hours: topMap },
      staff_hours: topMap,
      updatedAt: serverTimestamp()
    }, { merge: true });
  });

  // Canonical businesses’a da yaz (staff + staff_hours)
  await updateDoc(BIZ_REF, {
    staff: step8List,         // businesses tarafında personel dizi: {name, role, position, hours(TR), services}
    staff_hours: topMap,
    updatedAt: serverTimestamp()
  }).catch(async ()=>{
    await setDoc(BIZ_REF, {
      staff: step8List,
      staff_hours: topMap,
      updatedAt: serverTimestamp()
    }, { merge: true });
  });
}

/* AUTH → belgeyi getir & doldur + staff cache */
onAuthStateChanged(auth, async (user) => {
  try {
    if (!user) {
      const ret = encodeURIComponent(location.pathname.replace(/^\//, ""));
      location.href = `admin-register-login.html#login?return_to=${ret}`;
      return;
    }
    UID = user.uid;
    AO_REF  = doc(db, "adminOnboarding", UID);
    BIZ_REF = doc(db, "businesses", UID);

    const [bizSnap, aoSnap] = await Promise.all([getDoc(BIZ_REF), getDoc(AO_REF)]);
    const biz = bizSnap.exists() ? bizSnap.data() : {};
    const ao  = aoSnap.exists()  ? aoSnap.data()  : {};

    await prefillFromDocs(biz, ao);

    // Çalışanları da yükle (AO kaynağından)
    await ensureStaffLoaded();
  } catch (e) {
    console.warn("prefill error:", e?.message || e);
    await prefillFromDocs({}, {});
  }
});

/* ===========================
   İşletme güncelleme yükü (AO + businesses)
   =========================== */
function buildUpdatesForFirestore() {
  // Ortak normalize
  const normalizedServices = services
    .map((s) => ({ name: (s.name || "").trim(), min: Number(s.min) || 30, price: s.price === "" ? "" : Number(s.price) }))
    .filter((s) => s.name !== "");

  const phoneVal = (contactPhone?.value || "").replace(/\D/g, "").slice(0, 10);
  const bn = (bizName?.value || "").trim();

  // Canonical businesses alanları
  const bizUpdates = {
    "business.name": bn || null,
    "name": bn || null, // bazı ekranlar "name" okuyabilir
    "business.about": (aboutText?.value || "").trim(),
    "business.phone": phoneVal,
    "businessLocation.province": "İstanbul",
    "businessLocation.district": dist?.value || "",
    "businessLocation.neighborhood": hood?.value || "",
    "businessLocation.building": (buildingNo?.value || "").trim(),
    "businessLocation.mapUrl": (mapUrl?.value || "").trim(),
    "services": normalizedServices,
    "businessHours": bizHours,
    "updatedAt": serverTimestamp(),
  };

  // AO mirror alanları
  const aoUpdates = {
    "step2.businessName": bn || "",
    "business.name": bn || null,
    "business.about": (aboutText?.value || "").trim(),
    "business.phone": phoneVal,
    "businessLocation.province": "İstanbul",
    "businessLocation.district": dist?.value || "",
    "businessLocation.neighborhood": hood?.value || "",
    "businessLocation.building": (buildingNo?.value || "").trim(),
    "businessLocation.mapUrl": (mapUrl?.value || "").trim(),
    "step5.businessLocation.province": "İstanbul",
    "step5.businessLocation.district": dist?.value || "",
    "step5.businessLocation.neighborhood": hood?.value || "",
    "step5.businessLocation.building": (buildingNo?.value || "").trim(),
    "step5.businessLocation.mapUrl": (mapUrl?.value || "").trim(),
    "services": normalizedServices,
    "step7.services": normalizedServices.map(s=>s.name),
    "businessHours": bizHours,
    "step6.businessHours": bizHours,
    "updatedAt": serverTimestamp(),
  };

  return { bizUpdates, aoUpdates };
}

/* ===========================
   KAYDET (+ STAFF SYNC)
   =========================== */
$("#saveBtn")?.addEventListener("click", async () => {
  if (!UID) return showToast("Giriş gerekli");

  for (const k of Object.keys(bizHours)) {
    if (!validateDay(bizHours[k])) {
      showToast(`${labelOf(k)}: Kapanış, açılıştan büyük olmalı`, "error");
      return;
    }
  }

  // ---- STAFF SYNC: çalışanları işletme saatlerine uydur
  await ensureStaffLoaded();
  let staffChangesSummary = "";
  let nextEmployees = null;

  if (staffCache.length){
    const { next, changes } = clampStaffToBusiness(bizHours, staffCache);
    nextEmployees = next;
    if (changes.length){
      staffChangesSummary =
        "Uyarı: Bazı çalışan vardiyaları işletme saatlerinize uyarlandı:\n\n" +
        formatChangeSummary(changes) +
        "\n\nBilgi: Çalışanın işbaşı/çıkış saati, dükkan açılış/kapanış saatinin dışına çıkamaz.";
      alert(
    "Uyarı: Bazı çalışan vardiyaları işletme saatlerinize uyarlandı:\n\n" +
    summary +
    "\n\nBilgi: Çalışanın işbaşı/çıkış saati, dükkan açılış/kapanış saatinin dışına çıkamaz."
  );
    }
  }

  const { bizUpdates, aoUpdates } = buildUpdatesForFirestore();
  const btn = $("#saveBtn");
  btn.disabled = true; const old = btn.textContent; btn.textContent = "Kaydediliyor…";

  try {
    // 1) Canonical businesses
    await updateDoc(BIZ_REF, bizUpdates).catch(async ()=>{ await setDoc(BIZ_REF, bizUpdates, { merge: true }); });

    // 2) AO mirror
    await updateDoc(AO_REF, aoUpdates).catch(async ()=>{ await setDoc(AO_REF, aoUpdates, { merge: true }); });

    // 3) Çalışan saatlerini yaz + step8 uyumluluk alanlarını güncelle
    if (nextEmployees) {
      await persistStaff(nextEmployees);
      staffCache = nextEmployees;
    }

    showToast("Kaydedildi", "success"); setDirty(false);
  } catch (err) {
    alert("Kaydedilemedi: " + (err?.message || err));
  } finally {
    btn.disabled = false; btn.textContent = old;
  }
});
