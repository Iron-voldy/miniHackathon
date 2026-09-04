import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Board } from "../models/Board";
import { Phrase } from "../models/Phrase";
import { authenticate } from "../lib/authenticate";

const ListQuerySchema = z.object({
  context: z.enum(["home", "ward", "general"]).optional(),
  language: z.enum(["en", "si", "ta"]).optional(),
});

export async function boardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/boards", { preHandler: authenticate }, async (request, reply) => {
    const parsed = ListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid query parameters" });
    }

    const filter: Record<string, unknown> = {};
    if (parsed.data.context) filter.context = parsed.data.context;

    const boards = await Board.find(filter).lean();
    return reply.code(200).send(
      boards.map((board) => ({
        id: board._id,
        title: board.title,
        context: board.context,
      }))
    );
  });

  app.get("/boards/:boardId", { preHandler: authenticate }, async (request, reply) => {
    const { boardId } = request.params as { boardId: string };

    const board = await Board.findById(boardId).lean();
    if (!board) {
      return reply.code(404).send({ error: "Board not found" });
    }

    const phrases = await Phrase.find({ _id: { $in: board.phraseIds } }).lean();
    const phraseById = new Map(phrases.map((phrase) => [phrase._id, phrase]));

    // Preserve the board's curated ordering rather than the DB's natural order.
    const orderedPhrases = board.phraseIds
      .map((id) => phraseById.get(id))
      .filter((phrase): phrase is NonNullable<typeof phrase> => Boolean(phrase))
      .map((phrase) => ({
        id: phrase._id,
        category: phrase.category,
        english: phrase.english,
        sinhala: phrase.sinhala,
        tamil: phrase.tamil,
        symbolAsset: phrase.symbolAsset,
        riskClass: phrase.riskClass,
        canNotify: phrase.canNotify,
        requiresConfirmation: phrase.requiresConfirmation,
        version: phrase.version,
      }));

    return reply.code(200).send({
      id: board._id,
      title: board.title,
      context: board.context,
      phrases: orderedPhrases,
    });
  });
}
