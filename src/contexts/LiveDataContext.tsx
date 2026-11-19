import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LiveDataResponse, Record as LiveRecord } from "../types/LiveData";
import { useRPC2Call } from "./RPC2Context";

const LIVE_DATA_INTERVAL_MS = 2000;
const readNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : Number.NaN;

const sameStringArray = (left: string[], right: string[]) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const sameLiveRecord = (left: LiveRecord, right: LiveRecord) =>
  left.online === right.online &&
  Object.is(left.cpu.usage, right.cpu.usage) &&
  Object.is(left.ram.used, right.ram.used) &&
  Object.is(left.swap.used, right.swap.used) &&
  Object.is(left.load.load1, right.load.load1) &&
  Object.is(left.load.load5, right.load.load5) &&
  Object.is(left.load.load15, right.load.load15) &&
  Object.is(left.disk.used, right.disk.used) &&
  Object.is(left.network.up, right.network.up) &&
  Object.is(left.network.down, right.network.down) &&
  Object.is(left.network.totalUp, right.network.totalUp) &&
  Object.is(left.network.totalDown, right.network.totalDown) &&
  Object.is(left.connections.tcp, right.connections.tcp) &&
  Object.is(left.connections.udp, right.connections.udp) &&
  Object.is(left.gpu?.average_usage, right.gpu?.average_usage) &&
  Boolean(left.gpu) === Boolean(right.gpu) &&
  Object.is(left.uptime, right.uptime) &&
  Object.is(left.process, right.process) &&
  Object.is(left.message, right.message) &&
  Object.is(left.updated_at, right.updated_at);

const mergeLiveData = (
  result: Record<string, any>,
  previous: LiveDataResponse | null,
): LiveDataResponse => {
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new Error("Invalid live snapshot");
  if (
    Object.values(result).some((value) => !value || typeof value !== "object")
  )
    throw new Error("Invalid live record");
  const nextOnline = Object.entries(result)
    .filter(([, value]: [string, any]) => value.online === true)
    .map(([uuid]) => uuid);
  const previousData = previous?.data;
  const online =
    previousData && sameStringArray(previousData.online, nextOnline)
      ? previousData.online
      : nextOnline;
  const data: Record<string, LiveRecord> = {};
  let changed = !previousData || online !== previousData.online;

  for (const [uuid, value] of Object.entries(result)) {
    const record = value as any;
    const previousRecord = previousData?.data[uuid];
    const lastCounter = (value: unknown, previous: number | undefined) => {
      const current = readNumber(value);
      return Number.isFinite(current) ? current : readNumber(previous);
    };
    const nextRecord: LiveRecord = {
      online: typeof record.online === "boolean" ? record.online : undefined,
      cpu: { usage: readNumber(record.cpu) },
      ram: { used: readNumber(record.ram) },
      swap: { used: readNumber(record.swap) },
      load: {
        load1: readNumber(record.load),
        load5: readNumber(record.load5),
        load15: readNumber(record.load15),
      },
      disk: { used: readNumber(record.disk) },
      network: {
        up: readNumber(record.net_out),
        down: readNumber(record.net_in),
        totalUp: lastCounter(
          record.net_total_out ?? record.net_total_up,
          previousRecord?.network.totalUp,
        ),
        totalDown: lastCounter(
          record.net_total_in ?? record.net_total_down,
          previousRecord?.network.totalDown,
        ),
      },
      connections: {
        tcp: readNumber(record.connections),
        udp: readNumber(record.connections_udp),
      },
      gpu:
        record.gpu !== undefined
          ? { count: 0, average_usage: record.gpu, detailed_info: [] }
          : undefined,
      uptime: readNumber(record.uptime),
      process: readNumber(record.process),
      message: "",
      updated_at: record.time ?? 0,
    };
    if (previousRecord && sameLiveRecord(previousRecord, nextRecord)) {
      data[uuid] = previousRecord;
    } else {
      data[uuid] = nextRecord;
      changed = true;
    }
  }

  for (const [uuid, previousRecord] of Object.entries(
    previousData?.data ?? {},
  )) {
    if (data[uuid]) continue;
    // A missing status is unknown, not proof of offline. Preserve only last-report counters for visible-node totals.
    data[uuid] = {
      ...previousRecord,
      online: undefined,
      cpu: { usage: Number.NaN },
      ram: { used: Number.NaN },
      disk: { used: Number.NaN },
      network: { ...previousRecord.network, up: Number.NaN, down: Number.NaN },
    };
    changed = true;
  }
  if (
    previousData &&
    Object.keys(previousData.data).length !== Object.keys(data).length
  ) {
    changed = true;
  }

  if (!changed && previous) return previous;
  return { data: { online, data }, status: "ok" };
};

