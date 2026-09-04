import { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { z } from "zod";
import { CaregiverLink } from "../models/CaregiverLink";
import { User } from "../models/User";
import { authenticate } from "../lib/authenticate";
import { parse } from "../lib/validate";
import { auditLog } from "../lib/audit";
import { generateAccessCode, hashAccessCode } from "../lib/accessCode";

const AcceptPairingSchema = z.object({
  pairingCode: z.string().min(1, "Pairing code is required"),
});

const CreatePatientSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  language: z.enum(["en", "si", "ta"]).default("en"),
});

function generatePairingCode(): string {
  // 6-char uppercase alphanumeric, easy to read aloud/type on a demo device.
  return crypto.randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
}

export async function caregiverRoutes(app: FastifyInstance): Promise<void> {
  // Communicator generates a pairing code. Identity from JWT only, never the body.
  app.post("/caregivers/pair", { preHandler: authenticate }, async (request, reply) => {
    if (request.user!.role !== "communicator") {
      return reply.code(403).send({ error: "Only communicators can generate a pairing code" });
    }

    let pairingCode = generatePairingCode();
    // Extremely unlikely collision, but guard against the unique-index race anyway.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await CaregiverLink.findOne({ pairingCode, status: "pending" });
      if (!existing) break;
      pairingCode = generatePairingCode();
    }

    const link = await CaregiverLink.create({
      communicatorId: request.user!.userId,
      pairingCode,
      status: "pending",
    });

    auditLog({ route: "/caregivers/pair", actorId: request.user!.userId, outcome: "success" });
    return reply.code(201).send({ pairingCode: link.pairingCode });
  });

  // Caregiver submits the code. Identity from JWT only, never the body.
  app.post("/caregivers/pair/accept", { preHandler: authenticate }, async (request, reply) => {
    if (request.user!.role !== "caregiver") {
      return reply.code(403).send({ error: "Only caregivers can accept a pairing code" });
    }

    const result = parse(AcceptPairingSchema, request.body);
    if (!result.success || !result.data) {
      return reply.code(400).send({ error: result.message });
    }

    const link = await CaregiverLink.findOneAndUpdate(
      { pairingCode: result.data.pairingCode, status: "pending" },
      { $set: { caregiverId: request.user!.userId, status: "active" }, $unset: { pairingCode: "" } },
      { returnDocument: "after" }
    );

    if (!link) {
      auditLog({ route: "/caregivers/pair/accept", actorId: request.user!.userId, outcome: "denied" });
      return reply.code(404).send({ error: "Invalid or already-used pairing code" });
    }

    auditLog({ route: "/caregivers/pair/accept", actorId: request.user!.userId, outcome: "success" });
    return reply.code(200).send({
      id: link._id.toString(),
      communicatorId: link.communicatorId.toString(),
      status: link.status,
    });
  });

  // Caregiver creates the patient's account directly and gets back a one-time
  // access code - the patient's device logs in with just that code (see
  // /auth/patient-code in routes/auth.ts), never typing a name or phone
  // number. Also immediately pairs the two, so this replaces the manual
  // "generate code / accept code" dance below for this - now primary - flow.
  app.post("/caregivers/patients", { preHandler: authenticate }, async (request, reply) => {
    if (request.user!.role !== "caregiver") {
      return reply.code(403).send({ error: "Only caregivers can set up a patient" });
    }

    const result = parse(CreatePatientSchema, request.body);
    if (!result.success || !result.data) {
      return reply.code(400).send({ error: result.message });
    }

    const { name, language } = result.data;

    let accessCode = generateAccessCode();
    let accessCodeHash = hashAccessCode(accessCode);
    // Extremely unlikely collision, but guard against the unique-index race anyway.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await User.findOne({ accessCodeHash }).select("_id").lean();
      if (!existing) break;
      accessCode = generateAccessCode();
      accessCodeHash = hashAccessCode(accessCode);
    }

    const patient = await User.create({
      name,
      role: "communicator",
      accessCodeHash,
      preferences: { language, boardContext: "home" },
    });

    await CaregiverLink.create({
      communicatorId: patient._id,
      caregiverId: request.user!.userId,
      status: "active",
    });

    auditLog({ route: "/caregivers/patients", actorId: request.user!.userId, outcome: "success" });
    return reply.code(201).send({ patientId: patient._id.toString(), name: patient.name, accessCode });
  });

  // Caller's own linked caregivers/communicators only — never an arbitrary query param.
  app.get("/caregivers", { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user!.userId;
    const links = await CaregiverLink.find({
      status: "active",
      $or: [{ communicatorId: userId }, { caregiverId: userId }],
    })
      .populate("communicatorId", "name phone")
      .populate("caregiverId", "name phone")
      .lean();

    return reply.code(200).send(
      links.map((link) => ({
        id: link._id.toString(),
        communicator: link.communicatorId,
        caregiver: link.caregiverId,
      }))
    );
  });
}
