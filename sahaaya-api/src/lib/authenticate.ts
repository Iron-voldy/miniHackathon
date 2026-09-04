import { FastifyReply, FastifyRequest } from "fastify";
import { verifyToken } from "./jwt";

/**
 * Fastify preHandler. Decodes the bearer JWT into request.user; every protected
 * route reads request.user.userId as "who am I" and never a client-supplied id
 * (invariant #6/#7).
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Missing or invalid Authorization header" });
  }

  const token = header.slice("Bearer ".length).trim();
  try {
    request.user = verifyToken(token);
  } catch {
    return reply.code(401).send({ error: "Invalid or expired token" });
  }
}
