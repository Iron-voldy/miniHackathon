import { ZodError, ZodSchema } from "zod";

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  message?: string;
}

/**
 * Parses input against a Zod schema and reduces failures to a single human-readable
 * sentence (the schema's own custom message when present) instead of a raw Zod
 * error dump - every form on this API follows this pattern.
 */
export function parse<T>(schema: ZodSchema<T>, input: unknown): ValidationResult<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, message: firstMessage(result.error) };
}

function firstMessage(error: ZodError): string {
  const issue = error.issues[0];
  return issue?.message ?? "Invalid request";
}
