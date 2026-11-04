import { z } from "zod";
import { cleanRichText, richTextToPlain } from "@/lib/rich-text";
import { isUploadedUrl } from "@/lib/storage";
import { endOfLocalDay, parseLocalDateTime, startOfLocalDay } from "@/lib/time";

// Server-only: cleaning HTML and checking upload URLs use Node libraries, so
// this is kept apart from lib/schemas.ts, which client components may import.

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    schema.optional(),
  );

const dateTime = (message: string) =>
  z.string({ error: message }).transform((value, ctx) => {
    const date = parseLocalDateTime(value);
    if (!date) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return date;
  });

const uploadedUrl = z.string().refine(isUploadedUrl, "Upload the file again.");

export const MAX_DESCRIPTION_LENGTH = 20000;

export const eventSchema = z
  .object({
    title: z.string().trim().min(3, "Enter a title.").max(120, "Use at most 120 characters."),
    categoryId: z.string({ error: "Choose a category." }).min(1, "Choose a category."),
    subEvent: optional(z.string().trim().max(80, "Use at most 80 characters.")),
    description: z
      .string({ error: "Describe the event." })
      .max(MAX_DESCRIPTION_LENGTH, "This description is too long.")
      .transform(cleanRichText)
      .refine((html) => richTextToPlain(html).length >= 10, "Describe the event in a few words."),
    posterUrl: optional(uploadedUrl),
    rulesUrl: optional(uploadedUrl),
    venueId: optional(z.string().min(1)),
    startsAt: dateTime("Choose when it starts."),
    endsAt: dateTime("Choose when it ends."),
    regOpensAt: dateTime("Choose when registration opens."),
    regClosesAt: dateTime("Choose when registration closes."),
    capacity: optional(
      z.coerce
        .number()
        .int("Use a whole number.")
        .min(1, "Must be at least 1.")
        .max(100000, "That is too many."),
    ),
    participation: z.enum(["SOLO", "TEAM"], { error: "Choose solo or team." }),
    teamMin: optional(
      z.coerce.number().int("Use a whole number.").min(1, "Must be at least 1.").max(50),
    ),
    teamMax: optional(
      z.coerce.number().int("Use a whole number.").min(1, "Must be at least 1.").max(50),
    ),
    seatPer: z.enum(["TEAM", "MEMBER"]).default("TEAM"),
    departmentIds: z.array(z.string().min(1)).default([]),
    years: z.array(z.coerce.number().int().min(1).max(4)).default([]),
    coordinatorIds: z.array(z.string().min(1)).default([]),
  })
  .superRefine((d, ctx) => {
    const fail = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    if (d.endsAt <= d.startsAt) fail("endsAt", "It must end after it starts.");
    if (d.regClosesAt <= d.regOpensAt) fail("regClosesAt", "It must close after it opens.");
    if (d.regClosesAt > d.startsAt) {
      fail("regClosesAt", "Registration must close by the time the event starts.");
    }
    if (d.participation === "TEAM") {
      if (d.teamMin === undefined) fail("teamMin", "Enter the smallest team allowed.");
      if (d.teamMax === undefined) fail("teamMax", "Enter the largest team allowed.");
      if (d.teamMin !== undefined && d.teamMax !== undefined && d.teamMax < d.teamMin) {
        fail("teamMax", "Must be at least the smallest team size.");
      }
    }
  })
  .transform((d) => {
    const team = d.participation === "TEAM";
    // Team settings mean nothing on a solo event, so they are not kept.
    return {
      ...d,
      teamMin: team ? (d.teamMin ?? null) : null,
      teamMax: team ? (d.teamMax ?? null) : null,
      seatPer: team ? d.seatPer : ("TEAM" as const),
      subEvent: d.subEvent ?? null,
      posterUrl: d.posterUrl ?? null,
      rulesUrl: d.rulesUrl ?? null,
      venueId: d.venueId ?? null,
      capacity: d.capacity ?? null,
    };
  });

export type EventInput = z.output<typeof eventSchema>;

/** FormData as plain values, keeping the ticked boxes as lists. */
export function eventFormValues(formData: FormData) {
  return {
    ...Object.fromEntries(formData),
    departmentIds: formData.getAll("departmentIds"),
    years: formData.getAll("years"),
    coordinatorIds: formData.getAll("coordinatorIds"),
  };
}

// ─── Filters on the public events page ──────────────────────────────────────

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export type EventTab = "upcoming" | "past";

export type PublicEventFilters = {
  tab: EventTab;
  q: string;
  category: string;
  department: string;
  from: string;
  to: string;
  fromDate: Date | null;
  toDate: Date | null;
  sort: "asc" | "desc";
  page: number;
};

/** Reads the page's query string. Anything odd in it is treated as not given. */
export function parseEventFilters(params: Record<string, unknown>): PublicEventFilters {
  const tab: EventTab = params.tab === "past" ? "past" : "upcoming";
  const from = text(params.from, 10);
  const to = text(params.to, 10);
  const fromDate = startOfLocalDay(from);
  const toDate = endOfLocalDay(to);

  return {
    tab,
    q: text(params.q, 100),
    category: text(params.category, 80),
    department: text(params.department, 40),
    from: fromDate ? from : "",
    to: toDate ? to : "",
    fromDate,
    toDate,
    // Upcoming events read soonest first; past events, latest first.
    sort:
      params.sort === "asc" || params.sort === "desc"
        ? params.sort
        : tab === "past"
          ? "desc"
          : "asc",
    page: Math.max(1, Math.floor(Number(params.page)) || 1),
  };
}
