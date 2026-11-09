import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";

// Stores uploaded files: profile photos, event posters and rules PDFs.
// With CLOUDINARY_URL set (cloudinary://<key>:<secret>@<cloud name>) files go
// to Cloudinary's free tier. Without it, development saves them under
// public/uploads/ (ignored by git); production refuses uploads.

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class UploadError extends Error {}

/**
 * Whether a URL is one this module hands out. Forms send uploaded URLs back in
 * a hidden field, so the server must not trust them blindly: a "rules link"
 * could otherwise point anywhere, or run a script.
 */
export function isUploadedUrl(url: string) {
  return (
    /^\/uploads\/[a-z0-9-]+\/[a-f0-9]+\.(jpg|png|webp|pdf)$/.test(url) ||
    /^https:\/\/res\.cloudinary\.com\/[\w./-]+$/.test(url)
  );
}

function refuseInProduction() {
  if (process.env.NODE_ENV === "production") {
    throw new UploadError("Uploads are not set up yet. Ask the admin to add CLOUDINARY_URL.");
  }
}

async function saveLocally(bytes: Uint8Array, folder: string, name: string) {
  const dir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return `/uploads/${folder}/${name}`;
}

/** Saves a PDF and returns its public URL. Throws UploadError for bad files. */
export async function savePdf(file: File, folder: string): Promise<string> {
  if (file.type !== "application/pdf") throw new UploadError("Use a PDF file.");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("Use a PDF under 3 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (!isPdf) throw new UploadError("That file is not a valid PDF.");

  const name = `${randomBytes(12).toString("hex")}.pdf`;
  const cloudinary = process.env.CLOUDINARY_URL;
  if (cloudinary) {
    // Cloudinary keeps non-images as "raw" files; the public id needs the
    // extension so the link downloads as a PDF.
    return uploadToCloudinary(cloudinary, bytes, file.type, folder, { raw: true, publicId: name });
  }
  refuseInProduction();
  return saveLocally(bytes, folder, name);
}

/** Reads back a file this module stored. Throws if it can't be reached. */
export async function readUploadedFile(url: string): Promise<Uint8Array> {
  if (!isUploadedUrl(url)) throw new Error("Not an uploaded file.");
  if (url.startsWith("/uploads/")) {
    return readFile(path.join(process.cwd(), "public", ...url.split("/").filter(Boolean)));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch the file: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

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
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("Use an image under 3 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeImage(bytes, file.type)) throw new UploadError("That file is not a valid image.");

  const name = `${randomBytes(12).toString("hex")}.${ext}`;
  const cloudinary = process.env.CLOUDINARY_URL;
  if (cloudinary) return uploadToCloudinary(cloudinary, bytes, file.type, folder);

  refuseInProduction();
  return saveLocally(bytes, folder, name);
}

async function uploadToCloudinary(
  configUrl: string,
  bytes: Uint8Array<ArrayBuffer>,
  type: string,
  folder: string,
  options: { raw?: boolean; publicId?: string } = {},
): Promise<string> {
  const { username: apiKey, password: apiSecret, hostname: cloudName } = new URL(configUrl);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const cloudFolder = `campus-events/${folder}`;
  const params: Record<string, string> = { folder: cloudFolder, timestamp };
  if (options.publicId) params.public_id = options.publicId;

  // Cloudinary signs the sorted parameters followed by the API secret.
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const signature = createHash("sha1").update(`${toSign}${apiSecret}`).digest("hex");

  const form = new FormData();
  form.set("file", new Blob([bytes], { type }));
  form.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) form.set(k, v);
  form.set("signature", signature);

  const kind = options.raw ? "raw" : "image";
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${kind}/upload`, {
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
