import { FastifyInstance } from "fastify";
import { z } from "zod";
import { User } from "../models/User";
import { authenticate } from "../lib/authenticate";
import { parse } from "../lib/validate";

const PreferencesSchema = z.object({
  language: z.enum(["en", "si", "ta"]).optional(),
  boardContext: z.enum(["home", "ward", "general"]).optional(),
});

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.get("/profiles/me", { preHandler: authenticate }, async (request, reply) => {
    const user = await User.findById(request.user!.userId);
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }
    return reply.code(200).send({
      user: {
        id: user._id.toString(),
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
      preferences: user.preferences,
    });
  });

  app.patch("/profiles/me/preferences", { preHandler: authenticate }, async (request, reply) => {
    const result = parse(PreferencesSchema, request.body);
    if (!result.success || !result.data) {
      return reply.code(400).send({ error: result.message });
    }

    const update: Record<string, unknown> = {};
    if (result.data.language) update["preferences.language"] = result.data.language;
    if (result.data.boardContext) update["preferences.boardContext"] = result.data.boardContext;

    const user = await User.findByIdAndUpdate(
      request.user!.userId,
      { $set: update },
      { returnDocument: "after" }
    );
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    return reply.code(200).send({ preferences: user.preferences });
  });
}
