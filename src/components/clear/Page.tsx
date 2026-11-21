import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link, Outlet, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  ArrowDown,
  ChevronLeft,
  LayoutGrid,
  List,
  Search,
  Sun,
  Moon,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
} from "lucide-react";
import { LiveDataProvider, useLiveData } from "@/contexts/LiveDataContext";
import { useNodeList } from "@/contexts/NodeListContext";
import { usePublicInfo } from "@/contexts/PublicInfoContext";
import { ThemeContext } from "@/contexts/ThemeContext";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { formatBytes } from "@/utils/unitHelper";
import { useDailyTraffic } from "../linen/useDailyTraffic";
import { useCarrierLatency } from "../linen/LinenCarrierLatency";
import { readDisplayOptions } from "../linen/linenDisplay";
import { summarizeNetwork } from "../linen/linenNetwork";
import NodeCard from "./NodeCard";
import History from "./History";
import Routes from "./Routes";
import { readingState, resourceIssue, numeric } from "./data";
import "./clear.css";
function usePanel() {
  const { i18n } = useTranslation();
  const en = (i18n.resolvedLanguage || i18n.language || "zh").startsWith("en");
  const inventory = useNodeList();
  const live = useLiveData();
  const publicData = usePublicInfo();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, []);
  const display = useMemo(
    () => readDisplayOptions(publicData.publicInfo?.theme_settings),
    [publicData.publicInfo?.theme_settings],
  );
  const ids = (inventory.nodeList ?? []).map((n) => n.uuid);
  const daily = useDailyTraffic(
    ids,
    display.showNodeTrafficToday && Boolean(publicData.publicInfo),
    publicData.publicInfo?.theme_settings?.trafficDayTimezone,
  );
  const carriers = useCarrierLatency(
    ids,
    display.showCarrierLatency && Boolean(publicData.publicInfo),
    publicData.publicInfo?.theme_settings,
  );
  const rows = useMemo(
    () =>
      (inventory.nodeList ?? []).map((node) => {
        const sample = live.live_data?.data.data[node.uuid];
        const status = readingState(
          sample,
          Boolean(live.live_data),
          live.showCallout,
          now,
        );
        return {
          node,
          sample,
          status,
          issue: resourceIssue(node, sample, status),
        };
      }),
    [inventory.nodeList, live.live_data, live.showCallout, now],
  );
  const refresh = async () => {
    await Promise.all([
      inventory.refresh(),
      live.refresh(),
      publicData.refresh(),
      daily.refresh(),
    ]);
    setNow(Date.now());
  };
  return {
    en,
    i18n,
    inventory,
    live,
    publicData,
    display,
    daily,
    carriers,
    rows,
    refresh,
    now,
  };
}
type Panel = ReturnType<typeof usePanel>;
const Context = createContext<Panel | null>(null);
function useData() {
  const p = useContext(Context);
  if (!p) throw Error("Panel provider is missing");
  return p;
}
function ShellContent() {
  const data = usePanel();
  const { appearance, setAppearance } = useContext(ThemeContext);
  const en = data.en;
  const [busy, setBusy] = useState(false);
  const title = data.publicData.publicInfo?.sitename || "Linen";
  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await data.refresh();
    } finally {
      setBusy(false);
    }
  };
  const settings = data.publicData.publicInfo?.theme_settings;
  const width = Number(settings?.mainContentWidth);
  const maxWidth =
    Number.isFinite(width) && width > 0
      ? Math.min(100, width) + "vw"
      : undefined;
  const desktop =
    typeof settings?.backgroundImageUrlDesktop === "string"
      ? settings.backgroundImageUrlDesktop
      : "";
  const mobile =
    typeof settings?.backgroundImageUrlMobile === "string"
      ? settings.backgroundImageUrlMobile
      : desktop;
  return (
    <Context.Provider value={data}>
      <div
        className="lc-app"
        style={
          {
            "--lc-bg-desktop": desktop
              ? "url(" + JSON.stringify(desktop) + ")"
              : undefined,
            "--lc-bg-mobile": mobile
              ? "url(" + JSON.stringify(mobile) + ")"
              : undefined,
          } as React.CSSProperties
        }
      >
        <div className="lc-wrap" style={{ maxWidth }}>
          <header className="lc-topbar">
            <Link className="lc-brand" to="/">
              <span>
                <Activity size={18} />
              </span>
              <b>{title}</b>
            </Link>
            <div className="lc-top-actions">
              <button
                className="lc-icon"
                aria-label={en ? "Refresh readings" : "刷新读数"}
                disabled={busy}
                onClick={() => void refresh()}
              >
                <RefreshCw size={16} className={busy ? "lc-spin" : ""} />
              </button>
              <button
                className="lc-icon"
                aria-label={en ? "Toggle appearance" : "切换明暗"}
                onClick={() =>
                  setAppearance(appearance === "dark" ? "light" : "dark")
                }
              >
                {appearance === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button
                className="lc-language"
                onClick={() =>
                  void data.i18n.changeLanguage(en ? "zh-CN" : "en")
                }
              >
                {en ? "中" : "EN"}
              </button>
              <Link className="lc-login" to="/admin/dashboard">
                {en ? "Dashboard" : "管理"}
                <ChevronRight size={13} />
              </Link>
            </div>
          </header>
          {!data.live.showCallout && (
            <div className="lc-notice" role="status">
              {en
                ? "Live connection interrupted. Current readings are unavailable."
                : "实时连接已中断，当前读数暂不可用。"}
            </div>
          )}
          {data.inventory.error && (
            <div className="lc-notice" role="status">
              {en
                ? "Node information could not be refreshed. Retry to recover."
                : "节点资料刷新失败，请重试。"}
              <button onClick={() => void refresh()}>
                {en ? "Retry" : "重试"}
              </button>
            </div>
          )}
          <Outlet />
          <footer className="lc-footer">
            <span>
              Powered by{" "}
              <a
                href="https://github.com/komari-monitor/komari"
                target="_blank"
                rel="noreferrer"
              >
                Komari Monitor
              </a>
            </span>
            <span>Linen 3.0</span>
          </footer>
          {typeof settings?.customFooterHtml === "string" &&
            settings.customFooterHtml && (
              <div
                className="lc-custom-footer"
                dangerouslySetInnerHTML={{ __html: settings.customFooterHtml }}
              />
            )}
        </div>
      </div>
    </Context.Provider>
  );
}
export function ClearLayout() {
  return (
    <LiveDataProvider>
      <ShellContent />
    </LiveDataProvider>
  );
}
function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={active ? "is-active" : ""}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function ClearHome() {
  const p = useData();
  const { en, rows, display } = p;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [group, setGroup] = useState("all");
  const [sort, setSort] = useState("default");
  const [view, setView] = useLocalStorage<"grid" | "list">(
    "linen3-view",
    "grid",
  );
  const [controls, setControls] = useState(false);
  const groups = useMemo(
    () => [...new Set(rows.map((r) => r.node.group?.trim() || ""))].sort(),
    [rows],
  );
  useEffect(() => {
    if (group !== "all" && !groups.includes(group)) setGroup("all");
  }, [group, groups]);
  const offline = rows.filter((r) => r.status === "offline").length,
    online = rows.filter((r) => r.status === "online").length,
    attention = rows.filter((r) => r.issue).length;
  const network = summarizeNetwork(
    rows.map((r) => ({
      record: r.sample,
      online: r.status === "online",
      sampleKnown: r.status === "online" || r.status === "offline",
    })),
  );
  const complete =
    rows.length > 0 &&
    Boolean(p.live.live_data) &&
    p.live.showCallout &&
    rows.every((r) => r.status === "online" || r.status === "offline");
  const items = useMemo(
    () =>
      rows
        .filter((r) => {
          const name = [r.node.name, r.node.group, r.node.region, r.node.os]
            .join(" ")
            .toLocaleLowerCase();
          return (
            (!query.trim() ||
              name.includes(query.trim().toLocaleLowerCase())) &&
            (group === "all" || (r.node.group?.trim() || "") === group) &&
            (filter === "all" ||
              (filter === "attention" ? Boolean(r.issue) : r.status === filter))
          );
        })
        .sort((a, b) =>
          sort === "name"
            ? a.node.name.localeCompare(b.node.name)
            : sort === "cpu"
              ? (b.status === "online" && numeric(b.sample?.cpu.usage)
                  ? b.sample.cpu.usage
                  : -1) -
                (a.status === "online" && numeric(a.sample?.cpu.usage)
                  ? a.sample.cpu.usage
                  : -1)
              : (a.node.weight ?? 0) - (b.node.weight ?? 0),
        ),
    [rows, query, filter, group, sort],
  );
  const speed = (n: number | null) =>
    n === null ? "—" : formatBytes(n) + "/s";
  return (
    <>
      <section className="lc-page-title">
        <div>
          <h1>{en ? "Node overview" : "节点概览"}</h1>
          <p>
            {en
              ? "Status, resources and network — in one place."
              : "状态、资源与网络，一屏查看。"}
          </p>
        </div>
        <span className="lc-count">
          {rows.length} {en ? "nodes" : "个节点"}
        </span>
      </section>
      <section
        className="lc-summary"
        aria-label={en ? "Panel summary" : "面板概览"}
      >
        {display.showOverviewOnline && (
          <div>
            <span>{en ? "Online nodes" : "在线节点"}</span>
            <strong>
              {complete ? online : "—"}
              <small> / {rows.length}</small>
            </strong>
            <em>
              {complete
                ? offline
                  ? en
                    ? offline + " offline"
                    : offline + " 个离线"
                  : en
                    ? "All online"
                    : "全部在线"
                : en
                  ? "Awaiting samples"
                  : "等待采样确认"}
            </em>
          </div>
        )}
        {display.showNetworkBandwidth && (
          <div>
            <span>{en ? "Current bandwidth" : "当前带宽"}</span>
            <strong className="lc-down">
              <ArrowDown size={13} />
              {speed(network.speedDown)}
            </strong>
            <em className="lc-up">
              ↑ {speed(network.speedUp)}
              {network.ratePartial ? (en ? " · partial" : " · 部分数据") : ""}
            </em>
          </div>
        )}
        {display.showNetworkTotal && (
          <div>
            <span>{en ? "Reported transfer" : "累计传输"}</span>
            <strong>
              {network.totalBytes === null
                ? "—"
                : formatBytes(network.totalBytes)}
            </strong>
            <em>
              {network.counterPartial
                ? en
                  ? "Partial counters"
                  : "部分计数缺失"
                : en
                  ? "Last-reported counters"
                  : "最后上报计数"}
            </em>
          </div>
        )}
        {display.showOverviewAttention && (
          <div>
            <span>{en ? "Needs attention" : "待关注"}</span>
            <strong>
              {p.live.showCallout && p.live.live_data ? attention : "—"}
              <small> {en ? "nodes" : "个"}</small>
            </strong>
            <em>
              {en ? "Online resource / sample issues" : "在线资源或采样异常"}
            </em>
          </div>
        )}
      </section>
      <section
        className="lc-toolbar"
        aria-label={en ? "Node filters" : "节点筛选"}
      >
        <div className="lc-filter-row">
          <div className="lc-segments">
            <Choice active={filter === "all"} onClick={() => setFilter("all")}>
              {en ? "All" : "全部"} <b>{rows.length}</b>
            </Choice>
            <Choice
              active={filter === "online"}
              onClick={() => setFilter("online")}
            >
              {en ? "Online" : "在线"} <b>{online}</b>
            </Choice>
            <Choice
              active={filter === "offline"}
              onClick={() => setFilter("offline")}
            >
              {en ? "Offline" : "离线"} <b>{offline}</b>
            </Choice>
            {display.showPrioritySection && (
              <Choice
                active={filter === "attention"}
                onClick={() => setFilter("attention")}
              >
                {en ? "Attention" : "待关注"} <b>{attention}</b>
              </Choice>
            )}
          </div>
          <div className="lc-view">
            <button
              aria-label={en ? "Card view" : "卡片视图"}
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              aria-label={en ? "List view" : "列表视图"}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List size={16} />
            </button>
          </div>
        </div>
        <div className="lc-search-row">
          <label className="lc-search">
            <Search size={15} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                en ? "Search nodes, location or OS" : "搜索节点、地区或系统"
              }
              aria-label={en ? "Search nodes" : "搜索节点"}
            />
          </label>
          <button
            className={"lc-filter-button " + (controls ? "is-active" : "")}
            aria-expanded={controls}
            onClick={() => setControls(!controls)}
          >
            <SlidersHorizontal size={14} />
            {en ? "Filters" : "筛选"}
          </button>
        </div>
        {controls && (
          <div className="lc-more-filters">
            <label>
              {en ? "Group" : "分组"}
              <select
                aria-label={en ? "Group" : "分组"}
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              >
                <option value="all">{en ? "All groups" : "全部分组"}</option>
                {groups.map((v) => (
                  <option key={v} value={v}>
                    {v || (en ? "Ungrouped" : "未分组")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {en ? "Sort" : "排序"}
              <select
                aria-label={en ? "Sort" : "排序"}
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="default">
                  {en ? "Default order" : "默认顺序"}
                </option>
                <option value="name">{en ? "Name" : "名称"}</option>
                <option value="cpu">CPU</option>
              </select>
            </label>
          </div>
        )}
      </section>
      <section
        className={"lc-fleet is-" + view}
        aria-label={en ? "Node inventory" : "节点列表"}
      >
        {items.map((r) => (
          <NodeCard
            key={r.node.uuid}
            node={r.node}
            sample={r.sample}
            status={r.status}
            now={p.now}
            en={en}
            display={display}
            day={p.daily.records[r.node.uuid]}
            dayStatus={p.daily.status}
            zone={p.daily.zone}
            carriers={p.carriers[r.node.uuid]}
            refresh={p.refresh}
          />
        ))}
        {!items.length && (
          <div className="lc-empty">
            <Activity size={24} />
            <h2>
              {p.inventory.isLoading
                ? en
                  ? "Loading nodes…"
                  : "正在读取节点…"
                : en
                  ? "No matching nodes"
                  : "没有符合条件的节点"}
            </h2>
            <p>
              {p.inventory.error
                ? en
                  ? "Node information is unavailable."
                  : "节点资料暂时不可用。"
                : en
                  ? "Change the search or filters to see more nodes."
                  : "调整搜索或筛选条件后再试。"}
            </p>
            <button
              onClick={() => {
                setQuery("");
                setFilter("all");
                setGroup("all");
              }}
            >
              {en ? "Reset filters" : "清除筛选"}
            </button>
          </div>
        )}
      </section>
      <p className="lc-bottom-note">
        {en ? "Showing" : "显示"} {items.length} / {rows.length} ·{" "}
        {en
          ? "Reported counters can reset. Daily totals use recorded samples."
          : "累计计数可能重置，今日流量按已记录样本统计。"}
      </p>
    </>
  );
}
export function ClearDetail() {
  const { uuid = "" } = useParams();
  const p = useData();
  const row = p.rows.find((r) => r.node.uuid === uuid);
  const { en } = p;
  return (
    <>
      <div className="lc-detail-nav">
        <Link to="/">
          <ChevronLeft size={15} />
          {en ? "All nodes" : "全部节点"}
        </Link>
        <span>{en ? "Node details" : "节点详情"}</span>
      </div>
      {!row ? (
        <div className="lc-empty">
          <h1>
            {p.inventory.isLoading
              ? en
                ? "Loading…"
                : "读取中…"
              : en
                ? "Node unavailable"
                : "节点不可用"}
          </h1>
          <p>
            {en
              ? "This node may be private or no longer exists."
              : "节点可能未公开或已被移除。"}
          </p>
          <button onClick={() => void p.refresh()}>
            {en ? "Retry" : "重试"}
          </button>
        </div>
      ) : (
        <>
          <div className="lc-detail-layout">
            <div className="lc-detail-main">
              <NodeCard
                detail
                node={row.node}
                sample={row.sample}
                status={row.status}
                now={p.now}
                en={en}
                display={p.display}
                day={p.daily.records[uuid]}
                dayStatus={p.daily.status}
                zone={p.daily.zone}
                carriers={p.carriers[uuid]}
                refresh={p.refresh}
              />
              {p.display.showCarrierLatency && (
                <Routes uuid={uuid} en={en} now={p.now} />
              )}
            </div>
            <aside className="lc-section lc-specs">
              <div className="lc-section-head">
                <h2>{en ? "System information" : "系统信息"}</h2>
              </div>
              <dl>
                {[
                  [en ? "Operating system" : "操作系统", row.node.os],
                  [en ? "Processor" : "处理器", row.node.cpu_name],
                  [en ? "Cores" : "核心", row.node.cpu_cores],
                  [en ? "Architecture" : "架构", row.node.arch],
                  [
                    en ? "Memory" : "内存",
                    numeric(row.node.mem_total)
                      ? formatBytes(row.node.mem_total)
                      : "—",
                  ],
                  [
                    en ? "Storage" : "存储",
                    numeric(row.node.disk_total)
                      ? formatBytes(row.node.disk_total)
                      : "—",
                  ],
                  [en ? "Virtualization" : "虚拟化", row.node.virtualization],
                  [en ? "Region" : "地区", row.node.region],
                  [en ? "Group" : "分组", row.node.group],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt>{label}</dt>
                    <dd>{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </aside>
          </div>
          <div id="lc-history">
            <History uuid={uuid} en={en} />
          </div>
        </>
      )}
    </>
  );
}
