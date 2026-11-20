import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Cpu,
  HardDrive,
  LayoutGrid,
  List,
  Network,
  RefreshCw,
  Search,
  Server,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { NodeBasicInfo } from "@/contexts/NodeListContext";
import type {
  LiveData as LiveSnapshot,
  Record as LiveRecord,
} from "@/types/LiveData";
import { useLiveData } from "@/contexts/LiveDataContext";
import { useNodeList } from "@/contexts/NodeListContext";
import { usePublicInfo } from "@/contexts/PublicInfoContext";
import Flag, { getFlagRegionCode } from "@/components/Flag";
import { formatBytes } from "@/utils/unitHelper";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { summarizeNetwork, validCounter } from "./linenNetwork";
import { readDisplayOptions, type DisplayOptions } from "./linenDisplay";
import NodeTraffic from "./NodeTraffic";
import LinenExpiry from "./LinenExpiry";
import LinenCarrierLatency, { useCarrierLatency } from "./LinenCarrierLatency";
import { useDailyTraffic } from "./useDailyTraffic";
import "./LinenDashboard.css";

const EMPTY_LIVE: LiveSnapshot = { online: [], data: {} };
type Filter = "all" | "attention" | "online" | "offline";
type Sort = "priority" | "name" | "cpu" | "memory" | "disk";
type ViewMode = "list" | "grid";
type NodeState = {
  node: NodeBasicInfo;
  record?: LiveRecord;
  online: boolean;
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  issue: string;
  sampleKnown: boolean;
  attention: boolean;
};
const percent = (used?: number, total?: number) =>
  !validCounter(used) || !validCounter(total) || !total || total <= 0
    ? null
    : Math.max(0, Math.min(100, (used! / total!) * 100));
const fmtPercent = (value: number | null) =>
  !validCounter(value) ? "—" : Math.round(value) + "%";
const fmtSpeed = (value?: number | null) =>
  validCounter(value) ? formatBytes(value) + "/s" : "—";
