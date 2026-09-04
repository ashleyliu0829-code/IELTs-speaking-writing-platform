import { randomInt } from "crypto";

/**
 * Activation codes for teacher accounts.
 *
 * Registration is open, so anyone with the URL can create a teacher workspace.
 * A code issued per account is what turns that into an invitation: the operator
 * reads it out of the database and sends it to the teacher they actually
 * recruited.
 *
 * It is read aloud, typed on a phone and pasted into chat apps, so the alphabet
 * drops the characters people confuse — 0/O, 1/I/L, 2/Z, 5/S, 8/B — rather than
 * being maximally compact.
 */
const alphabet = "ACDEFGHJKMNPQRTUVWXY34679";
const groups = 3;
const groupLength = 4;

export function generateActivationCode() {
  const block = () =>
    Array.from({ length: groupLength }, () => alphabet[randomInt(alphabet.length)]).join("");
  return Array.from({ length: groups }, block).join("-");
}

/** Accepts what a teacher actually types: any case, spaces or missing dashes. */
export function normalizeActivationCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function activationCodesMatch(entered: string, stored: string) {
  if (!entered || !stored) return false;
  return normalizeActivationCode(entered) === normalizeActivationCode(stored);
}
