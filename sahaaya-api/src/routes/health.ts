import { FastifyInstance } from "fastify";
import { isDBReady } from "../lib/db";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health/live", async (_request, reply) => {
    return reply.code(200).send({ status: "live" });
  });

  app.get("/health/ready", async (_request, reply) => {
    if (!isDBReady()) {
      return reply.code(503).send({ status: "not_ready" });
    }
    return reply.code(200).send({ status: "ready" });
  });
}
