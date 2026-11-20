"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Camera, Copy, Eye, Mic, MicOff, Play, Square, X } from "lucide-react";
import { submitBlinkEvents } from "@/lib/eyeComm";
import { useBlinkDetector } from "@/lib/useBlinkDetector";
import type { BlinkEventIn } from "@/types";

// ------------------------------------------------------------------------------
// Morse timing thresholds (milliseconds) — mirror backend defaults.
// ------------------------------------------------------------------------------
const DEFAULT_SHORT_MAX_MS = 450;
const DEFAULT_LONG_MIN_MS = 450;
const LETTER_GAP_MS = 700;
const WORD_GAP_MS = 2500;
const RAPID_BLINK_MAX_INTERVAL_MS = 200;

type AppStatus = "idle" | "camera-ready" | "calibrating" | "active" | "error";
type EyeState = "open" | "closed" | "unknown";
type BlinkCommand = "none" | "clear" | "speak";

// ------------------------------------------------------------------------------
// Morse code table (international).
// ------------------------------------------------------------------------------
const MORSE_TABLE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.",
  G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..",
  M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.",
  S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
  Y: "-.--", Z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
  "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "'": ".----.", "!": "-.-.--",
  "/": "-..-.", "(": "-.--.", ")": "-.--.-", "&": ".-...", ":": "---...",
  ";": "-.-.-.", "=": "-...-", "+": ".-.-.", "-": "-....-", "_": "..--.-",
  '"': ".-..-.", "$": "...-..-", "@": ".--.-.",
};
const REVERSE_MORSE: Record<string, string> = {};
Object.entries(MORSE_TABLE).forEach(([char, pattern]) => {
  REVERSE_MORSE[pattern] = char;
});

const nowMs = () => performance.now();

