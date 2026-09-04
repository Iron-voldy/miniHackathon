import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Types } from "mongoose";
import { CommunicationRequest, CommunicationRequestDoc } from "../models/CommunicationRequest";
import { Phrase } from "../models/Phrase";
import { CustomPhrase } from "../models/CustomPhrase";
import { CaregiverLink } from "../models/CaregiverLink";
import { authenticate } from "../lib/authenticate";
import { parse } from "../lib/validate";
import { env } from "../lib/env";
import { auditLog } from "../lib/audit";
import { User } from "../models/User";
import { sendCaregiverRequestEmail } from "../services/email";

const CreateRequestSchema = z
  .object({
    phraseId: z.string().optional(),
    customPhraseId: z.string().optional(),
    inputMode: z.enum(["touch", "face"], {
      error: "Invalid input mode",
    }),
    // Confirmation is enforced in code, never trusted from the client (invariant #1).
    confirmed: z.literal(true, {
      error: "Request must be confirmed before sending",
    }),
    clientRequestId: z.string().min(1, "clientRequestId is required"),
  })
  .refine((data) => Boolean(data.phraseId) || Boolean(data.customPhraseId), {
    message: "Either phraseId or customPhraseId is required",
  });

function serializeRequest(doc: CommunicationRequestDoc) {
  return {
    id: doc._id.toString(),
    communicatorId: doc.communicatorId.toString(),
    phraseId: doc.phraseId,
    resolvedText: doc.resolvedText,
    inputMode: doc.inputMode,
    status: doc.status,
    deliveries: doc.deliveries.map((d) => ({
      caregiverId: d.caregiverId.toString(),
      status: d.status,
      deliveredAt: d.deliveredAt,
    })),
    acknowledgement: doc.acknowledgement
      ? {
          caregiverId: doc.acknowledgement.caregiverId.toString(),
          responderName: doc.acknowledgement.responderName,
          respondedAt: doc.acknowledgement.respondedAt,
        }
      : undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function requestRoutes(app: FastifyInstance): Promise<void> {
  app.post("/requests", { preHandler: authenticate }, async (request, reply) => {
    const result = parse(CreateRequestSchema, request.body);
    if (!result.success || !result.data) {
      return reply.code(400).send({ error: result.message });
    }

    const { phraseId, customPhraseId, inputMode, clientRequestId } = result.data;
    const communicatorId = request.user!.userId;

    // Server resolves phraseId -> canonical text; renderedText from the client is
    // never accepted, let alone delivered (invariant #2).
    let resolvedText: string;
    let resolvedPhraseId: string;

    if (phraseId) {
      const phrase = await Phrase.findById(phraseId).lean();
      if (!phrase) {
        return reply.code(404).send({ error: "Phrase not found" });
      }
      resolvedText = phrase.english;
      resolvedPhraseId = phrase._id;
    } else {
      const customPhrase = await CustomPhrase.findOne({
        _id: customPhraseId,
        ownerUserId: communicatorId,
        approvedByCommunicator: true,
      }).lean();
      if (!customPhrase) {
        return reply.code(404).send({ error: "Approved custom phrase not found" });
      }
      resolvedText = customPhrase.text;
      resolvedPhraseId = customPhrase._id.toString();
    }

    // Caregiver targets are filtered to the caller's active links only, never a body param.
    const activeLinks = await CaregiverLink.find({
      communicatorId,
      status: "active",
    }).lean();

    if (activeLinks.length === 0) {
      return reply.code(422).send({ error: "No active caregiver is linked to this account" });
    }

    const deliveries = activeLinks.map((link) => ({
      caregiverId: link.caregiverId as Types.ObjectId,
      status: "pending" as const,
    }));

    try {
      const created = await CommunicationRequest.create({
        communicatorId,
        phraseId: resolvedPhraseId,
        resolvedText,
        inputMode,
        clientRequestId,
        deliveries,
      });
      auditLog({ route: "/requests", actorId: communicatorId, requestId: created._id.toString(), outcome: "success" });

      // Secondary delivery channel: email each linked caregiver too, not just the
      // dashboard/SSE push. Fire-and-forget - never delays or fails the response.
      notifyCaregiversByEmail(communicatorId, deliveries.map((d) => d.caregiverId), resolvedText).catch(
        () => undefined
      );

      return reply.code(201).send(serializeRequest(created));
    } catch (error) {
      // Duplicate clientRequestId: idempotent retry returns the existing document,
      // never a 500 (invariant #3).
      if (isDuplicateKeyError(error)) {
        const existing = await CommunicationRequest.findOne({ clientRequestId });
        if (existing) {
          return reply.code(200).send(serializeRequest(existing));
        }
      }
      auditLog({ route: "/requests", actorId: communicatorId, outcome: "error" });
      throw error;
    }
  });

  app.get("/requests/:id", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.userId;

    const doc = await CommunicationRequest.findById(id);
    if (!doc) {
      return reply.code(404).send({ error: "Request not found" });
    }

    const isOwner = doc.communicatorId.toString() === userId;
    const isTargetedCaregiver = doc.deliveries.some((d) => d.caregiverId.toString() === userId);
    if (!isOwner && !isTargetedCaregiver) {
      return reply.code(403).send({ error: "Not authorized to view this request" });
    }

    return reply.code(200).send(serializeRequest(doc));
  });

  // SSE: always the caller's own inbox, never an arbitrary query param. Polls Mongo
  // every ~1.5s for the caller's requests and pushes deltas - simplest thing that
  // works for a single-instance hackathon deploy.
  app.get("/requests/stream", { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user!.userId;
    const role = request.user!.role;

    const origin = request.headers.origin;
    if (origin && env.ALLOWED_ORIGINS.includes(origin)) {
      reply.raw.setHeader("Access-Control-Allow-Origin", origin);
      reply.raw.setHeader("Vary", "Origin");
    }
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.flushHeaders?.();

    const seenUpdatedAt = new Map<string, number>();

    const filter =
      role === "communicator"
        ? { communicatorId: userId }
        : { "deliveries.caregiverId": userId };

    const poll = async () => {
      const docs = await CommunicationRequest.find(filter).sort({ updatedAt: -1 }).limit(50).lean();
      for (const doc of docs) {
        // Mark delivered the moment this push actually happens - not a synonym for
        // acknowledged (invariant #10). Only the targeted caregiver's own stream
        // can transition their delivery/the request's top-level status this way.
        if (role === "caregiver") {
          const delivery = doc.deliveries.find((d) => d.caregiverId.toString() === userId);
          if (delivery && delivery.status === "pending") {
            const deliveredAt = new Date();
            await CommunicationRequest.updateOne(
              { _id: doc._id, "deliveries.caregiverId": userId },
              { $set: { "deliveries.$.status": "delivered", "deliveries.$.deliveredAt": deliveredAt } }
            );
            await CommunicationRequest.updateOne(
              { _id: doc._id, status: "pending" },
              { $set: { status: "delivered" } }
            );
            delivery.status = "delivered";
            delivery.deliveredAt = deliveredAt;
            if (doc.status === "pending") doc.status = "delivered";
          }
        }

        const key = doc._id.toString();
        const updatedAtMs = new Date(doc.updatedAt).getTime();
        if (seenUpdatedAt.get(key) !== updatedAtMs) {
          seenUpdatedAt.set(key, updatedAtMs);
          reply.raw.write(`data: ${JSON.stringify(serializeRequest(doc as CommunicationRequestDoc))}\n\n`);
        }
      }
    };

    await poll();
    const interval = setInterval(() => {
      poll().catch(() => undefined);
    }, 1500);

    request.raw.on("close", () => {
      clearInterval(interval);
    });
  });

  app.post("/requests/:id/acknowledge", { preHandler: authenticate }, async (request, reply) => {
    if (request.user!.role !== "caregiver") {
      return reply.code(403).send({ error: "Only caregivers can acknowledge a request" });
    }
    const { id } = request.params as { id: string };
    const userId = request.user!.userId;

    const doc = await CommunicationRequest.findById(id);
    if (!doc) {
      return reply.code(404).send({ error: "Request not found" });
    }

    const delivery = doc.deliveries.find((d) => d.caregiverId.toString() === userId);
    if (!delivery) {
      return reply.code(403).send({ error: "Not authorized to acknowledge this request" });
    }

    const caregiver = await User.findById(userId).select("name").lean();

    // delivered vs acknowledged are separate states (invariant #10): mark delivered
    // too in case this caregiver's stream hadn't already, but "seen" always wins.
    delivery.status = "delivered";
    delivery.deliveredAt = delivery.deliveredAt ?? new Date();
    doc.status = "seen";
    doc.acknowledgement = {
      caregiverId: new Types.ObjectId(userId),
      responderName: caregiver?.name ?? "",
      respondedAt: new Date(),
    };

    await doc.save();
    auditLog({ route: "/requests/:id/acknowledge", actorId: userId, requestId: id, outcome: "success" });
    return reply.code(200).send(serializeRequest(doc));
  });

  app.post("/requests/:id/cancel", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.userId;

    const doc = await CommunicationRequest.findOneAndUpdate(
      { _id: id, communicatorId: userId },
      { $set: { status: "cancelled" } },
      { returnDocument: "after" }
    );

    if (!doc) {
      return reply.code(404).send({ error: "Request not found" });
    }

    auditLog({ route: "/requests/:id/cancel", actorId: userId, requestId: id, outcome: "success" });
    return reply.code(200).send(serializeRequest(doc));
  });
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

async function notifyCaregiversByEmail(
  communicatorId: string,
  caregiverIds: Types.ObjectId[],
  phraseText: string
): Promise<void> {
  const [communicator, caregivers] = await Promise.all([
    User.findById(communicatorId).select("name").lean(),
    User.find({ _id: { $in: caregiverIds } })
      .select("email")
      .lean(),
  ]);
  if (!communicator) return;

  await Promise.all(
    caregivers
      .filter((c) => Boolean(c.email))
      .map((c) =>
        sendCaregiverRequestEmail({
          to: c.email as string,
          communicatorName: communicator.name,
          phraseText,
        })
      )
  );
}
