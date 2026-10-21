import { parseEnum } from "$shared/services/sqlEnvironmentCompiler";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
    applyCatalogMutation,
    catalogKindLabel,
    fetchCatalogSnapshot,
    isExecutableEnumSource,
    resolveCatalogTypeName,
    SqlCatalogTransportError,
    validateCatalogMutation,
} from "./sqlCatalogClient";

describe("sqlCatalogClient naming", () => {
    it("resolves the unqualified ENUM declaration name", () => {
        expect(resolveCatalogTypeName("CREATE TYPE priority_level AS ENUM ('high','medium','low')"))
            .toBe("priority_level");
        expect(resolveCatalogTypeName("create type \"my type\" as enum ('a');")).toBe("my type");
        expect(
            resolveCatalogTypeName("-- project type\nCREATE TYPE task_state AS ENUM ('Open', 'Closed');\n"),
        ).toBe("task_state");
    });

    it("resolves names the way the catalog compiler does (comments, case folding, escapes)", () => {
        // Block-comment-prefixed source is accepted by the service, so the
        // surface must show its resolved name instead of "unsupported".
        expect(resolveCatalogTypeName("/* project type */ CREATE TYPE task_state AS ENUM ('Open', 'Closed');"))
            .toBe("task_state");
        // Unquoted identifiers fold to lowercase per PostgreSQL rules.
        expect(resolveCatalogTypeName("CREATE TYPE TaskState AS ENUM ('Open');")).toBe("taskstate");
        // Quoted identifiers keep case and unescape doubled quotes.
        expect(resolveCatalogTypeName('CREATE TYPE "My ""Quoted"" Type" AS ENUM (\'a\');'))
            .toBe('My "Quoted" Type');
        // Unquoted Unicode identifiers are valid PostgreSQL names and must
        // resolve the same way the catalog compiler accepts them.
        expect(resolveCatalogTypeName("CREATE TYPE 状態 AS ENUM ('open', 'closed');")).toBe("状態");
        expect(isExecutableEnumSource("CREATE TYPE 状態 AS ENUM ('open', 'closed');")).toBe(true);
        // Comments between tokens and after the statement are trivia, not new shapes.
        expect(resolveCatalogTypeName("CREATE /* c */ TYPE task_state AS ENUM ('a');")).toBe("task_state");
        expect(resolveCatalogTypeName("CREATE TYPE task_state AS ENUM ('a'); /* done */")).toBe("task_state");
        expect(isExecutableEnumSource("/* project type */ CREATE TYPE task_state AS ENUM ('Open', 'Closed');"))
            .toBe(true);
        expect(isExecutableEnumSource("CREATE TYPE TaskState AS ENUM ('Open');")).toBe(true);
    });

    it("uses the shared parser for nested comments and PostgreSQL literal syntax", () => {
        const sources = [
            "/* outer /* nested */ comment */ CREATE /* between */ TYPE 状態 AS ENUM ('open;now', E'line\\nfeed');",
            "CREATE TYPE \"My \"\"Mood\"\"\" AS ENUM ('happy; yes', 'it''s fine');",
        ];

        for (const source of sources) {
            expect(resolveCatalogTypeName(source)).toBe(parseEnum(source).name);
            expect(isExecutableEnumSource(source)).toBe(true);
        }
    });

    it("reports every other DDL shape as unsupported", () => {
        expect(resolveCatalogTypeName("CREATE TABLE tasks (id TEXT PRIMARY KEY)")).toBeUndefined();
        expect(resolveCatalogTypeName("SELECT 1")).toBeUndefined();
        expect(resolveCatalogTypeName("CREATE TYPE mood AS ENUM ('happy'")).toBeUndefined();
        expect(resolveCatalogTypeName("CREATE TYPE mood AS ENUM ('happy")).toBeUndefined();
        expect(resolveCatalogTypeName("/* unterminated CREATE TYPE mood AS ENUM ('happy')")).toBeUndefined();
        // Qualified names are not the supported Project-level shape.
        expect(resolveCatalogTypeName("CREATE TYPE public.task_state AS ENUM ('a')")).toBeUndefined();
        // Two declarations are not one declaration per object.
        expect(
            resolveCatalogTypeName(
                "CREATE TYPE a AS ENUM ('x'); CREATE TYPE b AS ENUM ('y');",
            ),
        ).toBeUndefined();
        expect(resolveCatalogTypeName("")).toBeUndefined();
    });

    it("marks only the single ENUM declaration executable", () => {
        expect(isExecutableEnumSource("CREATE TYPE priority_level AS ENUM ('high','medium','low')")).toBe(true);
        expect(isExecutableEnumSource("CREATE TABLE tasks (id TEXT PRIMARY KEY)")).toBe(false);
        expect(isExecutableEnumSource("CREATE TYPE public.task_state AS ENUM ('a')")).toBe(false);
    });

    it("labels only the enum kind executable", () => {
        expect(catalogKindLabel("enum")).toBe("ENUM");
        expect(catalogKindLabel("table")).toBe("Unsupported (table)");
    });
});

