import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { assertOutcome, installObservation, readApplication } from "./production-oracle.mjs";
const output = process.argv[2];
mkdirSync(output, { recursive: true });
const save = (name, value) => writeFileSync(join(output, `${name}.json`), JSON.stringify(value, null, 2));
async function json(url, method = "GET", body) {
    const response = await fetch(url, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(45000),
    });
    const result = await response.json();
    if (!response.ok || result.value?.error) throw new Error(`${url}: ${JSON.stringify(result)}`);
    return result;
}
const wdBase = "http://127.0.0.1:4444";
const session = (await json(`${wdBase}/session`, "POST", {
    capabilities: { alwaysMatch: { browserName: "firefox" } },
})).value;
const wd = async (path, body) => (await json(`${wdBase}/session/${session.sessionId}/${path}`, "POST", body)).value;
await wd("timeouts", { script: 30000, pageLoad: 60000, implicit: 0 });
const execute = (fn, ...args) => wd("execute/sync", { script: `return (${fn.toString()})(...arguments)`, args });
const asyncExecute = (script, ...args) => wd("execute/async", { script, args });
const state = () => execute(readApplication);
if (process.env.OUTLINER_NATIVE_BACKEND === "wsl2-linux") {
    const observations = [];
    for (
        const url of [
            "http://127.0.0.1:7090/",
            "http://127.0.0.1:7093/health",
            "http://127.0.0.1:57070/api/health",
            "http://127.0.0.1:59099/",
            "http://127.0.0.1:58080/",
        ]
    ) {
        await wd("url", { url });
        const observed = await asyncExecute(`
            const done = arguments[arguments.length - 1];
            fetch(location.href, {cache: 'no-store', signal: AbortSignal.timeout(10000)})
                .then(async r => done({url:location.href, documentURI:document.documentURI,
                    status:r.status, text:(await r.text()).slice(0, 500)}))
                .catch(e => done({url:location.href, error:String(e)}));
        `);
        observations.push(observed);
        save("windows-firefox-linux-localhost", {
            platform: session.capabilities.platformName,
            browser: session.capabilities.browserVersion,
            observations,
        });
        if (observed.status !== 200 || observed.error || observed.documentURI.startsWith("about:")) {
            throw new Error(`Windows-native Firefox could not reach Linux service ${url}`);
        }
    }
}
let baseline;
async function waitFor(fn, message) {
    const deadline = Date.now() + 60000;
    let last;
    do {
        try {
            last = await fn();
            if (last) return last;
        } catch (e) {
            last = e.message;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    } while (Date.now() < deadline);
    throw new Error(`${message}: ${JSON.stringify(last)}`);
}
async function prepare({ action }) {
    const auth = await json(
        "http://127.0.0.1:59099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key",
        "POST",
        { email: "test@example.com", password: "password", returnSecureToken: true },
    ).catch(async e => {
        if (!e.message.includes("EMAIL_EXISTS")) throw e;
        return json(
            "http://127.0.0.1:59099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key",
            "POST",
            { email: "test@example.com", password: "password", returnSecureToken: true },
        );
    });
    const project = `Native IME ${Date.now()}`;
    const page = action;
    const response = await fetch("http://127.0.0.1:7093/api/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.idToken}` },
        body: JSON.stringify({
            projectName: project,
            pages: [{ name: page, lines: ["prefixsuffix", "lefttail", "untouched"] }],
        }),
        signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Authenticated seeding failed: ${await response.text()}`);
    // Initial origin load sets the same test flags used by the existing E2E harness.
    // These configure disposable auth/services; no input/layout/handler is replaced.
    await wd("url", { url: "http://127.0.0.1:7090/?isTest=true" });
    await execute(() => {
        for (
            const [key, value] of Object.entries({
                VITE_IS_TEST: "true",
                VITE_E2E_TEST: "true",
                VITE_USE_FIREBASE_EMULATOR: "true",
                VITE_YJS_REQUIRE_AUTH: "true",
                VITE_DISABLE_YJS_INDEXEDDB: "true",
            })
        ) localStorage.setItem(key, value);
    });
    try {
        await waitFor(() => execute(() => !!window.__SVELTE_GOTO__), "Svelte navigation unavailable");
    } catch (error) {
        // Retain bootstrap facts before failing; do not substitute application state.
        save(
            `${action}-bootstrap-failure`,
            await execute(() => ({
                url: location.href,
                readyState: document.readyState,
                body: document.body.textContent.slice(0, 2000),
                navigation: !!window.__SVELTE_GOTO__,
                authManager: !!window.__USER_MANAGER__,
                authenticated: !!window.__USER_MANAGER__?.auth?.currentUser,
                yjsStore: !!window.__YJS_STORE__,
                connected: !!window.__YJS_STORE__?.isConnected,
            })),
        );
        throw error;
    }
    await asyncExecute(
        "const done = arguments[arguments.length - 1]; window.__SVELTE_GOTO__(arguments[0]).then(() => done(true), e => done({error:String(e)}));",
        `/${encodeURIComponent(project)}/${page}?isTest=true`,
    );
    await waitFor(() =>
        execute(() =>
            !!window.__USER_MANAGER__?.auth?.currentUser
            && window.__YJS_STORE__?.isConnected && [...document.querySelectorAll(".item-text")].some(e =>
                e.textContent === "prefixsuffix"
            )
        ), "Authenticated ordinary editor not ready");
    const user = await execute(() => ({
        uid: window.__USER_MANAGER__.auth.currentUser.uid,
        email: window.__USER_MANAGER__.auth.currentUser.email,
        provider: window.__USER_MANAGER__.auth.currentUser.providerData.map(p => p.providerId),
    }));
    if (user.uid !== auth.localId || !user.provider.includes("password")) {
        throw new Error("Browser did not authenticate as emulator password user");
    }
    await execute(installObservation, action);
    save(`${action}-authentication`, user);
    return state();
}
// Read-only DOM Range geometry at a logical text boundary; OS Alt+Click adds
// the second caret through OutlinerItem's ordinary UI handler.
function geometry(text, offset) {
    const item = [...document.querySelectorAll(".outliner-item[data-item-id]")].find(e =>
        e.querySelector(".item-text")?.textContent === text
    );
    if (!item) throw new Error(`Item missing: ${text}`);
    const element = item.querySelector(".item-text");
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node, remaining = offset, rect;
    while ((node = walker.nextNode())) {
        if (remaining <= node.textContent.length) {
            const range = document.createRange();
            range.setStart(node, remaining);
            range.collapse(true);
            rect = range.getBoundingClientRect();
            break;
        }
        remaining -= node.textContent.length;
    }
    if (!rect || rect.height <= 0) throw new Error("No visible text boundary geometry");
    return {
        itemId: item.dataset.itemId,
        x: (window.mozInnerScreenX + rect.left) * devicePixelRatio,
        y: (window.mozInnerScreenY + rect.top + rect.height / 2) * devicePixelRatio,
    };
}
async function mutationControls({ candidate, cancel }) {
    const original = await state();
    const controls = cancel
        ? ["incorrect-restored-caret"]
        : [
            "omitted-insertion",
            "duplicated-insertion",
            "incorrect-caret",
            ...(baseline.cursors.length === 2 ? ["missing-second-recipient"] : []),
        ];
    for (const mutation of controls) {
        try {
            await execute(
                (name, before, chosen) => {
                    const store = window.editorOverlayStore;
                    const cursor = before.cursors[name === "missing-second-recipient" ? 1 : 0];
                    if (name.includes("caret")) {
                        store.updateCursor({
                            ...store.cursors[cursor.cursorId],
                            offset: cursor.offset + (name === "incorrect-restored-caret" ? 1 : 0),
                        });
                        return;
                    }
                    const project = window.__YJS_STORE__.yjsClient.getProject();
                    let target;
                    const find = items => {
                        for (const item of items) {
                            if (item.id === cursor.itemId) target = item;
                            find(item.items);
                        }
                    };
                    find(project.items);
                    if (!target) throw new Error("Mutation target missing");
                    const text = target.yMap.get("text");
                    if (name === "duplicated-insertion") text.insert(cursor.offset, chosen);
                    else text.delete(cursor.offset, chosen.length);
                },
                mutation,
                baseline,
                candidate,
            );
            await new Promise(resolve => setTimeout(resolve, 200));
            const mutated = await state();
            let reason;
            try {
                assertOutcome(baseline, mutated, candidate, cancel);
            } catch (e) {
                reason = e.message;
            }
            save(`${baseline.action}-control-${mutation}`, { mutation, rejected: !!reason, reason, observed: mutated });
            if (!reason) throw new Error(`Production mutation passed: ${mutation}`);
        } finally {
            await execute(snapshot => {
                const project = window.__YJS_STORE__.yjsClient.getProject();
                const restore = items => {
                    for (const item of items) {
                        const saved = snapshot.items.find(i => i.id === item.id);
                        const text = item.yMap.get("text");
                        if (text.toString() !== saved.canonical) {
                            text.delete(0, text.length);
                            text.insert(0, saved.canonical);
                        }
                        restore(item.items);
                    }
                };
                restore(project.items);
                for (const c of snapshot.cursors) window.editorOverlayStore.updateCursor(c);
            }, original);
            await new Promise(resolve => setTimeout(resolve, 200));
            assertOutcome(baseline, await state(), candidate, cancel);
        }
    }
    return { controls };
}
createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    try {
        let body = "";
        for await (const chunk of req) body += chunk;
        const args = body ? JSON.parse(body) : {};
        let result;
        if (req.url === "/prepare") result = await prepare(args);
        else if (req.url === "/geometry") result = await execute(geometry, args.text, args.offset);
        else if (req.url === "/state") result = await state();
        else if (req.url === "/baseline") {
            baseline = await state();
            save(`${baseline.action}-before`, baseline); // Also retain invalid UI-placement diagnostics.
            if (
                baseline.cursors.length !== args.count || baseline.selections.length || !baseline.focused
                || baseline.wrap !== "off"
            ) throw new Error("Invalid production baseline");
            for (const c of baseline.cursors) {
                const expected = args.targets.find(t => t.itemId === c.itemId);
                const item = baseline.items.find(item => item.id === c.itemId);
                if (!item || item.rendered !== item.canonical) {
                    throw new Error("Baseline target has no matching rendered text");
                }
                if (!expected || c.offset !== expected.offset) {
                    throw new Error("UI did not place the required baseline caret");
                }
            }
            result = baseline;
        } else if (req.url === "/assert") {
            const after = await state();
            save(`${baseline.action}-after`, after); // Retain the immutable outcome even when an assertion fails.
            const expected = assertOutcome(baseline, after, args.candidate, args.cancel);
            result = { baseline, candidate: args.candidate, cancel: args.cancel, expected, after, result: "PROVEN" };
            save(`${baseline.action}-result`, result);
        } else if (req.url === "/mutations") result = await mutationControls(args);
        else throw new Error(`Unknown bridge command ${req.url}`);
        res.end(JSON.stringify(result));
    } catch (e) {
        save("production-bridge-error", { error: e.stack });
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e.message }));
    }
}).listen(
    8766,
    "127.0.0.1",
    () => save("production-bridge-ready", { sessionId: session.sessionId, capabilities: session.capabilities }),
);
