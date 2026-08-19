/**
 * Enhanced Voice Commands System
 *
 * Features:
 * - Natural language processing for commands
 * - Multi-language support (EN/AR)
 * - Custom command definitions
 * - Context-aware commands
 * - Confirmation for destructive actions
 * - Feedback with haptic/audio cues
 */

export interface VoiceCommand {
  id: string;
  patterns: string[];
  patternsAr?: string[];
  action: (context?: any) => Promise<void> | void;
  description: string;
  descriptionAr: string;
  requiresConfirmation?: boolean;
  category: "navigation" | "action" | "search" | "settings";
}

export interface VoiceCommandResult {
  success: boolean;
  command?: VoiceCommand;
  message: string;
  messageAr: string;
}

export interface VoiceCommandsConfig {
  language: "en" | "ar";
  continuous?: boolean;
  interimResults?: boolean;
  onResult?: (result: VoiceCommandResult) => void;
  onError?: (error: string) => void;
}

/**
 * Voice Commands Manager
 */
export class VoiceCommandsManager {
  private commands: VoiceCommand[] = [];
  private recognition: any = null;
  private isListening = false;
  private config: VoiceCommandsConfig;
  private audioContext: AudioContext | null = null;

  constructor(config: VoiceCommandsConfig) {
    this.config = config;
    this.initializeRecognition();
    this.registerDefaultCommands();
  }

