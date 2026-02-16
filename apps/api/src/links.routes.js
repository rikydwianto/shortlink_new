import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.js";
import { prisma } from "./prisma.js";
import { generateCode } from "./utils.js";

export const linksRouter = Router();
const NON_PREMIUM_LINK_LIMIT = 5;

const codeSchema = z.string().trim().min(1).max(20).regex(/^[a-zA-Z0-9_-]+$/);

const createLinkSchema = z.object({
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

const updateLinkSchema = createLinkSchema
  .partial()
  .extend({
    password: z.string().min(1).max(128).nullable().optional()
  });

function getParamId(value) {
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

function buildLinkData(input) {
  const data = {
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

  return data;
}

linksRouter.use(requireAuth);

linksRouter.get("/", async (req, res) => {
  const links = await prisma.link.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" }
  });

  return res.status(200).json({ data: links });
});

linksRouter.get("/check-code/:code", async (req, res) => {
  const code = req.params.code?.trim();
  const excludeId = typeof req.query.excludeId === "string" ? req.query.excludeId : "";

  if (!code || !/^[a-zA-Z0-9_-]{1,20}$/.test(code)) {
    return res.status(400).json({ message: "Invalid code format" });
  }

  const existing = await prisma.link.findUnique({
    where: { code },
    select: { id: true }
  });

  const isAvailable = !existing || (excludeId && existing.id === excludeId);
  return res.status(200).json({
    data: {
      code,
      isAvailable
    }
  });
});

linksRouter.get("/:id", async (req, res) => {
  const linkId = getParamId(req.params.id);
  if (!linkId) {
    return res.status(400).json({ message: "Invalid link id" });
  }

  const link = await prisma.link.findFirst({
    where: { id: linkId, userId: req.userId }
  });

  if (!link) {
    return res.status(404).json({ message: "Link not found" });
  }

  return res.status(200).json({ data: link });
});

linksRouter.post("/", async (req, res) => {
  const parsed = createLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const [owner, currentLinksCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, isPremium: true }
    }),
    prisma.link.count({
      where: { userId: req.userId }
    })
  ]);

  if (!owner) {
    return res.status(404).json({ message: "User not found" });
  }

  if (!owner.isPremium && currentLinksCount >= NON_PREMIUM_LINK_LIMIT) {
    return res.status(403).json({
      message: `Akun non-premium maksimal ${NON_PREMIUM_LINK_LIMIT} link. Hapus link lama atau upgrade ke premium.`
    });
  }

  const chosenCode = parsed.data.code?.trim() || generateCode();
  const existing = await prisma.link.findUnique({ where: { code: chosenCode } });

  if (existing) {
    return res.status(409).json({ message: "Code already exists" });
  }

  const data = buildLinkData(parsed.data);

  if (parsed.data.password) {
    data.passwordHash = await bcrypt.hash(parsed.data.password, 10);
  }

  const link = await prisma.link.create({
    data: {
      userId: req.userId,
      code: chosenCode,
      ...data
    }
  });

  return res.status(201).json({ data: link });
});

linksRouter.patch("/:id", async (req, res) => {
  const linkId = getParamId(req.params.id);
  if (!linkId) {
    return res.status(400).json({ message: "Invalid link id" });
  }

  const parsed = updateLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const existing = await prisma.link.findFirst({
    where: { id: linkId, userId: req.userId }
  });

  if (!existing) {
    return res.status(404).json({ message: "Link not found" });
  }

  const patch = { ...parsed.data };

  if (patch.code && patch.code !== existing.code) {
    const duplicate = await prisma.link.findUnique({ where: { code: patch.code } });
    if (duplicate) {
      return res.status(409).json({ message: "Code already exists" });
    }
  }

  const updateData = {
    ...(patch.targetUrl ? { targetUrl: patch.targetUrl } : {}),
    ...(patch.code ? { code: patch.code } : {}),
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
    data: updateData
  });

  return res.status(200).json({ data: updated });
});

linksRouter.post("/:id/toggle", async (req, res) => {
  const linkId = getParamId(req.params.id);
  if (!linkId) {
    return res.status(400).json({ message: "Invalid link id" });
  }

  const existing = await prisma.link.findFirst({
    where: { id: linkId, userId: req.userId }
  });

  if (!existing) {
    return res.status(404).json({ message: "Link not found" });
  }

  const updated = await prisma.link.update({
    where: { id: linkId },
    data: { isActive: !existing.isActive }
  });

  return res.status(200).json({ data: updated });
});

linksRouter.delete("/:id", async (req, res) => {
  const linkId = getParamId(req.params.id);
  if (!linkId) {
    return res.status(400).json({ message: "Invalid link id" });
  }

  const existing = await prisma.link.findFirst({
    where: { id: linkId, userId: req.userId }
  });

  if (!existing) {
    return res.status(404).json({ message: "Link not found" });
  }

  await prisma.link.delete({ where: { id: linkId } });
  return res.status(204).send();
});
