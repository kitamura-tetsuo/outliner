const assert = require("node:assert/strict");
const { execFileSync, spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const root = path.resolve(__dirname, "../..");
const guard = path.join(__dirname, "assert-no-tinylicious.sh");
function executable(dir, name, body) {
    fs.writeFileSync(path.join(dir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}
test("absence guard rejects process, listener and observation failures in a conditional", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tiny-guard-"));
    try {
        executable(dir, "ps", 'printf \'%s\\n\' "$FAKE_PS"; exit "${FAKE_PS_STATUS:-0}"');
        executable(dir, "ss", 'printf \'%s\\n\' "$FAKE_SS"; exit "${FAKE_SS_STATUS:-0}"');
        const processLine = "node node /tmp/node_modules/tinylicious/bin/start.js";
        const listenerLine = "LISTEN 0 128 127.0.0.1:7092 0.0.0.0:*";
        for (
            const [ps, ss, psStatus, ssStatus, expected] of [
                ["", "", "0", "0", 0],
                [processLine, "", "0", "0", 13],
                ["", listenerLine, "0", "0", 13],
                [processLine, listenerLine, "0", "0", 13],
                ["", "", "1", "0", 13],
                ["", "", "0", "1", 13],
            ]
        ) {
            const result = spawnSync("bash", ["-c", 'if ! bash "$1"; then exit 13; fi', "guard-test", guard], {
                env: {
                    ...process.env,
                    PATH: `${dir}:${process.env.PATH}`,
                    FAKE_PS: ps,
                    FAKE_SS: ss,
                    FAKE_PS_STATUS: psStatus,
                    FAKE_SS_STATUS: ssStatus,
                },
                encoding: "utf8",
            });
            assert.equal(result.status, expected, `ps=${ps} ss=${ss}: ${result.stderr}`);
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
test("VS Code compounds invoke port cleanup before a fresh server binds", async () => {
    const launch = fs.readFileSync(path.join(root, ".vscode/launch.json"), "utf8");
    const tasks = fs.readFileSync(path.join(root, ".vscode/tasks.json"), "utf8");
    for (
        const name of [
            "Servers",
            "Test Servers",
            "Localhost Test Servers",
            "Localhost Test Servers with Firebase Functions",
        ]
    ) {
        const compound = launch.match(new RegExp(`"name": "${name}"[\\s\\S]*?\\n        }`));
        assert.ok(compound, name);
        assert.match(compound[0], /"preLaunchTask": "Clean Development Ports"/);
    }
    const task = tasks.match(/"label": "Clean Development Ports"[\s\S]*?"command": "([^"]+)"/);
    assert.ok(task);
    assert.equal(task[1], "node ${workspaceFolder}/scripts/kill-tinylicious.js");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dev-port-cleanup-"));
    const port = Number(process.env.DEV_CLEANUP_TEST_PORT || 7090);
    const child = spawn(process.execPath, [
        "-e",
        'require("node:net").createServer().listen(Number(process.env.OWNED_PORT), "127.0.0.1", () => process.send("ready"))',
    ], {
        env: { ...process.env, OWNED_PORT: String(port) },
        stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    const exited = new Promise(resolve => child.once("exit", (code, signal) => resolve({ code, signal })));
    try {
        await new Promise((resolve, reject) => {
            child.once("message", resolve);
            child.once("error", reject);
            child.once("exit", () => reject(new Error("owned listener did not start")));
        });
        // Restrict lsof to the listener owned by this test; leave all other services untouched.
        executable(
            dir,
            "lsof",
            'if [ "$2" = ":7090" ]; then /usr/bin/lsof -nP -t -iTCP:"$OWNED_PORT" -sTCP:LISTEN | awk -v pid="$OWNED_PID" \'$0 == pid { print }\'; else exit 1; fi',
        );
        const output = execFileSync(process.execPath, [task[1].replace("node ${workspaceFolder}/", `${root}/`)], {
            env: {
                ...process.env,
                PATH: `${dir}:${process.env.PATH}`,
                OWNED_PORT: String(port),
                OWNED_PID: String(child.pid),
            },
            encoding: "utf8",
            timeout: 10000,
        });
        assert.match(output, /Checking for processes on port 7090/);
        assert.match(output, new RegExp(`Killing process with PID: ${child.pid}`));
        assert.equal((await exited).signal, "SIGKILL");
        const replacement = net.createServer();
        await new Promise((resolve, reject) => replacement.once("error", reject).listen(port, "127.0.0.1", resolve));
        await new Promise((resolve, reject) => replacement.close(error => error ? reject(error) : resolve()));
    } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
