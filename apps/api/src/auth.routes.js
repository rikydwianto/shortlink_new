import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.js";
import { signToken } from "./jwt.js";
import { prisma } from "./prisma.js";

export const authRouter = Router();

const usernameSchema = z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9._-]+$/);

const registerSchema = z.object({
  username: usernameSchema,
  email: z.string().trim().email(),
  password: z.string().min(8)
});

const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(8)
});

const premiumRequestSchema = z.object({
  message: z.string().trim().max(500).optional()
});

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function normalizeUsername(value) {
  return value.trim().toLowerCase();
}

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const email = normalizeEmail(parsed.data.email);
  const username = normalizeUsername(parsed.data.username);
  const { password } = parsed.data;
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username }]
    }
  });

  if (existing) {
    if (existing.email === email) {
      return res.status(409).json({ message: "Email already used" });
    }

    return res.status(409).json({ message: "Username already used" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, email, passwordHash },
    select: { id: true, username: true, email: true, role: true, isPremium: true, createdAt: true }
  });

  const token = signToken(user.id);
  return res.status(201).json({ user, token });
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const identifier = parsed.data.identifier.trim().toLowerCase();
  const { password } = parsed.data;
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: identifier }, { username: identifier }]
    }
  });
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = signToken(user.id);
  return res.status(200).json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isPremium: user.isPremium,
      createdAt: user.createdAt
    },
    token
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, username: true, email: true, role: true, isPremium: true, createdAt: true }
  });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.status(200).json({ data: user });
});

authRouter.get("/premium-requests/me", requireAuth, async (req, res) => {
  const requests = await prisma.premiumRequest.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" }
  });

  return res.status(200).json({ data: requests });
});

authRouter.post("/premium-requests", requireAuth, async (req, res) => {
  const parsed = premiumRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, isPremium: true }
  });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (user.isPremium) {
    return res.status(400).json({ message: "Akun sudah premium" });
  }

  const pending = await prisma.premiumRequest.findFirst({
    where: { userId: req.userId, status: "PENDING" }
  });

  if (pending) {
    return res.status(409).json({ message: "Masih ada permintaan premium yang menunggu konfirmasi" });
  }

  const created = await prisma.premiumRequest.create({
    data: {
      userId: req.userId,
      message: parsed.data.message?.trim() || null
    }
  });

  return res.status(201).json({ data: created });
});
