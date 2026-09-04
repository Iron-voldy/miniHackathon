import { FastifyInstance } from "fastify";
import { z } from "zod";
import { CustomPhrase } from "../models/CustomPhrase";
import { authenticate } from "../lib/authenticate";
import { parse } from "../lib/validate";

const CreateCustomPhraseSchema = z.object({
  text: z.string().min(1, "Phrase text cannot be empty").max(200, "Phrase text is too long"),
  language: z.enum(["en", "si", "ta"], {
    error: "Language must be 'en', 'si', or 'ta'",
  }),
});

export async function customPhraseRoutes(app: FastifyInstance): Promise<void> {
  app.post("/custom-phrases", { preHandler: authenticate }, async (request, reply) => {
    const result = parse(CreateCustomPhraseSchema, request.body);
    if (!result.success || !result.data) {
      return reply.code(400).send({ error: result.message });
    }

    const customPhrase = await CustomPhrase.create({
      ownerUserId: request.user!.userId,
      text: result.data.text,
      language: result.data.language,
    });

    return reply.code(201).send({
      id: customPhrase._id.toString(),
      text: customPhrase.text,
      language: customPhrase.language,
      approvedByCommunicator: customPhrase.approvedByCommunicator,
    });
  });

  app.post("/custom-phrases/:id/approve", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Owner-only: filter by ownerUserId from the JWT, never trust the id alone.
    const customPhrase = await CustomPhrase.findOneAndUpdate(
      { _id: id, ownerUserId: request.user!.userId },
      { $set: { approvedByCommunicator: true } },
      { returnDocument: "after" }
    );

    if (!customPhrase) {
      return reply.code(404).send({ error: "Custom phrase not found" });
    }

    return reply.code(200).send({
      id: customPhrase._id.toString(),
      approvedByCommunicator: customPhrase.approvedByCommunicator,
    });
  });
}
