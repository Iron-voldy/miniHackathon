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
      payload: { name: "Kasun", phone: "12345" },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toMatch(/valid Sri Lankan mobile number/i);
  });

  it("creates a communicator and returns a decodable token for a valid request", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/demo-login",
      payload: { name: "Kasun", phone: "0771234567" },
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
      payload: { name: "Nimal", phone: "0779876543" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/auth/demo-login",
      payload: { name: "Nimal", phone: "0779876543" },
    });

    expect(first.json().user.id).toBe(second.json().user.id);
  });

  it("refuses to log a caregiver's phone number in through the patient flow", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { name: "Priya", phone: "0771230001", email: "priya@example.com", password: "password123" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/demo-login",
      payload: { name: "Priya", phone: "0771230001" },
    });

    expect(response.statusCode).toBe(409);
  });
});

describe("POST /api/v1/auth/signup", () => {
  it("creates a caregiver account with a hashed password and returns a token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { name: "Nadeesha", phone: "0771230002", email: "nadeesha@example.com", password: "password123" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.token).toBeTruthy();
    expect(body.user.role).toBe("caregiver");
    expect(body.user.email).toBe("nadeesha@example.com");
    expect(body.user.passwordHash).toBeUndefined();
  });

  it("rejects a short password", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { name: "Nadeesha", phone: "0771230003", email: "short@example.com", password: "abc" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects a duplicate email or phone", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { name: "Nadeesha", phone: "0771230004", email: "dup@example.com", password: "password123" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { name: "Someone Else", phone: "0771230005", email: "dup@example.com", password: "password123" },
    });

    expect(response.statusCode).toBe(409);
  });
});

describe("POST /api/v1/auth/login", () => {
  it("logs a caregiver in with the correct password", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { name: "Ruwan", phone: "0771230006", email: "ruwan@example.com", password: "password123" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "ruwan@example.com", password: "password123" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe("ruwan@example.com");
  });

  it("rejects the wrong password", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { name: "Ruwan", phone: "0771230007", email: "wrongpw@example.com", password: "password123" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "wrongpw@example.com", password: "nope12345" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an email that was never signed up", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "ghost@example.com", password: "password123" },
    });

    expect(response.statusCode).toBe(401);
  });
});
