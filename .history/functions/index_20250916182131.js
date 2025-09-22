/* functions/index.js */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
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

// "Pazartesi" → "mon"
const dayMap = { "Pazartesi":"mon","Salı":"tue","Çarşamba":"wed","Perşembe":"thu","Cuma":"fri","Cumartesi":"sat","Pazar":"sun" };

// TR (10 haneli) → +90 E.164
const toE164TR = (raw = "") => {
  const d = String(raw).replace(/\D/g, "");
  if (d.length === 10) return `+90${d}`;
  if (d.length === 12 && d.startsWith("90")) return `+${d}`;
  if (d.startsWith("+")) return d;
  return null;
};

/* ============= Callable ============= */
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

      // Step7: Diziler string olabilir -> normalize et
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

      // --- 4) Çalışma saatleri normalizasyonu
      let normalizedHours = null;
      if (s6 && typeof s6 === "object") {
        normalizedHours = {};
        Object.keys(s6).forEach((trDay) => {
          const key = dayMap[trDay] || trDay;
          const v = s6[trDay] || {};
          normalizedHours[key] = v.open
            ? { enabled: true, start: String(v.from || "10:00"), end: String(v.to || "19:00") }
            : { enabled: false };
        });
      }

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

      // business
      const phoneE164 =
        s2.adminPhoneE164 || toE164TR(s2.adminPhone || s2.ownerPhone || "");
      batch.set(
        bizRef,
        {
          name: businessName,
          ownerUid: uid,
          slug,
          types: Array.isArray(s2.businessTypes) ? s2.businessTypes : [],
          countryISO: "TR",
          phoneE164: phoneE164 || null,
          settings: {
            timezone: ob.step6?.timezone || "Europe/Istanbul",
            currency: "TRY",
            onlineBooking: false,
            mobileService: !!s3?.hasMobileService,
            travel,
          },
          location: location ?? FieldValue.delete(),
          hours: normalizedHours ?? FieldValue.delete(),
          createdAt: now(),
          updatedAt: now(),
        },
        { merge: true }
      );

      // owner personel
      const ownerName = s2.adminName || "Admin";
      const ownerStaffRef = bizRef.collection("staff").doc(uid);
      batch.set(
        ownerStaffRef,
        {
          uid,
          name: ownerName,
          role: "Owner",
          active: true,
          showInCalendar: true,
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

      // extra staff
      s8.forEach((st) => {
        const nm = (st?.name || "").trim();
        if (!nm) return;
        const phone = (st?.phone || "").replace(/\D/g, "").slice(0, 10);
        const key = tr2slug(`${nm}-${phone || "p"}`);
        const ref = bizRef.collection("staff").doc(key);
        batch.set(
          ref,
          {
            name: nm,
            phone: st.phone || null,
            title: st.position || "Personel",
            active: true,
            showInCalendar: true,
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
