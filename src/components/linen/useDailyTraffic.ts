import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRPC2Call } from "@/contexts/RPC2Context";
import type { QueryMetricsResponse } from "@/types/metrics";
import {
  summarizeDailyTraffic,
  trafficDayWindow,
  type DailyTraffic,
} from "./linenTraffic";
export type DailyTrafficStatus = "disabled" | "loading" | "ready" | "error";
export function useDailyTraffic(
  nodeIds: string[],
  enabled: boolean,
  timeZone: unknown,
) {
  const { call } = useRPC2Call();
  const [clock, setClock] = useState(Date.now());
  const idsKey = JSON.stringify([...new Set(nodeIds)].sort());
  const ids = useMemo(() => JSON.parse(idsKey) as string[], [idsKey]);
  const range = trafficDayWindow(clock, timeZone);
  const key = range.key + ":" + idsKey;
  const [state, setState] = useState<{
    key: string;
    status: DailyTrafficStatus;
    records: Record<string, DailyTraffic>;
    fetched: number;
  }>({ key: "", status: "loading", records: {}, fetched: 0 });
  const trigger = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => trigger.current(), []);
  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      if (!document.hidden) setClock(Date.now());
    }, 15000);
    return () => globalThis.clearInterval(timer);
  }, []);
  useEffect(() => {
    const timer = globalThis.setTimeout(
      () => setClock(Date.now()),
      Math.max(10, range.start + 86400000 - Date.now() + 10),
    );
    return () => globalThis.clearTimeout(timer);
  }, [range.start, range.zone]);
  useEffect(() => {
    let active = true;
    let pending: Promise<void> | null = null;
    if (!enabled || ids.length === 0) {
      trigger.current = async () => {};
      return;
    }
    const run = (): Promise<void> => {
      if (!active || document.hidden) return Promise.resolve();
      if (pending) return pending;
      const actualDay = trafficDayWindow(Date.now(), range.zone);
      if (actualDay.start !== range.start) {
        setClock(Date.now());
        return Promise.resolve();
      }
      setState((previous) => ({
        key,
        status: "loading",
        records: previous.key === key ? previous.records : {},
        fetched: previous.key === key ? previous.fetched : 0,
      }));
      const end = Date.now();
      pending = (async () => {
        try {
          const result = await call<object, QueryMetricsResponse>(
            "public:queryMetrics",
            {
              entity_ids: ids,
              metric_keys: ["traffic.up", "traffic.down"],
              start: new Date(range.start).toISOString(),
              end: new Date(end).toISOString(),
              aggregation: "sum",
              max_points: 288,
              fill_empty: true,
            },
            { timeout: 20000 },
          );
          if (!result || !Array.isArray(result.series))
            throw new Error("Invalid daily traffic response");
          if (active)
            setState({
              key,
              status: "ready",
              records: summarizeDailyTraffic(
                result.series,
                ids,
                range.start,
                end,
              ),
              fetched: Date.now(),
            });
        } catch {
          if (active)
            setState((previous) => ({
              key,
              status: "error",
              records: previous.key === key ? previous.records : {},
              fetched: previous.key === key ? previous.fetched : 0,
            }));
        } finally {
          pending = null;
        }
      })();
      return pending;
    };
    trigger.current = run;
    void run();
    const timer = globalThis.setInterval(() => {
      if (!document.hidden) void run();
    }, 60000);
    const visible = () => {
      if (!document.hidden) {
        const next = trafficDayWindow(Date.now(), range.zone);
        setClock(Date.now());
        if (next.start === range.start) void run();
      }
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      globalThis.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      if (trigger.current === run) trigger.current = async () => {};
    };
  }, [call, enabled, ids, key, range.start, range.zone]);
  const current = enabled && ids.length > 0 && state.key === key;
  return {
    records: current ? state.records : {},
    status:
      !enabled || ids.length === 0
        ? ("disabled" as const)
        : current
          ? state.status
          : ("loading" as const),
    fetched: current ? state.fetched : 0,
    zone: range.label,
    refresh,
  };
}
