import type { NodeBasicInfo } from "@/contexts/NodeListContext";
import type { Record as Sample } from "@/types/LiveData";
export const numeric = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
export type NodeStatus =
  "pending" | "disconnected" | "missing" | "offline" | "stale" | "online";
export function readingState(
  sample: Sample | undefined,
  ready: boolean,
  connected: boolean,
  now: number,
): NodeStatus {
  if (!ready) return "pending";
  if (!connected) return "disconnected";
  if (!sample || typeof sample.online !== "boolean") return "missing";
  if (!sample.online) return "offline";
  const t = Date.parse(sample.updated_at);
  if (!Number.isFinite(t)) return "missing";
  return Math.abs(now - t) > 30000 ? "stale" : "online";
}
export const ratio = (used: unknown, total: unknown) =>
  numeric(used) && numeric(total) && total > 0
    ? Math.min(100, (used / total) * 100)
    : null;
export function resourceIssue(
  node: NodeBasicInfo,
  sample: Sample | undefined,
  status: NodeStatus,
) {
  if (status === "stale" || status === "missing") return "sampling";
  if (status !== "online" || !sample) return "";
  if (numeric(sample.cpu.usage) && sample.cpu.usage >= 80) return "cpu";
  if ((ratio(sample.ram.used, node.mem_total) ?? 0) >= 82) return "memory";
  if ((ratio(sample.disk.used, node.disk_total) ?? 0) >= 80) return "disk";
  return "";
}
export const duration = (s: unknown, en: boolean) => {
  if (!numeric(s)) return "—";
  const d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60);
  return d
    ? d + (en ? "d " : "天") + h + (en ? "h" : "小时")
    : h
      ? h + (en ? "h " : "小时") + m + (en ? "m" : "分")
      : m + (en ? "m" : "分钟");
};
