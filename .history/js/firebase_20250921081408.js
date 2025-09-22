// js/firebase.js  (v4.4 — correct Storage bucket + App Check + emu opsiyonları)
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-functions.js";

import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

import {
  getStorage,
  connectStorageEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

/* ========= Firebase config =========
   Not: Bu projede Storage bucket domaini *.firebasestorage.app (Console/gsutil ile uyumlu). */
const firebaseConfig = {
  apiKey: "AIzaSyBLzbyeKVCvKGtXlOOJI_Ki1dQeIFiiVNo",
  authDomain: "my-barber-system.firebaseapp.com",
  projectId: "my-barber-system",
  storageBucket: "my-barber-system.firebasestorage.app", // ← BUCKET (console ile aynı)
  messagingSenderId: "1042627764617",
  appId: "1:1042627764617:web:9dfb36d8f2a0443e1a4158",
  measurementId: "G-HBBNK2J38R",
};

/* ========= App init ========= */
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/* —— Bazı gstatic modülleri window.process arıyor —— */
if (typeof window !== "undefined" && !window.process) {
  window.process = { env: {} };
}

/* ========= App Check =========
   Localhost’ta debug token; prod’da reCAPTCHA v3 site key.
   (Debug token değeri konsola düşer; Console > App Check > Manage debug tokens'a ekle.) */
let appCheck = null;
try {
  const isLocalhost = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (isLocalhost) {
    // Sadece yerel geliştirme için!
    // eslint-disable-next-line no-undef
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    console.log("[app-check] Debug token modu (localhost). Token console’da görünecek.");
  }

  const { initializeAppCheck, ReCaptchaV3Provider } =
    await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-app-check.js");

  // Firebase Console > App Check > Web App reCAPTCHA v3 site key’in
  const APP_CHECK_SITE_KEY = "6LeOxMgrAAAAANHG5q2IiflzNs-VCHBjzRIvSmPN";

  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
} catch (e) {
  console.warn("[app-check] init hata/atlandı:", e?.message || e);
}
export { appCheck };

/* --- Auth --- */
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((e) =>
  console.warn("[auth] setPersistence:", e?.message || e)
);
auth.useDeviceLanguage?.();

/* --- Firestore --- */
const params = new URLSearchParams(location.search);
const firestoreOptions = {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  experimentalAutoDetectLongPolling: true,
};
if (params.get("forceLP") === "1") {
  firestoreOptions.experimentalForceLongPolling = true;
}
export const db = initializeFirestore(app, firestoreOptions);

/* --- Storage ---
   ÖNEMLİ: explicit bucket verirsen mutlaka firebasestorage.app olanı kullan.
   İstersen parametresiz de çağırabilirsin: getStorage(app) → config’teki bucket’ı kullanır. */
export const storage = getStorage(app, "gs://my-barber-system.firebasestorage.app"); // ← DOĞRU BUCKET

/* --- Functions (region) --- */
export const functions = getFunctions(app, "europe-west3");

/* ========= Emulators (opsiyonel) =========
   URL’ye ?emu=1 ekleyerek yerelleri bağlayabilirsin. */
const useEmulators = params.get("emu") === "1";
if (useEmulators) {
  try {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    console.log("[firebase] Emulators enabled");
  } catch (e) {
    console.warn("[firebase] Emulator connect error:", e);
  }
}

/* ========= Yardımcılar ========= */
export function awaitUser(timeoutMs = 4000) {
  return new Promise((resolve) => {
    let settled = false;
    const to = setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, timeoutMs);

    import("https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js")
      .then(({ onAuthStateChanged }) => {
        onAuthStateChanged(
          auth,
          (u) => { if (!settled) { settled = true; clearTimeout(to); resolve(u); } },
          ()  => { if (!settled) { settled = true; clearTimeout(to); resolve(null); } }
        );
      })
      .catch(() => { if (!settled) { settled = true; clearTimeout(to); resolve(null); } });
  });
}

/* ========= Exports ========= */
export { serverTimestamp };
