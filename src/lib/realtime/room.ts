/**
 * Real-time room for analytics dashboard.
 * Uses BroadcastChannel for cross-tab communication and
 * a lightweight pub/sub pattern for real-time updates.
 *
 * For production, swap this with Liveblocks or PartyKit:
 * - Liveblocks: https://liveblocks.io
 * - PartyKit: https://partykit.io
 */

type EventCallback = (data: any) => void;

class RealtimeRoom {
  private channel: BroadcastChannel | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private userId: string;
  private roomId: string;

  constructor(roomId: string) {
    this.roomId = roomId;
    this.userId = this.generateUserId();
    
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      this.channel = new BroadcastChannel(`realtime:${roomId}`);
      this.channel.onmessage = (event) => {
        const { type, data, sender } = event.data;
        if (sender !== this.userId) {
          this.emit(type, data);
        }
      };
    }
  }

  private generateUserId(): string {
    return `user_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Subscribe to an event
   */
  on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  /**
   * Emit an event to all subscribers (including other tabs)
   */
  emit(event: string, data: any): void {
    // Notify local listeners
    this.listeners.get(event)?.forEach((callback) => {
      callback(data);
    });

    // Notify other tabs via BroadcastChannel
    if (this.channel) {
      this.channel.postMessage({
        type: event,
        data,
        sender: this.userId,
      });
    }
  }

  /**
   * Broadcast a page view event
   */
  trackPageView(page: string, metadata?: Record<string, any>): void {
    this.emit("pageview", {
      page,
      metadata,
      timestamp: Date.now(),
      userId: this.userId,
    });
  }

  /**
   * Broadcast an active user event
   */
  trackActiveUser(userData: { name?: string; role?: string }): void {
    this.emit("active_user", {
      ...userData,
      userId: this.userId,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast an error event
   */
  trackError(error: string, context?: Record<string, any>): void {
    this.emit("error", {
      error,
      context,
      timestamp: Date.now(),
      userId: this.userId,
    });
  }

  /**
   * Get current active users in the room
   */
  getActiveUsers(): string[] {
    return [this.userId]; // In production, this would query the server
  }

  /**
   * Disconnect from the room
   */
  disconnect(): void {
    this.channel?.close();
    this.listeners.clear();
  }
}

// Singleton instance
let roomInstance: RealtimeRoom | null = null;

export function getRealtimeRoom(roomId: string = "analytics"): RealtimeRoom {
  if (!roomInstance) {
    roomInstance = new RealtimeRoom(roomId);
  }
  return roomInstance;
}

export type { RealtimeRoom };
