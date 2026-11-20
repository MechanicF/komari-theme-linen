import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  ArrowUpRight,
  Cpu,
  Ellipsis,
  Info,
  RefreshCw,
  Server,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Flag from "@/components/Flag";
import { useLiveData } from "@/contexts/LiveDataContext";
import { useNodeList } from "@/contexts/NodeListContext";
import { usePublicInfo } from "@/contexts/PublicInfoContext";
import { useRPC2Call } from "@/contexts/RPC2Context";
import type { MetricSeries, QueryMetricsResponse } from "@/types/metrics";
import { formatBytes } from "@/utils/unitHelper";
import { getNodeExpiry } from "./linenExpiry";
import { readDisplayOptions } from "./linenDisplay";
import { trafficQuota } from "./linenTraffic";
import { LinenRoutePanel } from "./LinenRoutePanel";
import "./LinenInstance.css";

const METRICS = [
  "cpu.usage",
  "memory.used",
  "disk.used",
  "net.in.rate",
  "net.out.rate",
];
const valid = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const bytes = (value?: number) => (valid(value) ? formatBytes(value) : "—");
const speed = (value?: number) =>
  valid(value) ? formatBytes(value) + "/s" : "—";
const percent = (used?: number, total?: number) =>
  valid(used) && valid(total) && total > 0 ? (used / total) * 100 : null;
const pct = (value: number | null) =>
  value === null ? "—" : value.toFixed(1) + "%";
