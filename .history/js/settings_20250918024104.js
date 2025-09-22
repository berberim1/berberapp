/* ===========================
   AYARLAR – Firestore Entegre (v11.4)
   - business.about & business.phone
   - Storage upload iyileştirmeleri (contentType, hata logları)
   =========================== */

console.log("[settings] settings.js yüklendi (v11.4)");

import { auth, db, storage } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
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
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import {
  ref as sRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

/* ====== yardımcılar ====== */
const $ = (s, r = document) => r.querySelector(s);
const toast = $("#toast");

/* tip destekli toast */
function showToast(msg = "Kaydedildi", type = "default") {
  if (!toast) return console.log("[toast]", msg);
  toast.textContent = msg;
  toast.classList.remove("success", "error");
  if (type === "success") toast.classList.add("success");
  if (type === "error") toast.classList.add("error");
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show", "success", "error");
  }, 1600);
}

/* ====== Dirty state ====== */
let DIRTY = false;
function setDirty(v = true) {
  DIRTY = v;
  const b = document.getElementById("saveBtn");
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
      document.getElementById("saveBtn")?.click();
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (DIRTY) { e.preventDefault(); e.returnValue = ""; }
  });
}

/* ====== Giriş kalıcılığı ====== */
setPersistence(auth, browserLocalPersistence).catch((e) => {
  console.warn("[auth] setPersistence:", e?.message || e);
});

/* =========================================================
   BAR-MENU (rail) mount
   ========================================================= */
