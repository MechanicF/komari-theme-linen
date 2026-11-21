import type { NodeBasicInfo } from "@/contexts/NodeListContext";
import type { Record as LiveRecord } from "@/types/LiveData";
import { formatBytes } from "@/utils/unitHelper";
import type { DisplayOptions } from "./linenDisplay";
import type { DailyTrafficStatus } from "./useDailyTraffic";
import {
  isTrafficValue,
  trafficQuota,
  type DailyTraffic,
} from "./linenTraffic";
import "./NodeTraffic.css";
const bytes = (value: number | null | undefined) =>
  isTrafficValue(value) ? formatBytes(value) : "—";
export default function NodeTraffic({
  node,
  network,
  online,
  en,
  display,
  daily,
  status,
  zone,
  fetched,
}: {
  node: NodeBasicInfo;
  network: LiveRecord["network"] | undefined;
  online: boolean;
  en: boolean;
  display: DisplayOptions;
  daily: DailyTraffic | undefined;
  status: DailyTrafficStatus;
  zone: string;
  fetched: number;
}) {
  const quota = trafficQuota(
    network?.totalUp,
    network?.totalDown,
    node.traffic_limit,
    node.traffic_limit_type,
  );
  const showQuota = display.showNodeTrafficProgress && quota.limit !== null;
  if (
    !showQuota &&
    !display.showNodeTrafficTotal &&
    !display.showNodeTrafficToday
  )
    return null;
  const both =
    isTrafficValue(network?.totalUp) && isTrafficValue(network?.totalDown);
  const cumulative =
    isTrafficValue(network?.totalUp) || isTrafficValue(network?.totalDown)
      ? (isTrafficValue(network?.totalUp) ? network.totalUp : 0) +
        (isTrafficValue(network?.totalDown) ? network.totalDown : 0)
      : null;
  const mode: Record<string, string> = en
    ? {
        up: "Upload only",
        down: "Download only",
        sum: "Upload + download",
        max: "Larger direction",
        min: "Smaller direction",
      }
    : {
        up: "仅上传",
        down: "仅下载",
        sum: "上传＋下载",
        max: "双向较大值",
        min: "双向较小值",
      };
  const dailyNote =
    status === "error"
      ? daily?.total != null
        ? en
          ? "Last result · update failed"
          : "上次统计 · 更新失败"
        : en
          ? "Today's records unavailable"
          : "暂无法获取今日记录"
      : status === "loading"
        ? en
          ? "Updating records…"
          : "正在更新记录…"
        : daily?.total == null
          ? en
            ? "No records today"
            : "暂无今日记录"
          : daily.partial
            ? en
              ? "Partial records"
              : "记录不完整"
            : en
              ? "Sample totals, not billing"
              : "采样统计，非账单";
  const updated = fetched
    ? new Date(fetched).toLocaleTimeString(en ? "en-US" : "zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: zone === "UTC" ? "UTC" : "Asia/Shanghai",
      })
    : "";
  return (
    <section
      className={
        "linen-node-traffic" +
        (Number(display.showNodeTrafficTotal) +
          Number(display.showNodeTrafficToday) ===
        1
          ? " is-one-number"
          : "")
      }
      aria-label={en ? "Node traffic usage" : "节点流量用量"}
    >
      {showQuota && (
        <div className="linen-quota" data-node-traffic="quota">
          <div className="linen-quota__heading">
            <span>{en ? "Traffic allowance" : "流量额度"}</span>
            <strong>
              {quota.percent === null
                ? en
                  ? "Usage unavailable"
                  : "用量数据不足"
                : quota.percent.toFixed(1) + "%"}
            </strong>
          </div>
          {quota.bar !== null && (
            <div
              className={
                "linen-quota__bar " +
                (quota.percent! >= 100
                  ? "is-over"
                  : quota.percent! >= 80
                    ? "is-warn"
                    : "")
              }
              role="progressbar"
              aria-label={
                en ? "Configured traffic allowance used" : "已用流量额度"
              }
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Number(quota.bar.toFixed(2))}
              aria-valuetext={
                quota.percent!.toFixed(1) +
                "%" +
                (quota.percent! > 100
                  ? en
                    ? ", over allowance"
                    : "，已超额"
                  : "")
              }
            >
              {Array.from({ length: 24 }, (_, i) => (
                <span
                  key={i}
                  data-filled={i < Math.ceil(((quota.bar ?? 0) * 24) / 100)}
                />
              ))}
            </div>
          )}
          {quota.limit !== null && (
            <small className="linen-quota__note">
              {mode[quota.mode]} · {bytes(quota.used)} / {bytes(quota.limit)}
              {quota.over !== null && quota.over > 0
                ? (en ? " · over " : " · 超出 ") + bytes(quota.over)
                : ""}
              {!online ? (en ? " · last report" : " · 最后上报") : ""}
            </small>
          )}
          <small className="linen-traffic-help">
            {en
              ? "Uses node allowance settings; no billing period assumed."
              : "按节点设置计入额度，不推断账期或月度用量。"}
          </small>
        </div>
      )}
      {display.showNodeTrafficTotal && (
        <div className="linen-traffic-number" data-node-traffic="cumulative">
          <span>
            {cumulative === null || both
              ? en
                ? "Cumulative transfer"
                : "累计传输"
              : en
                ? "Known cumulative transfer"
                : "已知累计传输"}
          </span>
          <strong>{bytes(cumulative)}</strong>
          <small>
            ↑ {bytes(network?.totalUp)} · ↓ {bytes(network?.totalDown)}
          </small>
          <small className="linen-traffic-help">
            {en
              ? "Last-reported counters; may reset."
              : "最后上报计数，可能因重启或重置而变化。"}
          </small>
        </div>
      )}
      {display.showNodeTrafficToday && (
        <div className="linen-traffic-number" data-node-traffic="today">
          <span>
            {en ? "Recorded today" : "今日已记录"} <small>({zone})</small>
          </span>
          <strong>{bytes(daily?.total)}</strong>
          <small>
            ↑ {bytes(daily?.up)} · ↓ {bytes(daily?.down)}
          </small>
          <small
            className={
              "linen-traffic-help " +
              (daily?.partial || status === "error" ? "is-partial" : "")
            }
            title={
              en
                ? "Since 00:00: sum of stored upload/download increments; gaps, resets and bucket boundaries can affect totals. Not a carrier bill."
                : "从所选时区00:00起，汇总服务端已存储的上传和下载增量；受缺报、重置和采样桶边界影响，不是运营商账单。"
            }
          >
            {dailyNote}
            {updated ? (en ? " · updated " : " · 更新于 ") + updated : ""}
          </small>
        </div>
      )}
    </section>
  );
}
