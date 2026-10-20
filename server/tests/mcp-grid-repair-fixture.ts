import fs from "node:fs";
import * as Y from "yjs";
import { mcpLogPath, refreshMcpLogStream } from "../src/utils/log-manager.js";
import { httpGridFixture } from "./mcp-create-grid-http-fixture.js";
export type Fixture = ReturnType<typeof httpGridFixture>;
export function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => {
        resolve = done;
    });
    return { promise, resolve };
}
export function pauseValidation(f: Fixture) {
    const started = deferred(), release = deferred();
    const target = f.relations as unknown as { validateGridCandidate: (...args: unknown[]) => Promise<unknown>; };
    const original = target.validateGridCandidate.bind(f.relations);
    target.validateGridCandidate = async (...args) => {
        const result = await original(...args);
        started.resolve();
        await release.promise;
        return result;
    };
    return { started, release };
}
export function snapshot(f: Fixture) {
    return [f.project.ydoc, f.tasks, f.people].map(doc => Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"));
}
export function auditReader() {
    const stream = refreshMcpLogStream();
    return async (operationId: string) => {
        await new Promise<void>((resolve, reject) => stream.write("", error => error ? reject(error) : resolve()));
        return fs.readFileSync(mcpLogPath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line))
            .filter(record => record.event === "mcp_audit" && record.operationId === operationId);
    };
}
export function holdCleanup(f: Fixture, room: "source" | "project", fail = false) {
    const started = deferred(), release = deferred();
    // Only the actual direct connection is wrapped; native validation and
    // Yjs publication/release continue through the production services.
    const host = f.hocuspocus as unknown as {
        openDirectConnection: (room: string) => Promise<{ disconnect: () => Promise<void>; }>;
    };
    const original = host.openDirectConnection.bind(host);
    host.openDirectConnection = async name => {
        const connection = await original(name);
        const disconnect = connection.disconnect.bind(connection);
        if ((room === "project") === !name.includes("/tables/")) {
            connection.disconnect = async () => {
                started.resolve();
                await release.promise;
                await disconnect();
                if (fail) throw new Error("protected cleanup failure");
            };
        }
        return connection;
    };
    return { started, release };
}
