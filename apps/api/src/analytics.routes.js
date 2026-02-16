import { Router } from "express";
import { requireAuth } from "./auth-middleware.js";
import { prisma } from "./prisma.js";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

analyticsRouter.get("/overview", async (req, res) => {
  const [totalLinks, totalClicks] = await Promise.all([
    prisma.link.count({ where: { userId: req.userId } }),
    prisma.link.aggregate({
      where: { userId: req.userId },
      _sum: { clicks: true }
    })
  ]);

  return res.status(200).json({
    data: {
      totalLinks,
      totalClicks: totalClicks._sum.clicks ?? 0
    }
  });
});
