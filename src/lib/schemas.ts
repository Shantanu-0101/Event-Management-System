import { z } from "zod";

// Zod schemas for every form in Phase 1. Server actions parse FormData with
// these; the same rules are mirrored as HTML attributes on the inputs.

const trimmed = (max: number) => z.string().trim().max(max);

// FormData sends "" for an empty optional field; treat that as "not given".
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    schema.optional(),
  );

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address." }));

// bcrypt only reads the first 72 bytes, so longer passwords are refused.
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.");

export const rollNoSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9/-]{3,20}$/, "Use 3–20 letters, digits, / or -.");

export const yearSchema = z.coerce
  .number({ error: "Choose your year." })
  .int()
  .min(1, "Choose your year.")
  .max(4, "Choose your year.");

export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(\+91)?[6-9]\d{9}$/, "Enter a 10-digit mobile number."));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(72),
});

export const signupSchema = z
  .object({
    name: trimmed(80).min(2, "Enter your full name."),
    email: emailSchema,
    rollNo: rollNoSchema,
    // An untouched <select> sends nothing at all, hence the custom error.
    departmentId: z.string({ error: "Choose your department." }).min(1, "Choose your department."),
    year: yearSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

// Roll number and department can only be filled in once (for Google sign-ups
// who skipped them); after that an admin changes them.
export const profileSchema = z.object({
  name: trimmed(80).min(2, "Enter your full name."),
  phone: optional(phoneSchema),
  year: optional(yearSchema),
  rollNo: optional(rollNoSchema),
  departmentId: optional(z.string().min(1)),
});

export const roleSchema = z.enum(["STUDENT", "COORDINATOR", "ADMIN"]);

export const departmentSchema = z.object({
  name: trimmed(100).min(2, "Enter a name."),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,10}$/, "Use 2–10 letters or digits."),
});

export const categorySchema = z.object({
  name: trimmed(60).min(2, "Enter a name."),
  // Left empty, it is made from the name.
  slug: optional(
    z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, digits and dashes."),
  ),
  description: optional(trimmed(300)),
  icon: optional(
    z
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/, "Use a lucide icon name, e.g. trophy."),
  ),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export const venueSchema = z.object({
  name: trimmed(100).min(2, "Enter a name."),
  building: optional(trimmed(100)),
  capacity: optional(z.coerce.number().int().min(1, "Must be at least 1.").max(100000)),
});

export const teamNameSchema = z.object({
  name: trimmed(60).min(2, "Enter a team name."),
});

export const teamInviteSchema = z.object({
  member: trimmed(254).min(3, "Enter their roll number or email."),
});

export const announcementSchema = z.object({
  subject: trimmed(120).min(3, "Enter a subject."),
  body: trimmed(2000).min(3, "Enter your message."),
});

export const feedbackSchema = z.object({
  rating: z.coerce
    .number({ error: "Choose a rating." })
    .int("Choose a rating.")
    .min(1, "Choose a rating.")
    .max(5, "Choose a rating."),
  comment: optional(trimmed(1000)),
});

/** Turns a slug-like id from a name: "Paper Presentation" → "paper-presentation". */
export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
