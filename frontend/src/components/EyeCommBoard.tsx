"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Camera, Copy, Eye, Mic, MicOff, Play, Square, X, Type, Keyboard, ArrowLeft } from "lucide-react";
import { submitBlinkEvents } from "@/lib/eyeComm";
import { useBlinkDetector } from "@/lib/useBlinkDetector";
import type { BlinkEventIn } from "@/types";

// ------------------------------------------------------------------------------
// Morse timing thresholds (milliseconds) — mirror backend defaults.
// ------------------------------------------------------------------------------
const DEFAULT_SHORT_MAX_MS = 450;
const LETTER_GAP_MS = 700;
const WORD_GAP_MS = 2500;
// Hands-free commands are long deliberate holds.
const SPEAK_HOLD_MS = 1500; // eyes shut 1.5 s+  -> speak composed text
const CLEAR_HOLD_MS = 2500; // eyes shut 2.5 s+  -> clear current word

// Scanning timing (milliseconds).
const ROW_SCAN_INTERVAL_MS = 2000; // time a row stays highlighted before auto-advance
const WORD_SCAN_INTERVAL_MS = 1500; // time a word stays highlighted before auto-advance
const BLINK_CONFIRM_MS = 300; // min blink duration to count as a selection

// ------------------------------------------------------------------------------
// Top-level scanning options (shown after calibration).
// ------------------------------------------------------------------------------
const TOP_LEVEL_ROWS: string[][] = [
  ["Emergency Words"],
  ["Keyboard"],
];

// ------------------------------------------------------------------------------
// Emergency words — organized in rows for row-column scanning.
// ------------------------------------------------------------------------------
const EMERGENCY_ROWS: string[][] = [
  ["Yes", "No", "Water", "Food"],
  ["Washroom", "Come here", "Help me", "Pain"],
  ["Doctor", "Nurse", "Family", "Phone"],
  ["Sleep", "Rest", "TV", "Music"],
];

// QWERTY keyboard rows for scanning selection.
const KEYBOARD_ROWS: string[][] = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
  ["SPACE", "BACK", "DONE"],
];

type AppStatus = "idle" | "camera-ready" | "calibrating" | "active" | "error";
type EyeState = "open" | "closed" | "unknown" | "--";

// Scanning modes.
type ScanMode = "idle" | "top" | "emergency" | "keyboard";

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

// ------------------------------------------------------------------------------
// Text-to-speech helper
// ------------------------------------------------------------------------------
let speechSynthesisAvailable = false;
try {
  speechSynthesisAvailable = typeof window !== "undefined" && "speechSynthesis" in window;
} catch {
  speechSynthesisAvailable = false;
}

function speak(text: string): void {
  if (!text || text.trim().length === 0) return;
  if (!speechSynthesisAvailable) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("Speech synthesis failed:", err);
  }
}

