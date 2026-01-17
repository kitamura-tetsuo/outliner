import type { Server } from "@hocuspocus/server";

let totalMessages = 0;
let currentSecondCount = 0;
const history: number[] = [];

const timer = setInterval(() => {
    history.push(currentSecondCount);
    if (history.length > 60) {
        history.shift();
    }
    currentSecondCount = 0;
}, 1000);
// Prevent the timer from keeping Node.js event loop alive during tests.
timer.unref();

export function recordMessage() {
    totalMessages++;
    currentSecondCount++;
}

export function getMetrics(server: Server) {
    const msgPerSec = history.length === 0 ? 0 : history.reduce((a, b) => a + b, 0) / history.length;
    return {
        connections: (server as any).getConnectionsCount(),
        totalMessages,
        msgPerSec,
    };
}

export function resetMetrics() {
    totalMessages = 0;
    currentSecondCount = 0;
    history.length = 0;
}

export function stopMetrics() {
    clearInterval(timer);
}
