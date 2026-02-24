import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { auth } from "./config";

let persistencePromise: Promise<void> | null = null;

export const ensureAuthPersistence = async () => {
  if (typeof window === "undefined") {
    return;
  }

  if (!persistencePromise) {
    persistencePromise = setPersistence(auth, browserLocalPersistence)
      .then(() => undefined)
      .catch((error) => {
        persistencePromise = null;
        throw error;
      });
  }

  await persistencePromise;
};

export const registerWithEmail = async (email: string, password: string) => {
  await ensureAuthPersistence();
  return createUserWithEmailAndPassword(auth, email, password);
};

export const loginWithEmail = async (email: string, password: string) => {
  await ensureAuthPersistence();
  return signInWithEmailAndPassword(auth, email, password);
};

export const logout = () => {
  return signOut(auth);
};

export const requestPasswordReset = async (email: string) => {
  await ensureAuthPersistence();
  return sendPasswordResetEmail(auth, email);
};

export const onAuthChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};
