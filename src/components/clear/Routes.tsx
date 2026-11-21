import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  MapPin,
  Gauge,
} from "lucide-react";
import { useRPC2Call } from "@/contexts/RPC2Context";
import type {
  PublicPingTask,
  QueryMetricsResponse,
  MetricPoint,
} from "@/types/metrics";
import { identifyCarrier } from "../linen/linenCarrierLatency";
function probeCity(name: string, en: boolean) {
  return (
    name
      .replace(
        /电信|联通|移动|telecom|unicom|mobile|ipv[46]|v[46]|tcp|icmp|ping/gi,
        "",
      )
      .replace(/[()（）_-]/g, " ")
      .trim() || (en ? "Default" : "默认")
  );
}
export default function Routes({
  uuid,
  en,
  now,
}: {
  uuid: string;
  en: boolean;
  now: number;
}) {
  const { call } = useRPC2Call();
  const [revision, setRevision] = useState(0);
  const [carrier, setCarrier] = useState("mobile");
  const [selected, setSelected] = useState("");
  const [state, setState] = useState<{
    uuid: string;
    tasks: PublicPingTask[];
    points: Record<string, MetricPoint[]>;
    status: string;
  }>({ uuid: "", tasks: [], points: {}, status: "loading" });
  useEffect(() => {
    let active = true;
    let pending = false;
    async function run() {
      if (!active || pending || document.hidden) return;
      pending = true;
      setState((s) => ({ ...s, status: "loading" }));
      try {
        const tasks = await call<unknown, PublicPingTask[]>(
          "public:getPublicPingTasks",
          undefined,
          { timeout: 12000 },
        );
        if (!Array.isArray(tasks)) throw Error();
        const applicable = tasks.filter(
          (t) =>
            t.id > 0 && (!Array.isArray(t.clients) || t.clients.includes(uuid)),
        );
        if (!applicable.length) {
          if (active)
            setState({ uuid, tasks: [], points: {}, status: "ready" });
          return;
        }
        const result = await call<object, QueryMetricsResponse>(
          "public:queryMetrics",
          {
            entity_ids: [uuid],
            metric_keys: ["ping.latency_ms"],
            hours: 1,
            max_points: 240,
            aggregation: "last",
            fill_empty: false,
          },
          { timeout: 15000 },
        );
        if (!Array.isArray(result?.series)) throw Error();
        const points: Record<string, MetricPoint[]> = {};
        for (const s of result.series) {
          if (
            s.entity_id !== uuid ||
            s.metric_key !== "ping.latency_ms" ||
            !s.tags?.task_id
          )
            continue;
          (points[s.tags.task_id] ??= []).push(...s.points);
        }
        if (active)
          setState({ uuid, tasks: applicable, points, status: "ready" });
      } catch {
        if (active) setState({ uuid, tasks: [], points: {}, status: "error" });
      } finally {
        pending = false;
      }
    }
    void run();
    const t = window.setInterval(run, 60000);
    return () => {
      active = false;
      window.clearInterval(t);
    };
  }, [call, uuid, revision]);
  const data = state.uuid === uuid ? state : null;
  const tasks = useMemo(
    () => data?.tasks.filter((t) => identifyCarrier(t.name) === carrier) ?? [],
    [data, carrier],
  );
  const cities = useMemo(
    () => [...new Set(tasks.map((t) => probeCity(t.name, en)))],
    [tasks, en],
  );
  const city = cities.includes(selected) ? selected : (cities[0] ?? "");
  const family = (t: PublicPingTask) =>
    /ipv6|(?:^|[^a-z0-9])v6/i.test(t.name) ? 6 : 4;
  const matching = tasks.filter((t) => probeCity(t.name, en) === city);
  return (
    <section
      className="lc-section lc-routes"
      aria-label={en ? "Route observations" : "线路观测"}
    >
      <div className="lc-section-head">
        <h2>{en ? "Route observations" : "线路观测"}</h2>
        <select
          aria-label={en ? "Carrier" : "运营商"}
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
        >
          <option value="telecom">{en ? "Telecom" : "电信"}</option>
          <option value="unicom">{en ? "Unicom" : "联通"}</option>
          <option value="mobile">{en ? "Mobile" : "移动"}</option>
        </select>
      </div>
      {[4, 6].map((ip) => {
        const task = matching.find((t) => family(t) === ip);
        const points = task ? (data?.points[String(task.id)] ?? []) : [];
        const byTime = new Map<number, number | null>();
        for (const p of points) {
          const time = Date.parse(p.time);
          if (Number.isFinite(time) && time <= now + 30000)
            byTime.set(
              time,
              typeof p.value === "number" && Number.isFinite(p.value)
                ? p.value
                : null,
            );
        }
        const ordered = [...byTime].sort((a, b) => a[0] - b[0]).slice(-24);
        const valid = ordered.filter((x) => x[1] !== null);
        const loss = valid.length
          ? (valid.filter((x) => x[1]! < 0).length / valid.length) * 100
          : null;
        const last = ordered.at(-1);
        const stale = last
          ? now - last[0] > Math.max(180000, (task?.interval ?? 60) * 3000)
          : false;
        const lights = [
          ...Array.from({ length: 24 - ordered.length }, () => null),
          ...ordered.map((x) => x[1]),
        ];
        return (
          <div className="lc-route-row" key={ip}>
            <strong>
              {carrier === "mobile"
                ? en
                  ? "Mobile"
                  : "移动"
                : carrier === "telecom"
                  ? en
                    ? "Telecom"
                    : "电信"
                  : en
                    ? "Unicom"
                    : "联通"}
              {ip === 6 ? " V6" : ""}
            </strong>
            <div
              className="lc-route-directions"
              title={en ? "Route data unavailable" : "暂无公开路由数据"}
            >
              <span className="lc-down">
                <ArrowRight size={12} />
                {en ? "Out" : "去"} —
              </span>
              <span className="lc-amber">
                <ArrowLeft size={12} />
                {en ? "Back" : "回"} —
              </span>
            </div>
            <div className="lc-probe">
              <div>
                <strong>
                  {stale
                    ? en
                      ? "Stale"
                      : "过期"
                    : last?.[1] == null
                      ? "—"
                      : last[1] < 0
                        ? en
                          ? "Timeout"
                          : "超时"
                        : last[1].toFixed(2) + " ms"}
                </strong>
                <small>{loss === null ? "—" : loss.toFixed(1) + "%"}</small>
              </div>
              <div
                className="lc-lights"
                aria-label={en ? "Recent 24 sample slots" : "最近24个采样位置"}
              >
                {lights.map((v, i) => (
                  <i
                    key={i}
                    data-state={
                      v === null ? "missing" : v < 0 ? "loss" : "good"
                    }
                  />
                ))}
              </div>
            </div>
            <div
              className="lc-route-speed"
              title={
                en
                  ? "Public bandwidth tests unavailable"
                  : "暂无公开带宽测速数据"
              }
            >
              <span className="lc-down">
                <ArrowDown size={12} />— <small>Mbps</small>
              </span>
              <span className="lc-up">
                <ArrowUp size={12} />— <small>Mbps</small>
              </span>
            </div>
          </div>
        );
      })}
      <div className="lc-route-actions">
        <label>
          <MapPin size={13} />
          <select
            aria-label={en ? "Probe location" : "探测地区"}
            value={city}
            disabled={!cities.length}
            onChange={(e) => setSelected(e.target.value)}
          >
            {cities.length ? (
              cities.map((c) => <option key={c}>{c}</option>)
            ) : (
              <option>{en ? "No tasks" : "暂无任务"}</option>
            )}
          </select>
        </label>
        <button
          disabled={data?.status === "loading"}
          onClick={() => setRevision((x) => x + 1)}
        >
          <RefreshCw size={13} />
          {en ? "Refresh observations" : "刷新线路记录"}
        </button>
        <button
          disabled
          title={
            en
              ? "Backend has no public bandwidth test endpoint"
              : "后端未提供公开带宽测速接口"
          }
        >
          <Gauge size={13} />
          {en ? "Speed test" : "测速"}
        </button>
      </div>
      <p className="lc-note">
        {data?.status === "error"
          ? en
            ? "Could not load public probe records."
            : "公开探测记录读取失败。"
          : data?.status === "loading"
            ? en
              ? "Reading public probe records…"
              : "正在读取探测记录…"
            : en
              ? "Observed loss uses available samples; gray bars mean missing data. Routes and bandwidth tests are not available."
              : "丢包率仅按已有样本计算，灰条表示缺测；暂无公开路由与带宽测速数据。"}
      </p>
    </section>
  );
}
