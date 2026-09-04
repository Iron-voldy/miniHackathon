import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Board } from "../models/Board";
import { Phrase } from "../models/Phrase";
import { CustomPhrase } from "../models/CustomPhrase";
import { authenticate } from "../lib/authenticate";
import { parse } from "../lib/validate";
import { rankPhrases } from "../services/llmRanker";
import { synthesizeSpeech, Language } from "../services/tts";

const RankSchema = z.object({
  boardId: z.string().min(1, "boardId is required"),
  recentPhraseIds: z.array(z.string()).optional(),
});

const TtsBodySchema = z.object({
  language: z.enum(["en", "si", "ta"]).default("en"),
});

export async function phraseRoutes(app: FastifyInstance): Promise<void> {
  app.post("/phrases/rank", { preHandler: authenticate }, async (request, reply) => {
    const result = parse(RankSchema, request.body);
    if (!result.success || !result.data) {
      return reply.code(400).send({ error: result.message });
    }

    const board = await Board.findById(result.data.boardId).lean();
    if (!board) {
      return reply.code(404).send({ error: "Board not found" });
    }

    const phrases = await Phrase.find({ _id: { $in: board.phraseIds } }, { _id: 1, english: 1 }).lean();
    const allowedPhrases = board.phraseIds
      .map((id) => phrases.find((p) => p._id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({ id: p._id, english: p.english }));

    const ranked = await rankPhrases(allowedPhrases, result.data.recentPhraseIds ?? []);

    return reply.code(200).send(ranked);
  });

  // TTS fallback for custom-phrase text only; board phrases ship pre-baked with the frontend.
  app.post("/phrases/:phraseId/tts", { preHandler: authenticate }, async (request, reply) => {
    const { phraseId } = request.params as { phraseId: string };
    const bodyResult = parse(TtsBodySchema, request.body ?? {});
    if (!bodyResult.success || !bodyResult.data) {
      return reply.code(400).send({ error: bodyResult.message });
    }

    const customPhrase = await CustomPhrase.findOne({
      _id: phraseId,
      ownerUserId: request.user!.userId,
    }).lean();

    if (!customPhrase) {
      return reply.code(404).send({ error: "Custom phrase not found" });
    }

    const language = (customPhrase.language ?? bodyResult.data.language) as Language;
    const result = await synthesizeSpeech(customPhrase.text, language);

    if (result.fallback || !result.audioBase64) {
      return reply.code(200).send({ text: result.text, fallback: true });
    }

    return reply.code(200).send({ audioUrl: `data:audio/mpeg;base64,${result.audioBase64}` });
  });
}
