import { EventEmitter } from "events";

// ─── Event Types ─────────────────────────────────────────────────────────────

export interface SSEEvent {
  type: "telemetry" | "alert" | "route_update" | "bin_update";
  data: Record<string, unknown>;
}

// ─── Event Bus ───────────────────────────────────────────────────────────────

class EventBus extends EventEmitter {
  emit(event: "sse", payload: SSEEvent): boolean {
    return super.emit(event, payload);
  }

  on(event: "sse", listener: (payload: SSEEvent) => void): this {
    return super.on(event, listener);
  }

  off(event: "sse", listener: (payload: SSEEvent) => void): this {
    return super.off(event, listener);
  }
}

export const eventBus = new EventBus();
eventBus.setMaxListeners(100);
