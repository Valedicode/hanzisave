import { timingSafeEqual } from "node:crypto";

// Shared-secret guard for routes that spend API credit. With no ACCESS_CODE
// configured, requests are allowed in development and refused in production,
// so a forgotten env var can't leave a deployed route open.
export function hasAccess(req: Request, expected: string | undefined = process.env.ACCESS_CODE): boolean {
  if (!expected) return process.env.NODE_ENV !== "production";
  const given = Buffer.from(req.headers.get("x-access-code") ?? "");
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
