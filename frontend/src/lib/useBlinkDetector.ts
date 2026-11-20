"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import {
  BlinkStateMachine,
  median,
  thresholdsFromCalibration,
  type BlinkEvent,
  type BlinkThresholds,
} from "./blinkStateMachine";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const MODEL_PATH = "/models/face_landmarker.task";

type Delegate = "GPU" | "CPU";

async function createLandmarker(delegate: Delegate): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface UseBlinkDetectorOptions {
  onBlink: (e: BlinkEvent) => void;
  minBlinkMs?: number;
  maxBlinkMs?: number;
  enabled?: boolean;
}

export type CalibrationPhase = "open" | "closed";

export function useBlinkDetector(
  videoRef: RefObject<HTMLVideoElement | null>,
  { onBlink, minBlinkMs = 200, maxBlinkMs = 3000, enabled = true }: UseBlinkDetectorOptions,
) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faceVisible, setFaceVisible] = useState(false);
  const [closure, setClosure] = useState(0);
  const [thresholds, setThresholds] = useState<BlinkThresholds | null>(null);

  const [machine] = useState(() => new BlinkStateMachine({ minBlinkMs, maxBlinkMs }));
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const onBlinkRef = useRef(onBlink);
  const collectRef = useRef<number[] | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastUiUpdateRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    onBlinkRef.current = onBlink;
  }, [onBlink]);

  useEffect(() => {
    machine.setTiming(minBlinkMs, maxBlinkMs);
  }, [machine, minBlinkMs, maxBlinkMs]);

  // Load the model once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let lm: FaceLandmarker;
        try {
          lm = await createLandmarker("GPU");
        } catch {
          lm = await createLandmarker("CPU");
        }
        if (cancelled || !isMountedRef.current) {
          lm.close();
          return;
        }
        landmarkerRef.current = lm;
        setReady(true);
      } catch (e) {
        if (!cancelled && isMountedRef.current) {
          setError(
            `Could not load the face model (${e instanceof Error ? e.message : String(e)}). ` +
              `Check that ${MODEL_PATH} exists.`,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      setReady(false);
    };
  }, []);

  // Per-frame loop
  useEffect(() => {
    if (!ready || !enabled) return;
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const video = videoRef.current;
      const lm = landmarkerRef.current;
      if (!video || !lm || !isMountedRef.current) return;
      if (video.readyState < 2 || video.paused || video.ended) return;
      if (video.currentTime === lastVideoTimeRef.current) return;
      lastVideoTimeRef.current = video.currentTime;

      const now = performance.now();
      let result: any = null;
      try {
        result = lm.detectForVideo(video, now);
      } catch (err) {
        console.warn("MediaPipe detectForVideo error:", err);
        return;
      }
      const cats = result?.faceBlendshapes?.[0]?.categories;

      let score: number | null = null;
      if (cats) {
        const left = cats.find((c: any) => c.categoryName === "eyeBlinkLeft")?.score;
        const right = cats.find((c: any) => c.categoryName === "eyeBlinkRight")?.score;
        if (left !== undefined && right !== undefined) score = (left + right) / 2;
      }

      if (score !== null) collectRef.current?.push(score);

      const blink = machine.update(score, now);
      if (blink) onBlinkRef.current(blink);

      if (now - lastUiUpdateRef.current > 100) {
        lastUiUpdateRef.current = now;
        setFaceVisible(score !== null);
        if (score !== null) setClosure(score);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, enabled, videoRef, machine]);

  // Two-step calibration (~7 s)
  const calibrate = useCallback(
    async (onPhase?: (phase: CalibrationPhase) => void): Promise<BlinkThresholds> => {
      const sample = async (phase: CalibrationPhase) => {
        onPhase?.(phase);
        await sleep(1500); // get ready, not sampled
        collectRef.current = [];
        await sleep(2000);
        const scores = collectRef.current ?? [];
        collectRef.current = null;
        return median(scores);
      };
      const openMedian = await sample("open");
      const closedMedian = await sample("closed");
      const t = thresholdsFromCalibration(openMedian, closedMedian);
      machine.setThresholds(t);
      machine.reset();
      setThresholds(t);
      return t;
    },
    [machine],
  );

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  return { ready, error, faceVisible, closure, thresholds, calibrate };
}
