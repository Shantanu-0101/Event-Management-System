"use server";

import { revalidatePath } from "next/cache";
import { failed, invalid, type FormState } from "@/lib/form-state";
import { tryAgainMessage } from "@/lib/rate-limits";
import { profileSchema } from "@/lib/schemas";
import { saveImage, UploadError } from "@/lib/storage";
import { hitRateLimit } from "@/server/services/rate-limit";
import { requireUser } from "@/server/session";
import { updateProfile, UserRuleError } from "@/server/services/users";

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser("/profile");

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  let photoUrl: string | undefined;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const limit = await hitRateLimit("uploadUser", user.id);
    if (!limit.ok) return failed(tryAgainMessage(limit.retryAfterSeconds), formData, "photo");

    try {
      photoUrl = await saveImage(photo, "profile-photos");
    } catch (e) {
      if (e instanceof UploadError) return failed(e.message, formData, "photo");
      throw e;
    }
  }

  try {
    await updateProfile(user.id, { ...parsed.data, photoUrl });
  } catch (e) {
    if (e instanceof UserRuleError) return failed(e.message, formData, e.field);
    throw e;
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Profile saved." };
}
