import { uploadFile } from "@/lib/firebase/storage";

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadProductImageCallable(
  productId: string,
  file: File,
  position = 0
): Promise<string> {
  const safeName = sanitizeName(file.name || "image");
  const path = `products/${productId}/${position}-${Date.now()}-${safeName}`;
  return uploadFile(path, file);
}

