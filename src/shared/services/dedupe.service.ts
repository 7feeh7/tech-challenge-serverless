const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 5000;

interface DedupeEntry {
  processedAt: number;
}

const processedEvents = new Map<string, DedupeEntry>();

export function wasEventProcessed(eventId: string): boolean {
  cleanupExpired();
  return processedEvents.has(eventId);
}

export function markEventProcessed(eventId: string): void {
  cleanupExpired();

  if (processedEvents.size >= MAX_ENTRIES) {
    const oldestKey = processedEvents.keys().next().value;
    if (oldestKey) {
      processedEvents.delete(oldestKey);
    }
  }

  processedEvents.set(eventId, { processedAt: Date.now() });
}

export function resetDedupeCache(): void {
  processedEvents.clear();
}

function cleanupExpired(): void {
  const now = Date.now();

  for (const [eventId, entry] of processedEvents.entries()) {
    if (now - entry.processedAt > TTL_MS) {
      processedEvents.delete(eventId);
    }
  }
}
