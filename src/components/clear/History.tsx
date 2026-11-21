import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRPC2Call } from "@/contexts/RPC2Context";
import type { MetricSeries, QueryMetricsResponse } from "@/types/metrics";

type MetricKey = "cpu.usage" | "memory.used" | "net.in.rate" | "net.out.rate";
type FieldKey = "cpu" | "memory" | "netIn" | "netOut";
type MetricRow = { timestamp: number } & Record<FieldKey, number | null>;
type QueryStatus = "loading" | "ready" | "error";
type QueryState = {
  key: string;
  status: QueryStatus;
  series: MetricSeries[];
  fetchedAt: number;
};
type Unit = "percent" | "bytes" | "rate";
type ChartProps = {
  title: string;
  fields: { key: FieldKey; name: string; color: string }[];
  data: MetricRow[];
  unit: Unit;
  hours: number;
  en: boolean;
  status: QueryStatus;
};

const METRIC_KEYS: MetricKey[] = [
  "cpu.usage",
  "memory.used",
  "net.in.rate",
  "net.out.rate",
];
const FIELD_BY_METRIC: Record<MetricKey, FieldKey> = {
  "cpu.usage": "cpu",
  "memory.used": "memory",
  "net.in.rate": "netIn",
  "net.out.rate": "netOut",
};

function formatBytes(value: number, en: boolean, perSecond = false): string {
  if (!Number.isFinite(value)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = Math.abs(value);
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  const sign = value < 0 ? "−" : "";
  const suffix = perSecond ? (en ? "/s" : "/秒") : "";
  return sign + amount.toFixed(unit === 0 ? 0 : 1) + " " + units[unit] + suffix;
}

function formatValue(value: number, unit: Unit, en: boolean): string {
  if (!Number.isFinite(value)) return "—";
  if (unit === "percent") return value.toFixed(1) + "%";
  return formatBytes(value, en, unit === "rate");
}

function formatTimestamp(
  timestamp: number,
  en: boolean,
  hours: number,
): string {
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat(en ? "en-US" : "zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    ...(hours === 1 ? { second: "2-digit" as const } : {}),
  }).format(timestamp);
}

function makeRows(series: MetricSeries[]): MetricRow[] {
  const rows = new Map<number, MetricRow>();
  for (const item of series) {
    const field = FIELD_BY_METRIC[item.metric_key as MetricKey];
    if (!field || !Array.isArray(item.points)) continue;
    for (const point of item.points) {
      const timestamp = Date.parse(point.time);
      if (!Number.isFinite(timestamp)) continue;
      let row = rows.get(timestamp);
      if (!row) {
        row = {
          timestamp,
          cpu: null,
          memory: null,
          netIn: null,
          netOut: null,
        };
        rows.set(timestamp, row);
      }
      row[field] =
        typeof point.value === "number" &&
        Number.isFinite(point.value) &&
        point.value >= 0
          ? point.value
          : null;
    }
  }
  return [...rows.values()].sort(
    (left, right) => left.timestamp - right.timestamp,
  );
}