function timestamp(value: unknown): number {
  if (
    typeof value === "number" ||
    (typeof value === "string" && /^\d+(\.\d+)?$/.test(value))
  ) {
    const number = Number(value);
    return number > 0 ? (number < 1e12 ? number * 1000 : number) : NaN;
  }
  return typeof value === "string" && value ? Date.parse(value) : NaN;
}
const clock = (value: unknown) => {
  const time = timestamp(value);
  return Number.isFinite(time)
    ? new Date(time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";
};
const fullDate = (value: unknown) => {
  const time = timestamp(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : "—";
};
function duration(value: number | undefined, en: boolean) {
  if (!valid(value)) return "—";
  const days = Math.floor(value / 86400),
    hours = Math.floor((value % 86400) / 3600),
    minutes = Math.floor((value % 3600) / 60);
  return en
    ? days
      ? days + "d " + hours + "h"
      : hours
        ? hours + "h " + minutes + "m"
        : minutes + "m"
    : days
      ? days + "天" + hours + "小时"
      : hours
        ? hours + "小时 " + minutes + "分"
        : minutes + "分钟";
}

type ChartRow = { time: number; [key: string]: number | null };
function historyRows(series: MetricSeries[], keys: string[]) {
  const rows = new Map<number, ChartRow>();
  const selected = series.filter((item) => keys.includes(item.metric_key));
  for (const item of selected) {
    let previous = 0;
    const points = [...item.points].sort(
      (a, b) => timestamp(a.time) - timestamp(b.time),
    );
    const gap = Math.max(60_000, (item.interval_seconds || 60) * 3000);
    for (const point of points) {
      const time = timestamp(point.time);
      if (!Number.isFinite(time)) continue;
      if (previous && time - previous > gap) {
        const middle = previous + 1;
        if (!rows.has(middle)) rows.set(middle, { time: middle });
        rows.get(middle)![item.metric_key] = null;
      }
      if (!rows.has(time)) rows.set(time, { time });
      rows.get(time)![item.metric_key] = valid(point.value)
        ? point.value
        : null;
      previous = time;
    }
  }
  return [...rows.values()]
    .sort((a, b) => a.time - b.time)
    .map((row) => {
      for (const key of keys) if (row[key] === undefined) row[key] = null;
      return row;
    });
}
function Stat({
  label,
  value,
  ratio,
  tone,
  title,
}: {
  label: string;
  value: string;
  ratio: number | null;
  tone: string;
  title?: string;
}) {
  return (
    <div className={"linen-node-resource is-" + tone} title={title}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="linen-node-meter" aria-hidden="true">
        <span
          className={ratio !== null && ratio >= 90 ? "is-high" : ""}
          style={{ width: Math.min(100, Math.max(0, ratio ?? 0)) + "%" }}
        />
      </div>
    </div>
  );
}
function Facts({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="linen-instance-panel">
      <h2>
        {icon}
        {title}
      </h2>
      <dl className="linen-instance-facts">{children}</dl>
    </section>
  );
}
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children || "—"}</dd>
    </div>
  );
}
function HistoryChart({
  title,
  keys,
  labels,
  series,
  unit,
  en,
  loading,
  failed,
}: {
  title: string;
  keys: string[];
  labels: string[];
  series: MetricSeries[];
  unit: "percent" | "bytes" | "speed";
  en: boolean;
  loading: boolean;
  failed: boolean;
}) {
  const data = useMemo(() => historyRows(series, keys), [series, keys]);
  const samples = data.filter((row) =>
    keys.some((key) => valid(row[key])),
  ).length;
  const format = (value: number) =>
    unit === "percent"
      ? value.toFixed(1) + "%"
      : unit === "speed"
        ? speed(value)
        : bytes(value);
  return (
    <article className="linen-instance-chart">
      <div className="linen-instance-chart__heading">
        <h3>{title}</h3>
        <span>
          {unit === "percent" ? "%" : unit === "speed" ? "B/s" : "Bytes"}
        </span>
      </div>
      <div className="linen-instance-chart__legend">
        {labels.map((label, index) => (
          <span key={label}>
            <i style={{ background: index ? "var(--warm)" : "var(--sage)" }} />
            {label}
          </span>
        ))}
        <small>
          {en ? samples + " sampled times" : samples + " 个采样时刻"}
        </small>
      </div>
      {loading || failed || samples === 0 ? (
        <div className="linen-instance-chart__empty">
          <Activity size={24} />
          <p>
            {loading
              ? en
                ? "Loading history…"
                : "正在读取历史…"
              : failed
                ? en
                  ? "History could not be loaded"
                  : "历史数据读取失败"
                : en
                  ? "No samples in this period"
                  : "所选时段暂无样本"}
          </p>
        </div>
      ) : (
        <div
          className="linen-instance-chart__plot"
          role="img"
          aria-label={title + (en ? ": historical samples" : "：历史样本")}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 10, right: 12, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                stroke="var(--line)"
                strokeDasharray="3 4"
                vertical={false}
              />
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(value) =>
                  new Date(value).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }
                minTickGap={45}
                tick={{ fill: "var(--muted)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                width={66}
                domain={unit === "percent" ? [0, 100] : [0, "auto"]}
                tickFormatter={format}
                tick={{ fill: "var(--muted)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                labelFormatter={(value) =>
                  new Date(Number(value)).toLocaleString()
                }
                formatter={(value: number, name: string) => [
                  format(value),
                  labels[keys.indexOf(name)] || name,
                ]}
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  color: "var(--ink)",
                  fontSize: 12,
                }}
              />
              {keys.map((key, index) => (
                <Line
                  key={key}
                  dataKey={key}
                  type="linear"
                  stroke={index ? "var(--warm)" : "var(--sage)"}
                  strokeWidth={1.8}
                  dot={{ r: 2, strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}
function History({ uuid, en }: { uuid: string; en: boolean }) {
  const { call } = useRPC2Call();
  const [hours, setHours] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    series: MetricSeries[];
    status: "loading" | "ready" | "error";
    fetched: number;
  }>({ key: "", series: [], status: "loading", fetched: 0 });
  const key = uuid + ":" + hours + ":" + revision;
  useEffect(() => {
    let active = true;
    setResult({ key, series: [], status: "loading", fetched: 0 });
    call<object, QueryMetricsResponse>(
      "public:queryMetrics",
      {
        entity_id: uuid,
        metric_keys: METRICS,
        hours,
        max_points: 180,
        aggregation: "avg",
        fill_empty: true,
      },
      { timeout: 30000 },
    )
      .then((response) => {
        if (!response || !Array.isArray(response.series))
          throw new Error("Invalid metrics response");
        if (active)
          setResult({
            key,
            series: response.series.filter(
              (item) =>
                item.entity_id === uuid &&
                METRICS.includes(item.metric_key) &&
                Array.isArray(item.points),
            ),
            status: "ready",
            fetched: Date.now(),
          });
      })
      .catch(() => {
        if (active) setResult({ key, series: [], status: "error", fetched: 0 });
      });
    return () => {
      active = false;
    };
  }, [call, hours, key, uuid]);
  const loading = result.key !== key || result.status === "loading";
  const series = result.key === key ? result.series : [];
  return (
    <section
      className="linen-instance-history"
      aria-labelledby="linen-history-title"
    >
      <div className="linen-instance-section-heading">
        <div>
          <span className="linen-instance-eyebrow">PERFORMANCE HISTORY</span>
          <h2 id="linen-history-title">
            {en ? "Resource history" : "历史资源趋势"}
          </h2>
          <p>
            {en
              ? "Public historical samples · averaged by the server · gaps are left empty"
              : "公开历史样本 · 服务端平均聚合 · 缺失区间保留为空"}
          </p>
        </div>
        <div className="linen-instance-history__controls">
          <div
            className="linen-instance-period"
            aria-label={en ? "History range" : "历史时段"}
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
          </div>
          <button
            className="linen-instance-icon-button"
            disabled={loading}
            type="button"
            aria-label={en ? "Refresh history" : "刷新历史"}
            title={en ? "Refresh history" : "刷新历史"}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>
      <div className="linen-instance-charts">
        <HistoryChart
          title={en ? "CPU utilization" : "CPU 使用率"}
          keys={["cpu.usage"]}
          labels={["CPU"]}
          series={series}
          unit="percent"
          en={en}
          loading={loading}
          failed={result.status === "error"}
        />
        <HistoryChart
          title={en ? "Memory used" : "内存占用"}
          keys={["memory.used"]}
          labels={[en ? "Memory" : "内存"]}
          series={series}
          unit="bytes"
          en={en}
          loading={loading}
          failed={result.status === "error"}
        />
        <HistoryChart
          title={en ? "Disk used" : "磁盘占用"}
          keys={["disk.used"]}
          labels={[en ? "Disk" : "磁盘"]}
          series={series}
          unit="bytes"
          en={en}
          loading={loading}
          failed={result.status === "error"}
        />
        <HistoryChart
          title={en ? "Network throughput" : "网络吞吐"}
          keys={["net.in.rate", "net.out.rate"]}
          labels={[en ? "Download" : "下载", en ? "Upload" : "上传"]}
          series={series}
          unit="speed"
          en={en}
          loading={loading}
          failed={result.status === "error"}
        />
      </div>
      <p className="linen-instance-history__note">
        <Info size={13} />
        {result.fetched && !loading
          ? (en ? "History fetched at " : "历史读取于 ") +
            clock(result.fetched) +
            " · "
          : ""}
        {en
          ? "History is a snapshot; refresh to update. These samples do not establish availability."
          : "历史为查询快照，可手动刷新；资源样本不代表可用率记录。"}
      </p>
    </section>
  );
}
export default function LinenInstance({ uuid }: { uuid: string }) {
  const { i18n, t } = useTranslation();
  const en = (i18n.resolvedLanguage || i18n.language || "zh").startsWith("en");
  const { nodeList, isLoading, error, refresh } = useNodeList();
  const { live_data, showCallout, refresh: refreshLive } = useLiveData();
  const { publicInfo } = usePublicInfo();
  const display = readDisplayOptions(publicInfo?.theme_settings);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);
  const node = nodeList?.find((item) => item.uuid === uuid);
  const raw = live_data?.data.data[uuid];
  const sampledAt = timestamp(raw?.updated_at);
  const fresh =
    Number.isFinite(sampledAt) &&
    now - sampledAt < 30_000 &&
    sampledAt - now < 30_000;
  const online = live_data?.data.online.includes(uuid) ?? false;
  const state = !live_data
    ? "pending"
    : !showCallout
      ? "disconnected"
      : !raw || typeof raw.online !== "boolean"
        ? "missing"
        : !online
          ? "offline"
          : !Number.isFinite(sampledAt)
            ? "missing"
            : !fresh
              ? "stale"
              : "online";
  const current = state === "online" ? raw : undefined;
  const status = {
    pending: en ? "Connecting" : "实时尚未就绪",
    disconnected: en ? "Connection interrupted" : "实时连接中断",
    offline: en ? "Offline" : "离线",
    missing: en ? "Awaiting sample" : "等待采样",
    stale: en ? "Sample stale" : "在线 · 样本已过期",
    online: en ? "Online" : "在线",
  }[state];
  const cpu = valid(current?.cpu.usage) ? current.cpu.usage : null;
  const memory = percent(current?.ram.used, node?.mem_total);
  const disk = percent(current?.disk.used, node?.disk_total);
  const load = current?.load.load1;
  const expiry = display.showNodeExpiry
    ? getNodeExpiry(node?.expired_at, now)
    : null;
  const quota = trafficQuota(
    raw?.network.totalUp,
    raw?.network.totalDown,
    node?.traffic_limit,
    node?.traffic_limit_type,
  );
  const cycle = node?.billing_cycle;
  const priced = valid(node?.price) && node.price > 0;
  const price =
    node?.price === -1
      ? t("common.free")
      : priced
        ? (node.currency || "") + node.price
        : "—";
  const term =
    priced && valid(cycle) && cycle > 0
      ? "/" +
        (cycle >= 27 && cycle <= 32
          ? en
            ? "mo"
            : "月"
          : cycle + (en ? "d" : "天"))
      : "";
  return (
    <div className="linen-instance">
      {isLoading && !node ? (
        <div className="linen-instance-empty" role="status">
          <Server size={30} />
          <h1>{en ? "Loading node…" : "正在读取节点…"}</h1>
          <Link to="/">{en ? "Back to overview" : "返回节点概览"}</Link>
        </div>
      ) : !node ? (
        <div className="linen-instance-empty" role="alert">
          <Server size={30} />
          <h1>
            {error
              ? en
                ? "Node information unavailable"
                : "节点资料读取失败"
              : en
                ? "Node not found"
                : "未找到节点"}
          </h1>
          <p>
            {en
              ? "The node may not be public, or its UUID is no longer valid."
              : "节点可能未公开，或此 UUID 已失效。"}
          </p>
          <button
            type="button"
            className="linen-instance-button"
            onClick={refresh}
          >
            <RefreshCw size={14} />
            {en ? "Try again" : "重新读取"}
          </button>
          <Link to="/">{en ? "Back to overview" : "返回节点概览"}</Link>
        </div>
      ) : (
        <>
          {error && (
            <div className="linen-instance-notice" role="status">
              <Info size={16} />
              <span>
                {en
                  ? "Node information refresh failed. Showing previously loaded metadata."
                  : "节点资料刷新失败，保留上次已加载资料。"}
              </span>
              <button type="button" onClick={refresh}>
                {en ? "Retry" : "重试"}
              </button>
            </div>
          )}
          <section
            className="linen-node-panel"
            aria-label={en ? "Node overview" : "节点运行概览"}
          >
            <header className="linen-node-card linen-node-title">
              <span className="linen-node-flag">
                <Flag flag={node.region} decorative />
              </span>
              <h1 title={node.name}>
                {node.name || (en ? "Unnamed node" : "未命名节点")}
              </h1>
              <span
                className={"linen-instance-status is-" + state}
                role="status"
                title={status}
              >
                <i />
                {status}
                {state === "online" && valid(current?.uptime)
                  ? " " + duration(current.uptime, en)
                  : ""}
              </span>
              <button
                type="button"
                className="linen-node-icon linen-node-refresh"
                disabled={refreshing}
                aria-label={en ? "Refresh node" : "刷新节点"}
                title={en ? "Refresh node" : "刷新节点"}
                onClick={async () => {
                  setRefreshing(true);
                  try {
                    await Promise.all([refresh(), refreshLive()]);
                    setNow(Date.now());
                  } finally {
                    setRefreshing(false);
                  }
                }}
              >
                <RefreshCw size={17} />
              </button>
              <details
                className="linen-node-menu"
                open={menuOpen}
                onToggle={(event) => setMenuOpen(event.currentTarget.open)}
              >
                <summary
                  className="linen-node-icon"
                  aria-label={en ? "Node actions" : "节点菜单"}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.currentTarget.parentElement?.removeAttribute(
                        "open",
                      );
                    }
                  }}
                >
                  <Ellipsis size={21} aria-hidden="true" />
                </summary>
                <nav
                  aria-label={en ? "Node shortcuts" : "节点快捷入口"}
                  onClick={() => setMenuOpen(false)}
                >
                  <Link to="/">{en ? "Back to overview" : "返回节点概览"}</Link>
                  <a href="#linen-history-title">
                    {en ? "Resource history" : "历史资源趋势"}
                  </a>
                  <a href="#linen-node-spec">
                    {en ? "Hardware details" : "硬件资料"}
                  </a>
                </nav>
              </details>
            </header>
            <section
              className="linen-node-card linen-node-resources"
              aria-label={en ? "Current resource readings" : "当前资源读数"}
            >
              <Stat label="CPU" value={pct(cpu)} ratio={cpu} tone="cpu" />
              <Stat
                label={en ? "Memory" : "内存"}
                value={pct(memory)}
                ratio={memory}
                tone="memory"
              />
              <Stat
                label={en ? "Storage" : "存储"}
                value={pct(disk)}
                ratio={disk}
                tone="disk"
              />
              <Stat
                label={en ? "Load" : "负载"}
                value={valid(load) ? load.toFixed(2) : "—"}
                ratio={
                  valid(load) && valid(node.cpu_cores) && node.cpu_cores > 0
                    ? (load / node.cpu_cores) * 100
                    : null
                }
                tone="load"
                title={
                  en
                    ? "One-minute load; bar relative to CPU cores"
                    : "1 分钟负载；进度条相对 CPU 核心数"
                }
              />
            </section>
            <section
              className="linen-node-card linen-node-network"
              aria-label={en ? "Network and billing" : "网络与续费"}
            >
              <div aria-label={en ? "Current transfer rates" : "实时上下行"}>
                <strong className="linen-node-up">
                  ↑ {speed(current?.network.up)}
                </strong>
                <strong className="linen-node-down">
                  ↓ {speed(current?.network.down)}
                </strong>
              </div>
              <div
                title={
                  en
                    ? "Last-reported cumulative transfer"
                    : "最后上报的累计传输"
                }
              >
                <strong>↑ {bytes(raw?.network.totalUp)}</strong>
                <strong>↓ {bytes(raw?.network.totalDown)}</strong>
              </div>
              <div className="linen-node-billing">
                {expiry && (
                  <strong
                    className={
                      expiry?.state === "expired" ? "linen-node-error" : ""
                    }
                    title={expiry.date}
                  >
                    {expiry.state === "expired"
                      ? en
                        ? "Expired"
                        : "已到期"
                      : en
                        ? expiry.days + "d left"
                        : "剩余" + expiry.days + "天"}
                  </strong>
                )}
                <span>
                  {en ? "Renew" : "续费"} <b>{price}</b>
                  {term}
                </span>
              </div>
              <div
                className="linen-node-connections"
                aria-label={en ? "Active connections" : "当前连接数"}
              >
                <span>
                  TCP{" "}
                  <strong>
                    {valid(current?.connections.tcp)
                      ? current.connections.tcp
                      : "—"}
                  </strong>
                </span>
                <span>
                  UDP{" "}
                  <strong>
                    {valid(current?.connections.udp)
                      ? current.connections.udp
                      : "—"}
                  </strong>
                </span>
              </div>
            </section>
            {quota.limit !== null && display.showNodeTrafficProgress && (
              <section
                className="linen-node-card linen-node-quota"
                aria-label={en ? "Traffic allowance" : "流量使用"}
              >
                <div className="linen-node-quota-heading">
                  <span>
                    {en ? "Traffic used" : "流量使用"}{" "}
                    <strong
                      className={
                        quota.percent !== null && quota.percent > 100
                          ? "linen-node-error"
                          : "linen-node-up"
                      }
                    >
                      {quota.percent === null
                        ? "—"
                        : new Intl.NumberFormat(en ? "en" : "zh", {
                            maximumFractionDigits: 1,
                          }).format(quota.percent) + "%"}
                    </strong>
                  </span>
                  <small
                    title={
                      en
                        ? "Last-reported counters, based on the configured allowance mode"
                        : "最后上报的计数，按节点设置的额度口径计算"
                    }
                  >
                    {en ? "Used " : "已用 "}
                    {bytes(quota.used ?? undefined)} / {en ? "Total " : "总计 "}
                    {bytes(quota.limit)}
                  </small>
                </div>
                <div
                  className="linen-node-quota-track"
                  role={quota.bar === null ? undefined : "progressbar"}
                  aria-hidden={quota.bar === null ? true : undefined}
                  aria-label={en ? "Traffic allowance used" : "已用流量额度"}
                  aria-valuenow={quota.bar ?? undefined}
                  aria-valuetext={
                    quota.percent === null
                      ? undefined
                      : quota.percent.toFixed(1) + "%"
                  }
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <i
                      key={i}
                      className={
                        i < Math.ceil(((quota.bar ?? 0) * 24) / 100)
                          ? (quota.percent ?? 0) > 100
                            ? "is-over"
                            : "is-used"
                          : undefined
                      }
                    />
                  ))}
                </div>
              </section>
            )}
            {display.showCarrierLatency && (
              <LinenRoutePanel key={uuid} uuid={uuid} zh={!en} now={now} />
            )}
          </section>
          <History uuid={uuid} en={en} />
          <div className="linen-instance-section-heading">
            <div>
              <span className="linen-instance-eyebrow">NODE SPECIFICATION</span>
              <h2 id="linen-node-spec">
                {en ? "Resources & hardware" : "资源与硬件资料"}
              </h2>
              <p>
                {en
                  ? "Public node information, independent of current connectivity"
                  : "节点公开资料，离线时仍可查看已登记配置"}
              </p>
            </div>
          </div>
          <div className="linen-instance-specs">
            <Facts
              title={en ? "Compute & storage" : "计算与存储"}
              icon={<Cpu size={17} />}
            >
              <Fact label={en ? "Processor" : "处理器"}>{node.cpu_name}</Fact>
              <Fact label={en ? "CPU cores" : "CPU 核心"}>
                {node.cpu_cores > 0 ? node.cpu_cores : "—"}
              </Fact>
              <Fact label={en ? "Memory capacity" : "内存容量"}>
                {node.mem_total > 0 ? bytes(node.mem_total) : "—"}
              </Fact>
              <Fact label={en ? "Disk capacity" : "磁盘容量"}>
                {node.disk_total > 0 ? bytes(node.disk_total) : "—"}
              </Fact>
              <Fact label={en ? "Swap capacity" : "交换空间"}>
                {valid(node.swap_total) ? bytes(node.swap_total) : "—"}
              </Fact>
              <Fact label="GPU">{node.gpu_name}</Fact>
            </Facts>
            <Facts
              title={en ? "System & identity" : "系统与身份"}
              icon={<Server size={17} />}
            >
              <Fact label={en ? "Operating system" : "操作系统"}>
                {node.os}
              </Fact>
              <Fact label={en ? "Architecture" : "架构"}>{node.arch}</Fact>
              <Fact label={en ? "Kernel" : "内核版本"}>
                {node.kernel_version}
              </Fact>
              <Fact label={en ? "Virtualization" : "虚拟化"}>
                {node.virtualization}
              </Fact>
              <Fact label={en ? "Region" : "地区"}>{node.region}</Fact>
              <Fact label="UUID">{uuid}</Fact>
              <Fact label={en ? "Processes" : "进程"}>
                {valid(current?.process) ? current.process : "—"}
              </Fact>
              <Fact label={en ? "Last sample" : "最近采样"}>
                {fullDate(raw?.updated_at)}
              </Fact>
              <Fact label={en ? "Group" : "分组"}>
                {node.group || (en ? "Ungrouped" : "未分组")}
              </Fact>
            </Facts>
          </div>
          <footer className="linen-instance-footer">
            <span>
              <Activity size={13} />
              Linen · {en ? "Public node telemetry" : "公开节点监控"}
            </span>
            <Link to="/">
              {en ? "All nodes" : "查看全部节点"}
              <ArrowUpRight size={14} />
            </Link>
          </footer>
        </>
      )}
    </div>
  );
}
