import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { setupTestDB, resetTestDB, teardownTestDB } from "./dbTestUtils";
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

async function login(phone: string, role: "communicator" | "caregiver") {
  const response = await app.inject({
    method: "POST",
    url: role === "caregiver" ? "/api/v1/auth/signup" : "/api/v1/auth/demo-login",
    payload:
      role === "caregiver"
        ? { name: "Test User", phone, email: `${phone}@test.dev`, password: "testpass123" }
        : { name: "Test User", phone },
  });
  return response.json() as { token: string; user: { id: string } };
}

async function pairCommunicatorWithCaregiver(communicatorToken: string, caregiverToken: string) {
  const pairResponse = await app.inject({
    method: "POST",
    url: "/api/v1/caregivers/pair",
    headers: { authorization: `Bearer ${communicatorToken}` },
  });
  const { pairingCode } = pairResponse.json();

  await app.inject({
    method: "POST",
    url: "/api/v1/caregivers/pair/accept",
    headers: { authorization: `Bearer ${caregiverToken}` },
    payload: { pairingCode },
  });
}

describe("POST /api/v1/requests", () => {
  it("rejects a request where confirmed !== true", async () => {
    const communicator = await login("0781111111", "communicator");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/requests",
      headers: { authorization: `Bearer ${communicator.token}` },
      payload: {
        phraseId: "CARE_WATER",
        inputMode: "touch",
        confirmed: false,
        clientRequestId: "req-1",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects when no active caregiver is linked", async () => {
    await Phrase.create({
      _id: "CARE_WATER",
      category: "basic-needs",
      english: "I want water",
      sinhala: "x",
      tamil: "x",
      symbolAsset: "x.svg",
      riskClass: "normal",
      canNotify: true,
      requiresConfirmation: false,
      version: 1,
    });
    const communicator = await login("0782222222", "communicator");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/requests",
      headers: { authorization: `Bearer ${communicator.token}` },
      payload: {
        phraseId: "CARE_WATER",
        inputMode: "touch",
        confirmed: true,
        clientRequestId: "req-2",
      },
    });

    expect(response.statusCode).toBe(422);
  });

  it("resolves text server-side and ignores any client-supplied renderedText", async () => {
    await Phrase.create({
      _id: "CARE_WATER",
      category: "basic-needs",
      english: "I want water",
      sinhala: "x",
      tamil: "x",
      symbolAsset: "x.svg",
      riskClass: "normal",
      canNotify: true,
      requiresConfirmation: false,
      version: 1,
    });
    const communicator = await login("0783333333", "communicator");
    const caregiver = await login("0784444444", "caregiver");
    await pairCommunicatorWithCaregiver(communicator.token, caregiver.token);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/requests",
      headers: { authorization: `Bearer ${communicator.token}` },
      payload: {
        phraseId: "CARE_WATER",
        renderedText: "something a compromised client tried to inject",
        inputMode: "touch",
        confirmed: true,
        clientRequestId: "req-3",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().resolvedText).toBe("I want water");
  });

  it("is idempotent on a duplicate clientRequestId (returns the existing request, not a 500)", async () => {
    await Phrase.create({
      _id: "CARE_WATER",
      category: "basic-needs",
      english: "I want water",
      sinhala: "x",
      tamil: "x",
      symbolAsset: "x.svg",
      riskClass: "normal",
      canNotify: true,
      requiresConfirmation: false,
      version: 1,
    });
    const communicator = await login("0785555555", "communicator");
    const caregiver = await login("0786666666", "caregiver");
    await pairCommunicatorWithCaregiver(communicator.token, caregiver.token);

    const payload = {
      phraseId: "CARE_WATER",
      inputMode: "touch",
      confirmed: true,
      clientRequestId: "duplicate-key-1",
    };

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/requests",
      headers: { authorization: `Bearer ${communicator.token}` },
      payload,
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/requests",
      headers: { authorization: `Bearer ${communicator.token}` },
      payload,
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);
  });

  it("only lets the communicator-owner or a targeted caregiver read a request", async () => {
    await Phrase.create({
      _id: "CARE_WATER",
      category: "basic-needs",
      english: "I want water",
      sinhala: "x",
      tamil: "x",
      symbolAsset: "x.svg",
      riskClass: "normal",
      canNotify: true,
      requiresConfirmation: false,
      version: 1,
    });
    const communicator = await login("0787777777", "communicator");
    const caregiver = await login("0788888888", "caregiver");
    const outsider = await login("0789999999", "caregiver");
    await pairCommunicatorWithCaregiver(communicator.token, caregiver.token);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/requests",
      headers: { authorization: `Bearer ${communicator.token}` },
      payload: {
        phraseId: "CARE_WATER",
        inputMode: "touch",
        confirmed: true,
        clientRequestId: "req-visibility",
      },
    });
    const requestId = created.json().id;

    const outsiderResponse = await app.inject({
      method: "GET",
      url: `/api/v1/requests/${requestId}`,
      headers: { authorization: `Bearer ${outsider.token}` },
    });
    expect(outsiderResponse.statusCode).toBe(403);

    const caregiverResponse = await app.inject({
      method: "GET",
      url: `/api/v1/requests/${requestId}`,
      headers: { authorization: `Bearer ${caregiver.token}` },
    });
    expect(caregiverResponse.statusCode).toBe(200);
  });
});
