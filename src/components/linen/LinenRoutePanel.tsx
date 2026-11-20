import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Gauge,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { useRPC2Call } from "@/contexts/RPC2Context";
import type {
  MetricPoint,
  PublicPingTask,
  QueryMetricsResponse,
} from "@/types/metrics";
import { identifyCarrier } from "./linenCarrierLatency";
import "./LinenRoutePanel.css";

const CITIES = [
  ["上海", "Shanghai"],
  ["北京", "Beijing"],
  ["广州", "Guangzhou"],
  ["深圳", "Shenzhen"],
  ["杭州", "Hangzhou"],
  ["南京", "Nanjing"],
  ["成都", "Chengdu"],
  ["重庆", "Chongqing"],
  ["武汉", "Wuhan"],
  ["天津", "Tianjin"],
  ["香港", "Hong Kong"],
  ["台北", "Taipei"],
] as const;
const FAMILIES = ["ipv4", "ipv6"] as const;
const LIGHT_COUNT = 24;
type Family = (typeof FAMILIES)[number];
type Light = "good" | "loss" | "missing";
type Probe = {
  task: PublicPingTask;
  family: Family;
  city: string;
  latest: number | null;
  expiresAt: number;
  loss: number | null;
  lights: Light[];
};

type ProbeState = {
  uuid: string;
  revision: number;
  probes: Probe[];
  failed: boolean;
};

function taskCity(name: string) {
  return (
    CITIES.find(
      ([chinese, english]) =>
        name.includes(chinese) ||
        new RegExp(
          "(?:^|[^a-z])" + english.replace(" ", "[ _-]*") + "(?:[^a-z]|$)",
          "i",
        ).test(name),
    )?.[0] ?? ""
  );
}

function taskFamily(name: string): Family {
  return /(?:^|[^a-z0-9])(?:ipv6|v6)(?![a-z0-9])/i.test(name) ? "ipv6" : "ipv4";
}

function readProbe(
  task: PublicPingTask,
  points: MetricPoint[],
  now: number,
): Probe {
  const byTime = new Map<number, number | null>();
  for (const point of points) {
    const time = Date.parse(point.time);
    if (!Number.isFinite(time) || time > now + 30_000) continue;
    const value =
      typeof point.value === "number" && Number.isFinite(point.value)
        ? point.value
        : null;
    if (value !== null || !byTime.has(time)) byTime.set(time, value);
  }
  const samples = [...byTime]
    .sort(([left], [right]) => left - right)
    .slice(-LIGHT_COUNT);
  const lights: Light[] = samples.map(([, value]) =>
    value === null ? "missing" : value < 0 ? "loss" : "good",
  );
  const observed = lights.filter((light) => light !== "missing").length;
  const latest = samples.at(-1);
  const freshnessMs = Math.max(180_000, (task.interval ?? 0) * 3000);
  return {
    task,
    city: taskCity(task.name),
    family: taskFamily(task.name),
    latest: latest?.[1] ?? null,
    expiresAt: latest ? latest[0] + freshnessMs : 0,
    loss: observed
      ? (lights.filter((light) => light === "loss").length / observed) * 100
      : null,
    lights: [
      ...Array.from<unknown, Light>(
        { length: LIGHT_COUNT - lights.length },
        () => "missing",
      ),
      ...lights,
    ],
  };
}

