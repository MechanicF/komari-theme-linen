export function getNodeExpiry(value: unknown, now: number) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(T|$)/.test(value))
    return null;
  const date = value.slice(0, 10);
  const midnight = Date.parse(date + "T00:00:00Z");
  if (
    !Number.isFinite(midnight) ||
    new Date(midnight).toISOString().slice(0, 10) !== date
  )
    return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(now))
    return null;
  const days = Math.max(0, Math.ceil((timestamp - now) / 86400000));
  return {
    date: value.slice(0, 10),
    days,
    state: timestamp <= now ? "expired" : days <= 7 ? "soon" : "active",
  } as const;
}
