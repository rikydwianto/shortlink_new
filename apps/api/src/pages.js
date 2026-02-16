/**
 * HTML page renderers — reads templates from /templates and fills placeholders.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clampRedirectDelay, escapeHtml } from "./helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMPL_DIR = join(__dirname, "templates");

const redirectTmpl = readFileSync(join(TMPL_DIR, "redirect.html"), "utf-8");
const errorTmpl = readFileSync(join(TMPL_DIR, "error.html"), "utf-8");

/* ------------------------------------------------------------------ */
/*  Redirect wait page                                                 */
/* ------------------------------------------------------------------ */

export function renderRedirectWaitPage({ code = "", targetUrl = "", delayMs = 3000, title = "", description = "", currentUrl = "" }) {
  const safeCode = escapeHtml(code);
  const safeTarget = escapeHtml(targetUrl);
  const encodedTarget = encodeURIComponent(targetUrl);
  const seconds = Math.ceil(delayMs / 1000);
  const siteName = escapeHtml(process.env.SITE_NAME ?? "Shortlink");
  const metaTitle = escapeHtml(title || `${code} — Shortlink`);
  const metaDesc = escapeHtml(description || `Klik untuk mengakses shortlink ${code}`);

  let html = redirectTmpl
    .replaceAll("{{DELAY_MS}}", String(delayMs))
    .replaceAll("{{SECONDS}}", String(seconds))
    .replaceAll("{{TARGET_URL}}", safeTarget)
    .replaceAll("{{ENCODED_TARGET}}", encodedTarget)
    .replaceAll("{{META_TITLE}}", metaTitle)
    .replaceAll("{{META_DESCRIPTION}}", metaDesc)
    .replaceAll("{{CURRENT_URL}}", escapeHtml(currentUrl))
    .replaceAll("{{SITE_NAME}}", siteName);

  // conditional code block
  if (safeCode) {
    html = html
      .replace("{{#CODE}}", "")
      .replace("{{/CODE}}", "")
      .replaceAll("{{CODE}}", safeCode);
  } else {
    html = html.replace(/{{#CODE}}[\s\S]*?{{\/CODE}}/g, "");
  }

  return html;
}

/* ------------------------------------------------------------------ */
/*  Error page                                                         */
/* ------------------------------------------------------------------ */

const SVG_ERROR = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
</svg>`;

const SVG_LOCK = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
  <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
</svg>`;

function buildPasswordScript() {
  return `<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script>
  const askPassword = async () => {
    const result = await Swal.fire({
      title: "Link Terkunci",
      text: "Masukkan password untuk membuka shortlink ini",
      input: "password",
      inputLabel: "Password",
      inputPlaceholder: "Masukkan password",
      inputAttributes: { autocapitalize: "off", autocorrect: "off" },
      showCancelButton: true,
      confirmButtonText: "Submit",
      cancelButtonText: "Batal",
      allowOutsideClick: false,
      backdrop: "rgba(10,23,50,.55)",
      preConfirm: (v) => {
        if (!v || !v.trim()) { Swal.showValidationMessage("Password wajib diisi"); return false; }
        return v.trim();
      }
    });
    if (result.isConfirmed && result.value) {
      const u = new URL(location.href);
      u.searchParams.set("password", result.value);
      location.assign(u.toString());
    }
  };
  document.getElementById("pw-btn")?.addEventListener("click", askPassword);
  addEventListener("load", askPassword);
</script>`;
}

export function renderLinkErrorPage({
  status = 404,
  code = "",
  title = "Link tidak ditemukan",
  message = "Shortlink yang kamu akses tidak tersedia.",
  hint = "Periksa kembali URL atau hubungi pemilik link.",
  passwordPrompt = false,
  currentUrl = ""
}) {
  const safeCode = escapeHtml(code);
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeHint = escapeHtml(hint);
  const dashboardUrl = escapeHtml(process.env.DASHBOARD_URL ?? "http://localhost:3000");

  const isLock = passwordPrompt;
  const iconClass = isLock ? "lock" : "error";
  const iconSvg = isLock ? SVG_LOCK : SVG_ERROR;
  const badgeClass = isLock ? "badge-blue" : "badge-red";
  const statusLabel = `Status ${status}`;

  const actionButtons = passwordPrompt
    ? `<button class="btn btn-primary" id="pw-btn" type="button">Masukkan Password</button>`
    : `<a class="btn btn-primary" href="${dashboardUrl}">Buka Dashboard</a>`;

  const siteName = escapeHtml(process.env.SITE_NAME ?? "Shortlink");

  let html = errorTmpl
    .replaceAll("{{TITLE}}", safeTitle)
    .replaceAll("{{MESSAGE}}", safeMessage)
    .replaceAll("{{HINT}}", safeHint)
    .replaceAll("{{ICON_CLASS}}", iconClass)
    .replaceAll("{{ICON_SVG}}", iconSvg)
    .replaceAll("{{BADGE_CLASS}}", badgeClass)
    .replaceAll("{{STATUS_LABEL}}", statusLabel)
    .replaceAll("{{ACTION_BUTTONS}}", actionButtons)
    .replaceAll("{{CURRENT_URL}}", escapeHtml(currentUrl))
    .replaceAll("{{SITE_NAME}}", siteName)
    .replaceAll("{{PASSWORD_HEAD}}", "")
    .replaceAll("{{PASSWORD_SCRIPT}}", passwordPrompt ? buildPasswordScript() : "");

  // conditional code block
  if (safeCode) {
    html = html
      .replace("{{#CODE}}", "")
      .replace("{{/CODE}}", "")
      .replaceAll("{{CODE}}", safeCode);
  } else {
    html = html.replace(/{{#CODE}}[\s\S]*?{{\/CODE}}/g, "");
  }

  return html;
}

/* ------------------------------------------------------------------ */
/*  Express response helpers                                           */
/* ------------------------------------------------------------------ */

export function sendLinkErrorPage(res, options, req = null) {
  const status = options.status ?? 404;
  if (req && !options.currentUrl) {
    options.currentUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  }
  const scriptSrc = options.passwordPrompt
    ? "script-src 'unsafe-inline' https://cdn.jsdelivr.net;"
    : "";
  res.status(status);
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; style-src 'unsafe-inline'; img-src data:; ${scriptSrc} base-uri 'none'; form-action 'none';`
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.type("html").send(renderLinkErrorPage(options));
}

export function sendRedirectWaitPage(res, options) {
  const delayMs = clampRedirectDelay(
    options.delayMs ?? process.env.REDIRECT_DELAY_MS ?? 3000
  );
  res.status(200);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none';"
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.type("html").send(renderRedirectWaitPage({ ...options, delayMs }));
}
