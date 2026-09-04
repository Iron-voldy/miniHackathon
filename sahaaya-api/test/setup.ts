import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll } from "vitest";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-key-at-least-16-chars";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOWED_ORIGINS = "http://localhost:5173";
process.env.OPENAI_TIMEOUT_MS = "50";
process.env.AZURE_TTS_TIMEOUT_MS = "50";

// Must be set before any module imports ../src/lib/env, which reads process.env
// eagerly at import time — hence the top-level await here, ahead of the test
// file's own imports.
const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri("sahaaya-test");

afterAll(async () => {
  await mongod.stop();
});
