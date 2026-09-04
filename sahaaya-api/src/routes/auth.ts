import { FastifyInstance } from "fastify";
import { z } from "zod";
import { User } from "../models/User";
import { signToken } from "../lib/jwt";
import { hashPassword, verifyPassword } from "../lib/password";
import { parse } from "../lib/validate";
import { auditLog } from "../lib/audit";

// Normalizes common formatting (spaces, dashes - e.g. "077 123 4567") before
// validating, so the example in our own error message actually passes.
const PhoneSchema = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(?:\+94|0)7\d{8}$/, "Enter a valid Sri Lankan mobile number, e.g. 077 123 4567"));

// Patient (communicator) side: passwordless, name + phone only - the device is
// handed to a non-speaking user, so there is no password to type. Caregivers
// authenticate separately below with a real account (invariant: caregivers get
// stronger auth since they receive care requests and PII by email).
const DemoLoginSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  phone: PhoneSchema,
});

const SignupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  phone: PhoneSchema,
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const LoginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

function serializeUser(user: {
  _id: { toString(): string };
  name: string;
  phone: string;
  email?: string;
  role: "communicator" | "caregiver";
  preferences: unknown;
}) {
  return {
    id: user._id.toString(),
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    preferences: user.preferences,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/demo-login", async (request, reply) => {
    const result = parse(DemoLoginSchema, request.body);
    if (!result.success || !result.data) {
      return reply.code(400).send({ error: result.message });
    }

    const { name, phone } = result.data;

    let user = await User.findOne({ phone });
    if (!user) {
      user = await User.create({ name, phone, role: "communicator" });
    } else if (user.role !== "communicator") {
      // A caregiver phone number colliding here means "not this route" - caregivers
      // authenticate via /auth/login, never get a session from the demo flow.
      return reply.code(409).send({ error: "This phone number is already registered as a caregiver — please log in instead" });
    }

    const token = signToken({ sub: user._id.toString(), role: user.role });
    auditLog({ route: "/auth/demo-login", actorId: user._id.toString(), outcome: "success" });

    return reply.code(200).send({ token, user: serializeUser(user) });
  });

  // Caregiver account creation: unlike the patient's passwordless demo-login,
  // caregivers get a real password-protected account (no Google/OAuth for now -
  // plain email+password keeps this dependency-free for a hackathon deploy).
  app.post("/auth/signup", async (request, reply) => {
    const result = parse(SignupSchema, request.body);
    if (!result.success || !result.data) {
      return reply.code(400).send({ error: result.message });
    }

    const { name, phone, email, password } = result.data;

    const existing = await User.findOne({ $or: [{ phone }, { email }] });
    if (existing) {
      auditLog({ route: "/auth/signup", outcome: "denied" });
      return reply.code(409).send({ error: "An account with that phone number or email already exists" });
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({ name, phone, email, role: "caregiver", passwordHash });

    const token = signToken({ sub: user._id.toString(), role: user.role });
    auditLog({ route: "/auth/signup", actorId: user._id.toString(), outcome: "success" });

    return reply.code(201).send({ token, user: serializeUser(user) });
  });

  app.post("/auth/login", async (request, reply) => {
    const result = parse(LoginSchema, request.body);
    if (!result.success || !result.data) {
      return reply.code(400).send({ error: result.message });
    }

    const { email, password } = result.data;

    const user = await User.findOne({ email, role: "caregiver" }).select("+passwordHash");
    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      auditLog({ route: "/auth/login", outcome: "denied" });
      // Deliberately generic - never reveal whether the email exists.
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    const token = signToken({ sub: user._id.toString(), role: user.role });
    auditLog({ route: "/auth/login", actorId: user._id.toString(), outcome: "success" });

    return reply.code(200).send({ token, user: serializeUser(user) });
  });
}
