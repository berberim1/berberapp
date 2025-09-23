// js/firebase.js  (v5.0 — App Check aktif, doğru Storage bucket, emulator opsiyonları korunuyor)

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-functions.js";

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

import {
  initializeAppCheck,
  ReCaptchaV3Provider,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app-check.js";

/* ========= Firebase Config ========= */
const firebaseConfig = {
  apiKey: "AIzaSyBLzbyeKVCvKGtXlOOJI_Ki1dQeIFiiVNo",
  authDomain: "my-barber-system.firebaseapp.com",
  projectId: "my-barber-system",
  // BUCKET ADI DÜZELTİLDİ: appspot.com olmalı
  storageBucket: "my-barber-system.appspot.com",
  messagingSenderId: "1042627764617",
  appId: "1:1042627764617:web:9dfb36d8f2a0443e1a4158",
  measurementId: "G-HBBNK2J38R",
};

/* ========= App Init ========= */
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Bazı gstatic modülleri window.process bekliyor
if (typeof window !== "undefined" && !window.process) {
  window.process = { env: {} };
}

/* ========= URL parametreleri ========= */
const params = new URLSearchParams((typeof location !== "undefined" ? location.search : "") || "");
const useEmulators = params.get("emu") === "1";

/* ========= App Check (reCAPTCHA v3) =========
   - App Check 'Enforce' açık ise 401 hatalarını bu çözer.
   - Geliştirmede (localhost veya ?acdebug=1) debug token otomatik açılır.
*/
const APP_CHECK_SITE_KEY = "RECAPTCHA_V3_SITE_KEY_DEGIS"; // <-- kendi anahtarınızı koyun
let appCheckTmp = null;
try {
  const host = (typeof location !== "undefined" ? location.hostname : "");
  const isLocal =
    host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
  if (isLocal || params.get("acdebug") === "1") {
    // Debug token: App Check konsolunda otomatik görünür
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  if (APP_CHECK_SITE_KEY && !/DEGIS$/i.test(APP_CHECK_SITE_KEY)) {
    appCheckTmp = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } else {
    console.warn("[app-check] Site key tanımlı değil; App Check başlatılmadı.");
  }
} catch (e) {
  console.warn("[app-check] initialize error:", e?.message || e);
}
// Geriye dönük uyumluluk için export’u koruyoruz
export const appCheck = appCheckTmp || null;

/* ========= Auth ========= */
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((e) =>
  console.warn("[auth] setPersistence:", e?.message || e)
);
auth.useDeviceLanguage?.();

/* ========= Firestore ========= */
const firestoreOptions = {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  experimentalAutoDetectLongPolling: true,
};
if (params.get("forceLP") === "1") {
  firestoreOptions.experimentalForceLongPolling = true;
}
export const db = initializeFirestore(app, firestoreOptions);

/* ========= Storage =========
   Bucket explicit verildi (doğru gs:// URL ile).
*/
export const storage = getStorage(app, "gs://my-barber-system.appspot.com");

/* ========= Functions ========= */
export const functions = getFunctions(app, "europe-west3");

/* ========= Emulators (opsiyonel) =========
   URL’ye ?emu=1 ekleyerek yerel emulator bağlantısı açılır.
*/
if (useEmulators) {
  try {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    console.log("[firebase] Emulators enabled");
  } catch (e) {
    console.warn("[firebase] Emulator connect error:", e);
  }
}

/* ========= Yardımcılar ========= */
export function awaitUser(timeoutMs = 4000) {
  return new Promise((resolve) => {
    let settled = false;
    const to = setTimeout(() => {
      if (!settled) { settled = true; resolve(null); }
    }, timeoutMs);

    import("https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js")
      .then(({ onAuthStateChanged }) => {
        onAuthStateChanged(
          auth,
          (u) => { if (!settled) { settled = true; clearTimeout(to); resolve(u); } },
          ()  => { if (!settled) { settled = true; clearTimeout(to); resolve(null); } }
        );
      })
      .catch(() => {
        if (!settled) { settled = true; clearTimeout(to); resolve(null); }
      });
  });
}

/* ========= Exports ========= */
export { serverTimestamp };
