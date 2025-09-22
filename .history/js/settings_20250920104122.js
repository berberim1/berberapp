/* ===========================
   AYARLAR – Firestore + Business Hours MODAL (v13.0 staff-sync)
   =========================== */

console.log("[settings] settings.js yüklendi (v13.0 staff-sync)");

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
  // === STAFF SYNC: alt koleksiyon ve batch güncellemeler için
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
   STORAGE thumbs + lightbox
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

function createThumb(url, kind) {
  const el = document.createElement("div");
  el.className = "thumb";
  el.innerHTML = `<img src="${url}" alt=""><button class="del" title="Sil">Sil</button>`;
  el.querySelector("img").addEventListener("click", () => openImageViewer(url));
  el.querySelector(".del").addEventListener("click", async () => {
    if (!UID) return showToast("Giriş gerekli");
    try {
      await updateDoc(doc(db, "adminOnboarding", UID), {
        [`images.${kind}`]: arrayRemove(url),
        updatedAt: serverTimestamp(),
      });
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

  const ref = doc(db, "adminOnboarding", uid);
  try {
    await updateDoc(ref, { [`images.${kind}`]: arrayUnion(url), updatedAt: serverTimestamp() });
  } catch (e) {
    if (e?.code === "not-found" || /No document to update/i.test(e?.message || "")) {
      await setDoc(ref, { images: { [kind]: [url] }, updatedAt: serverTimestamp() }, { merge: true });
    } else { throw e; }
  }
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
      <div class="td ops" style="width:160px">
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
   BUSINESS HOURS – State & Modal Flow (fixed v12.4)
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
  hoursBackup = JSON.parse(JSON.stringify(bizHours)); // olası vazgeç için
  renderHoursList();
  openModal(bhModal);
});

/* ---- Ana modal içi delegasyon ---- */
bhModal?.addEventListener("click", (e)=>{
  // Header X → vazgeç (backup geri)
  if (e.target.closest(".picker__hd [data-close]")){
    if (hoursBackup) bizHours = hoursBackup;
    closeModal(bhModal);
    renderHoursSummary();
    return;
  }
  // Footer “Devam” → kapat + özet
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
   AUTH + Prefill
   =========================== */
let UID = null;
let lastData = {};

/* ====== STAFF SYNC – cache ====== */
let staffCache = [];         // { id, name, hours, raw, path: 'sub'|'array' }
let staffPath = null;        // 'sub' (alt koleksiyon) | 'array' (ana doküman alanı) | null
let staffLoaded = false;

function materializeData(d) {
  const step5Loc = d?.businessLocation || d?.step5?.businessLocation || {};
  const step2 = d?.step2 || {};

  const name = d?.business?.name || step2.businessName || "İşletmeniz";

  const cityVal = "İstanbul";
  const districtVal = step5Loc.district || "";
  const hoodVal = step5Loc.neighborhood || "";
  const buildingVal = step5Loc.building || "";
  const mapLink = step5Loc.mapUrl || "";

  const about = d?.business?.about || "";
  const phone = d?.business?.phone || step2.phone || "";

  const fromRoot = Array.isArray(d?.services) ? d.services : [];
  const fromStep7 = (d?.step7?.services || []).map((n) => ({ name: n, min: 30, price: "" }));
  const merged = [...fromRoot, ...fromStep7];

  const uniq = []; const seen = new Set();
  merged.forEach((s) => {
    const nm = (s?.name || s || "").toString().trim();
    if (!nm || seen.has(nm.toLowerCase())) return;
    seen.add(nm.toLowerCase());
    if (typeof s === "string") uniq.push({ name: nm, min: 30, price: "" });
    else uniq.push({ name: s.name || "", min: s.min ?? 30, price: s.price ?? "" });
  });

  const hours = d?.businessHours || d?.step6?.businessHours || defaultHours();

  return {
    business: {
      name, about, phone,
      address: { city: cityVal, district: districtVal, hood: hoodVal, buildingNo: buildingVal, mapUrl: mapLink }
    },
    services: uniq,
    businessHours: hours,
  };
}
function asArr(v){ if(!v) return []; return Array.isArray(v) ? v : [v]; }

async function prefillFromDoc(d) {
  lastData = d || {};
  const data = materializeData(lastData);

  if (bizName) bizName.value = data.business.name || "";
  if (aboutText) aboutText.value = data.business.about || "";
  if (contactPhone) contactPhone.value = data.business.phone || "";

  fillCities(); ensureOption(city, data.business.address.city);
  fillDistricts(); ensureOption(dist, data.business.address.district);
  fillHoods(); ensureOption(hood, data.business.address.hood);
  if (buildingNo) buildingNo.value = data.business.address.buildingNo || "";
  if (mapUrl) mapUrl.value = data.business.address.mapUrl || "";

  // Görseller
  renderThumbs($("#coverThumbs"), asArr(lastData?.images?.cover), "cover");
  renderThumbs($("#salonThumbs"), asArr(lastData?.images?.salon), "salon");
  renderThumbs($("#modelThumbs"), asArr(lastData?.images?.model), "model");

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
  if (bmUserNameEl) bmUserNameEl.textContent =
    lastData?.owner?.name || lastData?.step2?.adminName || "Kullanıcı";

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
function denormalizeBack(nObj, raw, changed){
  // raw ile aynı anahtarları koruyarak geri yazar.
  const out = {...raw};
  DAY_KEYS.forEach(k=>{
    const n = nObj[k];
    const base = raw[k] || {};
    if ("start" in base || "end" in base){
      out[k] = { ...base, start: n.start, end: n.end, off: n.off };
    } else {
      out[k] = { ...base, open: n.start, close: n.end, closed: n.off };
    }
  });
  return out;
}

/* Çalışanları getir (alt koleksiyon öncelikli) */
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
  const changes = []; // {name, day, fromStart, toStart, fromEnd, toEnd, reason}
  const next = employees.map(emp=>{
    if (!emp.hours) return emp;
    const clone = JSON.parse(JSON.stringify(emp));
    DAY_KEYS.forEach(k=>{
      const e = clone.hours[k]; if (!e) return;
      const b = bh[k];
      if (!b) return;

      if (b.closed){
        if (!e.off){
          changes.push({ name: emp.name, day: LABEL_BY_KEY[k], reason:"closed", fromStart:e.start, fromEnd:e.end, toStart:null, toEnd:null });
          e.off = true; e.start = null; e.end = null;
        }
        return;
      }
      if (e.off) return; // zaten izinli

      // start >= open, end <= close
      const bOpen = t2m(b.open), bClose = t2m(b.close);
      if (e.start){
        const s = t2m(e.start);
        if (s < bOpen){
          changes.push({ name: emp.name, day: LABEL_BY_KEY[k], reason:"open", fromStart:e.start, toStart:b.open });
          e.start = b.open;
        }
      } else {
        e.start = b.open;
        changes.push({ name: emp.name, day: LABEL_BY_KEY[k], reason:"open", fromStart:null, toStart:b.open });
      }
      if (e.end){
        const en = t2m(e.end);
        if (en > bClose){
          changes.push({ name: emp.name, day: LABEL_BY_KEY[k], reason:"close", fromEnd:e.end, toEnd:b.close });
          e.end = b.close;
        }
      } else {
        e.end = b.close;
        changes.push({ name: emp.name, day: LABEL_BY_KEY[k], reason:"close", fromEnd:null, toEnd:b.close });
      }
      // start < end güvenliği
      if (t2m(e.start) >= t2m(e.end)){
        // en azından 30dk
        const fixEnd = m2t(Math.min(t2m(b.close), t2m(e.start)+30));
        changes.push({ name: emp.name, day: LABEL_BY_KEY[k], reason:"order", fromEnd:e.end, toEnd:fixEnd });
        e.end = fixEnd;
      }
    });
    return clone;
  });
  return { next, changes };
}

/* Değişiklikleri kullanıcıya özetle */
function formatChangeSummary(changes){
  if (!changes.length) return "";
  const rows = changes.slice(0,8).map(ch=>{
    if (ch.reason==="closed"){
      return `• ${ch.name} – ${ch.day}: İş yeri kapalı ⇒ çalışan izinli yapılacak`;
    }
    if (ch.reason==="open" && ch.fromStart && ch.toStart){
      return `• ${ch.name} – ${ch.day}: İşbaşı ${ch.fromStart} ⇒ ${ch.toStart}`;
    }
    if (ch.reason==="close" && ch.fromEnd && ch.toEnd){
      return `• ${ch.name} – ${ch.day}: Çıkış ${ch.fromEnd} ⇒ ${ch.toEnd}`;
    }
    // fallback
    const parts=[];
    if (ch.toStart) parts.push(`başlangıç ${ch.fromStart||"—"} ⇒ ${ch.toStart}`);
    if (ch.toEnd)   parts.push(`bitiş ${ch.fromEnd||"—"} ⇒ ${ch.toEnd}`);
    return `• ${ch.name} – ${ch.day}: ${parts.join(", ")}`;
  });
  const more = changes.length>8 ? `\n… ve ${changes.length-8} değişiklik daha.` : "";
  return rows.join("\n")+more;
}

/* Firestore’a yaz: alt koleksiyon varsa batch, yoksa ana dokümandaki dizi */
async function persistStaff(nextEmployees){
  if (!UID || !staffPath) return;
  if (staffPath === "sub"){
    const batch = writeBatch(db);
    nextEmployees.forEach(emp=>{
      const ref = doc(db,"adminOnboarding",UID,"staff",emp.id);
      // hours alanını, orijinal anahtarları koruyarak yaz
      const newHours = denormalizeBack(emp.hours, emp.raw.hours || emp.raw.workHours || emp.raw.workingHours || {}, true);
      const payload = { ...emp.raw, hours: newHours, updatedAt: serverTimestamp() };
      batch.set(ref, payload, { merge: true });
    });
    await batch.commit();
  } else if (staffPath === "array"){
    const arr = nextEmployees.map(emp=>{
      const newHours = denormalizeBack(emp.hours, emp.raw.hours || emp.raw.workHours || emp.raw.workingHours || {}, true);
      return { ...emp.raw, id: emp.id, name: emp.name, hours: newHours };
    });
    const ref = doc(db,"adminOnboarding",UID);
    await updateDoc(ref, { staff: arr, updatedAt: serverTimestamp() }).catch(async ()=>{
      await setDoc(ref, { staff: arr, updatedAt: serverTimestamp() }, { merge: true });
    });
  }
}

/* UI -> Firestore updates (işletme) */
function buildUpdatesForFirestore() {
  const updates = {};

  if (dist?.value) updates["businessLocation.district"] = dist.value;
  if (hood?.value) updates["businessLocation.neighborhood"] = hood.value;
  updates["businessLocation.province"] = "İstanbul";
  updates["businessLocation.building"] = (buildingNo?.value || "").trim();
  updates["businessLocation.mapUrl"] = (mapUrl?.value || "").trim();

  updates["step5.businessLocation.district"] = dist?.value || "";
  updates["step5.businessLocation.neighborhood"] = hood?.value || "";
  updates["step5.businessLocation.province"] = "İstanbul";
  updates["step5.businessLocation.building"] = (buildingNo?.value || "").trim();
  updates["step5.businessLocation.mapUrl"] = (mapUrl?.value || "").trim();

  updates["business.about"] = (aboutText?.value || "").trim();
  const phoneVal = (contactPhone?.value || "").replace(/\D/g, "").slice(0, 10);
  updates["business.phone"] = phoneVal;

  const normalized = services
    .map((s) => ({ name: (s.name || "").trim(), min: Number(s.min) || 30, price: s.price === "" ? "" : Number(s.price) }))
    .filter((s) => s.name !== "");
  updates["step7.services"] = normalized.map((s) => s.name);
  updates["services"] = normalized;

  const bn = (bizName?.value || "").trim();
  if (bn) { updates["business.name"] = bn; updates["step2.businessName"] = bn; }

  // businessHours
  updates["businessHours"] = bizHours;
  updates["step6.businessHours"] = bizHours;

  updates["updatedAt"] = serverTimestamp();
  return updates;
}

/* Auth → belgeyi getir & doldur + staff cache */
onAuthStateChanged(auth, async (user) => {
  try {
    if (!user) {
      const ret = encodeURIComponent(location.pathname.replace(/^\//, ""));
      location.href = `admin-register-login.html#login?return_to=${ret}`;
      return;
    }
    UID = user.uid;
    const ref = doc(db, "adminOnboarding", UID);
    const snap = await getDoc(ref);
    if (!snap.exists()) { await prefillFromDoc({}); }
    else { await prefillFromDoc(snap.data()); }
    // Çalışanları da yükle
    await ensureStaffLoaded();
  } catch (e) {
    await prefillFromDoc({});
    console.warn("prefill error:", e?.message || e);
  }
});

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
      // Bilgilendir
      alert(staffChangesSummary);
    }
  }

  const updates = buildUpdatesForFirestore();
  const btn = $("#saveBtn");
  btn.disabled = true; const old = btn.textContent; btn.textContent = "Kaydediliyor…";

  try {
    // 1) İşletme ayarlarını yaz
    await updateDoc(doc(db, "adminOnboarding", UID), updates).catch(async ()=>{
      await setDoc(doc(db, "adminOnboarding", UID), updates, { merge: true });
    });
    // 2) Çalışan saatlerini yaz (varsa)
    if (nextEmployees) {
      await persistStaff(nextEmployees);
      // cache’i güncelle
      staffCache = nextEmployees;
    }

    showToast("Kaydedildi", "success"); setDirty(false);
  } catch (err) {
    alert("Kaydedilemedi: " + (err?.message || err));
  } finally {
    btn.disabled = false; btn.textContent = old;
  }
});
