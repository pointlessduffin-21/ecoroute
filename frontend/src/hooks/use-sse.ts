import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

const SSE_URL = `${import.meta.env.VITE_API_BASE_URL || "/api/v1"}/events`;

export function useSSE() {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    // EventSource doesn't support custom headers, so we pass token as query param
    // The backend auth middleware also checks query params for SSE
    const url = `${SSE_URL}?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener("telemetry", () => {
      // Invalidate dashboard and bin queries so they refetch
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["bins-telemetry"] });
      queryClient.invalidateQueries({ queryKey: ["fill-levels"] });
    });

    es.addEventListener("alert", () => {
      queryClient.invalidateQueries({ queryKey: ["recent-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    });

    es.addEventListener("route_update", () => {
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    });

    es.addEventListener("bin_update", () => {
      queryClient.invalidateQueries({ queryKey: ["bins"] });
      queryClient.invalidateQueries({ queryKey: ["bins-telemetry"] });
    });

    es.onerror = () => {
      // Auto-reconnect is built into EventSource, but close if token gone
      if (!localStorage.getItem("access_token")) {
        es.close();
      }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [queryClient]);
}
