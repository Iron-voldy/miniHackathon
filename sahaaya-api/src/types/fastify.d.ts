import { AuthenticatedUser } from "../lib/jwt";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
