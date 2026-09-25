import { useCallback, useEffect, useState } from "react";

import { request } from "@/lib/api";

export type HealthState = "checking" | "connected" | "error";

// Checks GET /health once on mount; `retry` checks again.
export function useBackendHealth() {
  const [state, setState] = useState<HealthState>("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState("checking");
    request<{ status: string }>("/health", { timeoutMs: 5000 })
      .then((data) => {
        if (active) setState(data?.status === "ok" ? "connected" : "error");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
