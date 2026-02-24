import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  type QueryConstraint,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";

function withId<T>(id: string, data: unknown): T {
  return { id, ...(data as Record<string, unknown>) } as T;
}

export async function getDocumentById<T = any>(
  collectionName: string,
  id: string
): Promise<T | null> {
  const snapshot = await getDoc(doc(db, collectionName, id));
  if (!snapshot.exists()) {
    return null;
  }

  return withId<T>(snapshot.id, snapshot.data());
}

export async function queryDocuments<T = any>(
  collectionName: string,
  ...constraints: QueryConstraint[]
): Promise<T[]> {
  const q = query(collection(db, collectionName), ...constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => withId<T>(item.id, item.data()));
}

export async function updateDocument<T extends Record<string, unknown> = Record<string, unknown>>(
  collectionName: string,
  id: string,
  data: Partial<T>
): Promise<void> {
  await updateDoc(doc(db, collectionName, id) as any, data as any);
}
