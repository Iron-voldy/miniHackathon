import jwt from "jsonwebtoken";
import { env } from "./env";

export type Role = "communicator" | "caregiver";

export interface JwtPayload {
  sub: string;
  role: Role;
}

export interface AuthenticatedUser {
  userId: string;
  role: Role;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });
}

export function verifyToken(token: string): AuthenticatedUser {
  const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  return { userId: decoded.sub, role: decoded.role };
}
