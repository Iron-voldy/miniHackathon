import OpenAI from "openai";
import { env } from "../lib/env";
import { withTimeout } from "../lib/withTimeout";
import { fallbackRank } from "./ranker";

export type RankReasonCode = "llm" | "fallback_timeout" | "fallback_error" | "fallback_disabled";

export interface RankResult {
  rankedPhraseIds: string[];
  reasonCode: RankReasonCode;
}

export interface PhraseForRanking {
  id: string;
  english: string;
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return client;
}

/**
 * Ranks a board's phrases by likely relevance using OpenAI, with a 2s timeout and
 * a mandatory allow-list filter on the model's output (invariant #4) — the model
 * may only reorder ids it was given, never introduce new ones. Falls back to the
 * deterministic ranker on any timeout, error, malformed output, or missing key.
 * This function only ranks; it never has an external side effect (invariant #5).
 */
export async function rankPhrases(
  allowedPhrases: PhraseForRanking[],
  recentPhraseIds: string[] = []
): Promise<RankResult> {
  const allowedPhraseIds = allowedPhrases.map((p) => p.id);

  if (!env.OPENAI_API_KEY) {
    return { rankedPhraseIds: fallbackRank(allowedPhraseIds, recentPhraseIds), reasonCode: "fallback_disabled" };
  }

  return withTimeout<RankResult>(
    async () => {
      const completion = await getClient().chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Given these phrase IDs and their English text, and the user's recently used phrases, " +
              "return a JSON array re-ordering the given IDs by likely relevance. Return ONLY ids " +
              "from the provided list, as JSON, nothing else.",
          },
          {
            role: "user",
            content: JSON.stringify({ phrases: allowedPhrases, recentPhraseIds }),
          },
        ],
        response_format: { type: "json_object" },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("empty_llm_response");

      const parsed = JSON.parse(content) as unknown;
      const candidateIds = extractIdArray(parsed);

      // Mandatory allow-list check: drop anything the model returned that wasn't offered.
      const allowedSet = new Set(allowedPhraseIds);
      const filtered = candidateIds.filter((id): id is string => typeof id === "string" && allowedSet.has(id));

      if (filtered.length === 0) throw new Error("no_valid_ids_returned");

      // Append any allowed ids the model omitted, preserving board order.
      const seen = new Set(filtered);
      for (const id of allowedPhraseIds) {
        if (!seen.has(id)) filtered.push(id);
      }

      return { rankedPhraseIds: filtered, reasonCode: "llm" as const };
    },
    env.OPENAI_TIMEOUT_MS,
    (reason) => ({
      rankedPhraseIds: fallbackRank(allowedPhraseIds, recentPhraseIds),
      reasonCode: reason === "timeout" ? ("fallback_timeout" as const) : ("fallback_error" as const),
    })
  );
}

function extractIdArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}