(async () => {
  try {
    // Eski kopyaları temizle
    document.querySelectorAll("aside.rail").forEach((n) => n.remove());

    const res = await fetch("bar-menu.html", { cache: "no-store" });
    const html = await res.text();
    const docx = new DOMParser().parseFromString(html, "text/html");

    // CSS
    const style = docx.querySelector("#bar-menu-css");
    if (style && !document.getElementById("bar-menu-css")) {
      document.head.appendChild(style.cloneNode(true));
    }

    // Nav + overlay
    const nav = docx.querySelector("nav.rail");
    const sbOverlay = docx.querySelector("#sbOverlay");
    if (nav) {
      let holder = document.getElementById("bar-menu");
      if (!holder) {
        holder = document.createElement("div");
        holder.id = "bar-menu";
        document.body.insertAdjacentElement("afterbegin", holder);
      }
      holder.appendChild(nav.cloneNode(true));
    }
    if (sbOverlay) document.body.appendChild(sbOverlay.cloneNode(true));

    // Sadece aktif sayfa mor, diğerleri hep opak
    const current = (location.pathname.split("/").pop() || "settings.html").toLowerCase();
    document.querySelectorAll("nav.rail .rail__btn").forEach((a) => {
      const hrefFile = (a.getAttribute("href") || "").split("/").pop().toLowerCase();
      if (hrefFile === current) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });

    // Sidebar modal
    const openBtn =
      document.querySelector("nav.rail #openProfile") ||
      document.querySelector("nav.rail .rail__bottom .avatar-btn");
    const overlay = document.getElementById("sbOverlay");
    const closeBtn = document.getElementById("sbClose");

    function openSb() { overlay?.classList.add("show"); document.body.style.overflow = "hidden"; }
    function closeSb() { overlay?.classList.remove("show"); document.body.style.overflow = ""; }

    openBtn?.addEventListener("click", (e) => { e.preventDefault(); openSb(); });
    closeBtn?.addEventListener("click", closeSb);
    overlay?.addEventListener("click", (e) => { if (e.target === overlay) closeSb(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSb(); });

    // ÇIKIŞ
    const sbLogout = document.getElementById("sbLogout");
    sbLogout?.addEventListener("click", async () => {
      try {
        sbLogout.disabled = true;
        sbLogout.textContent = "Çıkış yapılıyor…";
        await signOut(auth);
      } catch (err) {
        console.error("signOut error:", err);
      } finally {
        const ret = encodeURIComponent("settings.html");
        location.href = `admin-register-login.html#login?return_to=${ret}`;
      }
    });
  } catch (e) {
    console.warn("[rail] bar-menu mount hatası:", e);
  }
})();

/* ===========================
   İl / İlçe / Mahalle (sadece İstanbul)
   =========================== */
const DATA = {
  İstanbul: {
    Ümraniye: [
      "Atakent","Atatürk","Aşağıdudullu","Çakmak","Esenevler","Esenkent","Hekimbaşı",
      "Ihlamurkuyu","İnkılap","İstiklal","Kazım Karabekir","Namık Kemal","Parseller",
      "Sarıkaya","Tantavi","Tatlısu","Tepeüstü","Yamanevler","Yukarıdudullu"
    ],
    Üsküdar: [
      "Altunizade","Aziz Mahmut Hüdayi","Bahçelievler","Beylerbeyi","Burhaniye","Bulgurlu",
      "Cumhuriyet","Çengelköy","Ferah","Güzeltepe","İcadiye","Kandilli","Kısıklı","Kuzguncuk",
      "Küçük Çamlıca","Mehmet Akif Ersoy","Mimar Sinan","Salacak","Selami Ali","Sultantepe",
      "Ünalan","Valide-i Atik","Yavuztürk","Zeynep Kamil"
    ],
  },
};
const city = $("#city"),
  dist = $("#district"),
  hood = $("#hood");

function fillCities() {
  if (!city) return;
  city.length = 0;
  city.add(new Option("İstanbul", "İstanbul", true, true));
  city.disabled = true;
}
function fillDistricts() {
  if (!dist || !hood) return;
  dist.length = 0;
  dist.add(new Option("İlçe seçin", "", true, true));
  dist.disabled = false;
  hood.length = 0;
  hood.add(new Option("Mahalle seçin", "", true, true));
  hood.disabled = true;
  Object.keys(DATA["İstanbul"]).forEach((d) => dist.add(new Option(d, d)));
}
function fillHoods() {
  if (!hood) return;
  hood.length = 0;
  hood.add(new Option("Mahalle seçin", "", true, true));
  hood.disabled = !dist.value;
  if (!dist.value) return;
  (DATA["İstanbul"]?.[dist.value] || []).forEach((h) => hood.add(new Option(h, h)));
}
function ensureOption(select, value, label) {
  if (!select || !value) return;
  const exists = [...select.options].some((o) => o.value === value);
  if (!exists) select.add(new Option(label ?? value, value));
  select.value = value;
}
city?.addEventListener("change", fillDistricts);
dist?.addEventListener("change", fillHoods);
fillCities();

/* ===========================
   Görsel (çoklu)
   =========================== */
function createThumb(url, kind) {
  const el = document.createElement("div");
  el.className = "thumb";
  el.innerHTML = `<img src="${url}" alt=""><button class="del" title="Sil">Sil</button>`;
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
  try {
    const path = storagePath(uid, kind, file);
    const r = sRef(storage, path);
    // contentType ekleyelim (özellikle bazı jpg/png'lerde gerekli)
    await uploadBytes(r, file, { contentType: file.type || "application/octet-stream" });
    const url = await getDownloadURL(r);

    await updateDoc(doc(db, "adminOnboarding", uid), {
      [`images.${kind}`]: arrayUnion(url),
      updatedAt: serverTimestamp(),
    });
    return url;
  } catch (err) {
    console.error("[uploadImageToStorage]", err);
    throw err;
  }
}
function bindUploader(kind) {
  const btn = document.querySelector(`[data-upload="${kind}"]`);
  const input = document.querySelector(`[data-input="${kind}"]`);
  const list = document.getElementById(kind + "Thumbs");
  if (!btn || !input || !list) return;

  btn.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    if (!UID) {
      showToast("Giriş gerekli");
      input.value = null;
      return;
    }
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
      } catch (e) {
        list.removeChild(loadingTile);
        showToast("Görsel yüklenemedi", "error");
      }
    }
    input.value = null;
  });
}
["cover", "salon", "model"].forEach(bindUploader);

