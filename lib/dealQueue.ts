/* -------------------------------------------------------------------------- */
/*  Deal Queue — the review inbox between the Scanner and the Pipeline.        */
/*                                                                            */
/*  The Scanner finds opportunities → they land here for triage. Only deals I  */
/*  explicitly promote enter the Acquisition Pipeline (which means "actively    */
/*  pursuing"). Queue triage state is intentionally separate from pipeline      */
/*  stage. Stored in localStorage (no database).                               */
/* -------------------------------------------------------------------------- */

import {
  genId,
  sanitizeDealState,
  type DealState,
  type PropertyTracking,
} from "./deals";
import type { ScanRow } from "./scanner";

export type QueueStatus =
  | "new"
  | "watching"
  | "analyzing"
  | "ignored"
  | "promoted";

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  new: "New",
  watching: "Watching",
  analyzing: "Analyzing",
  ignored: "Ignored",
  promoted: "In Pipeline",
};

export type QueueItem = {
  id: string;
  propertyKey: string;
  queueStatus: QueueStatus;
  addedAt: number;
  updatedAt: number;
  promotedDealId?: string;
  sourceLabel: string;
  confidence: number;
  /** Analysis-ready deal (carries photos + tracking). Metrics are derived live. */
  deal: DealState;
};

/* ------------------------------ tracking merge ---------------------------- */

function reconcileTracking(
  prev: PropertyTracking | undefined,
  price: number | null,
  now: number,
): PropertyTracking {
  if (!prev) {
    return {
      firstSeen: now,
      lastSeen: now,
      lastScan: now,
      previousPrice: null,
      currentPrice: price,
      priceChange: null,
    };
  }
  const out: PropertyTracking = { ...prev, lastSeen: now, lastScan: now };
  if (price != null && prev.currentPrice != null && price !== prev.currentPrice) {
    out.previousPrice = prev.currentPrice;
    out.currentPrice = price;
    out.priceChange = price - prev.currentPrice;
  } else if (price != null && prev.currentPrice == null) {
    out.currentPrice = price;
  }
  return out;
}

/**
 * Merge a fresh scan's passing rows into the existing queue:
 *  - dedupe by propertyKey,
 *  - update price tracking across runs (price-drop detection),
 *  - keep ignored items hidden (they still track silently, never resurface as new),
 *  - leave already-promoted items in place (tracking updated).
 */
export function mergeScanIntoQueue(
  existing: QueueItem[],
  rows: ScanRow[],
  now: number = Date.now(),
): QueueItem[] {
  const result = existing.map((item) => ({ ...item }));
  const resultByKey = new Map<string, QueueItem>();
  for (const item of result) resultByKey.set(item.propertyKey, item);

  for (const row of rows) {
    const key = row.property.propertyKey;
    if (!key) continue;
    const current = resultByKey.get(key);
    const price = row.property.price;

    if (current) {
      // Update tracking + refresh analysis; preserve identity + triage state.
      const reconciled = reconcileTracking(current.deal.tracking, price, now);
      current.deal = { ...row.deal, tracking: reconciled };
      current.sourceLabel = row.property.sourceLabel;
      current.confidence = row.property.confidence;
      current.updatedAt = now;
    } else {
      const item: QueueItem = {
        id: genId(),
        propertyKey: key,
        queueStatus: "new",
        addedAt: now,
        updatedAt: now,
        sourceLabel: row.property.sourceLabel,
        confidence: row.property.confidence,
        deal: row.deal,
      };
      result.push(item);
      resultByKey.set(key, item);
    }
  }
  return result;
}

/* --------------------------------- updates -------------------------------- */

export function setItemStatus(
  items: QueueItem[],
  id: string,
  status: QueueStatus,
): QueueItem[] {
  const now = Date.now();
  return items.map((it) =>
    it.id === id ? { ...it, queueStatus: status, updatedAt: now } : it,
  );
}

export function markPromoted(
  items: QueueItem[],
  id: string,
  dealId: string,
): QueueItem[] {
  const now = Date.now();
  return items.map((it) =>
    it.id === id
      ? { ...it, queueStatus: "promoted", promotedDealId: dealId, updatedAt: now }
      : it,
  );
}

export function removeItem(items: QueueItem[], id: string): QueueItem[] {
  return items.filter((it) => it.id !== id);
}

/* ------------------------------- persistence ------------------------------ */

const STORE_KEY = "brrrr-deal-queue-v1";

const QUEUE_STATUSES: QueueStatus[] = [
  "new",
  "watching",
  "analyzing",
  "ignored",
  "promoted",
];

function sanitizeItem(x: unknown): QueueItem | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const now = Date.now();
  const deal = sanitizeDealState(o.deal);
  return {
    id: typeof o.id === "string" ? o.id : genId(),
    propertyKey: typeof o.propertyKey === "string" ? o.propertyKey : "",
    queueStatus: QUEUE_STATUSES.includes(o.queueStatus as QueueStatus)
      ? (o.queueStatus as QueueStatus)
      : "new",
    addedAt: typeof o.addedAt === "number" ? o.addedAt : now,
    updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : now,
    promotedDealId:
      typeof o.promotedDealId === "string" ? o.promotedDealId : undefined,
    sourceLabel: typeof o.sourceLabel === "string" ? o.sourceLabel : "Scan",
    confidence: typeof o.confidence === "number" ? o.confidence : 0,
    deal,
  };
}

export function loadQueue(): QueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map(sanitizeItem)
          .filter((i): i is QueueItem => i !== null && !!i.propertyKey);
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return [];
}

export function saveQueue(items: QueueItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota errors */
  }
}