export default function EyeCommBoard() {
  // --------------------------------------------------------------------------
  // Refs
  // --------------------------------------------------------------------------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const blinkStateRef = useRef<{
    eyeClosed: boolean;
    blinkStartMs: number | null;
    lastBlinkMs: number | null;
    lastRapidBlinkMs: number | null;
    rapidSequenceLen: number;
    currentLetter: string;
    currentWord: string;
    composedText: string;
  }>({
    eyeClosed: false,
    blinkStartMs: null,
    lastBlinkMs: null,
    lastRapidBlinkMs: null,
    rapidSequenceLen: 0,
    currentLetter: "",
    currentWord: "",
    composedText: "",
  });

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  const [status, setStatus] = useState<AppStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [eyeState, setEyeState] = useState<EyeState>("unknown");
  const [faceDetected, setFaceDetected] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [calibrationTarget, setCalibrationTarget] = useState<EyeState | null>(null);

  // --------------------------------------------------------------------------
  // MediaPipe blink detector hook
  // --------------------------------------------------------------------------
  const {
    ready: detectorReady,
    error: detectorError,
    faceVisible: mpFaceVisible,
    closure,
    calibrate,
  } = useBlinkDetector(videoRef, {
    enabled: isCameraOn && (status === "active" || status === "calibrating"),
    onBlink: (e) => injectBlink(e.durationMs, e.endMs),
  });

  const runCalibration = useCallback(async () => {
    setStatus("calibrating");
    setError(null);
    try {
      await calibrate((phase) => setCalibrationTarget(phase)); // "open" then "closed"
      setCalibrationTarget(null);
      setStatus("active");
    } catch (e) {
      setCalibrationTarget(null);
      setError(e instanceof Error ? e.message : "Calibration failed");
      setStatus("camera-ready");
    }
  }, [calibrate]);

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  const reverseMorse = useCallback((pattern: string): string => {
    return REVERSE_MORSE[pattern] || "?";
  }, []);

  const getComposedText = useCallback((): string => {
    const s = blinkStateRef.current;
    const inProgress = s.currentWord + (s.currentLetter ? reverseMorse(s.currentLetter) : "");
    return (s.composedText + inProgress).trim();
  }, [reverseMorse]);

  // --------------------------------------------------------------------------
  // Blink input (manual buttons + MediaPipe detector)
  // --------------------------------------------------------------------------
  const injectBlink = useCallback(
    (durationMs: number, timestamp?: number) => {
      const ts = timestamp ?? nowMs();
      const symbol = durationMs < DEFAULT_SHORT_MAX_MS ? "." : "-";
      sendBlinkComplete(durationMs, ts, symbol);
    },
    [],
  );

  const sendBlinkComplete = useCallback(
    async (durationMs: number, timestamp: number, symbol: string) => {
      const s = blinkStateRef.current;

      // Rapid-blink command detection.
      if (
        s.lastRapidBlinkMs !== null &&
        timestamp - s.lastRapidBlinkMs <= RAPID_BLINK_MAX_INTERVAL_MS
      ) {
        s.rapidSequenceLen += 1;
      } else {
        if (s.rapidSequenceLen === 3) handleCommand("clear");
        else if (s.rapidSequenceLen >= 5) handleCommand("speak");
        s.rapidSequenceLen = 1;
      }
      s.lastRapidBlinkMs = timestamp;

      if (s.rapidSequenceLen >= 5) {
        handleCommand("speak");
        s.rapidSequenceLen = 0;
        s.currentLetter = "";
        s.currentWord = "";
        return;
      }

      // Append dot/dash to current letter.
      s.currentLetter += symbol;
      s.lastBlinkMs = timestamp;

      // Send event to backend for composition persistence.
      const event: BlinkEventIn = {
        event_type: "blink_complete",
        timestamp_ms: timestamp,
        duration_ms: durationMs,
      };
      try {
        await submitBlinkEvents({
          events: [event],
          user_id: "web-user",
          timestamp_ms: timestamp,
        });
      } catch (err) {
        // Backend may be offline — continue locally.
        console.warn("Backend event submission failed:", err);
      }
    },
    [],
  );

  // --------------------------------------------------------------------------
  // Text-to-speech
  // --------------------------------------------------------------------------
  const speakText = useCallback((text: string) => {
    if (!text || text.trim().length === 0) return;
    setIsSpeaking(true);
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      setIsSpeaking(false);
      console.warn("Speech synthesis failed:", err);
    }
  }, []);

  const handleCommand = useCallback((command: BlinkCommand) => {
    const s = blinkStateRef.current;
    if (command === "clear") {
      s.currentWord = "";
      s.currentLetter = "";
    } else if (command === "speak") {
      speakText(getComposedText());
      s.composedText += (s.composedText ? " " : "") + s.currentWord;
      s.currentWord = "";
      s.currentLetter = "";
    }
  }, [getComposedText, speakText]);

  // --------------------------------------------------------------------------
  // Letter / word gap timing (polling)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (status !== "active") return;
    const interval = setInterval(() => {
      const s = blinkStateRef.current;
      const now = nowMs();
      if (s.lastBlinkMs === null) return;

      // Finalize any pending rapid sequence.
      if (
        s.rapidSequenceLen > 0 &&
        s.lastRapidBlinkMs !== null &&
        now - s.lastRapidBlinkMs > RAPID_BLINK_MAX_INTERVAL_MS
      ) {
        if (s.rapidSequenceLen === 3) handleCommand("clear");
        else if (s.rapidSequenceLen >= 5) handleCommand("speak");
        s.rapidSequenceLen = 0;
      }

      // Letter gap.
      if (s.currentLetter && now - s.lastBlinkMs >= LETTER_GAP_MS) {
        const char = reverseMorse(s.currentLetter);
        s.currentWord += char;
        s.currentLetter = "";
        s.lastBlinkMs = now;
      }

      // Word gap.
      if (s.currentWord && now - s.lastBlinkMs >= WORD_GAP_MS) {
        s.composedText += (s.composedText ? " " : "") + s.currentWord;
        s.currentWord = "";
        s.lastBlinkMs = now;
      }
    }, 100);
    return () => clearInterval(interval);
  }, [status, nowMs, handleCommand, reverseMorse]);

  // --------------------------------------------------------------------------
  // Camera lifecycle
  // --------------------------------------------------------------------------
  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Video element not found");
      video.srcObject = stream;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = reject;
      });
      setIsCameraOn(true);
      setStatus("camera-ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to access camera");
      setStatus("error");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOn(false);
    setStatus("idle");
    setEyeState("unknown");
    setFaceDetected(false);
  }, []);

  const clearText = useCallback(() => {
    const s = blinkStateRef.current;
    s.composedText = "";
    s.currentWord = "";
    s.currentLetter = "";
    s.rapidSequenceLen = 0;
  }, []);

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  if (showDisclaimer) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0a192f] flex items-center justify-center p-6">
        <div className="max-w-lg bg-white rounded-2xl p-8 shadow-2xl border border-[#00D4FF]">
          <h2 className="text-2xl font-bold text-[#0a192f] mb-2">Eye-Blink Communication</h2>
          <p className="text-slate-600 mb-6">
            This tool helps people with severe motor paralysis communicate using eye blinks
            detected through a webcam. It is an accessibility aid, not a certified medical
            device. Always keep an alternative communication method available.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowDisclaimer(false)}
              className="flex-1 bg-[#183f5b] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#14507a]"
            >
              I understand — continue
            </button>
            <button
              onClick={() => setShowDisclaimer(false)}
              className="flex-1 border border-slate-300 text-slate-700 px-6 py-3 rounded-xl font-semibold hover:bg-slate-100"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#0a192f] text-white">
      {error && (
        <div className="fixed top-4 left-4 right-4 z-40 bg-red-900/90 border border-red-500 text-white px-4 py-3 rounded-xl shadow-lg">
          <div className="flex items-start gap-3">
            <X className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="ml-3 text-red-200 hover:text-white mt-1"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {detectorError && (
        <div className="fixed top-4 left-4 right-4 z-40 bg-[#183f5b] border border-[#00D4FF] text-white px-4 py-3 rounded-xl shadow-lg">
          <div className="flex items-start gap-3">
            <X className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm">{detectorError}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="ml-3 text-[#00D4FF] hover:text-white mt-1"
            aria-label="Dismiss detector error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[#00D4FF] mb-2">Eye-Blink Communication</h1>
          <p className="text-slate-300">
            Communicate using eye blinks — detected through your webcam and translated into text.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left column: camera + status */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-slate-900/50 border border-slate-700 rounded-2xl p-6 shadow-xl">
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-auto rounded-xl bg-black mirror"
                  style={{ transform: "scaleX(-1)" }}
                />
                {!isCameraOn && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-xl">
                    <button
                      onClick={startCamera}
                      className="flex flex-col items-center gap-3 bg-[#183f5b] hover:bg-[#14507a] text-white px-8 py-4 rounded-xl font-semibold transition"
                    >
                      <Eye className="h-6 w-6" />
                      <span>Start Camera</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-6 grid grid-cols-3 gap-4">
                <StatusCard
                  label="Face"
                  value={faceDetected ? "Detected" : "Not found"}
                  active={faceDetected}
                />
                <StatusCard
                  label="Eyes"
                  value={eyeState}
                  active={eyeState === "open"}
                />
                <StatusCard
                  label="Camera"
                  value={isCameraOn ? "On" : "Off"}
                  active={isCameraOn}
                />
              </div>

              {status === "calibrating" && (
                <div className="mt-6 bg-slate-800/50 border border-[#267965] rounded-xl p-4">
                  <p className="text-sm text-[#267965] font-semibold mb-3">
                    Calibration: {calibrationTarget === "open" ? "Keep eyes OPEN" : "Close your eyes gently"}
                  </p>
                  <div className="w-full bg-slate-700 rounded-full h-3 mb-3 overflow-hidden">
                    <div
                      className="h-full bg-[#267965] transition-all duration-300"
                      style={{ width: "50%" }}
                    />
                  </div>
                  <p className="text-xs text-slate-400">
                    Hold each pose for ~3.5 seconds…
                  </p>
                  <button
                    onClick={stopCamera}
                    className="mt-4 w-full py-2 rounded-lg bg-red-900/50 text-red-300 font-semibold hover:bg-red-900/80 border border-red-500/50"
                  >
                    Cancel Calibration
                  </button>
                </div>
              )}

              {status !== "calibrating" && isCameraOn && detectorReady === false && (
                <div className="mt-4 bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                  <p className="text-xs text-slate-400">Loading face detection model…</p>
                </div>
              )}

              {isCameraOn && detectorReady && (
                <div className="mt-4 bg-slate-800/50 border border-[#267965] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Camera className="h-4 w-4 text-[#267965]" />
                    <span className="text-sm text-[#267965] font-semibold">MediaPipe blink detection active</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2 mb-2 overflow-hidden">
                    <div
                      className="h-full bg-[#267965] transition-all duration-100"
                      style={{ width: `${Math.min(closure * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400">
                    Eye closure: {Math.round(closure * 100)}% &nbsp;|&nbsp; Face: {mpFaceVisible ? "visible" : "centering…"}
                  </p>
                  <button
                    onClick={runCalibration}
                    disabled={!detectorReady}
                    className="mt-3 w-full py-2 rounded-lg bg-[#183f5b] text-white font-semibold hover:bg-[#14507a] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Calibrate Eyes
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right column: composed text + controls */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-900/50 border border-slate-700 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Composed Text</h3>
                <span className="text-xs px-2 py-1 rounded bg-[#183f5b] text-[#00D4FF] font-mono">
                  Morse input
                </span>
              </div>

              <div className="relative mb-4">
                <textarea
                  value={getComposedText()}
                  readOnly
                  className="w-full h-32 bg-slate-800 border border-slate-600 rounded-xl p-4 text-xl text-white font-mono focus:outline-none focus:border-[#00D4FF] resize-none"
                  placeholder="Blink to compose text..."
                  aria-label="Composed text"
                />
                <div className="absolute bottom-2 right-2 text-xs text-slate-500 font-mono">
                  {blinkStateRef.current.currentLetter} {blinkStateRef.current.currentWord}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const text = getComposedText();
                    if (text) {
                      navigator.clipboard.writeText(text);
                    }
                  }}
                  className="flex-1 bg-[#183f5b] hover:bg-[#14507a] text-white px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition"
                >
                  <Copy className="h-5 w-5" />
                  <span>Copy</span>
                </button>
                <button
                  onClick={() => speakText(getComposedText())}
                  disabled={isSpeaking || getComposedText().length === 0}
                  className={`flex-1 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition ${
                    isSpeaking || getComposedText().length === 0
                      ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                      : "bg-[#267965] hover:bg-[#1f6656] text-white"
                  }`}
                >
                  {isSpeaking ? (
                    <>
                      <MicOff className="h-5 w-5 animate-pulse" />
                      <span>Speaking…</span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-5 w-5" />
                      <span>Speak</span>
                    </>
                  )}
                </button>
                <button
                  onClick={clearText}
                  className="bg-red-900/50 hover:bg-red-900/80 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl font-semibold transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-700">
                <p className="text-xs text-slate-400 mb-3">Blink Language</p>
                <div className="space-y-2 text-xs text-slate-300 font-mono">
                  <div className="flex justify-between">
                    <span>Short blink</span>
                    <span>· (dot)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Long blink (hold closed)</span>
                    <span>– (dash)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Gap ~0.7s</span>
                    <span>new letter</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Gap ~2.5s</span>
                    <span>new word</span>
                  </div>
                  <div className="flex justify-between">
                    <span>3 rapid blinks</span>
                    <span>clear word</span>
                  </div>
                  <div className="flex justify-between">
                    <span>5 rapid blinks</span>
                    <span>speak text</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Manual blink input — always works, no camera needed */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-2xl p-6 shadow-xl">
              <h3 className="text-lg font-bold text-white mb-4">Manual Blink Input</h3>
              <p className="text-xs text-slate-400 mb-4">
                Use these buttons to simulate blinks (works without camera):
              </p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  onClick={() => injectBlink(200)}
                  className="bg-[#183f5b] hover:bg-[#14507a] text-white py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
                >
                  <span className="text-[#00D4FF]">·</span> <span>Dot (short)</span>
                </button>
                <button
                  onClick={() => injectBlink(600)}
                  className="bg-[#183f5b] hover:bg-[#14507a] text-white py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
                >
                  <span className="text-[#00D4FF]">–</span> <span>Dash (long)</span>
                </button>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleCommand("clear")}
                  className="flex-1 bg-red-900/50 hover:bg-red-900/80 border border-red-500/50 text-red-300 py-3 rounded-xl font-semibold transition"
                >
                  <X className="h-5 w-5" /> <span>Clear</span>
                </button>
                <button
                  onClick={() => handleCommand("speak")}
                  className="flex-1 bg-[#267965] hover:bg-[#1f6656] text-white py-3 rounded-xl font-semibold transition"
                >
                  <Mic className="h-5 w-5" /> <span>Speak</span>
                </button>
              </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-700 rounded-2xl p-6 shadow-xl">
              <h3 className="text-lg font-bold text-white mb-4">Camera Controls</h3>
              <div className="flex gap-3">
                {isCameraOn ? (
                  <button
                    onClick={stopCamera}
                    className="flex-1 bg-red-900/50 hover:bg-red-900/80 border border-red-500/50 text-red-300 py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
                  >
                    <Square className="h-5 w-5" />
                    <span>Stop Camera</span>
                  </button>
                ) : (
                  <button
                    onClick={startCamera}
                    className="flex-1 bg-[#183f5b] hover:bg-[#14507a] text-white py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
                  >
                    <Play className="h-5 w-5" />
                    <span>Start Camera</span>
                  </button>
                )}
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Start the camera, then click "Calibrate Eyes" to set your personal
                open/closed blink thresholds. After calibration, blink naturally and
                watch the text appear.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------------------

function StatusCard({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className={`bg-slate-800/50 border rounded-xl p-3 text-center ${
      active ? "border-[#00D4FF] bg-[#00D4FF]/10" : "border-slate-700"
    }`}>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-sm font-bold ${active ? "text-[#00D4FF]" : "text-slate-300"}`}>
        {value}
      </p>
    </div>
  );
}
