import crypto from "node:crypto"

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`
}

export function now(): string {
  return new Date().toISOString()
}
