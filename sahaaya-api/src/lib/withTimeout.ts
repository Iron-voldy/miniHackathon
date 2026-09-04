/**
 * Races a promise against a timeout, invoking a fallback on timeout, rejection,
 * or any thrown error. Backs invariant #9: every external call degrades, never hard-fails.
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  onFallback: (reason: "timeout" | "error", error?: unknown) => T | Promise<T>
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("operation_timeout")), timeoutMs);
  });

  try {
    const result = await Promise.race([operation(), timeoutPromise]);
    return result;
  } catch (error) {
    const reason = error instanceof Error && error.message === "operation_timeout" ? "timeout" : "error";
    return onFallback(reason, error);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