export default function EyeCommBoard() {
  // --------------------------------------------------------------------------
  // Refs
  // --------------------------------------------------------------------------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const blinkStateRef = useRef<{
    eyeClosed: boolean;
    blinkStartMs: number | null;
    lastBlinkMs: number | null;
    currentLetter: string;
    currentWord: string;
    composedText: string;
  }>({
    eyeClosed: false,
    blinkStartMs: null,
    lastBlinkMs: null,
    currentLetter: "",
    currentWord: "",
    composedText: "",
  });

  // Scanning refs (fast, no re-render per blink).
  const scanRef = useRef<{
    mode: ScanMode;
    rowIndex: number;
    wordIndex: number;
    rowStartMs: number;
    wordStartMs: number;
    scanning: boolean;
  }>({
    mode: "idle",
    rowIndex: 0,
    wordIndex: 0,
    rowStartMs: 0,
    wordStartMs: 0,
    scanning: false,
  });

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  const [status, setStatus] = useState<AppStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [eyeState, setEyeState] = useState<EyeState>("--");
  const [faceDetected, setFaceDetected] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [calibrationTarget, setCalibrationTarget] = useState<EyeState | null>(null);
  const [composedText, setComposedText] = useState("");
  const [currentLetter, setCurrentLetter] = useState("");
  const [currentWord, setCurrentWord] = useState("");

  // Scanning UI state.
  const [scanMode, setScanMode] = useState<ScanMode>("idle");
  const [highlightedRow, setHighlightedRow] = useState(-1);
  const [highlightedWord, setHighlightedWord] = useState(-1);
  const [isScanning, setIsScanning] = useState(false);

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
    enabled: isCameraOn && (status === "active" || status === "calibrating" || scanMode !== "idle"),
    onBlink: (e) => injectBlink(e.durationMs, e.endMs),
  });

  // --------------------------------------------------------------------------
  // Calibration with voice announcements
  // --------------------------------------------------------------------------
  const runCalibration = useCallback(async () => {
    setStatus("calibrating");
    setError(null);
    setCalibrationTarget("open");
    speak("Open your eyes");
    try {
      await calibrate((phase) => {
        setCalibrationTarget(phase);
        if (phase === "open") {
          speak("Open your eyes");
        } else if (phase === "closed") {
          speak("Close your eyes gently");
        }
      });
      setCalibrationTarget(null);
      setStatus("active");
      // Automatically start scanning after calibration
      setScanMode("top");
      setIsScanning(true);
      setHighlightedRow(0);
      setHighlightedWord(-1);
      scanRef.current = {
        mode: "top",
        rowIndex: 0,
        wordIndex: 0,
        rowStartMs: nowMs(),
        wordStartMs: 0,
        scanning: true,
      };
      speak("Calibration complete. Scanning started. Blink to select.");
    } catch (e) {
      setCalibrationTarget(null);
      setError(e instanceof Error ? e.message : "Calibration failed");
      setStatus("camera-ready");
      speak("Calibration failed. Please try again.");
    }
  }, [calibrate, speak]);

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  const reverseMorse = useCallback((pattern: string): string => {
    return REVERSE_MORSE[pattern] || "?";
  }, []);

  // --------------------------------------------------------------------------
  // Text-to-speech
  // --------------------------------------------------------------------------
  const speakText = useCallback((text: string) => {
    if (!text || text.trim().length === 0) return;
    setIsSpeaking(true);
    speak(text);
    setTimeout(() => setIsSpeaking(false), 2000);
  }, [speak]);

  // --------------------------------------------------------------------------
  // Scanning navigation
  // --------------------------------------------------------------------------
  const stopScanning = useCallback(() => {
    setScanMode("idle");
    setIsScanning(false);
    setHighlightedRow(-1);
    setHighlightedWord(-1);
    scanRef.current = {
      mode: "idle",
      rowIndex: 0,
      wordIndex: 0,
      rowStartMs: 0,
      wordStartMs: 0,
      scanning: false,
    };
  }, []);

  const goToTopLevel = useCallback(() => {
    setScanMode("top");
    setHighlightedRow(0);
    setHighlightedWord(-1);
    scanRef.current = {
      mode: "top",
      rowIndex: 0,
      wordIndex: 0,
      rowStartMs: nowMs(),
      wordStartMs: 0,
      scanning: true,
    };
    speak("Back to main menu. Blink to select.");
  }, [speak]);

  const selectTopRow = useCallback((rowIdx: number) => {
    if (rowIdx === 0) {
      // Emergency Words
      setScanMode("emergency");
      setHighlightedRow(0);
      setHighlightedWord(0);
      scanRef.current = {
        mode: "emergency",
        rowIndex: 0,
        wordIndex: 0,
        rowStartMs: nowMs(),
        wordStartMs: nowMs(),
        scanning: true,
      };
      speak("Emergency words. Blink to select a word.");
    } else if (rowIdx === 1) {
      // Keyboard
      setScanMode("keyboard");
      setHighlightedRow(0);
      setHighlightedWord(0);
      scanRef.current = {
        mode: "keyboard",
        rowIndex: 0,
        wordIndex: 0,
        rowStartMs: nowMs(),
        wordStartMs: nowMs(),
        scanning: true,
      };
      speak("Keyboard. Blink to select a key.");
    }
  }, [speak]);

  const selectEmergencyWord = useCallback((rowIdx: number, wordIdx: number) => {
    const word = EMERGENCY_ROWS[rowIdx]?.[wordIdx];
    if (!word) return;
    setComposedText((prev) => (prev ? `${prev} ${word}` : word));
    setCurrentWord("");
    setCurrentLetter("");
    // Return to row scanning (not top level) — rows keep highlighting
    setScanMode("emergency");
    setHighlightedRow(rowIdx);
    setHighlightedWord(-1);
    scanRef.current = {
      mode: "emergency",
      rowIndex: rowIdx,
      wordIndex: 0,
      rowStartMs: nowMs(),
      wordStartMs: 0,
      scanning: true,
    };
    speakText(word);
  }, [speakText]);

  const selectKeyboardKey = useCallback((rowIdx: number, keyIdx: number) => {
    const key = KEYBOARD_ROWS[rowIdx]?.[keyIdx];
    if (!key) return;

    if (key === "SPACE") {
      setComposedText((prev) => (prev ? `${prev} ` : prev));
      setCurrentWord("");
      setCurrentLetter("");
    } else if (key === "BACK") {
      setComposedText((prev) => prev.slice(0, -1));
      setCurrentWord("");
      setCurrentLetter("");
    } else if (key === "DONE") {
      setScanMode("keyboard");
      setHighlightedRow(rowIdx);
      setHighlightedWord(-1);
      scanRef.current = {
        mode: "keyboard",
        rowIndex: rowIdx,
        wordIndex: 0,
        rowStartMs: nowMs(),
        wordStartMs: 0,
        scanning: true,
      };
      speakText(composedText || "Done");
      return;
    } else {
      setCurrentLetter((prev) => prev + key);
      setCurrentWord((prev) => prev + key);
      setComposedText((prev) => (prev ? `${prev} ${key}` : key));
    }

    // Return to row scanning (not top level) — rows keep highlighting
    setScanMode("keyboard");
    setHighlightedRow(rowIdx);
    setHighlightedWord(-1);
    scanRef.current = {
      mode: "keyboard",
      rowIndex: rowIdx,
      wordIndex: 0,
      rowStartMs: nowMs(),
      wordStartMs: 0,
      scanning: true,
    };
    speakText(key);
  }, [composedText, speakText]);

  // --------------------------------------------------------------------------
  // Blink input: one entry point for camera detector AND manual buttons
  // --------------------------------------------------------------------------
  const injectBlink = useCallback(
    (durationMs: number, timestamp?: number) => {
      const ts = timestamp ?? nowMs();

      // Long holds are commands, not letters.
      if (durationMs >= CLEAR_HOLD_MS) {
        setComposedText("");
        setCurrentWord("");
        setCurrentLetter("");
        speak("Cleared");
        return;
      }
      if (durationMs >= SPEAK_HOLD_MS) {
        if (composedText.trim()) speakText(composedText);
        setComposedText("");
        setCurrentWord("");
        setCurrentLetter("");
        return;
      }

      // If scanning, a blink confirms the current highlight.
      if (isScanning && durationMs >= BLINK_CONFIRM_MS) {
        if (scanRef.current.mode === "top") {
          selectTopRow(scanRef.current.rowIndex);
        } else if (scanRef.current.mode === "emergency") {
          selectEmergencyWord(scanRef.current.rowIndex, scanRef.current.wordIndex);
        } else if (scanRef.current.mode === "keyboard") {
          selectKeyboardKey(scanRef.current.rowIndex, scanRef.current.wordIndex);
        }
        return;
      }

      // Otherwise: Morse dot/dash input.
      const symbol = durationMs < DEFAULT_SHORT_MAX_MS ? "." : "-";
      const s = blinkStateRef.current;
      s.currentLetter += symbol;
      s.lastBlinkMs = ts;
      setCurrentLetter(s.currentLetter);
    },
    [
      isScanning,
      composedText,
      selectTopRow,
      selectEmergencyWord,
      selectKeyboardKey,
      speakText,
    ],
  );

  // --------------------------------------------------------------------------
  // Morse letter / word gap timing (polling)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (status !== "active") return;
    const interval = setInterval(() => {
      const s = blinkStateRef.current;
      const now = nowMs();
      if (s.lastBlinkMs === null) return;

      // Letter gap.
      if (s.currentLetter && now - s.lastBlinkMs >= LETTER_GAP_MS) {
        const char = reverseMorse(s.currentLetter);
        setCurrentWord((prev) => prev + char);
        s.currentWord += char;
        s.currentLetter = "";
        setCurrentLetter("");
        s.lastBlinkMs = now;
      }

      // Word gap.
      if (s.currentWord && now - s.lastBlinkMs >= WORD_GAP_MS) {
        setComposedText((prev) => (prev ? `${prev} ${s.currentWord}` : s.currentWord));
        s.composedText += (s.composedText ? " " : "") + s.currentWord;
        s.currentWord = "";
        setCurrentWord("");
        s.lastBlinkMs = null;
      }
    }, 100);
    return () => clearInterval(interval);
  }, [status, reverseMorse]);

  // --------------------------------------------------------------------------
  // Scanning auto-advance timer
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!isScanning) return;
    const interval = setInterval(() => {
      const now = nowMs();
      const s = scanRef.current;

      if (s.mode === "top") {
        if (now - s.rowStartMs >= ROW_SCAN_INTERVAL_MS) {
          const next = (s.rowIndex + 1) % TOP_LEVEL_ROWS.length;
          setHighlightedRow(next);
          scanRef.current.rowIndex = next;
          scanRef.current.rowStartMs = now;
        }
      } else if (s.mode === "emergency") {
        if (now - s.rowStartMs >= ROW_SCAN_INTERVAL_MS) {
          const next = (s.rowIndex + 1) % EMERGENCY_ROWS.length;
          setHighlightedRow(next);
          scanRef.current.rowIndex = next;
          scanRef.current.rowStartMs = now;
        } else if (now - s.wordStartMs >= WORD_SCAN_INTERVAL_MS) {
          const row = EMERGENCY_ROWS[s.rowIndex];
          if (!row) return;
          const next = (s.wordIndex + 1) % row.length;
          setHighlightedWord(next);
          scanRef.current.wordIndex = next;
          scanRef.current.wordStartMs = now;
        }
      } else if (s.mode === "keyboard") {
        if (now - s.rowStartMs >= ROW_SCAN_INTERVAL_MS) {
          const next = (s.rowIndex + 1) % KEYBOARD_ROWS.length;
          setHighlightedRow(next);
          scanRef.current.rowIndex = next;
          scanRef.current.rowStartMs = now;
        } else if (now - s.wordStartMs >= WORD_SCAN_INTERVAL_MS) {
          const row = KEYBOARD_ROWS[s.rowIndex];
          if (!row) return;
          const next = (s.wordIndex + 1) % row.length;
          setHighlightedWord(next);
          scanRef.current.wordIndex = next;
          scanRef.current.wordStartMs = now;
        }
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isScanning]);

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
    stopScanning();
  }, [stopScanning]);

  const clearText = useCallback(() => {
    setComposedText("");
    setCurrentWord("");
    setCurrentLetter("");
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
            Communicate using eye blinks — blinking selects highlighted words, or use Morse
            code (short blink = dot, long blink = dash).
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
                  value={faceDetected ? "Detected" : (isCameraOn ? "No face" : "Off")}
                  active={faceDetected && isCameraOn}
                />
                <StatusCard
                  label="Eyes"
                  value={isCameraOn ? (eyeState === "open" ? "Open" : eyeState === "closed" ? "Closed" : "--") : "Off"}
                  active={isCameraOn && eyeState === "open"}
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

          {/* Right column: scanning + composed text + controls */}
          <div className="lg:col-span-5 space-y-6">
            {/* Scanning interface */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">
                  {scanMode === "top" ? "Select Category" : scanMode === "emergency" ? "Emergency Words" : "Keyboard"}
                </h3>
                <span className="text-xs px-2 py-1 rounded bg-[#183f5b] text-[#00D4FF] font-mono">
                  Scanning
                </span>
              </div>

              {scanMode === "top" && (
                <div className="space-y-3">
                  {TOP_LEVEL_ROWS.map((row, rowIdx) => (
                    <div
                      key={rowIdx}
                      className={`flex items-center gap-3 mb-3 ${
                        highlightedRow === rowIdx
                          ? "border-2 border-[#00D4FF] bg-[#00D4FF]/20 rounded-xl p-4 shadow-[0_0_20px_rgba(0,212,255,0.5)]"
                          : "border border-slate-700/50 rounded-xl p-4 hover:bg-slate-800/50 transition"
                      }`}
                    >
                      <span className="text-xs text-slate-400 w-8 text-center">
                        {rowIdx + 1}.
                      </span>
                      <div className="flex-1">
                        <div className="text-lg font-semibold text-white">{row[0]}</div>
                        <div className="text-xs text-slate-400">
                          {rowIdx === 0 ? "Yes, No, Water, Food, Washroom, Come here, Help me, Pain, Doctor, Nurse, Family, Phone, Sleep, Rest, TV, Music" : "Type letters A-Z, SPACE, BACK, DONE"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {scanMode === "emergency" && (
                <div className="space-y-2">
                  {EMERGENCY_ROWS.map((row, rowIdx) => (
                    <div
                      key={rowIdx}
                      className={`flex items-center gap-2 mb-2 ${
                        highlightedRow === rowIdx
                          ? "border-2 border-[#00D4FF] bg-[#00D4FF]/20 rounded-lg p-2 shadow-[0_0_15px_rgba(0,212,255,0.4)]"
                          : "border border-slate-700/50 rounded-lg p-2 hover:bg-slate-800/50 transition"
                      }`}
                    >
                      <span className="text-xs text-slate-400 w-8 text-center">
                        {rowIdx + 1}.
                      </span>
                      {row.map((word, wordIdx) => (
                        <button
                          key={word}
                          onClick={() => selectEmergencyWord(rowIdx, wordIdx)}
                          className={`px-3 py-2 rounded text-sm font-medium transition-all duration-200 ${
                            highlightedRow === rowIdx && highlightedWord === wordIdx
                              ? "bg-[#00D4FF] text-[#0a192f] shadow-[0_0_12px_rgba(0,212,255,0.6)] scale-105"
                              : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600/50"
                          }`}
                          disabled={!isScanning || scanMode !== "emergency" || highlightedRow !== rowIdx}
                        >
                          {word}
                        </button>
                      ))}
                    </div>
                  ))}
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <button
                      onClick={goToTopLevel}
                      className="w-full py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm transition flex items-center justify-center gap-2"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Back</span>
                    </button>
                  </div>
                </div>
              )}

              {scanMode === "keyboard" && (
                <div className="space-y-2">
                  {KEYBOARD_ROWS.map((row, rowIdx) => (
                    <div
                      key={rowIdx}
                      className={`flex items-center gap-2 mb-2 ${
                        highlightedRow === rowIdx
                          ? "border-2 border-[#00D4FF] bg-[#00D4FF]/20 rounded-lg p-2 shadow-[0_0_15px_rgba(0,212,255,0.4)]"
                          : "border border-slate-700/50 rounded-lg p-2 hover:bg-slate-800/50 transition"
                      }`}
                    >
                      <span className="text-xs text-slate-400 w-8 text-center">
                        {rowIdx + 1}.
                      </span>
                      {row.map((key, keyIdx) => (
                        <button
                          key={key}
                          onClick={() => selectKeyboardKey(rowIdx, keyIdx)}
                          className={`px-2 py-2 rounded text-sm font-medium transition-all duration-200 ${
                            highlightedRow === rowIdx && highlightedWord === keyIdx
                              ? "bg-[#00D4FF] text-[#0a192f] shadow-[0_0_12px_rgba(0,212,255,0.6)] scale-105"
                              : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600/50"
                          }`}
                          disabled={!isScanning || scanMode !== "keyboard" || highlightedRow !== rowIdx}
                        >
                          {key}
                        </button>
                      ))}
                    </div>
                  ))}
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <button
                      onClick={goToTopLevel}
                      className="w-full py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm transition flex items-center justify-center gap-2"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Back</span>
                    </button>
                  </div>
                </div>
              )}

              {!isScanning && (
                <div className="mt-4 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                  <p className="text-xs text-slate-400 text-center">
                    Scanning will start automatically after calibration. Blink to select highlighted items.
                  </p>
                </div>
              )}
            </div>

            {/* Composed text */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Composed Text</h3>
                <span className="text-xs px-2 py-1 rounded bg-[#183f5b] text-[#00D4FF] font-mono">
                  Output
                </span>
              </div>

              <div className="relative mb-4">
                <textarea
                  value={composedText}
                  readOnly
                  className="w-full h-32 bg-slate-800 border border-slate-600 rounded-xl p-4 text-xl text-white font-mono focus:outline-none focus:border-[#00D4FF] resize-none"
                  placeholder="Selected words appear here..."
                  aria-label="Composed text"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (composedText) {
                      navigator.clipboard.writeText(composedText);
                    }
                  }}
                  className="flex-1 bg-[#183f5b] hover:bg-[#14507a] text-white px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition"
                >
                  <Copy className="h-5 w-5" />
                  <span>Copy</span>
                </button>
                <button
                  onClick={() => speakText(composedText)}
                  disabled={isSpeaking || composedText.length === 0}
                  className={`flex-1 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition ${
                    isSpeaking || composedText.length === 0
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
                <p className="text-xs text-slate-400 mb-3">Morse Blink Language</p>
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
                    <span>Hold eyes shut 1.5 s</span>
                    <span>speak text</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Hold eyes shut 2.5 s</span>
                    <span>clear text</span>
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
                  onClick={() => {
                    setComposedText("");
                    setCurrentWord("");
                    setCurrentLetter("");
                  }}
                  className="flex-1 bg-red-900/50 hover:bg-red-900/80 border border-red-500/50 text-red-300 py-3 rounded-xl font-semibold transition"
                >
                  <X className="h-5 w-5" /> <span>Clear</span>
                </button>
                <button
                  onClick={() => speakText(composedText)}
                  className="flex-1 bg-[#267965] hover:bg-[#1f6656] text-white py-3 rounded-xl font-semibold transition"
                >
                  <Mic className="h-5 w-5" /> <span>Speak</span>
                </button>
              </div>
            </div>

            {/* Camera controls */}
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
                open/closed blink thresholds. After calibration, scanning starts
                automatically. Blink to select highlighted items.
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
