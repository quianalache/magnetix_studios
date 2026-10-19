import {
  initializeApp,
  getApps,
  getApp,
  type FirebaseApp,
} from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Returns true if Firebase env vars are configured */
export function isFirebaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;

function getFirebaseApp(): FirebaseApp {
  if (!_app) {
    if (!isFirebaseConfigured()) {
      throw new Error("Firebase is not configured. Add env vars to .env.local");
    }
    _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  }
  return _app;
}

/**
 * Local QA only: when these are set (never in production builds), the
 * browser SDK talks to the Firebase emulators instead of the live project,
 * so staff screens can be exercised end to end without touching real data.
 */
const AUTH_EMULATOR = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
const FIRESTORE_EMULATOR = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST;

export function getFirebaseAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getFirebaseApp());
    if (AUTH_EMULATOR) connectAuthEmulator(_auth, `http://${AUTH_EMULATOR}`, { disableWarnings: true });
  }
  return _auth;
}

export function getFirebaseDb(): Firestore {
  if (!_db) {
    _db = getFirestore(getFirebaseApp());
    if (FIRESTORE_EMULATOR) {
      const [host, port] = FIRESTORE_EMULATOR.split(":");
      connectFirestoreEmulator(_db, host, Number(port));
    }
  }
  return _db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!_storage) {
    _storage = getStorage(getFirebaseApp());
  }
  return _storage;
}