function RouteRow({
  family,
  probe,
  pending,
  zh,
  now,
}: {
  family: Family;
  probe?: Probe;
  pending: boolean;
  zh: boolean;
  now: number;
}) {
  const stale = probe?.latest != null && now > probe.expiresAt;
  const latest = stale ? null : (probe?.latest ?? null);
  const latency =
    latest === null
      ? "—"
      : latest < 0
        ? zh
          ? "超时"
          : "Timed out"
        : latest.toFixed(2) + " ms";
  const loss = probe?.loss ?? null;
  const lights =
    probe?.lights ??
    Array.from<unknown, Light>({ length: LIGHT_COUNT }, () => "missing");
  const routeMissing = zh ? "暂无公开路由数据" : "No public route data";
  const speedMissing = zh ? "暂无公开测速数据" : "No public speed-test data";
  const resultHint = pending
    ? zh
      ? "正在读取公开探测记录"
      : "Reading public probe history"
    : stale
      ? zh
        ? "延迟样本已过期"
        : "Latency sample expired"
      : (probe?.task.name ??
        (zh ? "暂无公开探测记录" : "No public probe history"));
  const lightSummary = zh
    ? "最近 24 个公开采样位置：成功 " +
      lights.filter((light) => light === "good").length +
      "，超时 " +
      lights.filter((light) => light === "loss").length +
      "，缺测 " +
      lights.filter((light) => light === "missing").length
    : "Last 24 public sample slots: " +
      lights.filter((light) => light === "good").length +
      " successful, " +
      lights.filter((light) => light === "loss").length +
      " timed out, " +
      lights.filter((light) => light === "missing").length +
      " missing";

  return (
    <div className="linen-route-row" data-family={family}>
      <strong className="linen-route-name">
        {zh ? "移动" : "Mobile"}
        {family === "ipv6" && " V6"}
      </strong>
      <div className="linen-route-pair" title={routeMissing}>
        <span className="linen-route-blue">
          <ArrowRight aria-hidden="true" /> <span>{zh ? "去" : "Out"} —</span>
        </span>
        <span className="linen-route-orange">
          <ArrowLeft aria-hidden="true" /> <span>{zh ? "回" : "Back"} —</span>
        </span>
      </div>
      <div className="linen-route-result" title={resultHint}>
        <div className="linen-route-values">
          <strong>{latency}</strong>
          <span
            title={
              zh
                ? "最近 24 个采样位置中已有记录的丢包率"
                : "Packet loss among observed samples in the last 24 slots"
            }
          >
            {loss === null ? "—" : loss.toFixed(1) + "%"}
          </span>
        </div>
        <span
          className="linen-route-lights"
          role="img"
          aria-label={lightSummary}
        >
          {lights.map((light, index) => (
            <i key={index} data-state={light} />
          ))}
        </span>
      </div>
      <div className="linen-route-pair linen-route-speeds" title={speedMissing}>
        <span
          className="linen-route-blue"
          aria-label={zh ? "下载测速缺失" : "Download speed unavailable"}
        >
          <ArrowDown aria-hidden="true" />{" "}
          <span>
            — <small>Mbps</small>
          </span>
        </span>
        <span
          className="linen-route-green"
          aria-label={zh ? "上传测速缺失" : "Upload speed unavailable"}
        >
          <ArrowUp aria-hidden="true" />{" "}
          <span>
            — <small>Mbps</small>
          </span>
        </span>
      </div>
    </div>
  );
}

