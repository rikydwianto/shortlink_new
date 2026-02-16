import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "./auth-middleware.js";
import { prisma } from "./prisma.js";
import { generateCode } from "./utils.js";

export const adminRouter = Router();
const NON_PREMIUM_LINK_LIMIT = 5;

const codeSchema = z.string().trim().min(1).max(20).regex(/^[a-zA-Z0-9_-]+$/);
const usernameSchema = z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9._-]+$/);

const createUserSchema = z.object({
  username: usernameSchema,
  email: z.string().trim().email(),
  password: z.string().min(8),
  role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]).default("USER"),
  isPremium: z.boolean().optional()
});

const updateUserSchema = z.object({
  username: usernameSchema.optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]).optional(),
  isPremium: z.boolean().optional()
});

const createAdminLinkSchema = z.object({
  userId: z.string().min(1),
  targetUrl: z.string().url(),
  code: codeSchema.optional(),
  title: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
  expiresAt: z.string().datetime().optional(),
  maxClicks: z.number().int().positive().optional(),
  password: z.string().min(1).max(128).optional(),
  isActive: z.boolean().optional(),
  enableTracking: z.boolean().optional(),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(120).optional(),
  trackingPixelId: z.string().max(255).optional(),
  allowedDevices: z.array(z.enum(["android", "ios", "desktop"])).optional(),
  allowedCountries: z.array(z.string().trim().min(2).max(3)).optional(),
  scheduledAt: z.string().datetime().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).optional()
});

const updateAdminLinkSchema = createAdminLinkSchema
  .omit({ userId: true })
  .partial()
  .extend({
    password: z.string().min(1).max(128).nullable().optional()
  });

const updatePremiumRequestSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional()
});

