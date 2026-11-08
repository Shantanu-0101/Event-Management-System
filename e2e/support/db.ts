import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { e2eDatabaseUrl } from "../../scripts/e2e-env.mjs";

// What tests do behind the app's back: read the database and stand in for email and the
// passing of time. The app has no test-only code paths; these helpers only touch its data.

const pool = new pg.Pool({ connectionString: e2eDatabaseUrl(), max: 2 });

export async function sql<T extends pg.QueryResultRow>(text: string, values: unknown[] = []) {
  const { rows } = await pool.query<T>(text, values);
  return rows;
}

/** Issues the same kind of one-time link the app would have emailed. */
async function emailLink(email: string, type: "VERIFY_EMAIL" | "RESET_PASSWORD", path: string) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql(
    `INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at)
     SELECT $1, id, $2::"AuthTokenType", $3, (now() AT TIME ZONE 'utc') + interval '1 hour'
     FROM users WHERE email = $4`,
    [`e2e${randomBytes(8).toString("hex")}`, type, hash, email],
  );
  return `${path}?token=${token}`;
}

export const verifyEmailLink = (email: string) => emailLink(email, "VERIFY_EMAIL", "/verify-email");
export const resetPasswordLink = (email: string) =>
  emailLink(email, "RESET_PASSWORD", "/reset-password");

export async function ticketCode(email: string, slug: string) {
  const [row] = await sql<{ ticket_code: string }>(
    `SELECT r.ticket_code FROM registrations r
     JOIN users u ON u.id = r.user_id JOIN events e ON e.id = r.event_id
     WHERE u.email = $1 AND e.slug = $2`,
    [email, slug],
  );
  if (!row?.ticket_code) throw new Error(`${email} has no ticket for ${slug}.`);
  return row.ticket_code;
}

export async function eventId(slug: string) {
  const [row] = await sql<{ id: string }>("SELECT id FROM events WHERE slug = $1", [slug]);
  if (!row) throw new Error(`No event ${slug}.`);
  return row.id;
}

/** A private copy of a seeded event, so a test can change it without touching the others. */
export async function copyEvent(
  sourceSlug: string,
  changes: { capacity?: number } = {},
): Promise<{ id: string; slug: string; title: string }> {
  const suffix = randomBytes(4).toString("hex");
  const slug = `${sourceSlug}-${suffix}`;
  const id = `e2e${randomBytes(10).toString("hex")}`;
  const title = `Test ${suffix}`;
  await sql(
    `INSERT INTO events (id, title, slug, category_id, sub_event, description, venue_id,
       starts_at, ends_at, reg_opens_at, reg_closes_at, capacity, participation, team_min,
       team_max, seat_per, status, created_by, updated_at)
     SELECT $1, $2, $3, category_id, sub_event, description, venue_id, starts_at, ends_at,
       reg_opens_at, reg_closes_at, COALESCE($4, capacity), participation, team_min, team_max,
       seat_per, status, created_by, now()
     FROM events WHERE slug = $5`,
    [id, title, slug, changes.capacity ?? null, sourceSlug],
  );
  await sql(
    `INSERT INTO event_coordinators (event_id, user_id)
     SELECT $1, ec.user_id FROM event_coordinators ec
     JOIN events e ON e.id = ec.event_id WHERE e.slug = $2`,
    [id, sourceSlug],
  );
  return { id, slug, title };
}

/** Moves an event's dates into the past, as if it had just ended. */
export async function finishEvent(slug: string) {
  await sql(
    `UPDATE events SET
       starts_at = (now() AT TIME ZONE 'utc') - interval '3 hours',
       ends_at = (now() AT TIME ZONE 'utc') - interval '1 hour',
       reg_opens_at = (now() AT TIME ZONE 'utc') - interval '3 days',
       reg_closes_at = (now() AT TIME ZONE 'utc') - interval '4 hours'
     WHERE slug = $1`,
    [slug],
  );
}
