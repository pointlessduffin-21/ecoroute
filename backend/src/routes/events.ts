import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppVariables } from "../types/context";
import { eventBus, type SSEEvent } from "../services/event-bus";

const app = new Hono<{ Variables: AppVariables }>();

// ─── GET / — SSE stream of real-time events ─────────────────────────────────

app.get("/", (c) => {
  return streamSSE(c, async (stream) => {
    let alive = true;

    const onEvent = (event: SSEEvent) => {
      if (!alive) return;
      stream
        .writeSSE({
          event: event.type,
          data: JSON.stringify(event.data),
        })
        .catch(() => {
          alive = false;
        });
    };

    eventBus.on("sse", onEvent);

    // Send initial heartbeat
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({ timestamp: new Date().toISOString() }),
    });

    // Keepalive every 30s
    const keepalive = setInterval(() => {
      if (!alive) {
        clearInterval(keepalive);
        return;
      }
      stream
        .writeSSE({
          event: "heartbeat",
          data: JSON.stringify({ timestamp: new Date().toISOString() }),
        })
        .catch(() => {
          alive = false;
        });
    }, 30000);

    // Wait until client disconnects
    stream.onAbort(() => {
      alive = false;
      clearInterval(keepalive);
      eventBus.off("sse", onEvent);
    });

    // Keep stream open
    while (alive) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    clearInterval(keepalive);
    eventBus.off("sse", onEvent);
  });
});

export default app;
