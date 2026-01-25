// Polling analysis monitor
import { getLogger } from "./logger";

const logger = getLogger("pollingMonitor");

interface PollingStats {
    count: number;
    lastTime: number;
    intervalSum: number;
}

const stats: Map<string, PollingStats> = new Map();

/**
 * Record polling event
 * @param name Event name (e.g., 'getDoc')
 */
export function recordPolling(name: string) {
    const now = Date.now();

    if (!stats.has(name)) {
        stats.set(name, {
            count: 1,
            lastTime: now,
            intervalSum: 0,
        });
    } else {
        const stat = stats.get(name)!;
        const interval = now - stat.lastTime;

        stat.count++;
        stat.lastTime = now;
        stat.intervalSum += interval;

        // Warning if polling interval is too short (e.g., less than 100ms)
        if (interval < 100) {
            logger.warn(`Polling '${name}' is too frequent: ${interval}ms`);
        }
    }
}

/**
 * Get polling statistics
 */
export function getPollingStats() {
    const result: Record<string, any> = {};

    for (const [name, stat] of stats.entries()) {
        const avgInterval = stat.count > 1 ? stat.intervalSum / (stat.count - 1) : 0;
        result[name] = {
            count: stat.count,
            avgInterval: Math.round(avgInterval),
        };
    }

    return result;
}

/**
 * Reset statistics
 */
export function resetPollingStats() {
    stats.clear();
}
