import { useEffect, useMemo, useState } from "react";
import { useRPC2Call } from "@/contexts/RPC2Context";
import type { PublicPingTask, QueryMetricsResponse } from "@/types/metrics";
import {
  CARRIER_LABELS,
  carrierTaskIds,
  deriveCarrierLatency,
  type CarrierLatency,
} from "./linenCarrierLatency";
export function useCarrierLatency(
  ids: string[],
  enabled: boolean,
  settings: unknown,
) {
  const { call } = useRPC2Call();
  const idsKey = JSON.stringify([...new Set(ids)].sort());
  const nodes = useMemo(() => JSON.parse(idsKey) as string[], [idsKey]);
  const mappingKey = JSON.stringify(carrierTaskIds(settings));
  const mapping = useMemo(
    () => ({ carrierLatencyTaskIds: JSON.parse(mappingKey) }),
    [mappingKey],
  );
  const key = idsKey + mappingKey;
  const [state, setState] = useState<{
    key: string;
    records: Record<string, CarrierLatency[]>;
    error: boolean;
  }>({ key: "", records: {}, error: false });
  useEffect(() => {
    if (!enabled || !nodes.length) return;
    let active = true,
      pending = false;
    const run = async () => {
      if (!active || pending || document.hidden) return;
      pending = true;
      try {
        const tasks = await call<unknown, PublicPingTask[]>(
          "public:getPublicPingTasks",
          undefined,
          { timeout: 12000 },
        );
        if (!active) return;
        if (!Array.isArray(tasks)) throw new Error("Invalid ping task list");
        if (!Object.keys(carrierTaskIds(mapping, tasks)).length) {
          setState({
            key,
            records: deriveCarrierLatency(
              tasks,
              [],
              nodes,
              Date.now(),
              180000,
              mapping,
            ),
            error: false,
          });
          return;
        }
        const end = Date.now();
        const result = await call<object, QueryMetricsResponse>(
          "public:queryMetrics",
          {
            entity_ids: nodes,
            metric_keys: ["ping.latency_ms"],
            start: new Date(end - 15 * 60000).toISOString(),
            end: new Date(end).toISOString(),
            aggregation: "last",
            fill_empty: false,
            max_points: 32,
          },
          { timeout: 12000 },
        );
        if (!Array.isArray(result?.series))
          throw new Error("Invalid ping series");
        if (active)
          setState({
            key,
            records: deriveCarrierLatency(
              tasks,
              result.series,
              nodes,
              Date.now(),
              180000,
              mapping,
            ),
            error: false,
          });
      } catch {
        if (active) setState({ key, records: {}, error: true });
      } finally {
        pending = false;
      }
    };
    void run();
    const timer = window.setInterval(run, 60000);
    document.addEventListener("visibilitychange", run);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
    };
  }, [call, enabled, key, mapping, nodes]);
  return enabled && state.key === key ? state.records : {};
}
export default function LinenCarrierLatency({
  nodeId,
  en,
  latency,
}: {
  nodeId: string;
  en: boolean;
  latency: ReturnType<typeof useCarrierLatency>;
}) {
  const rows = latency[nodeId];
  if (!rows?.length)
    return (
      <div
        className="linen-node-extra linen-carrier linen-carrier--loading"
        aria-label={en ? "Carrier latency" : "三网延迟"}
      >
        {en ? "Carrier latency loading…" : "三网延迟采样中…"}
      </div>
    );
  const message = {
    unconfigured: en ? "Not configured" : "未配置",
    missing: en ? "No data" : "暂无数据",
    timeout: en ? "Timed out" : "超时",
    stale: en ? "Stale" : "数据过期",
  };
  return (
    <div
      className="linen-node-extra linen-carrier"
      aria-label={en ? "Carrier latency" : "三网延迟"}
    >
      {rows.map((row) => (
        <span key={row.carrier} data-state={row.state}>
          <span>{CARRIER_LABELS[row.carrier][en ? "en" : "zh"]}</span>
          <strong>
            {row.state === "fresh"
              ? Math.round(row.value!) + " ms"
              : message[row.state]}
          </strong>
        </span>
      ))}
    </div>
  );
}
