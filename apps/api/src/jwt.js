import jwt from "jsonwebtoken";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }
  return secret;
}

const secret = getJwtSecret();

export function signToken(userId) {
  const expiresIn = process.env.JWT_EXPIRES_IN ?? "7d";
  return jwt.sign({ sub: userId }, secret, { expiresIn });
}

export function verifyToken(token) {
  const payload = jwt.verify(token, secret);

  if (typeof payload === "string" || typeof payload.sub !== "string") {
    throw new Error("Invalid token payload");
  }

  return { sub: payload.sub };
}
