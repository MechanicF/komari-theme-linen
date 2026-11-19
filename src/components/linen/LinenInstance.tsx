import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Clock3,
  Cpu,
  HardDrive,
  Info,
  MemoryStick,
  Network,
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
import Flag, { getFlagRegionCode } from "@/components/Flag";
import { useLiveData } from "@/contexts/LiveDataContext";
import { useNodeList } from "@/contexts/NodeListContext";
import { useRPC2Call } from "@/contexts/RPC2Context";
import type { MetricSeries, QueryMetricsResponse } from "@/types/metrics";
import { formatBytes } from "@/utils/unitHelper";
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
      ? days + "天 " + hours + "小时"
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
  detail,
  icon,
  ratio,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  ratio?: number | null;
}) {
  return (
    <article className="linen-instance-stat">
      <div className="linen-instance-stat__label">
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {ratio !== undefined && (
        <div className="linen-instance-meter" aria-hidden="true">
          <span
            className={ratio !== null && ratio >= 90 ? "is-high" : ""}
            style={{ width: Math.min(100, Math.max(0, ratio ?? 0)) + "%" }}
          />
        </div>
      )}
      <small>{detail}</small>
    </article>
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
            {en ? "A closer look over time" : "运行趋势，细看每个时刻"}
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
  const { i18n } = useTranslation();
  const en = (i18n.resolvedLanguage || i18n.language || "zh").startsWith("en");
  const { nodeList, isLoading, error, refresh } = useNodeList();
  const { live_data, showCallout } = useLiveData();
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
  const unavailable =
    state === "offline"
      ? en
        ? "Offline · no current reading"
        : "节点离线 · 无当前读数"
      : en
        ? "Waiting for a fresh sample"
        : "等待新的有效样本";
  const cpu = valid(current?.cpu.usage) ? current.cpu.usage : null;
  const memory = percent(current?.ram.used, node?.mem_total);
  const disk = percent(current?.disk.used, node?.disk_total);
  return (
    <div className="linen-instance">
      <header className="linen-instance-header">
        <Link to="/" className="linen-instance-back">
          <ArrowLeft size={16} />
          <span>{en ? "Back to overview" : "返回节点概览"}</span>
        </Link>
        <span className="linen-instance-wordmark">
          <Activity size={16} />
          LINEN<span>/</span>
          {en ? "NODE DETAIL" : "节点详情"}
        </span>
      </header>
      {isLoading && !node ? (
        <div className="linen-instance-empty" role="status">
          <Server size={30} />
          <h1>{en ? "Loading node…" : "正在读取节点…"}</h1>
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
          <section className="linen-instance-hero">
            <div className="linen-instance-identity">
              <span className="linen-instance-avatar">
                <Flag flag={node.region} decorative />
              </span>
              <div>
                <span className="linen-instance-eyebrow">
                  {en ? "NODE / " : "节点 / "}
                  {node.group || (en ? "Ungrouped" : "未分组")}
                </span>
                <h1>{node.name || (en ? "Unnamed node" : "未命名节点")}</h1>
                <p>
                  {getFlagRegionCode(node.region) ||
                    node.region ||
                    (en ? "Unknown region" : "未知地区")}
                  <i>·</i>
                  {node.os || (en ? "Unknown OS" : "未知系统")}
                  <i>·</i>
                  {node.arch || "—"}
                </p>
              </div>
            </div>
            <div className="linen-instance-health">
              <span className={"linen-instance-status is-" + state}>
                <i />
                {status}
              </span>
              <span>
                {en ? "Last sample " : "最近采样 "}
                <time
                  dateTime={
                    Number.isFinite(sampledAt)
                      ? new Date(sampledAt).toISOString()
                      : undefined
                  }
                >
                  {fullDate(raw?.updated_at)}
                </time>
              </span>
            </div>
          </section>
          <div className="linen-instance-uuid">
            <Server size={12} />
            <span>UUID</span>
            <code>{uuid}</code>
          </div>
          {state !== "online" && (
            <div className={"linen-instance-notice is-" + state} role="status">
              <Info size={16} />
              <span>
                {state === "offline"
                  ? en
                    ? "This node is offline. Current metrics are hidden; historical samples remain available below."
                    : "该节点当前离线，已隐藏实时读数；下方仍可查询既有历史样本。"
                  : state === "disconnected"
                    ? en
                      ? "The live connection is interrupted. Current metrics are hidden until it recovers."
                      : "实时连接已中断，恢复前不展示缓存读数为当前状态。"
                    : state === "stale"
                      ? en
                        ? "No fresh sample in 30 seconds. Current readings are hidden until the next report."
                        : "超过 30 秒未收到新采样，已隐藏过期读数，等待节点重新上报。"
                      : en
                        ? "Live data is not ready. Waiting for a valid report from the node."
                        : "实时数据尚未就绪，正在等待节点提供有效样本。"}
              </span>
            </div>
          )}
          <section
            className="linen-instance-stats"
            aria-label={en ? "Current resource readings" : "当前资源读数"}
          >
            <Stat
              label="CPU"
              value={pct(cpu)}
              ratio={cpu}
              icon={<Cpu size={16} />}
              detail={
                current
                  ? (valid(node.cpu_cores) && node.cpu_cores > 0
                      ? node.cpu_cores + (en ? " cores" : " 核心")
                      : "—") +
                    " · " +
                    (en ? "1m load " : "1 分钟负载 ") +
                    (valid(current.load.load1)
                      ? current.load.load1.toFixed(2)
                      : "—")
                  : unavailable
              }
            />
            <Stat
              label={en ? "Memory" : "内存"}
              value={pct(memory)}
              ratio={memory}
              icon={<MemoryStick size={16} />}
              detail={
                current
                  ? bytes(current.ram.used) +
                    " / " +
                    (node.mem_total > 0 ? bytes(node.mem_total) : "—")
                  : unavailable
              }
            />
            <Stat
              label={en ? "Disk" : "磁盘"}
              value={pct(disk)}
              ratio={disk}
              icon={<HardDrive size={16} />}
              detail={
                current
                  ? bytes(current.disk.used) +
                    " / " +
                    (node.disk_total > 0 ? bytes(node.disk_total) : "—")
                  : unavailable
              }
            />
            <article className="linen-instance-stat linen-instance-network">
              <div className="linen-instance-stat__label">
                <Network size={16} />
                {en ? "Network" : "网络吞吐"}
              </div>
              <div>
                <span>
                  <ArrowDownLeft size={15} />
                  {en ? "Down" : "下载"}
                </span>
                <strong>{speed(current?.network.down)}</strong>
              </div>
              <div>
                <span>
                  <ArrowUpRight size={15} />
                  {en ? "Up" : "上传"}
                </span>
                <strong>{speed(current?.network.up)}</strong>
              </div>
              <small>
                {current
                  ? en
                    ? "Current transfer rate"
                    : "当前传输速率"
                  : unavailable}
              </small>
            </article>
          </section>
          <div className="linen-instance-runtime">
            <span>
              <Clock3 size={14} />
              {en ? "Uptime" : "连续运行"}
              <strong>{duration(current?.uptime, en)}</strong>
            </span>
            <span>
              {en ? "Processes" : "进程"}
              <strong>{valid(current?.process) ? current.process : "—"}</strong>
            </span>
            <span>
              TCP / UDP
              <strong>
                {current
                  ? (valid(current.connections.tcp)
                      ? current.connections.tcp
                      : "—") +
                    " / " +
                    (valid(current.connections.udp)
                      ? current.connections.udp
                      : "—")
                  : "—"}
              </strong>
            </span>
            <span>
              {en ? "Total down / up" : "累计下载 / 上传"}
              <strong>
                {bytes(current?.network.totalDown)} /{" "}
                {bytes(current?.network.totalUp)}
              </strong>
            </span>
          </div>
          <History uuid={uuid} en={en} />
          <div className="linen-instance-section-heading">
            <div>
              <span className="linen-instance-eyebrow">NODE SPECIFICATION</span>
              <h2>{en ? "Resources & hardware" : "资源与硬件资料"}</h2>
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