function getId(value) {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

function normalizeArray(values) {
  if (!values) {
    return [];
  }

  return values
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.toLowerCase());
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function normalizeUsername(value) {
  return value.trim().toLowerCase();
}

function buildLinkData(input) {
  return {
    targetUrl: input.targetUrl,
    title: input.title,
    description: input.description?.trim() || null,
    notes: input.notes?.trim() || null,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    maxClicks: input.maxClicks ?? null,
    isActive: input.isActive ?? true,
    enableTracking: input.enableTracking ?? true,
    utmSource: input.utmSource?.trim() || null,
    utmMedium: input.utmMedium?.trim() || null,
    utmCampaign: input.utmCampaign?.trim() || null,
    trackingPixelId: input.trackingPixelId?.trim() || null,
    allowedDevices: normalizeArray(input.allowedDevices),
    allowedCountries: normalizeArray(input.allowedCountries).map((item) => item.toUpperCase()),
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    tags: normalizeArray(input.tags),
    qrCodePath: null
  };
}

adminRouter.use(requireAuth);

adminRouter.get("/summary", requireRole("ADMIN", "SUPER_ADMIN"), async (_req, res) => {
  const [totalUsers, totalLinks, totalClicks] = await Promise.all([
    prisma.user.count(),
    prisma.link.count(),
    prisma.link.aggregate({ _sum: { clicks: true } })
  ]);

  return res.status(200).json({
    data: {
      totalUsers,
      totalLinks,
      totalClicks: totalClicks._sum.clicks ?? 0
    }
  });
});

adminRouter.get("/links", requireRole("ADMIN", "SUPER_ADMIN"), async (_req, res) => {
  const links = await prisma.link.findMany({
    include: {
      user: {
        select: { id: true, username: true, email: true, role: true }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return res.status(200).json({ data: links });
});

adminRouter.post("/links", requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const parsed = createAdminLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const owner = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!owner) {
    return res.status(404).json({ message: "Target user not found" });
  }

  if (!owner.isPremium) {
    const ownerLinksCount = await prisma.link.count({ where: { userId: parsed.data.userId } });
    if (ownerLinksCount >= NON_PREMIUM_LINK_LIMIT) {
      return res.status(403).json({
        message: `User non-premium maksimal ${NON_PREMIUM_LINK_LIMIT} link. Hapus link lama atau upgrade user ke premium.`
      });
    }
  }

  const code = parsed.data.code?.trim() || generateCode();
  const exists = await prisma.link.findUnique({ where: { code } });
  if (exists) {
    return res.status(409).json({ message: "Code already exists" });
  }

  const data = buildLinkData(parsed.data);

  if (parsed.data.password) {
    data.passwordHash = await bcrypt.hash(parsed.data.password, 10);
  }

  const link = await prisma.link.create({
    data: {
      userId: parsed.data.userId,
      code,
      ...data
    },
    include: {
      user: {
        select: { id: true, username: true, email: true, role: true }
      }
    }
  });

  return res.status(201).json({ data: link });
});

adminRouter.patch("/links/:id", requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const linkId = getId(req.params.id);
  if (!linkId) {
    return res.status(400).json({ message: "Invalid link id" });
  }

  const parsed = updateAdminLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const exists = await prisma.link.findUnique({ where: { id: linkId } });
  if (!exists) {
    return res.status(404).json({ message: "Link not found" });
  }

  if (parsed.data.code && parsed.data.code !== exists.code) {
    const duplicate = await prisma.link.findUnique({ where: { code: parsed.data.code } });
    if (duplicate) {
      return res.status(409).json({ message: "Code already exists" });
    }
  }

  const patch = parsed.data;

  const updateData = {
    ...(patch.targetUrl !== undefined ? { targetUrl: patch.targetUrl } : {}),
    ...(patch.code !== undefined ? { code: patch.code } : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || null } : {}),
    ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt ? new Date(patch.expiresAt) : null } : {}),
    ...(patch.maxClicks !== undefined ? { maxClicks: patch.maxClicks ?? null } : {}),
    ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    ...(patch.enableTracking !== undefined ? { enableTracking: patch.enableTracking } : {}),
    ...(patch.utmSource !== undefined ? { utmSource: patch.utmSource?.trim() || null } : {}),
    ...(patch.utmMedium !== undefined ? { utmMedium: patch.utmMedium?.trim() || null } : {}),
    ...(patch.utmCampaign !== undefined ? { utmCampaign: patch.utmCampaign?.trim() || null } : {}),
    ...(patch.trackingPixelId !== undefined ? { trackingPixelId: patch.trackingPixelId?.trim() || null } : {}),
    ...(patch.allowedDevices !== undefined ? { allowedDevices: normalizeArray(patch.allowedDevices) } : {}),
    ...(patch.allowedCountries !== undefined
      ? { allowedCountries: normalizeArray(patch.allowedCountries).map((item) => item.toUpperCase()) }
      : {}),
    ...(patch.scheduledAt !== undefined ? { scheduledAt: patch.scheduledAt ? new Date(patch.scheduledAt) : null } : {}),
    ...(patch.tags !== undefined ? { tags: normalizeArray(patch.tags) } : {})
  };

  if (patch.password !== undefined) {
    if (patch.password === null) {
      updateData.passwordHash = null;
    } else {
      updateData.passwordHash = await bcrypt.hash(patch.password, 10);
    }
  }

  const updated = await prisma.link.update({
    where: { id: linkId },
    data: updateData,
    include: {
      user: {
        select: { id: true, username: true, email: true, role: true }
      }
    }
  });

  return res.status(200).json({ data: updated });
});

adminRouter.delete("/links/:id", requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const linkId = getId(req.params.id);
  if (!linkId) {
    return res.status(400).json({ message: "Invalid link id" });
  }

  const exists = await prisma.link.findUnique({ where: { id: linkId } });
  if (!exists) {
    return res.status(404).json({ message: "Link not found" });
  }

  await prisma.link.delete({ where: { id: linkId } });
  return res.status(204).send();
});

adminRouter.get("/users", requireRole("SUPER_ADMIN"), async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { links: true }
      }
    }
  });

  const mapped = users.map((item) => ({
    id: item.id,
    username: item.username,
    email: item.email,
    role: item.role,
    isPremium: item.isPremium,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    linksCount: item._count.links
  }));

  return res.status(200).json({ data: mapped });
});

