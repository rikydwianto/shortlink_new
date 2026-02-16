import { randomBytes } from "node:crypto";

export function generateCode(length = 7) {
  return randomBytes(length).toString("base64url").slice(0, length);
}
