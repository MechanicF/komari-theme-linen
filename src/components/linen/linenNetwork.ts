import type { Record as LiveRecord } from "@/types/LiveData";

export type NetworkNode = {
  sampleKnown?: boolean;
  online: boolean;
  record?: Pick<LiveRecord, "network">;
};
export const validCounter = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Sum only visible nodes. Live rates require fresh online status; counters retain last-reported offline samples. */
export function summarizeNetwork(nodes: NetworkNode[]) {
  let speedUp = 0,
    speedDown = 0,
    totalUp = 0,
    totalDown = 0;
  let upRates = 0,
    downRates = 0,
    upCounters = 0,
    downCounters = 0;
  let rateNodes = 0,
    counterNodes = 0,
    onlineNodes = 0;
  for (const node of nodes) {
    const n = node.record?.network;
    if (node.online) {
      onlineNodes++;
      if (validCounter(n?.up)) {
        speedUp += n.up;
        upRates++;
      }
      if (validCounter(n?.down)) {
        speedDown += n.down;
        downRates++;
      }
      if (validCounter(n?.up) && validCounter(n?.down)) rateNodes++;
    }
    if (validCounter(n?.totalUp)) {
      totalUp += n.totalUp;
      upCounters++;
    }
    if (validCounter(n?.totalDown)) {
      totalDown += n.totalDown;
      downCounters++;
    }
    if (validCounter(n?.totalUp) && validCounter(n?.totalDown)) counterNodes++;
  }
  return {
    speedUp: upRates ? speedUp : null,
    speedDown: downRates ? speedDown : null,
    totalUp: upCounters ? totalUp : null,
    totalDown: downCounters ? totalDown : null,
    totalBytes: upCounters || downCounters ? totalUp + totalDown : null,
    rateNodes,
    counterNodes,
    onlineNodes,
    nodeCount: nodes.length,
    unknownNodes: nodes.filter((node) => node.sampleKnown === false).length,
    offlineNodes: nodes.filter(
      (node) => node.sampleKnown === true && !node.online,
    ).length,
    ratePartial:
      rateNodes !== onlineNodes ||
      nodes.some((node) => node.sampleKnown === false),
    counterPartial: counterNodes !== nodes.length,
  };
}
