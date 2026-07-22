import { cookies } from "next/headers";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { SessionUser } from "./types";

export const COOKIE_NAME = "poop_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

/**
 * Runs on nearly every API request (including the map's 20s poll for every logged-in
 * tab), so this is one `include`-joined query rather than two sequential round trips
 * to the DB — halves the auth cost of every authenticated call.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;

  const user = session.user;
  if (!user || user.status !== "ACTIVE") return null;

  return {
    id: user.id,
    pseudo: user.pseudo,
    role: user.role === "ADMIN" ? "admin" : "user",
    username: user.username,
  };
}

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { userId, token, expiresAt } });
  const c = await cookies();
  c.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    // Only over HTTPS in production — localhost dev has no TLS to require.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  c.delete(COOKIE_NAME);
}
