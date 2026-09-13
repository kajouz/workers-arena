"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speechLocale } from "@/lib/tenant/countries";

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

export function useVoiceSearch(onResult: (transcript: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  /**
   * The callback is read through a ref so the subscription effect below depends
   * on NOTHING. Both call sites pass an inline arrow (a new identity on every
   * render), and with `onResult` in the dep list the effect re-ran — and
   * re-called `setSupported(true)` — on each render, which queued another
   * render: React aborted with "Maximum update depth exceeded" the moment a
   * search re-render landed (toggling the fee-waived filter was enough) and the
   * page stopped responding. Re-subscribing also discarded the live recognition
   * object mid-session, so an in-flight utterance was lost.
   */
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    const Ctor = getSpeechRecognition();
    if (Ctor) {
      const rec = new Ctor();
      // Arabic voice search — the tag comes from the country registry like
      // every other speech locale (it used to hardcode the Saudi tag).
      rec.lang = speechLocale("ar");
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.continuous = false;
      rec.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript ?? "";
        if (transcript) onResultRef.current(transcript);
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recognitionRef.current = rec;
      setSupported(true);
    }
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const toggle = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
    } else {
      setListening(true);
      rec.start();
    }
  }, [listening]);

  return { listening, supported, toggle };
}
