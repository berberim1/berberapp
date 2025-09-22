/* functions/index.js */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

initializeApp();
const db = getFirestore();

/* ============= Helpers ============= */
const now = () => FieldValue.serverTimestamp();
const newId = (p = "biz") => `${p}_${db.collection("_").doc().id}`;

const tr2slug = (s = "") => {
  const tr = { "ş":"s","Ş":"s","ı":"i","İ":"i","ç":"c","Ç":"c","ü":"u","Ü":"u","ö":"o","Ö":"o","ğ":"g","Ğ":"g" };
  return String(s)
    .replace(/[ŞşıİçÇüÜöÖğĞ]/g, (m) => tr[m] || m)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "profil";
};

// TR gün → index (0=Pazar ... 6=Cumartesi)
const DAY_INDEX = { Pazar:0, Pazartesi:1, Salı:2, Çarşamba:3, Perşembe:4, Cuma:5, Cumartesi:6 };

// "HH:MM" → dakika
const toMin = (hhmm = "") => {
  const [h, m] = String(hhmm).split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return Math.max(0, Math.min(1440, h * 60 + m));
};

// TR telefon → +90XXXXXXXXXX (E.164). 0, 90, +90 vb. varyasyonları normalize eder.
const toE164TR = (raw = "") => {
  const s = String(raw).trim();
  if (!s) return null;

  // Eğer zaten +90XXXXXXXXXX ise
  const already = s.replace(/\s+/g, "");
  if (/^\+90\d{10}$/.test(already)) return already;

  // Rakamları ayıkla
  let digits = s.replace(/\D/g, "");

  // 90 ile başlıyorsa ve 12+ haneliyse (0090 / 90xxxx / 090xxxx vs.)
  if (digits.startsWith("90") && digits.length >= 12) {
    digits = digits.slice(2);
  }

  // Baştaki sıfırları at (0XXXXXXXXXX gibi)
  while (digits.startsWith("0")) digits = digits.slice(1);

  // Son durumda tam 10 hane bekliyoruz
  if (digits.length !== 10) return null;

  return `+90${digits}`;
};

// Step6: TR gün adları + {open,from,to} → defaultHours (0..6: {open, ranges:[{startMin,endMin}]})
const convertTrWorkingHoursToDefaultHours = (s6) => {
  if (!s6 || typeof s6 !== "object") return null;
  const out = {};
  Object.keys(DAY_INDEX).forEach((trDay) => {
    const idx = DAY_INDEX[trDay];
    const v = s6[trDay] || {};
    if (!v.open) {
      out[idx] = { open: false, ranges: [] };
      return;
    }
    const start = toMin(v.from || "10:00");
    const end = toMin(v.to || "19:00");
    if (start == null || end == null || end <= start) {
      out[idx] = { open: false, ranges: [] };
    } else {
      out[idx] = { open: true, ranges: [{ startMin: start, endMin: end }] };
    }
  });
  return out;
};

// İşletme türlerini normalize et: sadece 'kuafor' ve 'guzellik-salonu'
const normalizeBusinessTypes = (arr) => {
  if (!Array.isArray(arr)) return ["kuafor"];
  const out = new Set();
  arr.forEach((t) => {
    const s = String(t || "").toLowerCase().trim();
    if (!s) return;
    const slug = tr2slug(s);
    if (slug.includes("guzellik")) out.add("guzellik-salonu");
    else if (slug.includes("kuafor") || slug.includes("berber")) out.add("kuafor"); // 'berber' → 'kuafor'
  });
  if (out.size === 0) out.add("kuafor");
  return Array.from(out);
};

