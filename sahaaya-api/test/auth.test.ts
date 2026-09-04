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

describe("POST /api/v1/auth/demo-login", () => {
  it("rejects an invalid phone number with a friendly message", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/demo-login",
      payload: { name: "Kasun", phone: "12345", role: "communicator" },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toMatch(/valid Sri Lankan mobile number/i);
  });

  it("creates a user and returns a decodable token for a valid request", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/demo-login",
      payload: { name: "Kasun", phone: "0771234567", role: "communicator" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.token).toBeTruthy();
    expect(body.user.role).toBe("communicator");
    expect(body.user.phone).toBe("0771234567");
  });

  it("finds-or-creates the same user on a repeat login by phone", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/auth/demo-login",
      payload: { name: "Nimal", phone: "0779876543", role: "caregiver" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/auth/demo-login",
      payload: { name: "Nimal", phone: "0779876543", role: "caregiver" },
    });

    expect(first.json().user.id).toBe(second.json().user.id);
  });
});
