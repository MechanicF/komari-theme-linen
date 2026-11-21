import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  RefreshCw,
  Ellipsis,
  ChevronRight,
} from "lucide-react";
import Flag from "@/components/Flag";
import type { NodeBasicInfo } from "@/contexts/NodeListContext";
import type { Record as Sample } from "@/types/LiveData";
import { formatBytes } from "@/utils/unitHelper";
import type { DisplayOptions } from "../linen/linenDisplay";
import { trafficQuota, type DailyTraffic } from "../linen/linenTraffic";
import { getNodeExpiry } from "../linen/linenExpiry";
import {
  CARRIER_LABELS,
  type CarrierLatency,
} from "../linen/linenCarrierLatency";
import { numeric, ratio, duration, type NodeStatus } from "./data";
const bytes = (n: unknown) => (numeric(n) ? formatBytes(n) : "—");
const rate = (n: unknown) => (numeric(n) ? formatBytes(n) + "/s" : "—");
const pct = (n: unknown) => (numeric(n) ? n.toFixed(1) + "%" : "—");
const labels = {
  online: ["在线", "Online"],
  offline: ["离线", "Offline"],
  pending: ["连接中", "Connecting"],
  disconnected: ["连接中断", "Disconnected"],
  missing: ["等待采样", "Awaiting sample"],
  stale: ["样本过期", "Sample stale"],
} as const;
export default function NodeCard({
  node,
  sample,
  status,
  now,
  en,
  display,
  day,
  dayStatus,
  zone,
  carriers,
  refresh,
  detail = false,
}: {
  node: NodeBasicInfo;
  sample?: Sample;
  status: NodeStatus;
  now: number;
  en: boolean;
  display: DisplayOptions;
  day?: DailyTraffic;
  dayStatus: string;
  zone: string;
  carriers?: CarrierLatency[];
  refresh: () => Promise<void>;
  detail?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const s = status === "online" ? sample : undefined;
  const expiry = display.showNodeExpiry
    ? getNodeExpiry(node.expired_at, now)
    : null;
  const quota = trafficQuota(
    sample?.network.totalUp,
    sample?.network.totalDown,
    node.traffic_limit,
    node.traffic_limit_type,
  );
  const priced = numeric(node.price) && node.price > 0;
  const period =
    node.billing_cycle >= 27 && node.billing_cycle <= 32
      ? en
        ? " / mo"
        : " /月"
      : numeric(node.billing_cycle) && node.billing_cycle > 0
        ? " /" + node.billing_cycle + (en ? "d" : "天")
        : "";
  const metrics = [
    display.showNodeCpu
      ? {
          name: "CPU",
          value: pct(s?.cpu.usage),
          pct: numeric(s?.cpu.usage) ? Math.min(100, s.cpu.usage) : null,
          tone: "blue",
        }
      : null,
    display.showNodeMemory
      ? {
          name: en ? "Memory" : "内存",
          value: pct(ratio(s?.ram.used, node.mem_total)),
          pct: ratio(s?.ram.used, node.mem_total),
          tone: "purple",
        }
      : null,
    display.showNodeDisk
      ? {
          name: en ? "Storage" : "存储",
          value: pct(ratio(s?.disk.used, node.disk_total)),
          pct: ratio(s?.disk.used, node.disk_total),
          tone: "amber",
        }
      : null,
    display.showNodeLoad
      ? {
          name: en ? "Load" : "负载",
          value: numeric(s?.load.load1) ? s.load.load1.toFixed(2) : "—",
          pct:
            numeric(s?.load.load1) && node.cpu_cores > 0
              ? Math.min(100, (s.load.load1 / node.cpu_cores) * 100)
              : null,
          tone: "green",
        }
      : null,
  ].filter((x) => x !== null);
  const total =
    numeric(sample?.network.totalUp) && numeric(sample?.network.totalDown)
      ? sample.network.totalUp + sample.network.totalDown
      : null;
  const direction = {
    up: en ? "Upload" : "上传",
    down: en ? "Download" : "下载",
    sum: en ? "Up + down" : "上传＋下载",
    max: en ? "Larger direction" : "双向较大值",
    min: en ? "Smaller direction" : "双向较小值",
  };
  return (
    <article
      className={"lc-node " + (detail ? "lc-node-detail" : "")}
      data-node={node.uuid}
      data-status={status}
    >
      <header className="lc-node-head">
        {display.showNodeRegion && (
          <span className="lc-flag">
            <Flag flag={node.region} decorative />
          </span>
        )}
        {detail ? (
          <h1 className="lc-node-name" title={node.name}>
            {node.name || "—"}
          </h1>
        ) : (
          <Link
            to={"/instance/" + node.uuid}
            className="lc-node-name"
            title={node.name}
          >
            {node.name || "—"}
          </Link>
        )}
        <span className={"lc-status is-" + status}>
          <i />
          {labels[status][en ? 1 : 0]}
          {status === "online" && display.showNodeUptime && numeric(s?.uptime)
            ? " " + duration(s.uptime, en)
            : ""}
        </span>
        <button
          className="lc-icon lc-refresh"
          type="button"
          disabled={busy}
          aria-label={en ? "Refresh node" : "刷新节点"}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            try {
              await refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          <RefreshCw size={16} className={busy ? "lc-spin" : ""} />
        </button>
        <div className="lc-node-menu">
          <button
            className="lc-icon"
            aria-expanded={open}
            aria-label={en ? "Node menu" : "节点菜单"}
            onClick={() => setOpen(!open)}
          >
            <Ellipsis size={19} />
          </button>
          {open && (
            <nav
              aria-label={en ? "Node links" : "节点快捷入口"}
              onClick={() => setOpen(false)}
            >
              <Link to={"/instance/" + node.uuid}>
                {en ? "Node details" : "节点详情"}
              </Link>
              <Link to="/">{en ? "All nodes" : "全部节点"}</Link>
              {detail && (
                <a href="#lc-history">{en ? "History" : "历史趋势"}</a>
              )}
            </nav>
          )}
        </div>
      </header>
      {(display.showNodeGroup || display.showNodeOs) && (
        <div className="lc-node-meta">
          {display.showNodeGroup && (
            <span>{node.group || (en ? "Ungrouped" : "未分组")}</span>
          )}
          {display.showNodeOs && <span>{node.os || "—"}</span>}
        </div>
      )}
      {metrics.length > 0 && (
        <div
          className="lc-resources"
          style={{
            gridTemplateColumns: "repeat(" + metrics.length + ",minmax(0,1fr))",
          }}
        >
          {metrics.map((m) => (
            <div className={"lc-resource lc-tone-" + m.tone} key={m.name}>
              <div>
                <span>{m.name}</span>
                <strong>{m.value}</strong>
              </div>
              <div className="lc-meter" aria-hidden="true">
                <i style={{ width: (m.pct ?? 0) + "%" }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="lc-network">
        {display.showNodeNetwork && (
          <div className="lc-rates">
            <span className="lc-up">
              <ArrowUp size={12} />
              <b>{rate(s?.network.up)}</b>
            </span>
            <span className="lc-down">
              <ArrowDown size={12} />
              <b>{rate(s?.network.down)}</b>
            </span>
          </div>
        )}
        {display.showNodeTrafficTotal && (
          <div
            className="lc-counters"
            title={
              en ? "Last-reported cumulative counters" : "最后上报的累计计数"
            }
          >
            <span>
              ↑ <b>{bytes(sample?.network.totalUp)}</b>
            </span>
            <span>
              ↓ <b>{bytes(sample?.network.totalDown)}</b>
            </span>
          </div>
        )}
        {(display.showNodeExpiry || priced || node.price === -1) && (
          <div className="lc-billing">
            {expiry && (
              <strong
                className={expiry.state === "expired" ? "lc-danger" : ""}
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
            {(priced || node.price === -1) && (
              <span>
                {en ? "Renew " : "续费 "}
                <b className="lc-up">
                  {node.price === -1
                    ? en
                      ? "Free"
                      : "免费"
                    : (node.currency || "") + node.price}
                </b>
                {priced ? period : ""}
              </span>
            )}
          </div>
        )}
        <div className="lc-connections">
          <span>
            TCP <b>{numeric(s?.connections.tcp) ? s.connections.tcp : "—"}</b>
          </span>
          <span>
            UDP <b>{numeric(s?.connections.udp) ? s.connections.udp : "—"}</b>
          </span>
        </div>
      </div>
      {display.showNodeTrafficProgress && (
        <div className="lc-quota">
          <div className="lc-quota-head">
            <span>
              {en ? "Traffic used" : "流量使用"}{" "}
              <strong
                className={
                  quota.percent !== null && quota.percent >= 100
                    ? "lc-danger"
                    : "lc-up"
                }
              >
                {quota.limit === null
                  ? en
                    ? "∞ Unlimited"
                    : "∞ 无限额"
                  : quota.percent === null
                    ? "—"
                    : quota.percent.toFixed(1) + "%"}
              </strong>
            </span>
            <small>
              {en ? "Used " : "已用 "}
              {quota.limit === null ? bytes(total) : bytes(quota.used)} /{" "}
              {en ? "Total " : "额度 "}
              {quota.limit === null ? "∞" : bytes(quota.limit)}
            </small>
          </div>
          {quota.limit === null ? (
            <div
              className="lc-segment-meter is-unlimited"
              aria-label={
                en
                  ? "Unlimited traffic; no allowance configured"
                  : "无限额流量，未设置额度"
              }
            >
              {Array.from({ length: 24 }, (_, i) => (
                <i key={i} className="is-filled" />
              ))}
            </div>
          ) : (
            quota.bar !== null && (
              <div
                className="lc-segment-meter"
                role="progressbar"
                aria-label={en ? "Traffic allowance used" : "流量额度已用"}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Number(quota.bar.toFixed(2))}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <i
                    key={i}
                    className={
                      i < Math.ceil((quota.bar! * 24) / 100)
                        ? quota.percent! >= 100
                          ? "is-over"
                          : "is-filled"
                        : ""
                    }
                  />
                ))}
              </div>
            )
          )}
          <small className="lc-hint">
            {direction[quota.mode as keyof typeof direction]}
            {quota.over !== null && quota.over > 0
              ? " · " + (en ? "Over " : "超出 ") + bytes(quota.over)
              : ""}{" "}
            ·{" "}
            {quota.limit === null
              ? en
                ? "no configured allowance"
                : "未设置额度"
              : en
                ? "reported counters"
                : "上报计数"}
          </small>
        </div>
      )}
      {(display.showNodeTrafficToday || display.showNodeTrafficTotal) && (
        <div className="lc-usage">
          {display.showNodeTrafficTotal && (
            <div>
              <span>{en ? "Cumulative transfer" : "累计传输"}</span>
              <strong>{bytes(total)}</strong>
              <small>{en ? "Counters may reset" : "计数可能重置"}</small>
            </div>
          )}
          {display.showNodeTrafficToday && (
            <div>
              <span>
                {en ? "Recorded today" : "今日已记录"} <em>{zone}</em>
              </span>
              <strong>{bytes(day?.total)}</strong>
              <small className={dayStatus === "error" ? "lc-danger" : ""}>
                {dayStatus === "error"
                  ? en
                    ? "Update failed"
                    : "统计更新失败"
                  : dayStatus === "loading"
                    ? en
                      ? "Updating…"
                      : "统计更新中…"
                    : day?.total == null
                      ? en
                        ? "No records"
                        : "暂无记录"
                      : day.partial
                        ? en
                          ? "Partial records"
                          : "记录不完整"
                        : en
                          ? "Recorded increments"
                          : "已记录增量"}
              </small>
            </div>
          )}
        </div>
      )}
      {display.showCarrierLatency && (
        <div
          className="lc-carriers"
          aria-label={en ? "Carrier latency" : "三网延迟"}
        >
          {(["telecom", "unicom", "mobile"] as const).map((c) => {
            const row = carriers?.find((r) => r.carrier === c);
            return (
              <span key={c}>
                <span>{CARRIER_LABELS[c][en ? "en" : "zh"]}</span>
                <strong className={row?.state === "timeout" ? "lc-danger" : ""}>
                  {row?.state === "fresh" && numeric(row.value)
                    ? Math.round(row.value) + " ms"
                    : row?.state === "timeout"
                      ? en
                        ? "Timeout"
                        : "超时"
                      : row?.state === "unconfigured"
                        ? en
                          ? "Not configured"
                          : "未配置"
                        : row?.state === "stale"
                          ? en
                            ? "Stale"
                            : "已过期"
                          : "—"}
                </strong>
              </span>
            );
          })}
        </div>
      )}
      {!detail && (
        <footer className="lc-node-foot">
          <Link to={"/instance/" + node.uuid}>
            {en ? "Routes & history" : "线路与历史"}
            <ChevronRight size={12} />
          </Link>
        </footer>
      )}
    </article>
  );
}
