import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { normalizeTicketCode, TICKET_ALPHABET, TICKET_LENGTH } from "@/lib/check-in";

// A ticket code is 10 random characters plus a 6-character signature of them, 80
// bits in all: short enough to type if a camera fails, and not a database id. The
// signature lets the scanner turn away a made-up code without a database lookup.
//
// It's signed with AUTH_SECRET. Changing that secret also makes tickets already
// issued fail the check, so don't rotate it in the middle of an event.

const RANDOM_LENGTH = 10;

/** Turns bytes into `length` characters of the ticket alphabet, 5 bits each. */
function encode(bytes: Buffer, length: number) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      bits -= 5;
      out += TICKET_ALPHABET[(value >> bits) & 31];
    }
    value &= (1 << bits) - 1;
  }
  return out;
}

function sign(random: string, secret: string) {
  const digest = createHmac("sha256", secret).update(`ticket:${random}`).digest();
  return encode(digest, TICKET_LENGTH - RANDOM_LENGTH);
}

function defaultSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET must be set to issue and check tickets.");
  return secret;
}

export function newTicketCode(secret = defaultSecret()) {
  const random = encode(randomBytes(8), RANDOM_LENGTH);
  return random + sign(random, secret);
}

/**
 * A certificate's public code: 12 characters from the same easy-to-read alphabet. It
 * needs no signature, because checking one always means looking it up.
 */
export function newVerifyCode() {
  return encode(randomBytes(8), 12);
}

/** The code in its stored form if the signature checks out, otherwise null. */
export function verifyTicketCode(input: string, secret = defaultSecret()): string | null {
  const code = normalizeTicketCode(input);
  if (code.length !== TICKET_LENGTH) return null;
  const expected = Buffer.from(sign(code.slice(0, RANDOM_LENGTH), secret));
  const given = Buffer.from(code.slice(RANDOM_LENGTH));
  return given.length === expected.length && timingSafeEqual(given, expected) ? code : null;
}
