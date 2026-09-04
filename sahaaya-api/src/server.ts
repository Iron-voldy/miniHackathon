import { buildApp } from "./app";
import { connectDB } from "./lib/db";
import { env } from "./lib/env";

async function main(): Promise<void> {
  await connectDB();

  const app = buildApp();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`sahaaya-api listening on port ${env.PORT}`);

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down`);
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server", error);
  process.exit(1);
});
