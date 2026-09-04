import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { env } from "./lib/env";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { profileRoutes } from "./routes/profiles";
import { boardRoutes } from "./routes/boards";
import { customPhraseRoutes } from "./routes/customPhrases";
import { phraseRoutes } from "./routes/phrases";
import { caregiverRoutes } from "./routes/caregivers";
import { requestRoutes } from "./routes/requests";

/**
 * Builds the Fastify instance without calling .listen(), so tests can import it
 * directly (guide §4).
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
  });

  app.register(cors, {
    origin: env.ALLOWED_ORIGINS.length > 0 ? env.ALLOWED_ORIGINS : false,
    credentials: true,
  });

  // Unprefixed so Render's health check path (/health/ready) works as documented.
  app.register(healthRoutes);

  app.register(
    async (v1) => {
      await v1.register(authRoutes);
      await v1.register(profileRoutes);
      await v1.register(boardRoutes);
      await v1.register(customPhraseRoutes);
      await v1.register(phraseRoutes);
      await v1.register(caregiverRoutes);
      await v1.register(requestRoutes);
    },
    { prefix: "/api/v1" }
  );

  return app;
}
