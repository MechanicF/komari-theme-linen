export const CARRIER_LABELS = {
  telecom: { zh: "电信", en: "Telecom" },
  unicom: { zh: "联通", en: "Unicom" },
  mobile: { zh: "移动", en: "Mobile" },
};
export type Carrier = keyof typeof CARRIER_LABELS;
export const CARRIERS = Object.keys(CARRIER_LABELS) as Carrier[];
export type CarrierState = "fresh" | "missing" | "timeout" | "stale";
export type CarrierLatency = {
  carrier: Carrier;
  value: number | null;
  state: CarrierState;
  sampledAt: number | null;
};
type Task = { id?: unknown; name?: unknown; interval?: number };
type Series = {
  entity_id?: unknown;
  tags?: Record<string, unknown>;
  interval_seconds?: number;
  points?: { time?: unknown; value?: unknown }[];
};
const patterns = {
  telecom: /电信|電信|telecom|ctcc|chinanet|cn2/i,
  unicom: /联通|聯通|unicom|cucc|china169/i,
  mobile: /移动|移動|mobile|cmcc|cmnet/i,
};
const idKeys = {
  telecom: "carrierTelecomTaskId",
  unicom: "carrierUnicomTaskId",
  mobile: "carrierMobileTaskId",
};
export function identifyCarrier(name: unknown): Carrier | null {
  return CARRIERS.find((c) => patterns[c].test(String(name ?? ""))) ?? null;
}
export function carrierTaskIds(
  settings: unknown,
  tasks: Task[] = [],
): Partial<Record<Carrier, string>> {
  const root = (
    settings && typeof settings === "object" ? settings : {}
  ) as Record<string, unknown>;
  const old = (root.carrierLatencyTaskIds ?? {}) as Partial<
    Record<Carrier, unknown>
  >;
  const result: Partial<Record<Carrier, string>> = {};
  for (const c of CARRIERS) {
    const value = String(root[idKeys[c]] || old[c] || "").trim();
    if (/^\d+$/.test(value) && Number(value) > 0) {
      if (!tasks.length || tasks.some((t) => String(t.id) === value))
        result[c] = value;
      continue;
    }
    const task = tasks.find(
      (t) => t.id != null && identifyCarrier(t.name) === c,
    );
    if (task) result[c] = String(task.id);
  }
  return result;
}
export function deriveCarrierLatency(
  tasks: Task[],
  series: Series[],
  ids: string[],
  now = Date.now(),
  timeoutMs = 180000,
  settings?: unknown,
): Record<string, CarrierLatency[]> {
  const map = carrierTaskIds(settings, tasks);
  const allowed = new Set(ids);
  const selected = new Set(Object.values(map));
  const latest = new Map<
    string,
    { value: number; at: number; window: number }
  >();
  for (const s of series) {
    const tid = String(s.tags?.task_id ?? "");
    const node = String(s.entity_id ?? "");
    if (!selected.has(tid) || !allowed.has(node)) continue;
    for (const p of s.points ?? []) {
      const at = Date.parse(String(p.time));
      const value = p.value;
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        !Number.isFinite(at) ||
        at > now + 30000
      )
        continue;
      const key = node + "\0" + tid;
      const old = latest.get(key);
      if (!old || at >= old.at)
        latest.set(key, {
          value,
          at,
          window: Math.max(
            timeoutMs,
            (s.interval_seconds ?? 0) * 2000,
            (tasks.find((t) => String(t.id) === tid)?.interval ?? 0) * 3000,
          ),
        });
    }
  }
  return Object.fromEntries(
    ids.map((id) => [
      id,
      CARRIERS.map((carrier) => {
        const tid = map[carrier];
        const p = tid ? latest.get(id + "\0" + tid) : undefined;
        const state: CarrierState = !p
          ? "missing"
          : now - p.at > p.window
            ? "stale"
            : p.value < 0
              ? "timeout"
              : "fresh";
        return {
          carrier,
          state,
          value: state === "fresh" ? p!.value : null,
          sampledAt: p?.at ?? null,
        };
      }),
    ]),
  );
}