const dateTime = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(date);
};
const uptime = (seconds: number | undefined, en: boolean) => {
  if (!validCounter(seconds)) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return en
    ? d
      ? d + "d " + h + "h"
      : h
        ? h + "h " + m + "m"
        : m + "m"
    : d
      ? d + "天 " + h + "小时"
      : h
        ? h + "小时 " + m + "分"
        : m + "分钟";
};
function issueFor(
  sampleKnown: boolean,
  online: boolean,
  record: LiveRecord | undefined,
  cpu: number | null,
  memory: number | null,
  disk: number | null,
) {
  if (!sampleKnown) return "等待采集器连接";
  if (!online) return "节点离线";
  if (!record) return "等待采样";
  if (disk !== null && disk >= 92) return "磁盘空间紧张";
  if (memory !== null && memory >= 90) return "内存占用偏高";
  if (cpu !== null && cpu >= 90) return "处理器负载偏高";
  if (disk !== null && disk >= 80) return "磁盘占用关注";
  if (memory !== null && memory >= 82) return "内存占用关注";
  if (cpu !== null && cpu >= 80) return "处理器负载关注";
  return "";
}
function issueEnglish(issue: string) {
  const translations: Record<string, string> = {
    等待采集器连接: "Waiting for agent connection",
    实时连接中断: "Connection interrupted",
    样本已过期: "Sample stale",
    节点离线: "Node offline",
    等待采样: "Waiting for sample",
    磁盘空间紧张: "Disk space critical",
    内存占用偏高: "Memory use critical",
    处理器负载偏高: "CPU load critical",
    磁盘占用关注: "Disk use elevated",
    内存占用关注: "Memory use elevated",
    处理器负载关注: "CPU load elevated",
  };
  return translations[issue] || issue;
}
function Meter({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: number | null;
  detail: string;
  icon: typeof Cpu;
}) {
  const tone =
    value === null
      ? "unknown"
      : value >= 90
        ? "high"
        : value >= 80
          ? "warm"
          : "cool";
  return (
    <div
      className="linen-metric"
      aria-label={
        value === null
          ? label + ": no sample"
          : label + ": " + fmtPercent(value)
      }
    >
      <div className="linen-metric__head">
        <span className="linen-metric__label">
          <Icon size={13} strokeWidth={1.8} />
          {label}
        </span>
        <span className={"linen-metric__value is-" + tone}>
          {fmtPercent(value)}
        </span>
      </div>
      <div className="linen-meter" aria-hidden="true">
        <span className={"is-" + tone} style={{ width: (value ?? 0) + "%" }} />
      </div>
      <div className="linen-metric__detail">{detail}</div>
    </div>
  );
}
function NodeIdentity({
  state,
  en,
  display,
}: {
  state: NodeState;
  en: boolean;
  display: DisplayOptions;
}) {
  const stateClass =
    !state.sampleKnown || (state.online && !state.record)
      ? "pending"
      : state.online
        ? "online"
        : "offline";
  const label = !state.sampleKnown
    ? en
      ? issueEnglish(state.issue)
      : state.issue
    : state.online
      ? en
        ? "Online"
        : "在线"
      : en
        ? "Offline"
        : "离线";
  const metadata = [
    display.showNodeRegion
      ? getFlagRegionCode(state.node.region) ||
        state.node.region ||
        (en ? "Unknown region" : "未知地区")
      : null,
    display.showNodeGroup
      ? state.node.group || (en ? "Ungrouped" : "未分组")
      : null,
    display.showNodeOs
      ? state.node.os || (en ? "Unknown OS" : "未知系统")
      : null,
  ].filter((entry): entry is string => entry !== null);
  return (
    <div
      className={
        "linen-node-identity" + (display.showNodeRegion ? "" : " is-no-region")
      }
    >
      <span className={"linen-state-dot is-" + stateClass} aria-hidden="true" />
      {display.showNodeRegion && (
        <span className="linen-node-avatar">
          <Flag flag={state.node.region} decorative />
        </span>
      )}
      <span className="linen-node-title-wrap">
        <Link className="linen-node-title" to={"/instance/" + state.node.uuid}>
          {state.node.name || (en ? "Unnamed node" : "未命名节点")}
        </Link>
        {metadata.length > 0 && (
          <span className="linen-node-meta">
            {metadata.map((entry, index) => (
              <span key={index}>
                {index > 0 && <i aria-hidden="true"> · </i>}
                {entry}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className={"linen-status-pill is-" + stateClass}>{label}</span>
    </div>
  );
}
function NodeRow({
  state,
  en,
  display,
  daily,
  now,
  latency,
}: {
  state: NodeState;
  en: boolean;
  display: DisplayOptions;
  daily: ReturnType<typeof useDailyTraffic>;
  now: number;
  latency: ReturnType<typeof useCarrierLatency>;
}) {
  const record = state.online ? state.record : undefined;
  const empty = en ? "No sample" : "暂无采样";
  const metrics =
    Number(display.showNodeCpu) +
    Number(display.showNodeMemory) +
    Number(display.showNodeDisk);
  return (
    <article
      className={
        "linen-node-row " +
        (state.sampleKnown && !state.online ? "is-offline " : "") +
        (!metrics || !display.showNodeNetwork ? "has-custom-columns" : "")
      }
    >
      <div className="linen-node-row__identity">
        <NodeIdentity state={state} en={en} display={display} />
      </div>
      {metrics > 0 && (
        <div
          className="linen-node-row__metrics"
          style={{
            gridTemplateColumns: "repeat(" + metrics + ",minmax(0,1fr))",
          }}
        >
          {display.showNodeCpu && (
            <Meter
              label="CPU"
              value={state.cpu}
              detail={
                state.cpu === null
                  ? empty
                  : (state.node.cpu_cores || "—") + (en ? " cores" : " 核心")
              }
              icon={Cpu}
            />
          )}
          {display.showNodeMemory && (
            <Meter
              label={en ? "Memory" : "内存"}
              value={state.memory}
              detail={
                record
                  ? formatBytes(record.ram.used) +
                    " / " +
                    formatBytes(state.node.mem_total)
                  : empty
              }
              icon={Activity}
            />
          )}
          {display.showNodeDisk && (
            <Meter
              label={en ? "Disk" : "磁盘"}
              value={state.disk}
              detail={
                record
                  ? formatBytes(record.disk.used) +
                    " / " +
                    formatBytes(state.node.disk_total)
                  : empty
              }
              icon={HardDrive}
            />
          )}
        </div>
      )}
      {display.showNodeNetwork && (
        <div className="linen-node-row__traffic">
          <span className="linen-traffic-line">
            <ArrowDownRight size={14} />
            {fmtSpeed(record?.network.down)}
          </span>
          <span className="linen-traffic-line">
            <ArrowUpRight size={14} />
            {fmtSpeed(record?.network.up)}
          </span>
        </div>
      )}
      <div className="linen-node-row__footer">
        {display.showNodeUptime && (
          <span>
            <Clock3 size={13} />
            {en ? "Up" : "运行"} {uptime(record?.uptime, en)}
          </span>
        )}
        {display.showNodeLoad && (
          <span>
            {en ? "1m load" : "1 分钟负载"}{" "}
            {validCounter(record?.load.load1)
              ? record.load.load1.toFixed(2)
              : "—"}
          </span>
        )}
        <Link className="linen-detail-link" to={"/instance/" + state.node.uuid}>
          <span>{en ? "Details" : "节点详情"}</span>
          <ChevronRight size={15} />
        </Link>
      </div>
      {display.showNodeExpiry && (
        <LinenExpiry value={state.node.expired_at} now={now} en={en} />
      )}
      {display.showCarrierLatency && (
        <LinenCarrierLatency
          nodeId={state.node.uuid}
          en={en}
          latency={latency}
        />
      )}
      <NodeTraffic
        node={state.node}
        network={state.record?.network}
        online={state.online}
        en={en}
        display={display}
        daily={daily.records[state.node.uuid]}
        status={daily.status}
        zone={daily.zone}
        fetched={daily.fetched}
      />
    </article>
  );
}
function Concern({ state, en }: { state: NodeState; en: boolean }) {
  const offline = state.sampleKnown && !state.online;
  return (
    <Link className="linen-concern" to={"/instance/" + state.node.uuid}>
      <span
        className={"linen-concern__icon " + (offline ? "is-danger" : "is-warm")}
      >
        {offline ? <X size={16} /> : <AlertTriangle size={16} />}
      </span>
      <span className="linen-concern__body">
        <strong>
          {state.node.name || (en ? "Unnamed node" : "未命名节点")}
        </strong>
        <small>{en ? issueEnglish(state.issue) : state.issue}</small>
      </span>
      <ChevronRight size={15} className="linen-concern__arrow" />
    </Link>
  );
}
function Callouts() {
  const { showCallout } = useLiveData();
  const insecure =
    typeof window !== "undefined" && window.location.protocol !== "https:";
  return (
    <div className="linen-callouts">
      {insecure && (
        <div className="linen-callout is-warm">
          <AlertTriangle size={15} />
          建议通过 HTTPS 访问监控面板。
        </div>
      )}
      {!showCallout && (
        <div className="linen-callout is-danger">
          <Network size={15} />
          实时连接中断，数据可能不是最新状态。
        </div>
      )}
    </div>
  );
}
function DashboardContent() {
  const { i18n } = useTranslation();
  const en = (i18n.resolvedLanguage || i18n.language || "zh").startsWith("en");
  const { live_data, showCallout, refresh: refreshLive } = useLiveData();
  const { nodeList, isLoading, error, refresh } = useNodeList();
  const { publicInfo, refresh: refreshPublic } = usePublicInfo();
  const display = useMemo(
    () => readDisplayOptions(publicInfo?.theme_settings),
    [publicInfo?.theme_settings],
  );
  const daily = useDailyTraffic(
    (nodeList ?? []).map((node) => node.uuid),
    display.showNodeTrafficToday && Boolean(publicInfo),
    publicInfo?.theme_settings?.trafficDayTimezone,
  );
  const latency = useCarrierLatency(
    (nodeList ?? []).map((node) => node.uuid),
    display.showCarrierLatency && Boolean(publicInfo),
    publicInfo?.theme_settings,
  );
  const showPrioritySection = display.showPrioritySection;
  const overviewCount =
    Number(display.showOverviewOnline) +
    Number(display.showOverviewCpu) +
    Number(display.showOverviewMemory) +
    Number(display.showOverviewAttention);
  const networkCount =
    Number(display.showNetworkBandwidth) +
    Number(display.showNetworkCounters) +
    Number(display.showNetworkTotal);
  const [filter, setFilter] = useState<Filter>("all");
  const [group, setGroup] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("priority");
  const [view, setView] = useLocalStorage<ViewMode>("linen-view", "list");
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, []);
  const liveReady = Boolean(live_data?.data) && showCallout;
  const live = live_data?.data ?? EMPTY_LIVE;
  const online = useMemo(() => new Set(live.online), [live.online]);
  const nodes = nodeList ?? [];
  const stateList = useMemo<NodeState[]>(
    () =>
      nodes.map((node) => {
        const record = live.data[node.uuid];
        const rawTime = record?.updated_at;
        const numeric =
          typeof rawTime === "number"
            ? rawTime
            : typeof rawTime === "string" && /^\d+(\.\d+)?$/.test(rawTime)
              ? Number(rawTime)
              : NaN;
        const stamp = Number.isFinite(numeric)
          ? numeric < 1e12
            ? numeric * 1000
            : numeric
          : Date.parse(rawTime || "");
        const reportedOnline = online.has(node.uuid);
        const fresh = Number.isFinite(stamp) && Math.abs(now - stamp) < 30000;
        const sampleKnown =
          liveReady &&
          record !== undefined &&
          typeof record.online === "boolean" &&
          (!reportedOnline || fresh);
        const isOnline = sampleKnown && reportedOnline;
        const stale =
          liveReady && reportedOnline && record !== undefined && !fresh;
        const cpu =
          isOnline && validCounter(record?.cpu.usage) ? record.cpu.usage : null;
        const memory =
          isOnline && record ? percent(record.ram.used, node.mem_total) : null;
        const disk =
          isOnline && record
            ? percent(record.disk.used, node.disk_total)
            : null;
        const highUsage =
          isOnline &&
          record !== undefined &&
          ((cpu !== null && cpu >= 80) ||
            (memory !== null && memory >= 82) ||
            (disk !== null && disk >= 80));
        return {
          node,
          record,
          online: isOnline,
          cpu,
          memory,
          disk,
          sampleKnown,
          attention:
            liveReady && reportedOnline && (highUsage || stale || !record),
          issue:
            !showCallout && live_data
              ? "实时连接中断"
              : stale
                ? "样本已过期"
                : liveReady && reportedOnline && !record
                  ? "等待采样"
                  : issueFor(sampleKnown, isOnline, record, cpu, memory, disk),
        };
      }),
    [live.data, liveReady, nodeList, online, now, showCallout, live_data],
  );
  const groups = useMemo(() => {
    const entries = new Map<string, string>();
    for (const { node } of stateList) {
      const value = typeof node.group === "string" ? node.group.trim() : "";
      entries.set(
        value ? "group:" + value : "ungrouped",
        value || (en ? "Ungrouped" : "未分组"),
      );
    }
    return Array.from(entries, ([id, label]) => ({ id, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [en, stateList]);
  useEffect(() => {
    if (group !== "all" && !groups.some((item) => item.id === group))
      setGroup("all");
  }, [group, groups]);
  const onlineCount = liveReady
    ? stateList.filter((item) => item.online).length
    : 0;
  const offlineCount = liveReady
    ? stateList.filter((item) => item.sampleKnown && !item.online).length
    : 0;
  const waitingCount = stateList.filter(
    (item) => !item.sampleKnown || (item.online && !item.record),
  ).length;
  const attention = stateList.filter((item) => item.attention);
  const cpuValues = stateList
    .filter((item) => item.online && item.cpu !== null)
    .map((item) => item.cpu!);
  const cpuMean = cpuValues.length
    ? cpuValues.reduce((sum, item) => sum + item, 0) / cpuValues.length
    : null;
  const memoryStates = stateList.filter(
    (item) =>
      item.online &&
      validCounter(item.record?.ram.used) &&
      validCounter(item.node.mem_total) &&
      item.node.mem_total > 0,
  );
  const ramUsed = memoryStates.reduce(
    (sum, item) =>
      sum + (item.online && item.record ? item.record.ram.used : 0),
    0,
  );
  const ramTotal = memoryStates.reduce(
    (sum, item) => sum + (item.online ? item.node.mem_total || 0 : 0),
    0,
  );
  const network = useMemo(() => summarizeNetwork(stateList), [stateList]);
  const latest = stateList.reduce<string | undefined>((value, item) => {
    const next = item.record?.updated_at;
    return !next ||
      (value && new Date(value).getTime() >= new Date(next).getTime())
      ? value
      : next;
  }, undefined);
  const list = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return stateList
      .filter((item) => {
        const matchFilter =
          filter === "all" ||
          (filter === "attention"
            ? item.attention
            : filter === "online"
              ? item.online
              : item.sampleKnown && !item.online);
        const groupName =
          typeof item.node.group === "string" ? item.node.group.trim() : "";
        const groupId = groupName ? "group:" + groupName : "ungrouped";
        const matchGroup = group === "all" || groupId === group;
        const terms = [
          item.node.name,
          item.node.region,
          item.node.group,
          item.node.os,
          item.node.cpu_name,
        ]
          .join(" ")
          .toLocaleLowerCase();
        return matchFilter && matchGroup && (!needle || terms.includes(needle));
      })
      .sort((a, b) => {
        if (sort === "name")
          return (a.node.name || "").localeCompare(b.node.name || "");
        if (sort === "cpu") return (b.cpu ?? -1) - (a.cpu ?? -1);
        if (sort === "memory") return (b.memory ?? -1) - (a.memory ?? -1);
        if (sort === "disk") return (b.disk ?? -1) - (a.disk ?? -1);
        const rank = (item: NodeState) =>
          item.attention && item.sampleKnown && !item.online
            ? 0
            : item.attention
              ? 1
              : !item.sampleKnown || (item.online && !item.record)
                ? 2
                : 3;
        return (
          rank(a) - rank(b) ||
          (a.node.name || "").localeCompare(b.node.name || "")
        );
      });
  }, [en, filter, group, query, sort, stateList]);
  const onRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        refresh(),
        refreshLive(),
        refreshPublic(),
        daily.refresh(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };
  const text = (zh: string, english: string) => (en ? english : zh);
  const title = publicInfo?.sitename || text("节点运行台", "Node operations");
  const onlineRate =
    liveReady && stateList.length && waitingCount === 0
      ? Math.round((onlineCount / stateList.length) * 100)
      : null;
  const filters: { key: Filter; label: string; count: number | string }[] = [
    {
      key: "all",
      label: text("全部节点", "All nodes"),
      count: stateList.length,
    },
    {
      key: "attention",
      label: text("待关注", "Attention"),
      count: liveReady ? attention.length : "—",
    },
    {
      key: "online",
      label: text("在线", "Online"),
      count: liveReady ? onlineCount : "—",
    },
    {
      key: "offline",
      label: text("离线", "Offline"),
      count: liveReady ? offlineCount : "—",
    },
  ];
  return (
    <main className="linen-console">
      <Callouts />
      <section className="linen-console-hero">
        <div className="linen-console-hero__copy">
          <span className="linen-kicker">
            <span className="linen-kicker__pulse" />
            {text("运行状态 / 流量概览", "STATUS / NETWORK")}
          </span>
          <h1>{text("节点运行台", "Node operations")}</h1>
          <p>
            {en
              ? title + ": node status, resource use and network transfer."
              : title + " · 查看节点状态、资源占用与网络流量。"}
          </p>
        </div>
        <div className="linen-console-hero__actions">
          <div className="linen-updated">
            <span className="linen-updated__dot" />
            <span>
              {text("最近采样", "LAST SAMPLE")}
              <strong>{dateTime(latest)}</strong>
            </span>
          </div>
          <button
            className="linen-refresh"
            type="button"
            disabled={refreshing}
            onClick={onRefresh}
            aria-label={text("刷新节点", "Refresh nodes")}
          >
            <RefreshCw size={15} className={refreshing ? "is-spinning" : ""} />
            <span>{text("刷新", "Refresh")}</span>
          </button>
        </div>
      </section>
      {error && (
        <div className="linen-error" role="status">
          <CircleAlert size={16} />
          {text(
            "节点资料暂时无法加载。",
            "Some node details could not be loaded.",
          )}
          <button type="button" onClick={onRefresh}>
            {text("重试", "Retry")}
          </button>
        </div>
      )}
      {overviewCount > 0 && (
        <section
          className={
            "linen-overview" + (overviewCount < 4 ? " is-configured" : "")
          }
        >
          {display.showOverviewOnline && (
            <article className="linen-overview__health">
              <div className="linen-overview__eyebrow">
                <Activity size={14} />
                {text("当前在线率", "ONLINE NOW")}
              </div>
              <div className="linen-health-main">
                <div
                  className="linen-health-ring"
                  style={
                    {
                      "--health-angle": (onlineRate ?? 0) * 3.6 + "deg",
                    } as CSSProperties
                  }
                >
                  <span>
                    {onlineRate === null ? "—" : onlineRate}
                    <small>{onlineRate === null ? "" : "%"}</small>
                  </span>
                </div>
                <div className="linen-health-copy">
                  <strong>
                    {liveReady ? onlineCount : "—"}
                    <span> / {stateList.length}</span>
                  </strong>
                  <p>{text("节点在线", "nodes online")}</p>
                  <span
                    className={
                      "linen-health-label " +
                      (!liveReady ||
                      stateList.length === 0 ||
                      waitingCount > 0 ||
                      offlineCount > 0
                        ? "is-warn"
                        : "is-good")
                    }
                  >
                    {stateList.length === 0 ? (
                      <>
                        <Server size={13} />
                        {text("暂无节点", "No nodes")}
                      </>
                    ) : !liveReady ? (
                      <>
                        <Activity size={13} />
                        {text("等待首批采样", "Waiting for telemetry")}
                      </>
                    ) : waitingCount > 0 ? (
                      <>
                        <Activity size={13} />
                        {text("部分节点待采样", "Some nodes awaiting samples")}
                      </>
                    ) : offlineCount > 0 ? (
                      <>
                        <AlertTriangle size={13} />
                        {text("有节点离线", "Some nodes offline")}
                      </>
                    ) : (
                      <>
                        <Check size={13} />
                        {text("全部在线", "All nodes online")}
                      </>
                    )}
                  </span>
                </div>
              </div>
              <div className="linen-health-legend">
                <span>
                  <i className="is-online" />
                  {text("在线", "Online")} {liveReady ? onlineCount : "—"}
                </span>
                <span>
                  <i className="is-offline" />
                  {text("离线", "Offline")} {liveReady ? offlineCount : "—"}
                </span>
              </div>
            </article>
          )}
          {display.showOverviewCpu && (
            <article className="linen-stat-block">
              <span className="linen-stat-block__icon is-cpu">
                <Cpu size={17} />
              </span>
              <span className="linen-stat-block__label">
                {text("平均 CPU", "AVERAGE CPU")}
              </span>
              <strong>{fmtPercent(cpuMean)}</strong>
              <small>{text("在线节点均值", "Across online nodes")}</small>
              <div className="linen-stat-rule">
                <i style={{ width: (cpuMean ?? 0) + "%" }} />
              </div>
            </article>
          )}
          {display.showOverviewMemory && (
            <article className="linen-stat-block">
              <span className="linen-stat-block__icon is-memory">
                <Activity size={17} />
              </span>
              <span className="linen-stat-block__label">
                {text("已用内存", "MEMORY USED")}
              </span>
              <strong>
                {liveReady && memoryStates.length ? formatBytes(ramUsed) : "—"}
              </strong>
              <small>
                {liveReady && ramTotal
                  ? text("在线总量", "online capacity") +
                    " " +
                    formatBytes(ramTotal)
                  : text("暂无采样", "No samples")}
              </small>
              <div className="linen-stat-rule">
                <i style={{ width: (percent(ramUsed, ramTotal) ?? 0) + "%" }} />
              </div>
            </article>
          )}
          {display.showOverviewAttention && (
            <article className="linen-stat-block">
              <span className="linen-stat-block__icon is-focus">
                <SlidersHorizontal size={17} />
              </span>
              <span className="linen-stat-block__label">
                {text("待关注项目", "NEEDS ATTENTION")}
              </span>
              <strong>
                {liveReady ? attention.length : "—"}
                <span className="linen-stat-unit">{text("项", "items")}</span>
              </strong>
              <small>
                {text(
                  "在线节点资源异常或采样问题",
                  "Online resource or sampling issues",
                )}
              </small>
              <div className="linen-stat-rule">
                <i
                  className={attention.length ? "is-warning" : "is-clear"}
                  style={{
                    width:
                      (stateList.length
                        ? Math.min(
                            100,
                            (attention.length / stateList.length) * 100,
                          )
                        : 0) + "%",
                  }}
                />
              </div>
            </article>
          )}
        </section>
      )}
      {networkCount > 0 && (
        <section
          className={
            "linen-network-overview" +
            (networkCount < 3 ? " is-configured" : "")
          }
          aria-label={text("实时带宽与累计流量", "Live bandwidth and traffic")}
        >
          {display.showNetworkBandwidth && (
            <article
              className={
                "linen-network-stat" +
                (network.ratePartial ? " is-partial" : "")
              }
              data-network="live"
            >
              <span className="linen-network-stat__label">
                <Network size={15} />
                {text("实时带宽", "LIVE BANDWIDTH")}
              </span>
              <div className="linen-network-stat__values">
                <span>
                  <ArrowDownRight size={15} />
                  <strong data-metric="speed-down">
                    {fmtSpeed(network.speedDown)}
                  </strong>
                  <small>{text("下载", "Down")}</small>
                </span>
                <span>
                  <ArrowUpRight size={15} />
                  <strong data-metric="speed-up">
                    {fmtSpeed(network.speedUp)}
                  </strong>
                  <small>{text("上传", "Up")}</small>
                </span>
              </div>
              <small className="linen-network-stat__note">
                {text("仅新鲜在线样本", "Fresh online samples only")} ·{" "}
                {network.rateNodes}/{network.nodeCount}{" "}
                {text("可见节点", "visible nodes")}
                {network.offlineNodes > 0
                  ? text(" · 离线 ", " · offline ") + network.offlineNodes
                  : ""}
                {network.unknownNodes > 0
                  ? text(" · 状态未知 ", " · status unknown ") +
                    network.unknownNodes
                  : ""}
                {network.ratePartial
                  ? text(" · 部分数据缺失", " · partial data")
                  : ""}
              </small>
            </article>
          )}
          {display.showNetworkCounters && (
            <article
              className={
                "linen-network-stat" +
                (network.counterPartial ? " is-partial" : "")
              }
              data-network="counters"
            >
              <span className="linen-network-stat__label">
                <ArrowRight size={15} />
                {text("累计上传/下载", "REPORTED UP/DOWN")}
              </span>
              <div className="linen-network-stat__values">
                <span>
                  <ArrowDownRight size={15} />
                  <strong data-metric="total-down">
                    {network.totalDown === null
                      ? "—"
                      : formatBytes(network.totalDown)}
                  </strong>
                  <small>{text("下载", "Down")}</small>
                </span>
                <span>
                  <ArrowUpRight size={15} />
                  <strong data-metric="total-up">
                    {network.totalUp === null
                      ? "—"
                      : formatBytes(network.totalUp)}
                  </strong>
                  <small>{text("上传", "Up")}</small>
                </span>
              </div>
              <small className="linen-network-stat__note">
                {text(
                  "含离线节点最后上报值",
                  "Includes last-reported offline counters",
                )}{" "}
                · {network.counterNodes}/{network.nodeCount}
                {network.counterPartial
                  ? text(" · 部分数据缺失", " · partial data")
                  : ""}
              </small>
            </article>
          )}
          {display.showNetworkTotal && (
            <article
              className={
                "linen-network-stat" +
                (network.counterPartial ? " is-partial" : "")
              }
              data-network="total"
            >
              <span className="linen-network-stat__label">
                <Activity size={15} />
                {text("累计传输总量", "TOTAL TRANSFER")}
              </span>
              <strong
                className="linen-network-stat__total"
                data-metric="total-transfer"
              >
                {network.totalBytes === null
                  ? "—"
                  : formatBytes(network.totalBytes)}
              </strong>
              <small className="linen-network-stat__note">
                {text(
                  network.counterPartial
                    ? "仅已知部分：上传＋下载；非自然月账单，计数可能重置。"
                    : "所有可见节点上传＋下载；非自然月账单，计数可能重置。",
                  network.counterPartial
                    ? "Known portion only: upload + download. Not monthly billing; counters may reset."
                    : "All visible nodes: upload + download. Not monthly billing; counters may reset.",
                )}
              </small>
            </article>
          )}
        </section>
      )}
      <section
        className={
          "linen-workspace" + (showPrioritySection ? "" : " is-fullwidth")
        }
      >
        {showPrioritySection && (
          <aside className="linen-attention">
            <div className="linen-section-heading">
              <div>
                <span className="linen-section-eyebrow">
                  {text("优先查看", "PRIORITY QUEUE")}
                </span>
                <h2>{text("待关注", "Attention")}</h2>
              </div>
              <span
                className={
                  "linen-count-badge " + (attention.length ? "is-active" : "")
                }
              >
                {String(attention.length).padStart(2, "0")}
              </span>
            </div>
            {attention.length ? (
              <div className="linen-attention-list">
                {attention.slice(0, 5).map((item) => (
                  <Concern key={item.node.uuid} state={item} en={en} />
                ))}
                {attention.length > 5 && (
                  <button
                    className="linen-queue-more"
                    type="button"
                    onClick={() => setFilter("attention")}
                  >
                    {text("查看其余", "View remaining")} {attention.length - 5}
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            ) : (
              <div className="linen-empty-queue">
                <span className="linen-empty-queue__icon">
                  <Check size={19} />
                </span>
                <div>
                  <strong>
                    {text(
                      !liveReady || waitingCount || stateList.length === 0
                        ? "等待采样确认"
                        : "暂时没有待处理项",
                      !liveReady || waitingCount || stateList.length === 0
                        ? "Awaiting telemetry confirmation"
                        : "Nothing needs attention",
                    )}
                  </strong>
                  <p>
                    {text(
                      !liveReady || waitingCount || stateList.length === 0
                        ? "数据尚未完整，暂不判断全部健康。"
                        : "已上报指标暂未发现超阈值；未上报指标按缺测处理。",
                      !liveReady || waitingCount || stateList.length === 0
                        ? "Some current readings are unavailable."
                        : "No reported metric is over threshold; unreported metrics remain unknown.",
                    )}
                  </p>
                </div>
              </div>
            )}
            <div className="linen-queue-note">
              <span className="linen-queue-note__line" />
              <p>
                {text(
                  "仅含在线节点的资源异常或采样问题；离线节点请查看离线筛选。",
                  "Online resource or sampling issues only; offline nodes have a separate filter.",
                )}
              </p>
            </div>
          </aside>
        )}
        <section className="linen-fleet">
          <div className="linen-fleet-heading">
            <div>
              <span className="linen-section-eyebrow">
                {text("资源与运行状态", "CAPACITY / STATUS")}
              </span>
              <h2>
                {text("节点清单", "Node inventory")}{" "}
                <span>{String(stateList.length).padStart(2, "0")}</span>
              </h2>
            </div>
            <div
              className="linen-view-toggle"
              role="group"
              aria-label={text("节点视图", "Node view")}
            >
              <button
                type="button"
                className={view === "list" ? "is-active" : ""}
                aria-pressed={view === "list"}
                aria-label={text("列表视图", "List view")}
                onClick={() => setView("list")}
              >
                <List size={16} />
              </button>
              <button
                type="button"
                className={view === "grid" ? "is-active" : ""}
                aria-pressed={view === "grid"}
                aria-label={text("卡片视图", "Grid view")}
                onClick={() => setView("grid")}
              >
                <LayoutGrid size={15} />
              </button>
            </div>
          </div>
          <div className="linen-filters">
            <div
              className="linen-filter-tabs"
              role="group"
              aria-label={text("筛选节点状态", "Filter nodes")}
            >
              {filters.map((option) => (
                <button
                  type="button"
                  key={option.key}
                  className={filter === option.key ? "is-active" : ""}
                  aria-pressed={filter === option.key}
                  onClick={() => setFilter(option.key)}
                >
                  <span>{option.label}</span>
                  <b>{option.count}</b>
                </button>
              ))}
            </div>
            <label className="linen-search">
              <Search size={15} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={text(
                  "搜索节点、地区或系统…",
                  "Search nodes, region or OS…",
                )}
                aria-label={text(
                  "搜索节点、地区或系统",
                  "Search nodes, region or OS",
                )}
              />
              {query && (
                <button
                  type="button"
                  aria-label={text("清除搜索", "Clear search")}
                  onClick={() => setQuery("")}
                >
                  <X size={14} />
                </button>
              )}
            </label>
          </div>
          <div className="linen-filter-bottom">
            <div className="linen-group-tabs">
              <button
                type="button"
                className={group === "all" ? "is-active" : ""}
                aria-pressed={group === "all"}
                onClick={() => setGroup("all")}
              >
                {text("全部分组", "All groups")}
              </button>
              {groups.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  className={group === entry.id ? "is-active" : ""}
                  aria-pressed={group === entry.id}
                  onClick={() => setGroup(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <label className="linen-sort">
              <span>{text("排序", "Sort")}</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as Sort)}
                aria-label={text("排序节点", "Sort nodes")}
              >
                <option value="priority">
                  {text("运行优先级", "Priority")}
                </option>
                <option value="name">{text("名称", "Name")}</option>
                <option value="cpu">CPU</option>
                <option value="memory">{text("内存", "Memory")}</option>
                <option value="disk">{text("磁盘", "Disk")}</option>
              </select>
            </label>
          </div>
          <div
            className={"linen-node-list " + (view === "grid" ? "is-grid" : "")}
          >
            {isLoading && stateList.length === 0 ? (
              <div className="linen-list-state">
                <span className="linen-loading-mark" />
                <strong>
                  {text("正在载入节点资料…", "Loading node inventory…")}
                </strong>
                <p>
                  {text(
                    "正在读取公开节点清单。",
                    "Fetching the visible node list.",
                  )}
                </p>
              </div>
            ) : list.length ? (
              list.map((item) => (
                <NodeRow
                  key={item.node.uuid}
                  state={item}
                  en={en}
                  display={display}
                  daily={daily}
                  now={now}
                  latency={latency}
                />
              ))
            ) : (
              <div className="linen-list-state">
                <span className="linen-loading-mark is-idle">
                  <Search size={16} />
                </span>
                <strong>
                  {text("没有符合条件的节点", "No matching nodes")}
                </strong>
                <p>
                  {text(
                    "调整筛选或搜索条件再试一次。",
                    "Try changing filters or search terms.",
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFilter("all");
                    setGroup("all");
                    setQuery("");
                  }}
                >
                  {text("清除筛选", "Clear filters")}
                </button>
              </div>
            )}
          </div>
          <div className="linen-fleet-footer">
            <span>
              {text("显示", "Showing")} <strong>{list.length}</strong>{" "}
              {text("/ 共", "of")} <strong>{stateList.length}</strong>{" "}
              {text("个节点", "nodes")}
            </span>
            <span className="linen-fleet-footer__live">
              <span />
              {liveReady
                ? text("采样周期", "Sample interval")
                : text("等待连接恢复", "Waiting for connection")}{" "}
              · 2s
            </span>
          </div>
        </section>
      </section>
      {publicInfo?.theme_settings?.customFooterHtml && (
        <div
          className="linen-custom-footer"
          dangerouslySetInnerHTML={{
            __html: String(publicInfo.theme_settings.customFooterHtml),
          }}
        />
      )}
      <footer className="linen-dashboard-footer">
        <span>
          <Server size={14} />
          {text("节点运行台", "Node operations")}
        </span>
        <span>
          {text("Powered by Komari Monitor", "Powered by Komari Monitor")}
        </span>
      </footer>
    </main>
  );
}
export default DashboardContent;
