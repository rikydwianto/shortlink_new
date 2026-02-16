import { prisma } from "./prisma.js";
import { verifyToken } from "./jwt.js";

export async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const token = auth.slice(7);
    const payload = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true }
    });

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.userId = user.id;
    req.userRole = user.role;
    return next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return next();
  };
}
