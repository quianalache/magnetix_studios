"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser-native speech-to-text (the Web Speech API) — free, no backend,
 * no API key. Chrome/Edge/Safari support it (vendor-prefixed as
 * `webkitSpeechRecognition` in Safari and older Chrome); Firefox does not
 * implement it at all, so `supported` is the feature-detect callers must
 * check before rendering a dictate control.
 *
 * Fires `onResult(transcript, isFinal)` for each recognized chunk — most
 * engines finalize a phrase every few seconds while you keep talking, not
 * just when you stop, so callers appending `transcript` on every `isFinal`
 * call get a naturally "live" feel without needing to track interim text.
 */

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function useDictation(
  onResult: (transcript: string, isFinal: boolean) => void,
): {
  supported: boolean;
  listening: boolean;
  toggle: () => void;
  error: string | null;
} {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  // Starts false to match SSR (no `window`), then flips after mount if the
  // browser actually has it — avoids a hydration mismatch between the
  // server's "not supported" render and the client's real capability.
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("Dictation isn't supported in this browser.");
      return;
    }
    setError(null);
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        onResultRef.current(result[0].transcript, result.isFinal);
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(
        event.error === "not-allowed"
          ? "Microphone access was denied."
          : "Dictation stopped due to an error.",
      );
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening]);

  return { supported, listening, toggle, error };
}
