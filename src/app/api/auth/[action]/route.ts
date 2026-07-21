import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, getSessionUser, hashPassword, verifyPassword } from "@/lib/auth";
import { withApiErrorHandling } from "@/lib/api-error";
import { clientIp, isRateLimited } from "@/lib/rate-limit";
import type { SessionUser } from "@/lib/types";

function toSessionUser(u: { id: number; pseudo: string; role: string; username: string }): SessionUser {
  return { id: u.id, pseudo: u.pseudo, role: u.role === "ADMIN" ? "admin" : "user", username: u.username };
}

const isValidUsername = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_.-]{3,20}$/.test(v);

const normalizeUsername = (v: string) => v.trim().toLowerCase();

const TOO_MANY = () => NextResponse.json({ error: "Trop de tentatives — réessaie dans quelques minutes" }, { status: 429 });

// Computed lazily, once, and reused for every "user not found" login: comparing
// against a real bcrypt hash even when there's no such account keeps the response
// time indistinguishable from a wrong-password case, so timing can't be used to
// enumerate which usernames exist.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("no-such-account-timing-normalizer", 12));

export const GET = withApiErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ action: string }> }) => {
  const { action } = await params;
  if (action !== "me") return NextResponse.json({ error: "Action inconnue" }, { status: 404 });
  const user = await getSessionUser();
  return NextResponse.json({ user });
});

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ action: string }> }) => {
  const { action } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (action === "register") {
    if (isRateLimited(`register:${clientIp(req)}`, 5)) return TOO_MANY();

    const { username, password, pseudo } = body;
    if (!isValidUsername(username))
      return NextResponse.json({ error: "Identifiant invalide (3 à 20 caractères : lettres, chiffres, . _ -)" }, { status: 400 });
    if (typeof password !== "string" || password.length < 8)
      return NextResponse.json({ error: "Mot de passe trop court (8 caractères min)" }, { status: 400 });
    if (typeof pseudo !== "string" || pseudo.trim().length < 2 || pseudo.trim().length > 24)
      return NextResponse.json({ error: "Pseudo invalide (2 à 24 caractères)" }, { status: 400 });

    const normalized = normalizeUsername(username);
    const existing = await prisma.user.findUnique({ where: { username: normalized } });
    if (existing) return NextResponse.json({ error: "Cet identifiant est déjà pris" }, { status: 409 });

    const user = await prisma.user.create({
      data: {
        username: normalized,
        passwordHash: await hashPassword(password),
        pseudo: pseudo.trim(),
      },
    });
    await createSession(user.id);
    return NextResponse.json({ user: toSessionUser(user) }, { status: 201 });
  }

  if (action === "login") {
    if (isRateLimited(`login:${clientIp(req)}`, 10)) return TOO_MANY();

    const { username, password } = body;
    if (!isValidUsername(username) || typeof password !== "string")
      return NextResponse.json({ error: "Identifiants invalides" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { username: normalizeUsername(username) } });
    const ok = await verifyPassword(password, user ? user.passwordHash : await getDummyHash());
    if (!user || !ok) {
      return NextResponse.json({ error: "Identifiant ou mot de passe incorrect" }, { status: 401 });
    }
    if (user.status === "BANNED") {
      return NextResponse.json({ error: "Ce compte a été suspendu" }, { status: 403 });
    }
    await createSession(user.id);
    return NextResponse.json({ user: toSessionUser(user) });
  }

  if (action === "logout") {
    await destroySession();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Action inconnue" }, { status: 404 });
});
