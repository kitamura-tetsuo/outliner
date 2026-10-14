const dns = require("node:dns");
const fs = require("node:fs");
const net = require("node:net");

const auditLog = process.env.OUTLINER_EGRESS_AUDIT_LOG;
if (!auditLog) throw new Error("OUTLINER_EGRESS_AUDIT_LOG is required by the Compose test observer");

const localHosts = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function hostOf(args) {
    const first = args[0];
    if (first && typeof first === "object") return first.host ?? first.hostname;
    return typeof args[1] === "string" ? args[1] : undefined;
}

function refuse(kind, host) {
    if (!host || localHosts.has(host)) return;
    fs.appendFileSync(auditLog, `${JSON.stringify({ kind, host, pid: process.pid })}\n`);
    throw Object.assign(new Error(`External runtime access blocked by Compose test observer: ${host}`), {
        code: "OUTLINER_EGRESS_BLOCKED",
    });
}

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
    refuse("connect", hostOf(args));
    return connect.apply(this, args);
};

for (const method of ["lookup", "resolve", "resolve4", "resolve6"]) {
    const original = dns[method];
    dns[method] = function(host, ...args) {
        refuse(`dns.${method}`, host);
        return original.call(this, host, ...args);
    };
}
