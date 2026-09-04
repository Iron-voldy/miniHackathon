import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import {
  isCooldownComplete,
  isDeliberateHold,
  gestureStillActive,
  startedGesture,
  nodStarted,
  nodReturned,
  shakeStarted,
  shakeCrossedOpposite,
  shakeReturned,
  shouldPauseForFaceLoss,
  BASELINE_DRIFT_ALPHA,
  type GestureKind,
} from "./gestureLogic";

// Cap how often MediaPipe actually runs inference - calling detectForVideo on
// every animation frame (up to 60fps) can stall the main thread on a CPU-only
// device (no WebGL/GPU delegate available), which shows up as the camera
// preview visibly freezing for a beat right when the patient moves. ~12fps is
// still plenty to catch a deliberate hold or nod.
const INFERENCE_INTERVAL_MS = 80;
// How long after a selection to average incoming head-pose readings into the
// confirm baseline before checking for a nod/shake, instead of trusting a
// single frame - the moment right after a blink/mouth-open release is when
// the head pose is most likely to still be settling.
const NOD_SETTLE_MS = 350;

export interface GestureInputOptions {
  enabled: boolean;
  itemCount: number;
  scanIntervalMs?: number;
  blinkThreshold?: number;
  onSelect: (index: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface GestureInputState {
  videoRef: React.RefObject<HTMLVideoElement>;
  highlightedIndex: number;
  faceDetected: boolean;
  awaitingConfirm: boolean;
  cameraError: string | null;
  ready: boolean;
  reset: () => void;
}

/**
 * Hands-free selection: a video element (never sent anywhere - processing and
 * the frames themselves stay entirely in this browser tab, invariant #7) is
 * fed to MediaPipe FaceLandmarker every animation frame. While no selection is
 * pending, tiles auto-scan; a deliberate long blink or held mouth-open (per
 * gestureLogic's thresholds) selects the current tile and switches to
 * head-gesture mode: a nod confirms, a shake cancels. Both also remain
 * available via on-screen tap, so a missed gesture never blocks the flow.
 */
export function useGestureInput(options: GestureInputOptions): GestureInputState {
  const { enabled, itemCount, onSelect, onConfirm, onCancel } = options;
  const scanIntervalMs = options.scanIntervalMs ?? 1800;
  const blinkThreshold = options.blinkThreshold ?? 0.45;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [faceDetected, setFaceDetected] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Mutable refs so the rAF loop always reads current values without re-subscribing.
  const highlightedRef = useRef(0);
  const awaitingConfirmRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const gestureActiveRef = useRef<GestureKind | null>(null);
  const gestureStartRef = useRef(0);
  const lastActionAtRef = useRef(0);
  const lastFaceSeenRef = useRef(0);
  const lastInferenceAtRef = useRef(0);
  const scanPausedRef = useRef(false);

  const baselinePitchRef = useRef<number | null>(null);
  const baselineYawRef = useRef<number | null>(null);
  const confirmReadyAtRef = useRef(0);
  const headGestureRef = useRef<"none" | "nod" | "shake">("none");
  const shakeDirectionRef = useRef<-1 | 1>(1);

  // Called whenever the confirm modal closes via an on-screen tap (Confirm or
  // Cancel) rather than a nod/shake, so the hook's internal state doesn't get
  // stuck thinking a confirmation is still pending (which would otherwise
  // freeze auto-scan and misinterpret the next gesture).
  const reset = useCallback(() => {
    awaitingConfirmRef.current = false;
    setAwaitingConfirm(false);
    headGestureRef.current = "none";
    gestureActiveRef.current = null;
    baselinePitchRef.current = null;
    baselineYawRef.current = null;
    confirmReadyAtRef.current = 0;
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (scanTimerRef.current !== null) clearInterval(scanTimerRef.current);
    scanTimerRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    setReady(false);
    setFaceDetected(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }

    let cancelled = false;

    async function setup() {
      try {
        const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
        const landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: "/models/face_landmarker.task" },
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          runningMode: "VIDEO",
          numFaces: 1,
        });
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        setReady(true);
        setCameraError(null);

        scanTimerRef.current = setInterval(() => {
          if (awaitingConfirmRef.current || scanPausedRef.current) return;
          setHighlightedIndex((i) => {
            const next = itemCount > 0 ? (i + 1) % itemCount : 0;
            highlightedRef.current = next;
            return next;
          });
        }, scanIntervalMs);

        const loop = () => {
          detectFrame();
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (err) {
        if (!cancelled) {
          setCameraError(err instanceof Error ? err.message : "Could not start the camera");
        }
      }
    }

    function detectFrame() {
      const now = performance.now();
      if (now - lastInferenceAtRef.current < INFERENCE_INTERVAL_MS) return;
      lastInferenceAtRef.current = now;

      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) return;

      let result: FaceLandmarkerResult;
      try {
        result = landmarker.detectForVideo(video, now);
      } catch {
        return;
      }

      const hasFace = (result.faceLandmarks?.length ?? 0) > 0;
      setFaceDetected(hasFace);

      if (!hasFace) {
        // Don't pause mid-gesture (e.g. tracking briefly drops out while both
        // eyes are deliberately held closed) - only pause genuinely idle scanning.
        if (
          shouldPauseForFaceLoss({
            nowMs: now,
            lastFaceSeenAtMs: lastFaceSeenRef.current,
            faceDetected: hasFace,
            gestureInProgress: awaitingConfirmRef.current || gestureActiveRef.current !== null,
            alreadyPaused: scanPausedRef.current,
          })
        ) {
          scanPausedRef.current = true;
        }
        return;
      }

      lastFaceSeenRef.current = now;
      scanPausedRef.current = false;

      const blendshapes = result.faceBlendshapes?.[0]?.categories ?? [];
      const score = (name: string) => blendshapes.find((c) => c.categoryName === name)?.score ?? 0;
      const blinkScore = (score("eyeBlinkLeft") + score("eyeBlinkRight")) / 2;
      const jawScore = score("jawOpen");

      const matrix = result.facialTransformationMatrixes?.[0]?.data;
      const pitchDeg = matrix ? Math.atan2(-matrix[6], matrix[10]) * (180 / Math.PI) : null;
      const yawDeg = matrix
        ? Math.atan2(matrix[2], Math.sqrt(matrix[0] * matrix[0] + matrix[1] * matrix[1])) * (180 / Math.PI)
        : null;

      if (!awaitingConfirmRef.current) {
        // Selection phase: blink or mouth-open dwell selects the highlighted tile.
        if (gestureActiveRef.current === null) {
          const started = startedGesture(blinkScore, jawScore, blinkThreshold);
          if (started && isCooldownComplete(now, lastActionAtRef.current)) {
            gestureActiveRef.current = started;
            gestureStartRef.current = now;
          }
        } else {
          const stillActive = gestureStillActive(gestureActiveRef.current, blinkScore, jawScore, blinkThreshold);
          if (stillActive) {
            // Fire as soon as the hold is long enough - don't also require
            // releasing (reopening eyes / closing the mouth) within a window,
            // or a hold that simply lasted longer than expected never registers.
            const duration = now - gestureStartRef.current;
            if (isDeliberateHold(duration)) {
              gestureActiveRef.current = null;
              lastActionAtRef.current = now;
              awaitingConfirmRef.current = true;
              setAwaitingConfirm(true);
              baselinePitchRef.current = pitchDeg;
              baselineYawRef.current = yawDeg;
              confirmReadyAtRef.current = now + NOD_SETTLE_MS;
              onSelect(highlightedRef.current);
            }
          } else {
            // Released before the hold was long enough - not deliberate.
            gestureActiveRef.current = null;
          }
        }
        return;
      }

      // Confirmation phase: nod confirms, shake cancels. Baseline drifts slowly
      // so a held tilt doesn't permanently look like an in-progress gesture.
      if (pitchDeg === null || yawDeg === null) return;
      if (baselinePitchRef.current === null) baselinePitchRef.current = pitchDeg;
      if (baselineYawRef.current === null) baselineYawRef.current = yawDeg;

      if (now < confirmReadyAtRef.current) {
        // Still settling right after the selection - average toward the true
        // baseline instead of checking for a nod/shake against a single,
        // possibly-noisy frame.
        baselinePitchRef.current = baselinePitchRef.current * 0.8 + pitchDeg * 0.2;
        baselineYawRef.current = baselineYawRef.current * 0.8 + yawDeg * 0.2;
        return;
      }

      const pitchDelta = pitchDeg - baselinePitchRef.current;
      const yawDelta = yawDeg - baselineYawRef.current;

      if (headGestureRef.current === "none") {
        if (nodStarted(pitchDelta)) {
          headGestureRef.current = "nod";
        } else {
          const dir = shakeStarted(yawDelta);
          if (dir !== 0) {
            headGestureRef.current = "shake";
            shakeDirectionRef.current = dir;
          } else {
            // Slowly track baseline while idle so small drift doesn't accumulate -
            // must stay slow relative to how fast a real nod/shake happens, or the
            // baseline chases the gesture itself and it never clears threshold.
            baselinePitchRef.current += (pitchDeg - baselinePitchRef.current) * BASELINE_DRIFT_ALPHA;
            baselineYawRef.current += (yawDeg - baselineYawRef.current) * BASELINE_DRIFT_ALPHA;
          }
        }
      } else if (headGestureRef.current === "nod") {
        if (nodReturned(pitchDelta) && now - lastActionAtRef.current > 200) {
          headGestureRef.current = "none";
          awaitingConfirmRef.current = false;
          setAwaitingConfirm(false);
          lastActionAtRef.current = now;
          onConfirm();
        }
      } else if (headGestureRef.current === "shake") {
        if (shakeCrossedOpposite(yawDelta, shakeDirectionRef.current)) {
          headGestureRef.current = "none";
          awaitingConfirmRef.current = false;
          setAwaitingConfirm(false);
          lastActionAtRef.current = now;
          onCancel();
        } else if (shakeReturned(yawDelta)) {
          headGestureRef.current = "none";
        }
      }
    }

    setup();

    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, itemCount, scanIntervalMs, blinkThreshold]);

  return { videoRef, highlightedIndex, faceDetected, awaitingConfirm, cameraError, ready, reset };
}
