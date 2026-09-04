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
  type GestureKind,
} from "./gestureLogic";

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

  const baselinePitchRef = useRef<number | null>(null);
  const baselineYawRef = useRef<number | null>(null);
  const headGestureRef = useRef<"none" | "nod" | "shake">("none");
  const shakeDirectionRef = useRef<-1 | 1>(1);

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
          if (awaitingConfirmRef.current) return;
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
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) return;

      let result: FaceLandmarkerResult;
      try {
        result = landmarker.detectForVideo(video, performance.now());
      } catch {
        return;
      }

      const now = performance.now();
      const hasFace = (result.faceLandmarks?.length ?? 0) > 0;
      setFaceDetected(hasFace);
      if (hasFace) lastFaceSeenRef.current = now;

      if (!hasFace) return;

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
          if (!stillActive) {
            const duration = now - gestureStartRef.current;
            gestureActiveRef.current = null;
            if (isDeliberateHold(duration)) {
              lastActionAtRef.current = now;
              awaitingConfirmRef.current = true;
              setAwaitingConfirm(true);
              baselinePitchRef.current = pitchDeg;
              baselineYawRef.current = yawDeg;
              onSelect(highlightedRef.current);
            }
          }
        }
        return;
      }

      // Confirmation phase: nod confirms, shake cancels. Baseline drifts slowly
      // so a held tilt doesn't permanently look like an in-progress gesture.
      if (pitchDeg === null || yawDeg === null) return;
      if (baselinePitchRef.current === null) baselinePitchRef.current = pitchDeg;
      if (baselineYawRef.current === null) baselineYawRef.current = yawDeg;

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
            // Slowly track baseline while idle so small drift doesn't accumulate.
            baselinePitchRef.current += (pitchDeg - baselinePitchRef.current) * 0.02;
            baselineYawRef.current += (yawDeg - baselineYawRef.current) * 0.02;
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

  return { videoRef, highlightedIndex, faceDetected, awaitingConfirm, cameraError, ready };
}