adminRouter.get("/premium-requests", requireRole("ADMIN", "SUPER_ADMIN"), async (_req, res) => {
  const requests = await prisma.premiumRequest.findMany({
    include: {
      user: {
        select: { id: true, username: true, email: true, role: true, isPremium: true }
      }
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }]
  });

  return res.status(200).json({ data: requests });
});

adminRouter.patch("/premium-requests/:id", requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const requestId = getId(req.params.id);
  if (!requestId) {
    return res.status(400).json({ message: "Invalid request id" });
  }

  const parsed = updatePremiumRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const existing = await prisma.premiumRequest.findUnique({
    where: { id: requestId },
    include: { user: { select: { id: true } } }
  });
  if (!existing) {
    return res.status(404).json({ message: "Premium request not found" });
  }

  if (existing.status !== "PENDING") {
    return res.status(400).json({ message: "Request sudah diproses" });
  }

  const now = new Date();
  const nextStatus = parsed.data.action === "approve" ? "APPROVED" : "REJECTED";
  const note = parsed.data.note?.trim() || null;

  const updated = await prisma.$transaction(async (tx) => {
    const reqUpdated = await tx.premiumRequest.update({
      where: { id: requestId },
      data: {
        status: nextStatus,
        adminNote: note,
        processedAt: now,
        processedByUserId: req.userId
      },
      include: {
        user: {
          select: { id: true, username: true, email: true, role: true, isPremium: true }
        }
      }
    });

    if (nextStatus === "APPROVED") {
      await tx.user.update({
        where: { id: existing.userId },
        data: { isPremium: true }
      });
    }

    return reqUpdated;
  });

  return res.status(200).json({ data: updated });
});

adminRouter.post("/users", requireRole("SUPER_ADMIN"), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const username = normalizeUsername(parsed.data.username);
  const email = normalizeEmail(parsed.data.email);
  const exists = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username }]
    }
  });
  if (exists) {
    if (exists.email === email) {
      return res.status(409).json({ message: "Email already used" });
    }

    return res.status(409).json({ message: "Username already used" });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      role: parsed.data.role,
      isPremium: parsed.data.isPremium ?? false
    },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      isPremium: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return res.status(201).json({ data: user });
});

adminRouter.patch("/users/:id", requireRole("SUPER_ADMIN"), async (req, res) => {
  const userId = getId(req.params.id);
  if (!userId) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const exists = await prisma.user.findUnique({ where: { id: userId } });
  if (!exists) {
    return res.status(404).json({ message: "User not found" });
  }

  const nextEmail = parsed.data.email ? normalizeEmail(parsed.data.email) : undefined;
  const nextUsername = parsed.data.username ? normalizeUsername(parsed.data.username) : undefined;

  if (nextEmail && nextEmail !== exists.email) {
    const duplicate = await prisma.user.findUnique({ where: { email: nextEmail } });
    if (duplicate) {
      return res.status(409).json({ message: "Email already used" });
    }
  }

  if (nextUsername && nextUsername !== exists.username) {
    const duplicate = await prisma.user.findUnique({ where: { username: nextUsername } });
    if (duplicate) {
      return res.status(409).json({ message: "Username already used" });
    }
  }

  const data = {
    ...(nextUsername !== undefined ? { username: nextUsername } : {}),
    ...(nextEmail !== undefined ? { email: nextEmail } : {}),
    ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
    ...(parsed.data.isPremium !== undefined ? { isPremium: parsed.data.isPremium } : {})
  };

  if (parsed.data.password) {
    data.passwordHash = await bcrypt.hash(parsed.data.password, 10);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      isPremium: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return res.status(200).json({ data: updated });
});

adminRouter.delete("/users/:id", requireRole("SUPER_ADMIN"), async (req, res) => {
  const userId = getId(req.params.id);
  if (!userId) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  if (userId === req.userId) {
    return res.status(400).json({ message: "You cannot delete your own account" });
  }

  const exists = await prisma.user.findUnique({ where: { id: userId } });
  if (!exists) {
    return res.status(404).json({ message: "User not found" });
  }

  await prisma.user.delete({ where: { id: userId } });
  return res.status(204).send();
});
