/**
 * Public redirect handler — GET /:code
 */

import bcrypt from "bcryptjs";
import { Router } from "express";
import { appendUtm, detectDevice } from "./helpers.js";
import { sendLinkErrorPage, sendRedirectWaitPage } from "./pages.js";
import { prisma } from "./prisma.js";

export const redirectRouter = Router();

redirectRouter.get("/:code", async (req, res) => {
  const link = await prisma.link.findUnique({
    where: { code: req.params.code }
  });

  /* ---- not found ---- */
  if (!link) {
    return sendLinkErrorPage(res, {
      status: 404,
      code: req.params.code,
      title: "Link tidak ditemukan",
      message: "Maaf, shortlink yang kamu buka tidak tersedia.",
      hint: "Cek lagi penulisan link atau minta URL terbaru dari pemilik."
    }, req);
  }

  /* ---- inactive ---- */
  if (!link.isActive) {
    return sendLinkErrorPage(res, {
      status: 410,
      code: req.params.code,
      title: "Link sedang nonaktif",
      message: "Shortlink ini sudah dinonaktifkan oleh pemilik.",
      hint: "Silakan hubungi pemilik link untuk mendapatkan akses terbaru."
    }, req);
  }

  const now = new Date();

  /* ---- scheduled ---- */
  if (link.scheduledAt && now < link.scheduledAt) {
    return sendLinkErrorPage(res, {
      status: 403,
      code: req.params.code,
      title: "Link belum aktif",
      message: "Shortlink ini dijadwalkan aktif pada waktu tertentu.",
      hint: "Coba akses kembali beberapa saat lagi."
    }, req);
  }

  /* ---- expired ---- */
  if (link.expiresAt && now > link.expiresAt) {
    await prisma.link.update({ where: { id: link.id }, data: { isActive: false } });
    return sendLinkErrorPage(res, {
      status: 410,
      code: req.params.code,
      title: "Masa berlaku habis",
      message: "Shortlink ini sudah melewati tanggal kedaluwarsa.",
      hint: "Minta pemilik link membuat URL baru."
    }, req);
  }

  /* ---- max clicks ---- */
  if (link.maxClicks && link.clicks >= link.maxClicks) {
    await prisma.link.update({ where: { id: link.id }, data: { isActive: false } });
    return sendLinkErrorPage(res, {
      status: 410,
      code: req.params.code,
      title: "Batas klik tercapai",
      message: "Link ini sudah mencapai batas maksimum klik.",
      hint: "Hubungi pemilik link jika kamu masih butuh akses."
    }, req);
  }

  /* ---- device restriction ---- */
  if (link.allowedDevices.length > 0) {
    const device = detectDevice(req.headers["user-agent"]);
    if (!link.allowedDevices.includes(device)) {
      return sendLinkErrorPage(res, {
        status: 403,
        code: req.params.code,
        title: "Perangkat tidak didukung",
        message: "Shortlink ini dibatasi untuk perangkat tertentu.",
        hint: "Coba akses dari perangkat yang sesuai kebijakan pemilik."
      }, req);
    }
  }

  /* ---- country restriction ---- */
  if (link.allowedCountries.length > 0) {
    const country =
      (typeof req.headers["cf-ipcountry"] === "string" ? req.headers["cf-ipcountry"] : "") ||
      (typeof req.headers["x-country"] === "string" ? req.headers["x-country"] : "");

    if (country && !link.allowedCountries.includes(country.toUpperCase())) {
      return sendLinkErrorPage(res, {
        status: 403,
        code: req.params.code,
        title: "Lokasi tidak diizinkan",
        message: "Shortlink ini tidak tersedia untuk lokasi kamu saat ini.",
        hint: "Gunakan jaringan/lokasi yang diizinkan oleh pemilik link."
      }, req);
    }
  }

  /* ---- password protection ---- */
  if (link.passwordHash) {
    const passwordInput =
      (typeof req.query.password === "string" ? req.query.password : "") ||
      (typeof req.headers["x-link-password"] === "string" ? req.headers["x-link-password"] : "");

    if (!passwordInput) {
      return sendLinkErrorPage(res, {
        status: 401,
        code: req.params.code,
        title: "Password dibutuhkan",
        message: "Shortlink ini dilindungi password.",
        hint: "Masukkan password untuk melanjutkan.",
        passwordPrompt: true
      }, req);
    }

    const valid = await bcrypt.compare(passwordInput, link.passwordHash);
    if (!valid) {
      return sendLinkErrorPage(res, {
        status: 401,
        code: req.params.code,
        title: "Password salah",
        message: "Password yang dimasukkan tidak cocok.",
        hint: "Coba masukkan password yang benar.",
        passwordPrompt: true
      }, req);
    }
  }

  /* ---- tracking ---- */
  if (link.enableTracking) {
    await prisma.link.update({
      where: { id: link.id },
      data: { clicks: { increment: 1 }, lastClickedAt: now }
    });
  }

  /* ---- redirect ---- */
  const targetUrl = appendUtm(link.targetUrl, link);
  const currentUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  return sendRedirectWaitPage(res, {
    code: req.params.code,
    targetUrl,
    title: link.title,
    description: link.description,
    currentUrl
  });
});
