// File: myecom/firebase/config.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const missingFirebaseConfigKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingFirebaseConfigKeys.length > 0) {
  console.error(
    `[Firebase] Missing NEXT_PUBLIC config keys: ${missingFirebaseConfigKeys.join(", ")}`
  );
}

export const isFirebaseConfigValid = missingFirebaseConfigKeys.length === 0;
const functionsRegion = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || "us-central1";

// Singleton pattern to prevent multiple initializations
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const firestore = db;
export const functions = getFunctions(app, functionsRegion);
export const storage = getStorage(app);

export default app;
