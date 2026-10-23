import { initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, indexedDBLocalPersistence, initializeAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  type Firestore,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";

/**
 * One Firebase connection for the whole app — the OFFICIAL web SDK, so we get real
 * listeners with proper reconnect/backoff, an offline cache, and security rules applied
 * to the signed-in person (never a service account).
 *
 * Development safety: with VITE_USE_EMULATORS=true the app runs against a `demo-…`
 * project id. Firebase treats `demo-` projects as emulator-only, so a development build
 * physically cannot read or write live Technofluid data.
 */

const env = import.meta.env;

export const usingEmulators = env.VITE_USE_EMULATORS !== "false";

const EMULATOR_PROJECT_ID = "demo-technofluid";

/** Where the local Cloud Functions emulator listens (firebase/firebase.json). */
export const FUNCTIONS_EMULATOR = { host: "127.0.0.1", port: 5001 };

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name} — copy desktop/.env.example to desktop/.env.local`);
  return value;
}

const firebaseConfig = usingEmulators
  ? {
      apiKey: "demo-api-key",
      authDomain: `${EMULATOR_PROJECT_ID}.firebaseapp.com`,
      projectId: EMULATOR_PROJECT_ID,
      appId: "demo-app",
    }
  : {
      apiKey: required("VITE_FIREBASE_API_KEY", env.VITE_FIREBASE_API_KEY),
      authDomain: required("VITE_FIREBASE_AUTH_DOMAIN", env.VITE_FIREBASE_AUTH_DOMAIN),
      projectId: required("VITE_FIREBASE_PROJECT_ID", env.VITE_FIREBASE_PROJECT_ID),
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: required("VITE_FIREBASE_APP_ID", env.VITE_FIREBASE_APP_ID),
    };

export const firebaseApp: FirebaseApp = initializeApp(firebaseConfig);

/** Sign-in survives restarts (IndexedDB), with no popup/redirect machinery. */
export const auth: Auth = initializeAuth(firebaseApp, { persistence: indexedDBLocalPersistence });

/** Offline cache on: screens keep working and writes queue up when the internet drops. */
export const db: Firestore = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager(undefined) }),
});

/** Cloud Functions live in us-central1 (CLAUDE.md). Money and stock writes go through these. */
export const functions: Functions = getFunctions(firebaseApp, "us-central1");

if (usingEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, FUNCTIONS_EMULATOR.host, FUNCTIONS_EMULATOR.port);
}

export const projectId = firebaseConfig.projectId;