function HistoryChart({
  title,
  fields,
  data,
  unit,
  hours,
  en,
  status,
}: ChartProps) {
  const hasSamples = fields.some(({ key }) =>
    data.some((row) => row[key] !== null && Number.isFinite(row[key])),
  );
  const message =
    status === "loading"
      ? en
        ? "Loading samples…"
        : "正在读取采样…"
      : status === "error"
        ? en
          ? "History could not be loaded."
          : "历史数据读取失败。"
        : en
          ? "No samples in this period."
          : "此时段暂无采样数据。 ";

  return (
    <article className="lc-chart">
      <h3>{title}</h3>
      <div className="lc-chart-body">
        {status !== "ready" || !hasSamples ? (
          <div
            className="lc-empty"
            role={status === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            {message}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 10, right: 14, bottom: 4, left: 2 }}
            >
              <CartesianGrid
                stroke="#dce5ed"
                strokeDasharray="3 5"
                vertical={false}
              />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(value) =>
                  formatTimestamp(Number(value), en, hours)
                }
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                width={62}
                tickFormatter={(value) => formatValue(Number(value), unit, en)}
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                domain={["auto", "auto"]}
              />
              <Tooltip
                labelFormatter={(value) =>
                  formatTimestamp(Number(value), en, hours)
                }
                formatter={(value, name) => [
                  formatValue(Number(value), unit, en),
                  String(name),
                ]}
                contentStyle={{
                  border: "1px solid #dce5ed",
                  borderRadius: 10,
                  background: "var(--surface)",
                  color: "var(--ink)",
                  fontSize: 12,
                }}
              />
              {fields.map(({ key, name, color }) => (
                <Line
                  key={key}
                  name={name}
                  dataKey={key}
                  type="monotone"
                  stroke={color}
                  strokeWidth={2}
                  connectNulls={false}
                  dot={{ r: 2.5, strokeWidth: 0, fill: color }}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </article>
  );
}

export default function History({ uuid, en }: { uuid: string; en: boolean }) {
  const { call } = useRPC2Call();
  const [hours, setHours] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<QueryState>({
    key: "",
    status: "loading",
    series: [],
    fetchedAt: 0,
  });
  const requestId = useRef(0);
  const queryKey = uuid + ":" + hours + ":" + revision;

  useEffect(() => {
    const currentRequest = ++requestId.current;
    let active = true;
    setResult({ key: queryKey, status: "loading", series: [], fetchedAt: 0 });

    void call<
      {
        entity_id: string;
        metric_keys: MetricKey[];
        hours: number;
        max_points: number;
        aggregation: "avg";
        fill_empty: true;
      },
      QueryMetricsResponse
    >(
      "public:queryMetrics",
      {
        entity_id: uuid,
        metric_keys: METRIC_KEYS,
        hours,
        max_points: 180,
        aggregation: "avg",
        fill_empty: true,
      },
      { timeout: 30000 },
    )
      .then((response) => {
        if (!response || !Array.isArray(response.series)) {
          throw new Error("Invalid metrics response");
        }
        if (active && requestId.current === currentRequest) {
          setResult({
            key: queryKey,
            status: "ready",
            series: response.series.filter(
              (item) =>
                item.entity_id === uuid &&
                METRIC_KEYS.includes(item.metric_key as MetricKey) &&
                Array.isArray(item.points),
            ),
            fetchedAt: Date.now(),
          });
        }
      })
      .catch(() => {
        if (active && requestId.current === currentRequest) {
          setResult({
            key: queryKey,
            status: "error",
            series: [],
            fetchedAt: 0,
          });
        }
      });

    return () => {
      active = false;
      if (requestId.current === currentRequest) requestId.current += 1;
    };
  }, [call, hours, queryKey, uuid]);

  const visibleResult = result.key === queryKey ? result : null;
  const status: QueryStatus = visibleResult?.status ?? "loading";
  const data = useMemo(
    () => makeRows(visibleResult?.series ?? []),
    [visibleResult],
  );
  const fetchedAt = visibleResult?.fetchedAt ?? 0;
  const title = en ? "Resource history" : "历史资源趋势";

  return (
    <section className="lc-section lc-history" aria-label={title}>
      <header className="lc-section-head">
        <div>
          <h2>{title}</h2>
          <p>
            {en
              ? "Public metric samples · gaps remain visible"
              : "公开历史采样 · 缺失区间保留为空"}
          </p>
        </div>
        <div
          className="lc-segments"
          role="group"
          aria-label={en ? "Time range" : "查询时段"}
        >
          {[1, 6, 24].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={hours === value}
              onClick={() => setHours(value)}
            >
              {value}h
            </button>
          ))}
          <button
            type="button"
            aria-label={en ? "Refresh history" : "刷新历史"}
            title={en ? "Refresh history" : "刷新历史"}
            onClick={() => setRevision((current) => current + 1)}
          >
            <span aria-hidden="true">↻</span>
            {en ? "Refresh" : "刷新"}
          </button>
        </div>
      </header>

      <div className="lc-history-grid">
        <HistoryChart
          title={en ? "CPU usage" : "CPU 使用率"}
          fields={[{ key: "cpu", name: "CPU", color: "#3486c5" }]}
          data={data}
          unit="percent"
          hours={hours}
          en={en}
          status={status}
        />
        <HistoryChart
          title={en ? "Memory used" : "内存占用"}
          fields={[
            { key: "memory", name: en ? "Memory" : "内存", color: "#6685b2" },
          ]}
          data={data}
          unit="bytes"
          hours={hours}
          en={en}
          status={status}
        />
        <HistoryChart
          title={en ? "Network throughput" : "网络吞吐"}
          fields={[
            { key: "netIn", name: en ? "Download" : "下行", color: "#398e9b" },
            { key: "netOut", name: en ? "Upload" : "上行", color: "#8b78b5" },
          ]}
          data={data}
          unit="rate"
          hours={hours}
          en={en}
          status={status}
        />
      </div>

      <p className="lc-note">
        {fetchedAt
          ? (en ? "Updated " : "更新于 ") +
            new Intl.DateTimeFormat(en ? "en-US" : "zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }).format(fetchedAt) +
            " · "
          : ""}
        {en
          ? "Historical samples are a snapshot and do not indicate availability."
          : "历史数据为查询快照，不代表节点可用率。"}
      </p>
    </section>
  );
}
