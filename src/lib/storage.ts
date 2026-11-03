import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Stores uploaded images (profile photos now, event posters in Phase 2).
// With CLOUDINARY_URL set (cloudinary://<key>:<secret>@<cloud name>) files go
// to Cloudinary's free tier. Without it, development saves them under
// public/uploads/ (ignored by git); production refuses uploads.

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export class UploadError extends Error {}

/** Checks the file's first bytes, so a renamed file can't pass as an image. */
function looksLikeImage(bytes: Uint8Array, type: string) {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (type === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  if (type === "image/png") return starts(0x89, 0x50, 0x4e, 0x47);
  if (type === "image/webp")
    return starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

/** Saves an image and returns its public URL. Throws UploadError for bad files. */
export async function saveImage(file: File, folder: string): Promise<string> {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new UploadError("Use a JPG, PNG or WebP image.");
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError("Use an image under 3 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeImage(bytes, file.type)) throw new UploadError("That file is not a valid image.");

  const name = `${randomBytes(12).toString("hex")}.${ext}`;
  const cloudinary = process.env.CLOUDINARY_URL;
  if (cloudinary) return uploadToCloudinary(cloudinary, bytes, file.type, folder);

  if (process.env.NODE_ENV === "production") {
    throw new UploadError("Uploads are not set up yet. Ask the admin to add CLOUDINARY_URL.");
  }
  const dir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return `/uploads/${folder}/${name}`;
}

async function uploadToCloudinary(
  configUrl: string,
  bytes: Uint8Array<ArrayBuffer>,
  type: string,
  folder: string,
): Promise<string> {
  const { username: apiKey, password: apiSecret, hostname: cloudName } = new URL(configUrl);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const cloudFolder = `campus-events/${folder}`;
  // Cloudinary signs the sorted parameters followed by the API secret.
  const signature = createHash("sha1")
    .update(`folder=${cloudFolder}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");

  const form = new FormData();
  form.set("file", new Blob([bytes], { type }));
  form.set("api_key", apiKey);
  form.set("timestamp", timestamp);
  form.set("folder", cloudFolder);
  form.set("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    console.error(`Cloudinary upload failed: ${res.status} ${await res.text()}`);
    throw new UploadError("The upload failed. Try again in a minute.");
  }
  const json = (await res.json()) as { secure_url: string };
  return json.secure_url;
}
