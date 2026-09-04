import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { setupTestDB, resetTestDB, teardownTestDB } from "./dbTestUtils";

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

describe("caregivers authorization", () => {
  it("rejects a caregiver trying to generate a pairing code", async () => {
    const caregiver = await login("0771111111", "caregiver");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/caregivers/pair",
      headers: { authorization: `Bearer ${caregiver.token}` },
    });

    expect(response.statusCode).toBe(403);
  });

  it("rejects a communicator trying to accept a pairing code", async () => {
    const communicator = await login("0772222222", "communicator");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/caregivers/pair/accept",
      headers: { authorization: `Bearer ${communicator.token}` },
      payload: { pairingCode: "ABC123" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("rejects an invalid or already-used pairing code", async () => {
    const caregiver = await login("0773333333", "caregiver");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/caregivers/pair/accept",
      headers: { authorization: `Bearer ${caregiver.token}` },
      payload: { pairingCode: "NOTREAL" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("lets a communicator generate a code and a caregiver accept it, then both see the link", async () => {
    const communicator = await login("0774444444", "communicator");
    const caregiver = await login("0775555555", "caregiver");

    const pairResponse = await app.inject({
      method: "POST",
      url: "/api/v1/caregivers/pair",
      headers: { authorization: `Bearer ${communicator.token}` },
    });
    expect(pairResponse.statusCode).toBe(201);
    const { pairingCode } = pairResponse.json();

    const acceptResponse = await app.inject({
      method: "POST",
      url: "/api/v1/caregivers/pair/accept",
      headers: { authorization: `Bearer ${caregiver.token}` },
      payload: { pairingCode },
    });
    expect(acceptResponse.statusCode).toBe(200);
    expect(acceptResponse.json().status).toBe("active");

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/v1/caregivers",
      headers: { authorization: `Bearer ${communicator.token}` },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toHaveLength(1);
  });

  it("never trusts a client-supplied communicatorId/caregiverId in the body", async () => {
    const attacker = await login("0776666666", "caregiver");
    const victim = await login("0777777777", "communicator");

    // Even if an attacker tries to smuggle a foreign id, identity comes from the JWT only.
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/caregivers/pair/accept",
      headers: { authorization: `Bearer ${attacker.token}` },
      payload: { pairingCode: "WONTMATCH", communicatorId: victim.user.id, caregiverId: victim.user.id },
    });

    expect(response.statusCode).toBe(404);
  });
});
