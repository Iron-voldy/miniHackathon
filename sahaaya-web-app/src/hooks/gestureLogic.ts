export const GESTURE_HOLD_MS = 450;
export const BLINK_MAX_MS = 2000;
export const COOLDOWN_MS = 500;
export const FACE_LOST_PAUSE_MS = 500;
export const BLINK_RELEASE_HYSTERESIS = 0.15;
export const JAW_OPEN_THRESHOLD = 0.5;
export const NOD_START_DEGREES = 7;
export const NOD_RETURN_DEGREES = 3;
export const SHAKE_START_DEGREES = 10;
export const SHAKE_RETURN_DEGREES = 4;

export type GestureKind = "blink" | "mouth";

export function startedGesture(
  blinkScore: number | null,
  jawScore: number | null,
  blinkThreshold: number,
): GestureKind | null {
  if (blinkScore !== null && blinkScore > blinkThreshold) return "blink";
  if (jawScore !== null && jawScore > JAW_OPEN_THRESHOLD) return "mouth";
  return null;
}

export function gestureStillActive(
  kind: GestureKind,
  blinkScore: number | null,
  jawScore: number | null,
  blinkThreshold: number,
): boolean {
  return kind === "blink"
    ? blinkScore !== null && blinkScore > Math.max(0.1, blinkThreshold - BLINK_RELEASE_HYSTERESIS)
    : jawScore !== null && jawScore > JAW_OPEN_THRESHOLD - 0.15;
}

export function isDeliberateHold(durationMs: number): boolean {
  return durationMs >= GESTURE_HOLD_MS && durationMs <= BLINK_MAX_MS;
}

export function isCooldownComplete(nowMs: number, lastActionAtMs: number): boolean {
  return nowMs - lastActionAtMs > COOLDOWN_MS;
}

export function shouldPauseForFaceLoss(input: {
  nowMs: number;
  lastFaceSeenAtMs: number;
  faceDetected: boolean;
  gestureInProgress: boolean;
  alreadyPaused: boolean;
}): boolean {
  return !input.faceDetected && !input.gestureInProgress && !input.alreadyPaused &&
    input.nowMs - input.lastFaceSeenAtMs > FACE_LOST_PAUSE_MS;
}

export function nodStarted(deltaDegrees: number, threshold = NOD_START_DEGREES): boolean {
  return Math.abs(deltaDegrees) >= threshold;
}

export function nodReturned(deltaDegrees: number, threshold = NOD_RETURN_DEGREES): boolean {
  return Math.abs(deltaDegrees) <= threshold;
}

export function shakeStarted(deltaDegrees: number, threshold = SHAKE_START_DEGREES): -1 | 0 | 1 {
  if (deltaDegrees >= threshold) return 1;
  if (deltaDegrees <= -threshold) return -1;
  return 0;
}

export function shakeCrossedOpposite(deltaDegrees: number, startingDirection: -1 | 1, threshold = SHAKE_START_DEGREES): boolean {
  return startingDirection === 1
    ? deltaDegrees <= -threshold
    : deltaDegrees >= threshold;
}

export function shakeReturned(deltaDegrees: number, threshold = SHAKE_RETURN_DEGREES): boolean {
  return Math.abs(deltaDegrees) <= threshold;
}

export function consumeOnce(alreadyConsumed: boolean): { shouldRun: boolean; consumed: true } {
  return { shouldRun: !alreadyConsumed, consumed: true };
}