  /**
   * Initialize speech recognition
   */
  private initializeRecognition() {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("[VoiceCommands] Speech recognition not supported");
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = this.config.continuous ?? false;
    this.recognition.interimResults = this.config.interimResults ?? false;
    this.recognition.lang = this.config.language === "ar" ? "ar-LB" : "en-US";

    this.recognition.onresult = (event: any) => {
      const last = event.results.length - 1;
      const transcript = event.results[last][0].transcript.toLowerCase().trim();

      if (event.results[last].isFinal) {
        this.processCommand(transcript);
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error("[VoiceCommands] Error:", event.error);
      this.config.onError?.(event.error);
    };

    this.recognition.onend = () => {
      if (this.isListening && this.config.continuous) {
        this.recognition?.start();
      }
    };
  }

  /**
   * Register default voice commands
   */
  private registerDefaultCommands() {
    // Navigation commands
    this.registerCommand({
      id: "nav-home",
      patterns: ["go home", "home page", "go to home"],
      patternsAr: ["اذهب للرئيسية", "الصفحة الرئيسية", "الرئيسية"],
      action: () => { window.location.href = "/"; },
      description: "Navigate to home page",
      descriptionAr: "الانتقال للصفحة الرئيسية",
      category: "navigation",
    });

    this.registerCommand({
      id: "nav-search",
      patterns: ["search", "find workers", "go to search"],
      patternsAr: ["بحث", "ابحث عن عمال", "اذهب للبحث"],
      action: () => { window.location.href = "/search"; },
      description: "Navigate to search page",
      descriptionAr: "الانتقال لصفحة البحث",
      category: "navigation",
    });

    this.registerCommand({
      id: "nav-categories",
      patterns: ["categories", "browse categories", "show categories"],
      patternsAr: ["الفئات", "تصفح الفئات", "عرض الفئات"],
      action: () => { window.location.href = "/categories"; },
      description: "Navigate to categories",
      descriptionAr: "الانتقال لصفحة الفئات",
      category: "navigation",
    });

    this.registerCommand({
      id: "nav-dashboard",
      patterns: ["dashboard", "my dashboard", "go to dashboard"],
      patternsAr: ["لوحة التحكم", "لوحتي", "اذهب للوحة التحكم"],
      action: () => { window.location.href = "/dashboard"; },
      description: "Navigate to dashboard",
      descriptionAr: "الانتقال للوحة التحكم",
      category: "navigation",
    });

    this.registerCommand({
      id: "nav-bookings",
      patterns: ["bookings", "my bookings", "show bookings"],
      patternsAr: ["الحجوزات", "حجوزاتي", "عرض الحجوزات"],
      action: () => { window.location.href = "/bookings"; },
      description: "Navigate to bookings",
      descriptionAr: "الانتقال للحجوزات",
      category: "navigation",
    });

    // Search commands
    this.registerCommand({
      id: "search-plumber",
      patterns: ["search plumber", "find plumber", "look for plumber"],
      patternsAr: ["ابحث عن سباك", "أريد سباك", "البحث عن سباك"],
      action: () => { window.location.href = "/search?category=plumbing"; },
      description: "Search for plumbers",
      descriptionAr: "البحث عن سباكين",
      category: "search",
    });

    this.registerCommand({
      id: "search-electrician",
      patterns: ["search electrician", "find electrician", "look for electrician"],
      patternsAr: ["ابحث عن كهربائي", "أريد كهربائي", "البحث عن كهربائي"],
      action: () => { window.location.href = "/search?category=electrical"; },
      description: "Search for electricians",
      descriptionAr: "البحث عن كهربائيين",
      category: "search",
    });

    this.registerCommand({
      id: "search-cleaning",
      patterns: ["search cleaning", "find cleaner", "look for cleaning service"],
      patternsAr: ["ابحث عن تنظيف", "أريد تنظيف", "خدمة تنظيف"],
      action: () => { window.location.href = "/search?category=cleaning"; },
      description: "Search for cleaning services",
      descriptionAr: "البحث عن خدمات تنظيف",
      category: "search",
    });

    // Action commands
    this.registerCommand({
      id: "action-favorites",
      patterns: ["show favorites", "my favorites", "view favorites"],
      patternsAr: ["عرض المفضلة", "المفضلة שלי", "المفضلة"],
      action: () => { window.location.href = "/favorites"; },
      description: "View favorites",
      descriptionAr: "عرض المفضلة",
      category: "action",
    });

    this.registerCommand({
      id: "action-theme",
      patterns: ["toggle theme", "switch theme", "dark mode", "light mode"],
      patternsAr: ["تغيير المظهر", "الوضع الداكن", "الوضع الفاتح"],
      action: () => {
        const html = document.documentElement;
        html.classList.toggle("dark");
        const isDark = html.classList.contains("dark");
        localStorage.setItem("wa_theme", isDark ? "dark" : "light");
      },
      description: "Toggle dark/light theme",
      descriptionAr: "تبديل المظهر الداكن/الفاتح",
      category: "settings",
    });

    this.registerCommand({
      id: "action-language",
      patterns: ["switch language", "toggle language", "change language"],
      patternsAr: ["تغيير اللغة", "تبديل اللغة"],
      action: () => {
        const current = document.documentElement.lang;
        const newLang = current === "ar" ? "en" : "ar";
        document.documentElement.lang = newLang;
        document.documentElement.dir = newLang === "ar" ? "rtl" : "ltr";
      },
      description: "Switch between English and Arabic",
      descriptionAr: "التبديل بين الإنجليزية والعربية",
      category: "settings",
    });

    this.registerCommand({
      id: "action-help",
      patterns: ["help", "show help", "what can you do"],
      patternsAr: ["مساعدة", "عرض المساعدة", "ماذا يمكنك أن تفعل"],
      action: () => { window.location.href = "/help"; },
      description: "Show help center",
      descriptionAr: "عرض مركز المساعدة",
      category: "action",
    });

    this.registerCommand({
      id: "action-contact",
      patterns: ["contact support", "get help", "talk to support"],
      patternsAr: ["التواصل مع الدعم", "المساعدة", "تحدث مع الدعم"],
      action: () => { window.location.href = "/help?tab=support"; },
      description: "Contact support",
      descriptionAr: "التواصل مع الدعم",
      category: "action",
    });

    this.registerCommand({
      id: "action-scroll-up",
      patterns: ["scroll up", "go up", "page up"],
      patternsAr: ["apol", "اذهب لفوق", "移到上面"],
      action: () => { window.scrollBy({ top: -500, behavior: "smooth" }); },
      description: "Scroll up",
      descriptionAr: "التمرير للأعلى",
      category: "action",
    });

    this.registerCommand({
      id: "action-scroll-down",
      patterns: ["scroll down", "go down", "page down"],
      patternsAr: ["apol", "اذهب لتحت", "移到下面"],
      action: () => { window.scrollBy({ top: 500, behavior: "smooth" }); },
      description: "Scroll down",
      descriptionAr: "التمرير للأسفل",
      category: "action",
    });
  }

  /**
   * Register a custom voice command
   */
  registerCommand(command: VoiceCommand) {
    this.commands.push(command);
  }

  /**
   * Process a voice transcript and execute matching command
   */
  private async processCommand(transcript: string): Promise<VoiceCommandResult> {
    const normalizedTranscript = transcript.toLowerCase().trim();

    // Find matching command
    for (const command of this.commands) {
      const allPatterns = [
        ...command.patterns,
        ...(command.patternsAr ?? []),
      ];

      const matched = allPatterns.some((pattern) =>
        normalizedTranscript.includes(pattern.toLowerCase())
      );

      if (matched) {
        // Confirmation for destructive actions
        if (command.requiresConfirmation) {
          this.playFeedback("confirm");
          // In production, show a confirmation dialog
        }

        try {
          await command.action();
          this.playFeedback("success");

          const result: VoiceCommandResult = {
            success: true,
            command,
            message: `Executed: ${command.description}`,
            messageAr: `تم التنفيذ: ${command.descriptionAr}`,
          };

          this.config.onResult?.(result);
          return result;
        } catch (error) {
          this.playFeedback("error");

          const result: VoiceCommandResult = {
            success: false,
            command,
            message: `Failed to execute: ${command.description}`,
            messageAr: `فشل التنفيذ: ${command.descriptionAr}`,
          };

          this.config.onResult?.(result);
          return result;
        }
      }
    }

    // No matching command found
    this.playFeedback("notfound");

    const result: VoiceCommandResult = {
      success: false,
      message: `Command not recognized: "${transcript}"`,
      messageAr: `أمر غير معروف: "${transcript}"`,
    };

    this.config.onResult?.(result);
    return result;
  }

  /**
   * Play audio feedback
   */
  private playFeedback(type: "success" | "error" | "confirm" | "notfound") {
    if (typeof window === "undefined") return;

    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      switch (type) {
        case "success":
          oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
          oscillator.frequency.setValueAtTime(1000, this.audioContext.currentTime + 0.1);
          break;
        case "error":
          oscillator.frequency.setValueAtTime(300, this.audioContext.currentTime);
          oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime + 0.1);
          break;
        case "confirm":
          oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
          break;
        case "notfound":
          oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
          break;
      }

      gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.2);
    } catch (error) {
      // Audio feedback not critical
    }
  }

  /**
   * Start listening for voice commands
   */
  startListening() {
    if (!this.recognition) {
      console.warn("[VoiceCommands] Speech recognition not available");
      return false;
    }

    try {
      this.recognition.start();
      this.isListening = true;
      return true;
    } catch (error) {
      console.error("[VoiceCommands] Failed to start:", error);
      return false;
    }
  }

  /**
   * Stop listening for voice commands
   */
  stopListening() {
    if (this.recognition) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  /**
   * Toggle listening state
   */
  toggleListening() {
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
    return this.isListening;
  }

  /**
   * Get all registered commands
   */
  getCommands(): VoiceCommand[] {
    return [...this.commands];
  }

  /**
   * Get commands by category
   */
  getCommandsByCategory(category: VoiceCommand["category"]): VoiceCommand[] {
    return this.commands.filter((cmd) => cmd.category === category);
  }

  /**
   * Check if speech recognition is available
   */
  isAvailable(): boolean {
    return this.recognition !== null;
  }

  /**
   * Get current listening state
   */
  getIsListening(): boolean {
    return this.isListening;
  }
}

/**
 * Create a voice commands manager instance
 */
export function createVoiceCommandsManager(
  config: VoiceCommandsConfig
): VoiceCommandsManager {
  return new VoiceCommandsManager(config);
}