/* ============= Callable: finalize onboarding ============= */
exports.finalizeAdminOnboarding = onCall(
  { region: "europe-west3" },
  async (_data, context) => {
    try {
      // --- Auth guard
      if (!context.auth) {
        throw new HttpsError("unauthenticated", "Giriş gerekli.");
      }
      const uid = context.auth.uid;

      // --- 1) Onboarding oku
      const obRef = db.collection("adminOnboarding").doc(uid);
      const obSnap = await obRef.get();
      if (!obSnap.exists) {
        throw new HttpsError("failed-precondition", "Onboarding verisi bulunamadı.");
      }
      const ob = obSnap.data() || {};
      const s2 = ob.step2 || {};
      const s3 = ob.step3 || {};
      const s4 = ob.step4?.travel || null;
      const s5 = ob.step5?.businessLocation || null;
      const s6 = ob.step6?.workingHours || null;

      // Step7 (servisler): Diziler string olabilir
      let services = [];
      if (Array.isArray(ob.step7?.services)) {
        services = ob.step7.services.map((it) =>
          typeof it === "string" ? { name: it } : it
        );
      }

      const s8 = Array.isArray(ob.step8?.staff) ? ob.step8.staff : [];

      // --- 2) Rol / businessId
      const roleRef = db.collection("roles").doc(uid);
      const roleSnap = await roleRef.get();
      let businessId = roleSnap.exists ? (roleSnap.data()?.businessId || null) : null;
      const isAlreadyAdmin = roleSnap.exists && roleSnap.data()?.role === "admin";
      if (!businessId) businessId = newId("biz");

      const bizRef = db.collection("businesses").doc(businessId);

      // --- 3) İşletme temel bilgiler
      const businessName =
        s2.businessName ||
        ob.step1?.business?.name ||
        "İşletmem";

      const slug = ob.profile?.slug || tr2slug(businessName);

      // --- 4) Çalışma saatleri (yeni şema: defaultHours)
      const defaultHours = convertTrWorkingHoursToDefaultHours(s6); // null ise yazmayacağız

      // --- 5) Mobil hizmet / yol ücreti
      const travel = s4
        ? {
            enabled: s3?.hasMobileService === true,
            priceType: s4.priceType,
            fee: Number(s4.fee || 0),
            currency: s4.currency || "TRY",
            maxDistanceKm: Number(s4.maxDistanceKm || 0),
          }
        : { enabled: s3?.hasMobileService === true };

      // --- 6) Adres
      const location = s5
        ? {
            country: "TR",
            province: s5.province || "İstanbul",
            district: s5.district || "",
            neighborhood: s5.neighborhood || "",
            street: s5.street || "",
            buildingNo: s5.building || s5.buildingNo || "",
            fullAddress: s5.fullAddress || "",
          }
        : null;

      // --- 7) Batch yazımları
      const batch = db.batch();

      // İşletme türleri normalize
      const types = normalizeBusinessTypes(s2.businessTypes);

      // Telefonlar → E.164
      const phoneE164 = toE164TR(s2.adminPhoneE164 || s2.adminPhone || s2.ownerPhone || "");

      // business (kanonik)
      const bizPayload = {
        name: businessName,
        ownerUid: uid,
        slug,
        types,                           // sadece ["kuafor"] veya ["guzellik-salonu"] veya ikisi
        countryISO: "TR",
        phoneE164: phoneE164 || null,    // legacy alan (mevcut UI’ı kırmamak için)
        contact: {
          email: (s2.adminEmail || s2.ownerEmail || null) || null,
          phoneE164: phoneE164 || null,
        },
        settings: {
          timezone: ob.step6?.timezone || "Europe/Istanbul",
          currency: "TRY",
          onlineBooking: false,
          mobileService: !!s3?.hasMobileService,
          travel,
        },
        location: location ?? FieldValue.delete(),
        createdAt: now(),
        updatedAt: now(),
      };

      // defaultHours varsa ekle, eski 'hours' alanını temizle
      if (defaultHours) bizPayload.defaultHours = defaultHours;
      bizPayload.hours = FieldValue.delete();

      batch.set(bizRef, bizPayload, { merge: true });

      // owner personel (admin de çalışan gibi listelenecek)
      const ownerName = s2.adminName || "Admin";
      const ownerStaffRef = bizRef.collection("staff").doc(uid);
      batch.set(
        ownerStaffRef,
        {
          uid,
          name: ownerName,
          role: "owner",
          position: "İşletme Sahibi",
          phoneE164: phoneE164 || null,
          active: true,
          showInCalendar: true,
          hoursOverride: null, // varsayılan saatler geçerli
          createdAt: now(),
          updatedAt: now(),
        },
        { merge: true }
      );

      // role
      batch.set(
        roleRef,
        {
          role: "admin",
          businessId,
          createdAt: now(),
          updatedAt: now(),
        },
        { merge: true }
      );

      // services
      services.forEach((svc) => {
        const name = (svc?.name || "").trim();
        if (!name) return;
        const id = tr2slug(name) || newId("svc");
        const ref = bizRef.collection("services").doc(id);
        batch.set(
          ref,
          {
            name,
            type: svc.type || "Genel",
            priceType: svc.priceType || "Sabit",
            price: Number(svc.price || 0),
            currency: svc.currency || "TRY",
            durationMinutes: Number(svc.durationMinutes || 30),
            active: svc.active !== false,
            createdAt: now(),
            updatedAt: now(),
          },
          { merge: true }
        );
      });

      // extra staff (step8)
      s8.forEach((st) => {
        const nm = (st?.name || "").trim();
        if (!nm) return;

        // Telefonu normalize
        const stPhoneE164 = toE164TR(st?.phoneE164 || st?.phone || "");

        // Stabil staff id (isim + tel) – isim değişse bile tel sabitse id sabit kalır
        const suffix = stPhoneE164 ? stPhoneE164.replace(/\D/g, "").slice(-10) : "p";
        const key = tr2slug(`${nm}-${suffix}`) || newId("stf");
        const ref = bizRef.collection("staff").doc(key);

        batch.set(
          ref,
          {
            name: nm,
            role: "staff",
            position: st.position || "Personel",
            phoneE164: stPhoneE164 || null,
            active: true,
            showInCalendar: true,
            hoursOverride: null, // farklı saat girilecekse UI’dan ayrı yazılır
            createdAt: now(),
            updatedAt: now(),
          },
          { merge: true }
        );
      });

      // onboarding işaretle
      batch.set(
        obRef,
        {
          onboardingCompleted: true,
          businessId,
          profile: {
            slug,
            url: ob.profile?.url || `${slug}.arat.com/j`,
            shareReady: true,
          },
          role: "owner",
          updatedAt: now(),
        },
        { merge: true }
      );

      await batch.commit();

      // --- 8) email_index & custom-claims
      try {
        const user = await getAuth().getUser(uid);
        const email = (user.email || "").trim().toLowerCase();
        if (email) {
          const key = encodeURIComponent(email);
          await db.doc(`email_index/${key}`).set(
            { roleHint: "admin", updatedAt: now() },
            { merge: true }
          );
        }
        await getAuth().setCustomUserClaims(uid, { admin: true });
      } catch (e) {
        console.warn("[claims/email_index] uyarı:", e?.message || e);
      }

      return { ok: true, businessId, already: isAlreadyAdmin };
    } catch (err) {
      console.error("[finalizeAdminOnboarding] hata:", err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("unknown", err?.message || "Bilinmeyen hata");
    }
  }
);

/* (Opsiyonel ama faydalı)
   İşletme belgesi değişince owner’ı /staff/{ownerUid} altında garanti et.
   Eğer functions v2 firestore trigger kullanmak istemezsen bunu kaldırabilirsin. */
exports.ensureOwnerAsStaff = onDocumentWritten(
  { region: "europe-west3", document: "businesses/{bizId}" },
  async (event) => {
    const after = event.data?.after?.data();
    if (!after) return;
    const ownerUid = after.ownerUid;
    if (!ownerUid) return;

    const bizId = event.params.bizId;
    const staffRef = db.doc(`businesses/${bizId}/staff/${ownerUid}`);
    const snap = await staffRef.get();
    if (!snap.exists) {
      await staffRef.set({
        uid: ownerUid,
        name: after.name || "Admin",
        role: "owner",
        position: "İşletme Sahibi",
        phoneE164: after.contact?.phoneE164 || after.phoneE164 || null,
        active: true,
        showInCalendar: true,
        hoursOverride: null,
        createdAt: now(),
        updatedAt: now(),
      }, { merge: true });
    }
  }
);
