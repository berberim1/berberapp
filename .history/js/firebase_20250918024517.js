// js/firebase.js  (v4 — App Check fix + doğru bucket + sade Storage init)
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
   NOT: storageBucket, konsoldaki ile aynı olmalı (…firebasestorage.app) */
const firebaseConfig = {
  apiKey: "AIzaSyBLzbyeKVCvKGtXlOOJI_Ki1dQeIFiiVNo",
  authDomain: "my-barber-system.firebaseapp.com",
  projectId: "my-barber-system",
  storageBucket: "my-barber-system.firebasestorage.app",
  messagingSenderId: "1042627764617",
  appId: "1:1042627764617:web:9dfb36d8f2a0443e1a4158",
  measurementId: "G-HBBNK2J38R",
};

/* ========= App init ========= */
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/* —— process hack: bazı gstatic modülleri process’e bakıyor —— */
if (typeof window !== "undefined" && !window.process) {
  window.process = { env: {} };
}

/* ========= App Check (tek yerden, dynamic import) =========
   ÖNEMLİ: reCAPTCHA v3 provider her zaman gerçek site key’i almalı.
   Localhost’ta bypass için sadece DEBUG TOKEN kullanılır. */
const isLocalhost = ["localhost", "127.0.0.1"].includes(location.hostname);
if (isLocalhost) {
  // İlk açılışta konsola debug token yazar; Console > App Check > Debug tokens’a ekleyebilirsin.
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}
const { initializeAppCheck, ReCaptchaV3Provider } =
  await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-app-check.js");

// 🔑 App Check reCAPTCHA v3 site key (Console > App Check > Apps > web app)
const APP_CHECK_SITE_KEY = "6LeOxMgrAAAAANHG5q2IiflzNs-VCHBjzRIvSmPN";

export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});

/* --- Auth --- */
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});
auth.useDeviceLanguage?.();

/* --- Firestore --- */
const params = new URLSearchParams(location.search);
const firestoreOptions = {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
};
if (params.get("forceLP") === "1") {
  firestoreOptions.experimentalForceLongPolling = true;
}
export const db = initializeFirestore(app, firestoreOptions);

/* --- Storage --- 
   NOT: Bucket override geçmeyelim; config’teki storageBucket kullanılsın. */
export const storage = getStorage(app);

/* ========= Functions ========= */
export const functions = getFunctions(app, "europe-west3");

/* ========= Emulators (opsiyonel) ========= */
const useEmulators = (params.get("emu") === "1");
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
        onAuthStateChanged(auth,
          (u) => { if (!settled) { settled = true; clearTimeout(to); resolve(u); } },
          () => { if (!settled) { settled = true; clearTimeout(to); resolve(null); } }
        );
      })
      .catch(() => { if (!settled) { settled = true; clearTimeout(to); resolve(null); } });
  });
}

/* ========= Exports ========= */
export { serverTimestamp };
