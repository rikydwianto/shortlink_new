import "dotenv/config";
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
import { redirectRouter } from "./redirect.routes.js";

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const port = Number(process.env.PORT ?? 4000);

/* ---------- middleware ---------- */
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(pinoHttp({ logger }));

/* ---------- routes ---------- */
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

app.use("/auth", authRouter);
app.use("/links", linksRouter);
app.use("/analytics", analyticsRouter);
app.use("/admin", adminRouter);

app.get("/", (_req, res) => {
  const dashboardUrl = process.env.DASHBOARD_URL ?? "http://localhost:3000";
  return res.redirect(302, dashboardUrl);
});

// public redirect — must be last
app.use(redirectRouter);

/* ---------- start ---------- */
app.listen(port, () => {
  logger.info(`API listening on http://localhost:${port}`);
});
