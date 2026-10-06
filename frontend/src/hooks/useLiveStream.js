import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";

export function useLiveStream(onEvent) {
  const auth = useAuth();
  const token = auth ? auth.token : null;

  useEffect(() => {
    const activeToken = token || localStorage.getItem("td_token");
    if (!activeToken) return;

    let eventSource = null;
    let reconnectTimer = null;

    function connect() {
      const streamUrl = `/api/v1/ui/stream?token=${encodeURIComponent(activeToken)}`;
      eventSource = new EventSource(streamUrl);

      eventSource.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          if (onEvent && parsed) {
            onEvent(parsed);
          }
        } catch (err) {
          // ignore keep-alive heartbeat comments
        }
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
        }
        reconnectTimer = setTimeout(() => {
          connect();
        }, 3000);
      };
    }

    connect();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [token, onEvent]);
}
