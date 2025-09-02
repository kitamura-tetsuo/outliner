import { expect, test } from "@playwright/test";
import "ts-node/register";

test("srv-server-health-probes respond", async () => {
    const { startServer } = await import("../../../server/src/server.ts");
    const cfg = {
        PORT: 12351,
        LOG_LEVEL: "silent",
        ROOM_PREFIX_ENFORCE: false,
        LEVELDB_PATH: "./ydb",
        LEVELDB_ROOM_SIZE_WARN_MB: 50,
        LEVELDB_LOG_INTERVAL_MS: 60 * 60 * 1000,
    };
    const { server } = startServer(cfg as any);
    await new Promise(resolve => server.on("listening", resolve));

    let res = await fetch(`http://localhost:${cfg.PORT}/livez`);
    expect(res.status).toBe(200);

    res = await fetch(`http://localhost:${cfg.PORT}/readyz`);
    expect(res.status).toBe(200);

    res = await fetch(`http://localhost:${cfg.PORT}/metrics`);
    const json = await res.json();
    expect(json.sockets).toBe(0);
    expect(json.rooms).toBe(0);

    server.close();
});