describe("sqlCatalogClient transport", () => {
    let observed: { method?: string; url?: string; authorization?: string; body?: unknown; } = {};
    let answer: { status: number; payload: unknown; } = { status: 200, payload: {} };
    let origin = "";
    let listener: Server | undefined;

    async function start(): Promise<void> {
        const server = createServer((req, res) => {
            let raw = "";
            req.on("data", chunk => {
                raw += chunk;
            });
            req.on("end", () => {
                observed = {
                    method: req.method,
                    url: req.url,
                    authorization: req.headers.authorization,
                    body: raw.length > 0 ? JSON.parse(raw) : undefined,
                };
                res.writeHead(answer.status, { "Content-Type": "application/json" });
                res.end(JSON.stringify(answer.payload));
            });
        });
        await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Loopback catalog server did not bind");
        origin = `http://127.0.0.1:${address.port}`;
        listener = server;
    }

    afterEach(async () => {
        observed = {};
        answer = { status: 200, payload: {} };
        await new Promise<void>(resolve => listener!.close(() => resolve()));
        listener = undefined;
    });

    it("reads through the authenticated transport with a Bearer token", async () => {
        await start();
        const snapshot = {
            projectId: "demo",
            format: 1,
            objects: [{ id: "enum-1", kind: "enum", source: "CREATE TYPE t AS ENUM ('a')" }],
            revision: "rev-1",
        };
        answer = { status: 200, payload: { snapshot } };
        const result = await fetchCatalogSnapshot("demo", {
            baseUrl: origin,
            getToken: async () => "test-token",
        });
        expect(result).toEqual(snapshot);
        expect(observed.method).toBe("GET");
        expect(observed.url).toBe("/api/sql-catalog/read?projectId=demo");
        expect(observed.authorization).toBe("Bearer test-token");
    });

    it("applies mutations without any client-declared UID or authorization", async () => {
        await start();
        answer = { status: 200, payload: { result: { status: "applied" } } };
        const mutation = {
            expectedRevision: "rev-1",
            intent: {
                operation: "create" as const,
                object: { id: "enum-1", kind: "enum", source: "CREATE TYPE t AS ENUM ('a')" },
            },
        };
        await applyCatalogMutation("demo", mutation, { baseUrl: origin, getToken: async () => "test-token" });
        expect(observed.method).toBe("POST");
        expect(observed.url).toBe("/api/sql-catalog/apply");
        expect(observed.authorization).toBe("Bearer test-token");
        expect(observed.body).toEqual({ projectId: "demo", ...mutation });
        expect(observed.body).not.toHaveProperty("uid");
    });

    it("validates through the same authorized transport", async () => {
        await start();
        answer = { status: 200, payload: { result: { status: "preview" } } };
        const mutation = {
            expectedRevision: "rev-1",
            intent: { operation: "delete" as const, objectId: "enum-1" },
        };
        const result = await validateCatalogMutation("demo", mutation, {
            baseUrl: origin,
            getToken: async () => "test-token",
        });
        expect(result).toEqual({ status: "preview" });
        expect(observed.url).toBe("/api/sql-catalog/validate");
    });

    it("refuses to send without a token and surfaces denied grants", async () => {
        await start();
        await expect(fetchCatalogSnapshot("demo", { baseUrl: origin, getToken: async () => undefined }))
            .rejects.toMatchObject({ name: "SqlCatalogTransportError", status: 401 });
        expect(observed.authorization).toBeUndefined();

        answer = { status: 403, payload: { error: "Forbidden", code: "forbidden" } };
        const failure = await fetchCatalogSnapshot("demo", {
            baseUrl: origin,
            getToken: async () => "test-token",
        }).catch(error => error);
        expect(failure).toBeInstanceOf(SqlCatalogTransportError);
        expect(failure).toMatchObject({ status: 403, code: "forbidden" });
    });
});
