import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config";

export async function callCallable<
  TResponse = unknown,
  TRequest = Record<string, unknown> | undefined
>(name: string, data?: TRequest): Promise<TResponse> {
  const fn = httpsCallable<TRequest | null, TResponse>(functions, name);
  const result = await fn((data ?? null) as TRequest | null);
  return result.data;
}

