export const DISPLAY_DEFAULTS = {
  showPrioritySection: true,
  showOverviewOnline: true,
  showOverviewCpu: true,
  showOverviewMemory: true,
  showOverviewAttention: true,
  showNetworkBandwidth: true,
  showNetworkCounters: true,
  showNetworkTotal: true,
  showNodeRegion: true,
  showNodeGroup: true,
  showNodeOs: true,
  showNodeCpu: true,
  showNodeMemory: true,
  showNodeDisk: true,
  showNodeNetwork: true,
  showNodeUptime: true,
  showNodeLoad: true,
  showNodeExpiry: true,
  showCarrierLatency: true,
  showNodeTrafficProgress: true,
  showNodeTrafficTotal: true,
  showNodeTrafficToday: true,
} as const;
export type DisplayOptions = { [K in keyof typeof DISPLAY_DEFAULTS]: boolean };
export function readDisplayOptions(value: unknown): DisplayOptions {
  const settings =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    Object.entries(DISPLAY_DEFAULTS).map(([key, fallback]) => {
      const entry = settings[key];
      const enabled =
        entry === false || entry === 0 || entry === "0" || entry === "false"
          ? false
          : entry === true || entry === 1 || entry === "1" || entry === "true"
            ? true
            : fallback;
      return [key, enabled];
    }),
  ) as DisplayOptions;
}