export function LinenRoutePanel({
  uuid,
  zh,
  now,
}: {
  uuid: string;
  zh: boolean;
  now: number;
}) {
  const { call } = useRPC2Call();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ProbeState | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const snapshot = state?.uuid === uuid ? state : null;
  const busy = Boolean(uuid) && snapshot?.revision !== revision;

  useEffect(() => {
    if (!uuid) return;
    let active = true;
    async function readHistory() {
      try {
        const tasks = await call<unknown, PublicPingTask[]>(
          "public:getPublicPingTasks",
          undefined,
          { timeout: 12000 },
        );
        if (!active) return;
        if (!Array.isArray(tasks))
          throw new Error("Invalid public ping task list");
        const applicable = tasks.filter(
          (task) =>
            task &&
            Number.isInteger(task.id) &&
            task.id > 0 &&
            identifyCarrier(task.name) === "mobile" &&
            (!Array.isArray(task.clients) || task.clients.includes(uuid)),
        );
        if (!applicable.length) {
          setState({ uuid, revision, probes: [], failed: false });
          return;
        }
        const now = Date.now();
        const result = await call<object, QueryMetricsResponse>(
          "public:queryMetrics",
          {
            entity_ids: [uuid],
            metric_keys: ["ping.latency_ms"],
            start: new Date(now - 3_600_000).toISOString(),
            end: new Date(now).toISOString(),
            max_points: 720,
            aggregation: "last",
            // Komari masks negative ping timeouts as null in filled series.
            fill_empty: false,
          },
          { timeout: 12000 },
        );
        if (!active) return;
        if (!Array.isArray(result?.series))
          throw new Error("Invalid public ping series");
        const byTask = new Map<string, MetricPoint[]>();
        for (const series of result.series) {
          if (
            series.entity_id !== uuid ||
            series.metric_key !== "ping.latency_ms"
          )
            continue;
          const taskId = series.tags?.task_id;
          if (taskId == null || !Array.isArray(series.points)) continue;
          const key = String(taskId);
          const points = byTask.get(key) ?? [];
          for (const point of series.points) points.push(point);
          byTask.set(key, points);
        }
        const probes = applicable
          .filter(
            (task) =>
              task.clients?.includes(uuid) || byTask.has(String(task.id)),
          )
          .map((task) =>
            readProbe(task, byTask.get(String(task.id)) ?? [], now),
          );
        setState({ uuid, revision, probes, failed: false });
      } catch {
        if (active) setState({ uuid, revision, probes: [], failed: true });
      }
    }
    void readHistory();
    return () => {
      active = false;
    };
  }, [call, uuid, revision]);

  const probes = snapshot?.probes ?? [];
  const cities = [...new Set(probes.map((probe) => probe.city))].sort(
    (left, right) =>
      Number(right === "上海") - Number(left === "上海") ||
      Number(!left) - Number(!right) ||
      left.localeCompare(right, "zh"),
  );
  const city =
    selectedCity !== null && cities.includes(selectedCity)
      ? selectedCity
      : (cities[0] ?? "");
  const selectProbe = (family: Family) =>
    probes
      .filter((probe) => probe.city === city && probe.family === family)
      .sort(
        (left, right) =>
          Number(right.loss !== null) - Number(left.loss !== null) ||
          (left.task.weight ?? 0) - (right.task.weight ?? 0) ||
          left.task.id - right.task.id,
      )[0];
  const status = busy
    ? zh
      ? "正在刷新公开探测记录…"
      : "Refreshing public probe history…"
    : snapshot?.failed
      ? zh
        ? "公开探测记录读取失败"
        : "Could not read public probe history"
      : probes.some((probe) => probe.city === city && probe.loss !== null)
        ? zh
          ? "路由与测速数据暂无"
          : "Route and speed-test data unavailable"
        : zh
          ? "暂无公开探测记录"
          : "No public probe history";
  const cityLabel = (value: string) =>
    value
      ? zh
        ? value
        : (CITIES.find(([chinese]) => chinese === value)?.[1] ?? value)
      : zh
        ? "未标注城市"
        : "City not specified";
  const speedMissing = zh ? "暂无公开测速数据" : "No public speed-test data";
  return (
    <section
      className="linen-route-panel"
      aria-label={zh ? "线路状态" : "Route status"}
    >
      <div className="linen-route-rows" aria-busy={busy}>
        {FAMILIES.map((family) => (
          <RouteRow
            key={family}
            family={family}
            probe={selectProbe(family)}
            pending={busy}
            zh={zh}
            now={now}
          />
        ))}
      </div>
      <div className="linen-route-actions">
        <div className="linen-route-city">
          <MapPin aria-hidden="true" />
          <select
            aria-label={zh ? "探测城市" : "Probe city"}
            value={city}
            disabled={!cities.length}
            onChange={(event) => setSelectedCity(event.target.value)}
          >
            {cities.length ? (
              cities.map((item) => (
                <option key={item} value={item}>
                  {cityLabel(item)}
                </option>
              ))
            ) : (
              <option value="">{zh ? "城市暂无" : "No cities"}</option>
            )}
          </select>
          <ChevronDown aria-hidden="true" />
        </div>
        <button
          type="button"
          className="linen-route-detect"
          disabled={!uuid || busy}
          onClick={() => setRevision((current) => current + 1)}
          title={zh ? "刷新公开探测记录" : "Refresh public probe history"}
        >
          <RefreshCw aria-hidden="true" /> {zh ? "检测线路" : "Check routes"}
        </button>
        <button type="button" disabled title={speedMissing}>
          <Gauge aria-hidden="true" /> {zh ? "测速" : "Speed test"}
        </button>
        <small className="linen-route-status" role="status">
          {status}
        </small>
      </div>
    </section>
  );
}