/* ===========================
   Hizmetler UI
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
        <input class="input" inputmode="numeric" pattern="[0-9]*" min="5" step="5"
               value="${min}" data-k="min" data-i="${idx}" placeholder="dk" />
      </div>
      <div class="td" style="width:120px">
        <input class="input" inputmode="numeric" pattern="[0-9]*" min="0" step="1"
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
  const t = e.target;
  const k = t.dataset.k, i = +t.dataset.i;
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
  if (up) {
    const i = +up.dataset.up;
    if (i > 0) {
      [services[i - 1], services[i]] = [services[i], services[i - 1]];
      renderServices(); setDirty(true);
    }
  }
  if (down) {
    const i = +down.dataset.down;
    if (i < services.length - 1) {
      [services[i + 1], services[i]] = [services[i], services[i + 1]];
      renderServices(); setDirty(true);
    }
  }
  if (del) {
    const i = +del.dataset.del;
    services.splice(i, 1);
    renderServices(); setDirty(true);
  }
});
$("#addQuick")?.addEventListener("click", () => {
  services.push({ name: "", min: 30, price: "" });
  renderServices(); setDirty(true);
});

/* ====== Picker ====== */
const pickerEl = $("#picker"),
  openPicker = $("#openPicker"),
  pickedChips = $("#pickedChips"),
  pickerList = $("#pickerList"),
  pickerSearch = $("#pickerSearch"),
  savePicked = $("#savePicked");

const CATALOG = [
  "Erkek Saç Kesimi","Sakal","Saç & sakal","Çocuk saç kesimi","Saç Boyama",
  "Fön","Saç bakımı","Kaş","Ağda","Perma","Brezilya fönü",
];
let tempSelected = new Set();

function renderPicker() {
  const q = (pickerSearch?.value || "").toLowerCase().trim();
  if (pickerList) pickerList.innerHTML = "";
  if (pickedChips) pickedChips.innerHTML = "";

  tempSelected.forEach((n) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `${n} <button class="rm" data-rm="${n}">x</button>`;
    pickedChips?.appendChild(chip);
  });

  CATALOG.filter((n) => n.toLowerCase().includes(q)).forEach((n) => {
    const it = document.createElement("div");
    const sel = tempSelected.has(n);
    it.className = "item";
    it.innerHTML = `<div>${n}</div><button class="${sel ? "pick sel" : "pick"}" data-toggle="${n}">${sel ? "SEÇİLDİ" : "SEÇ"}</button>`;
    pickerList?.appendChild(it);
  });

  if (savePicked) savePicked.textContent = `SEÇİLENLERİ KAYDET (${tempSelected.size})`;
}