// 创建Context
interface LiveDataContextType {
  live_data: LiveDataResponse | null;
  showCallout: boolean;
  refresh: () => Promise<void>;
  onRefresh: (callback: (data: LiveDataResponse) => void) => () => void;
}

const LiveDataContext = createContext<LiveDataContextType>({
  live_data: null,
  showCallout: true,
  refresh: async () => {},
  onRefresh: () => () => {},
});

// 创建Provider组件
export const LiveDataProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [live_data, setLiveData] = useState<LiveDataResponse | null>(null);
  const liveDataRef = useRef<LiveDataResponse | null>(null);
  const [showCallout, setShowCallout] = useState(false);
  const refreshCallbacksRef = useRef<Set<(data: LiveDataResponse) => void>>(
    new Set(),
  );
  const { call } = useRPC2Call();
  const refreshTriggerRef = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => refreshTriggerRef.current(), []);

  // 注册刷新回调函数
  const onRefresh = useCallback(
    (callback: (data: LiveDataResponse) => void) => {
      refreshCallbacksRef.current.add(callback);
      return () => {
        refreshCallbacksRef.current.delete(callback);
      };
    },
    [],
  );

  // 当数据更新时通知所有回调函数
  const notifyRefreshCallbacks = useCallback((data: LiveDataResponse) => {
    refreshCallbacksRef.current.forEach((callback) => callback(data));
  }, []);

  // 采用 RPC2 轮询最新状态，替代 WebSocket
  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    let pending: Promise<void> | null = null;
    const refreshCallbacks = refreshCallbacksRef.current;

    const clearTimer = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    const scheduleNext = () => {
      clearTimer();
      if (!stopped && !document.hidden) {
        timer = window.setTimeout(fetchLatest, LIVE_DATA_INTERVAL_MS);
      }
    };

    const fetchLatest = (): Promise<void> => {
      if (stopped || document.hidden) return Promise.resolve();
      if (pending) return pending;
      clearTimer();
      pending = (async () => {
        try {
          const result: Record<string, any> = await call(
            "common:getNodesLatestStatus",
          );
          if (stopped) return;
          const live = mergeLiveData(result, liveDataRef.current);
          if (live !== liveDataRef.current) {
            liveDataRef.current = live;
            setLiveData(live);
            notifyRefreshCallbacks(live);
          }
          setShowCallout(true);
        } catch (e) {
          if (!stopped) {
            console.error("Live snapshot refresh failed", e);
            setShowCallout(false);
          }
        } finally {
          pending = null;
          scheduleNext();
        }
      })();
      return pending;
    };
    refreshTriggerRef.current = fetchLatest;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearTimer();
      } else if (!pending) {
        void fetchLatest();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (!document.hidden) void fetchLatest();

    return () => {
      stopped = true;
      if (refreshTriggerRef.current === fetchLatest)
        refreshTriggerRef.current = async () => {};
      refreshCallbacks.clear();
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [call, notifyRefreshCallbacks]);

  const contextValue = useMemo(
    () => ({ live_data, showCallout, onRefresh, refresh }),
    [live_data, showCallout, onRefresh, refresh],
  );

  return (
    <LiveDataContext.Provider value={contextValue}>
      {children}
    </LiveDataContext.Provider>
  );
};

export const useLiveData = () => useContext(LiveDataContext);

export default LiveDataContext;
