import "dotenv/config";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pino from "pino";
import { pinoHttp } from "pino-http";
import { adminRouter } from "./admin.routes.js";
import { analyticsRouter } from "./analytics.routes.js";
import { authRouter } from "./auth.routes.js";
import { linksRouter } from "./links.routes.js";
import { prisma } from "./prisma.js";

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const port = Number(process.env.PORT ?? 4000);

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(pinoHttp({ logger }));

function detectDevice(userAgent = "") {
  const ua = userAgent.toLowerCase();
  if (ua.includes("android")) {
    return "android";
  }
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) {
    return "ios";
  }
  return "desktop";
}

function appendUtm(url, link) {
  const hasAny = link.utmSource || link.utmMedium || link.utmCampaign;
  if (!hasAny) {
    return url;
  }

  const target = new URL(url);

  if (link.utmSource && !target.searchParams.has("utm_source")) {
    target.searchParams.set("utm_source", link.utmSource);
  }

  if (link.utmMedium && !target.searchParams.has("utm_medium")) {
    target.searchParams.set("utm_medium", link.utmMedium);
  }

  if (link.utmCampaign && !target.searchParams.has("utm_campaign")) {
    target.searchParams.set("utm_campaign", link.utmCampaign);
  }

  return target.toString();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function clampRedirectDelay(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 3000;
  return Math.min(15000, Math.max(1000, Math.floor(parsed)));
}

function renderRedirectWaitPage({ code = "", targetUrl = "", delayMs = 3000 }) {
  const safeCode = escapeHtml(code);
  const safeTarget = escapeHtml(targetUrl);
  const encodedTarget = encodeURIComponent(targetUrl);
  const seconds = Math.ceil(delayMs / 1000);

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mengarahkan ke tujuan...</title>
  <style>
    :root {
      --ink: #0f172a;
      --muted: #556682;
      --line: #d7e1f1;
      --bg1: #eef4ff;
      --bg2: #e9f3ff;
      --card: #ffffff;
      --accent: #1f63dc;
      --accent-2: #4b8ef8;
      --accent-soft: #ecf3ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
      display: grid;
      place-items: center;
      background:
        radial-gradient(720px 280px at -8% -20%, rgba(101, 172, 255, 0.28), transparent 65%),
        linear-gradient(180deg, var(--bg1), var(--bg2));
      padding: 24px;
    }
    .card {
      width: min(700px, 100%);
      padding: 30px;
      border-radius: 24px;
      border: 1px solid var(--line);
      background: var(--card);
      box-shadow: 0 20px 38px rgba(20, 54, 111, 0.1);
    }
    .pill {
      display: inline-block;
      margin-bottom: 12px;
      padding: 7px 12px;
      border-radius: 999px;
      border: 1px solid #bfd2f2;
      background: var(--accent-soft);
      color: #1c58be;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0 0 8px;
      font-size: clamp(1.5rem, 2.8vw, 2.1rem);
      line-height: 1.18;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.55;
    }
    .countdown {
      margin-top: 16px;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 13px;
      border-radius: 12px;
      background: #f5f9ff;
      border: 1px solid #d6e3f8;
      color: #214171;
      font-weight: 700;
    }
    .count {
      min-width: 38px;
      border-radius: 9px;
      padding: 5px 8px;
      text-align: center;
      color: #fff;
      background: linear-gradient(145deg, var(--accent), var(--accent-2));
    }
    .meta {
      margin-top: 14px;
      padding: 11px 12px;
      border-radius: 12px;
      background: #f7fbff;
      border: 1px solid #d8e6fa;
      font-size: 0.95rem;
      color: #31517f;
      word-break: break-word;
    }
    .actions {
      margin-top: 18px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-block;
      padding: 10px 14px;
      border-radius: 11px;
      border: 1px solid transparent;
      text-decoration: none;
      font-size: 0.95rem;
      font-weight: 700;
      transition: transform 0.16s ease;
      cursor: pointer;
    }
    .btn:hover { transform: translateY(-1px); }
    .btn.primary {
      color: #fff;
      background: linear-gradient(145deg, var(--accent), var(--accent-2));
    }
    .btn.ghost {
      color: #294470;
      border-color: #ccd9f0;
      background: #fff;
    }
  </style>
</head>
<body>
  <main class="card">
    <span class="pill">Redirect</span>
    <h1>Menyiapkan halaman tujuan</h1>
    <p>Kamu akan diarahkan otomatis. Jika tidak berpindah, klik tombol di bawah.</p>
    <div class="countdown">
      <span>Dialihkan dalam</span>
      <span class="count" id="count-value">${seconds}</span>
      <span>detik</span>
    </div>
    ${safeCode ? `<div class="meta">Code: <strong>${safeCode}</strong></div>` : ""}
    <div class="meta">Tujuan: <strong>${safeTarget}</strong></div>
    <div class="actions">
      <a id="go-link" class="btn primary" href="${safeTarget}" rel="noreferrer">Lanjutkan Sekarang</a>
      <a class="btn ghost" href="javascript:history.back()">Kembali</a>
    </div>
  </main>
  <script>
    (function () {
      const target = decodeURIComponent("${encodedTarget}");
      const delayMs = ${delayMs};
      const startAt = Date.now();
      const countEl = document.getElementById("count-value");
      const navEntry = performance.getEntriesByType("navigation")[0];
      const isReload = navEntry && navEntry.type === "reload";

      if (isReload && window.history.length > 1) {
        window.history.back();
        return;
      }

      const update = () => {
        const elapsed = Date.now() - startAt;
        const remaining = Math.max(0, Math.ceil((delayMs - elapsed) / 1000));
        if (countEl) countEl.textContent = String(remaining);
      };

      update();
      const tick = window.setInterval(update, 200);

      window.setTimeout(function () {
        window.clearInterval(tick);
        window.location.assign(target);
      }, delayMs);
    })();
  </script>
</body>
</html>`;
}

function renderLinkErrorPage({
  status = 404,
  code = "",
  title = "Link tidak ditemukan",
  message = "Shortlink yang kamu akses tidak tersedia.",
  hint = "Periksa kembali URL atau hubungi pemilik link.",
  passwordPrompt = false
}) {
  const safeCode = escapeHtml(code);
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeHint = escapeHtml(hint);
  const dashboardUrl = escapeHtml(process.env.DASHBOARD_URL ?? "http://localhost:3000");
  const passwordButtonHtml = passwordPrompt
    ? `<button class="btn primary" id="password-btn" type="button">Masukkan Password</button>`
    : `<a class="btn primary" href="${dashboardUrl}">Buka Dashboard</a>`;
  const passwordScript = passwordPrompt
    ? `<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script>
  const askPassword = async () => {
    const result = await Swal.fire({
      title: "Link Terkunci",
      text: "Masukkan password untuk membuka shortlink ini",
      input: "password",
      inputLabel: "Password",
      inputPlaceholder: "Masukkan password",
      inputAttributes: {
        autocapitalize: "off",
        autocorrect: "off"
      },
      showCancelButton: true,
      confirmButtonText: "Submit",
      cancelButtonText: "Batal",
      allowOutsideClick: false,
      backdrop: "rgba(10, 23, 50, 0.55)",
      preConfirm: (value) => {
        if (!value || !value.trim()) {
          Swal.showValidationMessage("Password wajib diisi");
          return false;
        }
        return value.trim();
      }
    });

    if (result.isConfirmed && result.value) {
      const url = new URL(window.location.href);
      url.searchParams.set("password", result.value);
      window.location.assign(url.toString());
    }
  };

  document.getElementById("password-btn")?.addEventListener("click", askPassword);
  window.addEventListener("load", askPassword);
</script>`
    : "";

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    :root {
      --ink: #0f172a;
      --muted: #5f6f88;
      --line: #d4deef;
      --bg1: #eff4ff;
      --bg2: #e9f2ff;
      --card: #ffffff;
      --accent: #1e63de;
      --accent-2: #4a88f3;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
      display: grid;
      place-items: center;
      background:
        radial-gradient(700px 280px at -5% -15%, rgba(104, 175, 255, 0.28), transparent 65%),
        linear-gradient(180deg, var(--bg1), var(--bg2));
      padding: 24px;
    }
    .card {
      width: min(680px, 100%);
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 28px;
      box-shadow: 0 20px 35px rgba(21, 56, 120, 0.08);
    }
    .pill {
      display: inline-block;
      margin-bottom: 12px;
      padding: 7px 12px;
      border-radius: 999px;
      border: 1px solid #bed1f5;
      background: #edf3ff;
      color: #1f57ba;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0 0 8px;
      font-size: clamp(1.4rem, 2.8vw, 2rem);
      line-height: 1.2;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.55;
    }
    .meta {
      margin-top: 14px;
      padding: 11px 12px;
      border-radius: 12px;
      background: #f7faff;
      border: 1px solid #d9e5f8;
      font-size: 0.95rem;
      color: #314d7d;
      word-break: break-word;
    }
    .actions {
      margin-top: 18px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-block;
      border-radius: 11px;
      padding: 10px 14px;
      border: 1px solid transparent;
      font-size: 0.95rem;
      font-weight: 700;
      text-decoration: none;
      transition: transform 0.16s ease;
    }
    .btn:hover { transform: translateY(-1px); }
    .btn.primary {
      color: #fff;
      background: linear-gradient(140deg, var(--accent), var(--accent-2));
    }
    .btn.ghost {
      color: #284271;
      border-color: #ccdaf2;
      background: #fff;
    }
  </style>
</head>
<body>
  <main class="card">
    <span class="pill">Status ${status}</span>
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
    <p style="margin-top:8px">${safeHint}</p>
    ${safeCode ? `<div class="meta">Code: <strong>${safeCode}</strong></div>` : ""}
    <div class="actions">
      ${passwordButtonHtml}
      <a class="btn ghost" href="javascript:history.back()">Kembali</a>
    </div>
  </main>
  ${passwordScript}
</body>
</html>`;
}

function sendLinkErrorPage(res, options) {
  const status = options.status ?? 404;
  const scriptSrc = options.passwordPrompt ? "script-src 'unsafe-inline' https://cdn.jsdelivr.net;" : "";
  res.status(status);
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; style-src 'unsafe-inline'; img-src data:; ${scriptSrc} base-uri 'none'; form-action 'none';`
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.type("html").send(renderLinkErrorPage(options));
}

function sendRedirectWaitPage(res, options) {
  const delayMs = clampRedirectDelay(options.delayMs ?? process.env.REDIRECT_DELAY_MS ?? 3000);
  res.status(200);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none';"
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.type("html").send(renderRedirectWaitPage({ ...options, delayMs }));
}

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/links", linksRouter);
app.use("/analytics", analyticsRouter);
app.use("/admin", adminRouter);

app.get("/", (_req, res) => {
  const dashboardUrl = process.env.DASHBOARD_URL ?? "http://localhost:3000";
  return res.redirect(302, dashboardUrl);
});

app.get("/:code", async (req, res) => {
  const link = await prisma.link.findUnique({ where: { code: req.params.code } });

  if (!link) {
    return sendLinkErrorPage(res, {
      status: 404,
      code: req.params.code,
      title: "Link tidak ditemukan",
      message: "Maaf, shortlink yang kamu buka tidak tersedia.",
      hint: "Cek lagi penulisan link atau minta URL terbaru dari pemilik."
    });
  }

  if (!link.isActive) {
    return sendLinkErrorPage(res, {
      status: 410,
      code: req.params.code,
      title: "Link sedang nonaktif",
      message: "Shortlink ini sudah dinonaktifkan oleh pemilik.",
      hint: "Silakan hubungi pemilik link untuk mendapatkan akses terbaru."
    });
  }

  const now = new Date();

  if (link.scheduledAt && now < link.scheduledAt) {
    return sendLinkErrorPage(res, {
      status: 403,
      code: req.params.code,
      title: "Link belum aktif",
      message: "Shortlink ini dijadwalkan aktif pada waktu tertentu.",
      hint: "Coba akses kembali beberapa saat lagi."
    });
  }

  if (link.expiresAt && now > link.expiresAt) {
    await prisma.link.update({
      where: { id: link.id },
      data: { isActive: false }
    });
    return sendLinkErrorPage(res, {
      status: 410,
      code: req.params.code,
      title: "Masa berlaku habis",
      message: "Shortlink ini sudah melewati tanggal kedaluwarsa.",
      hint: "Minta pemilik link membuat URL baru."
    });
  }

  if (link.maxClicks && link.clicks >= link.maxClicks) {
    await prisma.link.update({
      where: { id: link.id },
      data: { isActive: false }
    });
    return sendLinkErrorPage(res, {
      status: 410,
      code: req.params.code,
      title: "Batas klik tercapai",
      message: "Link ini sudah mencapai batas maksimum klik.",
      hint: "Hubungi pemilik link jika kamu masih butuh akses."
    });
  }

  if (link.allowedDevices.length > 0) {
    const device = detectDevice(req.headers["user-agent"]);
    if (!link.allowedDevices.includes(device)) {
      return sendLinkErrorPage(res, {
        status: 403,
        code: req.params.code,
        title: "Perangkat tidak didukung",
        message: "Shortlink ini dibatasi untuk perangkat tertentu.",
        hint: "Coba akses dari perangkat yang sesuai kebijakan pemilik."
      });
    }
  }

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
      });
    }
  }

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
      });
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
      });
    }
  }

  if (link.enableTracking) {
    await prisma.link.update({
      where: { id: link.id },
      data: {
        clicks: { increment: 1 },
        lastClickedAt: now
      }
    });
  }

  const targetUrl = appendUtm(link.targetUrl, link);
  return sendRedirectWaitPage(res, {
    code: req.params.code,
    targetUrl
  });
});

app.listen(port, () => {
  logger.info(`API listening on http://localhost:${port}`);
});
