/**
 * Shared utility / helper functions.
 */

import { randomBytes } from "node:crypto";

/* ---------- code generator (re-export from utils if needed) ---------- */

export function generateCode(length = 7) {
  return randomBytes(Math.ceil(length * 0.75))
    .toString("base64url")
    .slice(0, length);
}

/* ---------- device detection ---------- */

export function detectDevice(userAgent = "") {
  const ua = userAgent.toLowerCase();
  if (ua.includes("android")) return "android";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) return "ios";
  return "desktop";
}

/* ---------- UTM builder ---------- */

export function appendUtm(url, link) {
  const hasAny = link.utmSource || link.utmMedium || link.utmCampaign;
  if (!hasAny) return url;

  const target = new URL(url);
  if (link.utmSource && !target.searchParams.has("utm_source"))
    target.searchParams.set("utm_source", link.utmSource);
  if (link.utmMedium && !target.searchParams.has("utm_medium"))
    target.searchParams.set("utm_medium", link.utmMedium);
  if (link.utmCampaign && !target.searchParams.has("utm_campaign"))
    target.searchParams.set("utm_campaign", link.utmCampaign);

  return target.toString();
}

/* ---------- HTML escaping ---------- */

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* ---------- redirect delay clamping ---------- */

export function clampRedirectDelay(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 3000;
  return Math.min(15000, Math.max(1000, Math.floor(parsed)));
}