function openPickerModal() {
  pickerEl?.classList.add("show");
  pickerEl?.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  renderPicker();
  pickerSearch?.focus();
}
function closePickerModal() {
  pickerEl?.classList.remove("show");
  pickerEl?.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

openPicker?.addEventListener("click", () => {
  tempSelected = new Set();
  openPickerModal();
});
pickerEl?.addEventListener("click", (e) => {
  if (e.target.hasAttribute?.("data-close") || e.target === pickerEl)
    closePickerModal();
});
document.addEventListener("keydown", (e) => {
  if (!pickerEl?.classList.contains("show")) return;
  if (e.key === "Escape") closePickerModal();
});

pickerList?.addEventListener("click", (e) => {
  const t = e.target.closest?.("[data-toggle]");
  if (!t) return;
  const name = t.dataset.toggle;
  const was = tempSelected.has(name);
  was ? tempSelected.delete(name) : tempSelected.add(name);
  renderPicker();
  showToast(was ? "Kaldırıldı" : "Eklendi", was ? "default" : "success");
});
pickedChips?.addEventListener("click", (e) => {
  const rm = e.target.dataset?.rm;
  if (rm) {
    tempSelected.delete(rm);
    renderPicker();
    showToast("Kaldırıldı");
  }
});
savePicked?.addEventListener("click", () => {
  let added = 0;
  tempSelected.forEach((n) => {
    if (!services.some((s) => (s.name || "").toLowerCase() === n.toLowerCase())) {
      services.push({ name: n, min: 30, price: "" });
      added++;
    }
  });
  renderServices();
  closePickerModal();
  setDirty(true);
  if (added > 0) showToast(`${added} hizmet eklendi`, "success");
  else showToast("Değişiklik yok");
});

/* ===========================
   Hakkımızda + Telefon
   =========================== */
const aboutEl = $("#about"); // (şu an kullanılmıyor ama ileride alan validasyonu için tutuldu)
const contactPhoneEl = $("#contactPhone");

/* Sadece rakam – 10 hane maske */
function onlyDigits10(v) {
  return (v || "").replace(/\D/g, "").slice(0, 10);
}
function bindPhoneMask() {
  if (!contactPhoneEl) return;

  let composing = false;
  contactPhoneEl.addEventListener("compositionstart", () => (composing = true));
  contactPhoneEl.addEventListener("compositionend", () => {
    composing = false;
    contactPhoneEl.value = onlyDigits10(contactPhoneEl.value);
  });

  contactPhoneEl.addEventListener("input", () => {
    if (composing) return;
    const digits = onlyDigits10(contactPhoneEl.value);
    if (digits !== contactPhoneEl.value) {
      const pos = contactPhoneEl.selectionStart || digits.length;
      contactPhoneEl.value = digits;
      contactPhoneEl.setSelectionRange(pos, pos);
    }
  });

  contactPhoneEl.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text");
    const digits = onlyDigits10(text);
    document.execCommand("insertText", false, digits);
  });

  contactPhoneEl.addEventListener("blur", () => {
    const val = onlyDigits10(contactPhoneEl.value);
    contactPhoneEl.value = val;
    contactPhoneEl.toggleAttribute("aria-invalid", val.length !== 10);
    if (val && val.length !== 10) {
      showToast("Telefon 10 haneli olmalı (örn. 5XXXXXXXXX)", "error");
    }
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
   AUTH + DOC YÜKLEME
   =========================== */
let UID = null;
let lastData = {};

function materializeData(d) {
  const step5Loc = d?.step5?.businessLocation || {};
  const step2 = d?.step2 || {};
  const name = d?.business?.name || step2.businessName || "İşletmeniz";

  const cityVal = "İstanbul";
  const districtVal = step5Loc.district || "";
  const hoodVal = step5Loc.neighborhood || "";
  const buildingVal = step5Loc.building || "";
  const mapLink = step5Loc.mapUrl || "";

  // Yeni alanlar
  const about = d?.business?.about || "";
  const phone = d?.business?.phone || step2.phone || "";

  const fromRoot = Array.isArray(d?.services) ? d.services : [];
  const fromStep7 = (d?.step7?.services || []).map((n) => ({ name: n, min: 30, price: "" }));
  const merged = [...fromRoot, ...fromStep7];

  const uniq = [];
  const seen = new Set();
  merged.forEach((s) => {
    const nm = (s?.name || s || "").toString().trim();
    if (!nm || seen.has(nm.toLowerCase())) return;
    seen.add(nm.toLowerCase());
    if (typeof s === "string") uniq.push({ name: nm, min: 30, price: "" });
    else uniq.push({ name: s.name || "", min: s.min ?? 30, price: s.price ?? "" });
  });

  return {
    business: {
      name,
      about,
      phone,
      address: { city: cityVal, district: districtVal, hood: hoodVal, buildingNo: buildingVal, mapUrl: mapLink },
    },
    services: uniq,
  };
}
function asArr(v) { if (!v) return []; return Array.isArray(v) ? v : [v]; }

async function prefillFromDoc(d) {
  lastData = d || {};
  const data = materializeData(lastData);

  if (bizName) bizName.value = data.business.name || "";
  if (aboutText) aboutText.value = data.business.about || "";
  if (contactPhone) contactPhone.value = data.business.phone || "";

  fillCities();
  ensureOption(city, data.business.address.city);
  fillDistricts();
  ensureOption(dist, data.business.address.district);
  fillHoods();
  ensureOption(hood, data.business.address.hood);
  if (buildingNo) buildingNo.value = data.business.address.buildingNo || "";
  if (mapUrl) mapUrl.value = data.business.address.mapUrl || "";

  renderThumbs($("#coverThumbs"), asArr(lastData?.images?.cover), "cover");
  renderThumbs($("#salonThumbs"), asArr(lastData?.images?.salon), "salon");
  renderThumbs($("#modelThumbs"), asArr(lastData?.images?.model), "model");

  services = data.services.length
    ? data.services
    : [
        { name: "Erkek Saç Kesimi", min: 30, price: 300 },
        { name: "Sakal", min: 20, price: 150 },
        { name: "Saç & sakal", min: 45, price: 400 },
      ];
  renderServices();

  const bmUserNameEl = $("#bmUserName");
  if (bmUserNameEl) bmUserNameEl.textContent = lastData?.step2?.adminName || "Kullanıcı";

  attachDirtyWatchers();
  setDirty(false);
}

/* UI → Firestore alan eşleme */
function buildUpdatesForFirestore() {
  const updates = {};
  if (dist?.value) updates["step5.businessLocation.district"] = dist.value;
  if (hood?.value) updates["step5.businessLocation.neighborhood"] = hood.value;
  updates["step5.businessLocation.province"] = "İstanbul";
  updates["step5.businessLocation.building"] = (buildingNo?.value || "").trim();
  updates["step5.businessLocation.mapUrl"] = (mapUrl?.value || "").trim();

  // Yeni alanlar
  updates["business.about"] = (aboutText?.value || "").trim();

  // Telefonu boşluklardan arındır (yalnızca 10 hane)
  const phoneVal = (contactPhone?.value || "").replace(/\D/g, "").slice(0, 10);
  updates["business.phone"] = phoneVal;

  const normalized = services
    .map((s) => ({ name: (s.name || "").trim(), min: Number(s.min) || 30, price: s.price === "" ? "" : Number(s.price) }))
    .filter((s) => s.name !== "");

  updates["step7.services"] = normalized.map((s) => s.name);
  updates["services"] = normalized;

  const bn = (bizName?.value || "").trim();
  if (bn) { updates["business.name"] = bn; updates["step2.businessName"] = bn; }

  updates["updatedAt"] = serverTimestamp();
  return updates;
}

/* Auth → belgeyi getir & doldur */
let UID = null;
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
    if (!snap.exists()) { await prefillFromDoc({}); return; }
    await prefillFromDoc(snap.data());
  } catch (e) {
    await prefillFromDoc({}); alert("Firestore okuma hatası: " + (e?.message || e));
  }
});

/* ===========================
   KAYDET
   =========================== */
const saveBtnEl = saveBtn;
saveBtnEl?.addEventListener("click", async () => {
  if (!UID) return showToast("Giriş gerekli");
  const updates = buildUpdatesForFirestore();

  saveBtnEl.disabled = true;
  const old = saveBtnEl.textContent;
  saveBtnEl.textContent = "Kaydediliyor…";

  try {
    await updateDoc(doc(db, "adminOnboarding", UID), updates);
    showToast("Kaydedildi", "success");
    setDirty(false);
  } catch (e) {
    try {
      await setDoc(doc(db, "adminOnboarding", UID), updates, { merge: true });
      showToast("Kaydedildi", "success");
      setDirty(false);
    } catch (err) {
      console.error("[save] setDoc hatası:", err?.code, err?.message || err);
      alert("Kaydedilemedi: " + (err?.message || err));
    }
  } finally {
    saveBtnEl.disabled = false;
    saveBtnEl.textContent = old;
  }
});
