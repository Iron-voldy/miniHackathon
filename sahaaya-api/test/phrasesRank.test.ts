import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { setupTestDB, resetTestDB, teardownTestDB } from "./dbTestUtils";
import { Board } from "../src/models/Board";
import { Phrase } from "../src/models/Phrase";

let app: FastifyInstance;

beforeAll(async () => {
  await setupTestDB();
  app = buildApp();
  await app.ready();
});

afterEach(async () => {
  await resetTestDB();
});

afterAll(async () => {
  await app.close();
  await teardownTestDB();
});

async function login() {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/demo-login",
    payload: { name: "Test User", phone: "0791111111" },
  });
  return response.json() as { token: string };
}

describe("POST /api/v1/phrases/rank", () => {
  it("returns 404 for an unknown board", async () => {
    const { token } = await login();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/phrases/rank",
      headers: { authorization: `Bearer ${token}` },
      payload: { boardId: "does-not-exist" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("falls back to deterministic ranking when OPENAI_API_KEY is not configured", async () => {
    await Board.create({ _id: "home-basic", title: "Home", context: "home", phraseIds: ["A", "B", "C"] });
    await Phrase.insertMany([
      { _id: "A", category: "x", english: "A", sinhala: "x", tamil: "x", symbolAsset: "x.svg", riskClass: "normal", canNotify: true, requiresConfirmation: false, version: 1 },
      { _id: "B", category: "x", english: "B", sinhala: "x", tamil: "x", symbolAsset: "x.svg", riskClass: "normal", canNotify: true, requiresConfirmation: false, version: 1 },
      { _id: "C", category: "x", english: "C", sinhala: "x", tamil: "x", symbolAsset: "x.svg", riskClass: "normal", canNotify: true, requiresConfirmation: false, version: 1 },
    ]);
    const { token } = await login();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/phrases/rank",
      headers: { authorization: `Bearer ${token}` },
      payload: { boardId: "home-basic", recentPhraseIds: ["C"] },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.reasonCode).toBe("fallback_disabled");
    expect(body.rankedPhraseIds).toEqual(["C", "A", "B"]);
  });
});
