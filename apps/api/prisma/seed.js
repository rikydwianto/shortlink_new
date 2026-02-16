import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function normalizeUsername(value) {
  return value.trim().toLowerCase();
}

async function upsertUser({ username, email, password, role, isPremium = false }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedUsername = normalizeUsername(username);
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: normalizedEmail }, { username: normalizedUsername }]
    }
  });
  if (existing) {
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      username: normalizedUsername,
      email: normalizedEmail,
      passwordHash,
      role,
      isPremium
    }
  });
}

async function main() {
  await upsertUser({
    username: process.env.SUPERUSER_USERNAME ?? "superadmin",
    email: process.env.SUPERUSER_EMAIL ?? "super@shortlink.local",
    password: process.env.SUPERUSER_PASSWORD ?? "super12345",
    role: "SUPER_ADMIN",
    isPremium: true
  });

  await upsertUser({
    username: process.env.ADMIN_USERNAME ?? "admin",
    email: process.env.ADMIN_EMAIL ?? "admin@shortlink.local",
    password: process.env.ADMIN_PASSWORD ?? "admin12345",
    role: "ADMIN",
    isPremium: true
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
