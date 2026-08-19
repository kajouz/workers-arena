/**
 * Liveblocks integration for real-time collaboration.
 *
 * Liveblocks provides:
 * - Real-time presence (who's online, cursors, selections)
 * - Storage (shared state that persists)
 * - Comments (collaborative commenting)
 * - Notifications (real-time alerts)
 *
 * Setup:
 * 1. Create a Liveblocks account at https://liveblocks.io
 * 2. Create a project and get your public API key
 * 3. Add LIVEBLOCKS_SECRET_KEY to your .env.local
 *
 * Pricing: Free tier includes 50k MAU, 100 concurrent connections
 */

const LIVEBLOCKS_PUBLIC_KEY = process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY ?? "";
const LIVEBLOCKS_SECRET_KEY = process.env.LIVEBLOCKS_SECRET_KEY ?? "";

interface PresenceState {
  userId: string;
  name: string;
  avatar?: string;
  cursor?: { x: number; y: number };
  lastActive: number;
}

interface RoomState {
  presence: PresenceState;
  storage: Record<string, any>;
}

/**
 * Liveblocks client for browser-side usage
 */
export function createLiveblocksClient() {
  if (!LIVEBLOCKS_PUBLIC_KEY) {
    console.warn("[Liveblocks] Public key not configured");
    return null;
  }

  // Dynamic import to avoid SSR issues
  return {
    publicKey: LIVEBLOCKS_PUBLIC_KEY,
    // In production, use: import { createClient } from "@liveblocks/client";
    // const client = createClient({ publicAPIKey: LIVEBLOCKS_PUBLIC_KEY });
  };
}

/**
 * Liveblocks server client for API routes
 */
export function createLiveblocksServerClient() {
  if (!LIVEBLOCKS_SECRET_KEY) {
    console.warn("[Liveblocks] Secret key not configured");
    return null;
  }

  return {
    secretKey: LIVEBLOCKS_SECRET_KEY,
    // In production, use: import { Liveblocks } from "@liveblocks/liveblocks";
    // const liveblocks = new Liveblocks({ secret: LIVEBLOCKS_SECRET_KEY });
  };
}

/**
 * Lightweight presence manager (no SDK dependency)
 * Uses BroadcastChannel for cross-tab communication
 */
class PresenceManager {
  private channel: BroadcastChannel | null = null;
  private userId: string;
  private room: string;
  private _onPresenceChange?: (users: PresenceState[]) => void;
  private users: Map<string, PresenceState> = new Map();

  constructor(room: string, userId: string) {
    this.room = room;
    this.userId = userId;

    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      this.channel = new BroadcastChannel(`presence:${room}`);
      this.channel.onmessage = (event) => {
        const { type, user } = event.data;
        if (type === "join" || type === "update") {
          this.users.set(user.userId, user);
          this._onPresenceChange?.(Array.from(this.users.values()));
        } else if (type === "leave") {
          this.users.delete(user.userId);
          this._onPresenceChange?.(Array.from(this.users.values()));
        }
      };

      // Announce presence
      this.broadcast({
        type: "join",
        user: this.getMyPresence(),
      });

      // Heartbeat to detect disconnected users
      setInterval(() => {
        this.broadcast({
          type: "update",
          user: this.getMyPresence(),
        });
        this.cleanStaleUsers();
      }, 5000);

      // Announce leave on page unload
      window.addEventListener("beforeunload", () => {
        this.broadcast({
          type: "leave",
          user: this.getMyPresence(),
        });
      });
    }
  }

  private getMyPresence(): PresenceState {
    return {
      userId: this.userId,
      name: `User ${this.userId.slice(0, 6)}`,
      lastActive: Date.now(),
    };
  }

  private broadcast(data: any): void {
    this.channel?.postMessage(data);
  }

  private cleanStaleUsers(): void {
    const now = Date.now();
    for (const [id, user] of this.users) {
      if (now - user.lastActive > 15000) {
        this.users.delete(id);
      }
    }
    this._onPresenceChange?.(Array.from(this.users.values()));
  }

  updatePresence(data: Partial<PresenceState>): void {
    const presence = { ...this.getMyPresence(), ...data };
    this.users.set(this.userId, presence);
    this.broadcast({ type: "update", user: presence });
  }

  onPresenceChange(callback: (users: PresenceState[]) => void): () => void {
    this._onPresenceChange = callback;
    return () => {
      this._onPresenceChange = undefined;
    };
  }

  getPresenceUsers(): PresenceState[] {
    return Array.from(this.users.values());
  }

  disconnect(): void {
    this.broadcast({
      type: "leave",
      user: this.getMyPresence(),
    });
    this.channel?.close();
  }
}

// Singleton instances
const presenceInstances = new Map<string, PresenceManager>();

export function getPresenceManager(room: string, userId: string): PresenceManager {
  if (!presenceInstances.has(room)) {
    presenceInstances.set(room, new PresenceManager(room, userId));
  }
  return presenceInstances.get(room)!;
}

export type { PresenceState };
export { PresenceManager };
