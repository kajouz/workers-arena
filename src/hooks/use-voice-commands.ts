"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  VoiceCommandsManager,
  createVoiceCommandsManager,
  type VoiceCommand,
  type VoiceCommandResult,
} from "@/lib/voice/voice-commands";

interface UseVoiceCommandsOptions {
  language?: "en" | "ar";
  continuous?: boolean;
  onResult?: (result: VoiceCommandResult) => void;
  onError?: (error: string) => void;
}

interface UseVoiceCommandsReturn {
  isListening: boolean;
  isAvailable: boolean;
  lastResult: VoiceCommandResult | null;
  commands: VoiceCommand[];
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  registerCommand: (command: VoiceCommand) => void;
}

/**
 * React hook for voice commands
 */
export function useVoiceCommands({
  language = "en",
  continuous = false,
  onResult,
  onError,
}: UseVoiceCommandsOptions = {}): UseVoiceCommandsReturn {
  const [isListening, setIsListening] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [lastResult, setLastResult] = useState<VoiceCommandResult | null>(null);
  const [commands, setCommands] = useState<VoiceCommand[]>([]);
  const managerRef = useRef<VoiceCommandsManager | null>(null);

  // Initialize manager
  useEffect(() => {
    if (typeof window === "undefined") return;

    const manager = createVoiceCommandsManager({
      language,
      continuous,
      onResult: (result) => {
        setLastResult(result);
        onResult?.(result);
      },
      onError,
    });

    managerRef.current = manager;
    setIsAvailable(manager.isAvailable());
    setCommands(manager.getCommands());

    return () => {
      manager.stopListening();
    };
  }, [language, continuous, onResult, onError]);

  const startListening = useCallback(() => {
    if (managerRef.current) {
      const started = managerRef.current.startListening();
      setIsListening(started);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.stopListening();
      setIsListening(false);
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (managerRef.current) {
      const newState = managerRef.current.toggleListening();
      setIsListening(newState);
    }
  }, []);

  const registerCommand = useCallback((command: VoiceCommand) => {
    if (managerRef.current) {
      managerRef.current.registerCommand(command);
      setCommands(managerRef.current.getCommands());
    }
  }, []);

  return {
    isListening,
    isAvailable,
    lastResult,
    commands,
    startListening,
    stopListening,
    toggleListening,
    registerCommand,
  };
}
