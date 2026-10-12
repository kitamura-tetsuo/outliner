// Regression tests for the Project SQL catalog surface (issue #5574).
//
// These tests exercise the real production paths: real Y.Doc storage, the
// real ENUM parser/comparator, and the real authenticated service transport.
// No mocks: authorization is a plain injected value, exactly as the UI wires
// it from UserManager, so "refused" assertions prove the service gate rather
// than a stub.

import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { GRID_REGISTRY_KEY } from "./gridDocs";
import {
    classifySource,
    createSqlCatalogService,
    declarationsEqual,
    getCatalogRegistry,
    listCatalogDeclarations,
    parseEnumDeclaration,
    type SqlCatalogAuth,
    SqlCatalogAuthError,
    SqlCatalogError,
    SqlCatalogService,
} from "./sqlCatalog";
import { TABLE_REGISTRY_KEY } from "./tableDocs";

const PRIORITY_SOURCE = "CREATE TYPE priority_level AS ENUM ('high','medium','low')";

function authorized(overrides: Partial<SqlCatalogAuth> = {}): () => SqlCatalogAuth {
    return () => ({ userId: "user-1", hasWriteGrant: true, projectId: "project-1", ...overrides });
}

function serviceFor(doc: Y.Doc, resolveAuth: () => SqlCatalogAuth = authorized()): SqlCatalogService {
    return createSqlCatalogService(doc, { projectId: "project-1", resolveAuth });
}

describe("parseEnumDeclaration", () => {
    it("parses one unqualified ENUM declaration with exact labels in order", () => {
        const parsed = parseEnumDeclaration(PRIORITY_SOURCE);
        expect(parsed.name).toBe("priority_level");
        expect(parsed.labels).toEqual(["high", "medium", "low"]);
    });

    it("rejects qualified names", () => {
        expect(() => parseEnumDeclaration("CREATE TYPE public.priority_level AS ENUM ('a')"))
            .toThrowError(/unqualified/);
    });

    it("rejects multiple statements", () => {
        expect(() => parseEnumDeclaration(`${PRIORITY_SOURCE}; SELECT 1`)).toThrowError(/exactly one/);
    });

    it("rejects an empty label list", () => {
        expect(() => parseEnumDeclaration("CREATE TYPE empty_type AS ENUM ()")).toThrowError();
    });
});

describe("classifySource (REQ-004)", () => {
    it("exposes ENUM as the executable kind", () => {
        const classified = classifySource(PRIORITY_SOURCE);
        expect(classified.kind).toBe("ENUM");
    });

    it("reports other DDL as unsupported rather than working functionality", () => {
        for (
            const ddl of [
                "CREATE TABLE tasks (id text PRIMARY KEY)",
                "CREATE VIEW v AS SELECT 1",
                "SELECT * FROM tasks",
                "CREATE TYPE mood AS RANGE (SUBTYPE = integer)",
            ]
        ) {
            const classified = classifySource(ddl);
            expect(classified.kind).toBe("UNSUPPORTED");
            if (classified.kind === "UNSUPPORTED") expect(classified.reason.length).toBeGreaterThan(0);
        }
    });
});

describe("declarationsEqual", () => {
    it("compares exact labels in declaration order", () => {
        expect(declarationsEqual(PRIORITY_SOURCE, "CREATE TYPE priority_level AS ENUM ('high', 'medium', 'low')"))
            .toBe(true);
        expect(declarationsEqual(PRIORITY_SOURCE, "CREATE TYPE priority_level AS ENUM ('low','medium','high')"))
            .toBe(false);
        expect(declarationsEqual(PRIORITY_SOURCE, "CREATE TYPE priority_level AS ENUM ('high','medium')")).toBe(false);
        expect(declarationsEqual(PRIORITY_SOURCE, "CREATE TYPE other AS ENUM ('high','medium','low')")).toBe(false);
    });
});

describe("SqlCatalogService CRUD (REQ-001, AS-001)", () => {
    it("creates, lists, inspects, edits and deletes through the authenticated transport", () => {
        const doc = new Y.Doc();
        const service = serviceFor(doc);

        expect(service.list()).toEqual([]);

        const created = service.create(PRIORITY_SOURCE);
        expect(created.kind).toBe("ENUM");
        expect(created.name).toBe("priority_level");
        expect(created.labels).toEqual(["high", "medium", "low"]);

        const listed = service.list();
        expect(listed.map((d) => ({ id: d.id, kind: d.kind, name: d.name }))).toEqual([
            { id: created.id, kind: "ENUM", name: "priority_level" },
        ]);

        expect(service.get(created.id)?.source).toBe(created.source);

        const edited = service.update(
            created.id,
            "CREATE TYPE priority_level AS ENUM ('high','medium','low','urgent')",
        );
        expect(edited.labels).toEqual(["high", "medium", "low", "urgent"]);
        expect(service.get(created.id)?.labels).toEqual(["high", "medium", "low", "urgent"]);

        const scratch = service.create("CREATE TYPE scratch_type AS ENUM ('a')");
        expect(service.remove(scratch.id)).toBe(true);
        expect(service.get(scratch.id)).toBeUndefined();
        expect(service.remove(scratch.id)).toBe(false);
        doc.destroy();
    });

    it("rejects duplicate TYPE names", () => {
        const doc = new Y.Doc();
        const service = serviceFor(doc);
        service.create(PRIORITY_SOURCE);
        expect(() => service.create("CREATE TYPE priority_level AS ENUM ('x')")).toThrowError(/already declared/);
        doc.destroy();
    });

    it("refuses unsupported DDL on create and update", () => {
        const doc = new Y.Doc();
        const service = serviceFor(doc);
        expect(() => service.create("CREATE TABLE t (id text)")).toThrowError(SqlCatalogError);
        const created = service.create(PRIORITY_SOURCE);
        expect(() => service.update(created.id, "SELECT 1")).toThrowError(SqlCatalogError);
        // The failed update leaves the persisted source untouched.
        expect(service.get(created.id)?.source).toBe(created.source);
        doc.destroy();
    });
});

describe("authenticated transport (REQ-002, AS-001)", () => {
    it("refuses every mutation for missing grants", () => {
        const doc = new Y.Doc();
        const anonymous = serviceFor(doc, authorized({ userId: undefined }));
        expect(() => anonymous.create(PRIORITY_SOURCE)).toThrowError(SqlCatalogAuthError);
        expect(anonymous.list()).toEqual([]);

        const seeded = serviceFor(doc);
        const created = seeded.create(PRIORITY_SOURCE);
        expect(() => anonymous.update(created.id, PRIORITY_SOURCE)).toThrowError(SqlCatalogAuthError);
        expect(() => anonymous.remove(created.id)).toThrowError(SqlCatalogAuthError);
        // Refused mutations persist nothing new and delete nothing.
        expect(seeded.get(created.id)?.source).toBe(created.source);
        doc.destroy();
    });

    it("refuses every mutation for denied grants", () => {
        const doc = new Y.Doc();
        const reader = serviceFor(doc, authorized({ hasWriteGrant: false }));
        expect(() => reader.create(PRIORITY_SOURCE)).toThrowError(SqlCatalogAuthError);

        const seeded = serviceFor(doc);
        const created = seeded.create(PRIORITY_SOURCE);
        expect(() => reader.update(created.id, PRIORITY_SOURCE)).toThrowError(SqlCatalogAuthError);
        expect(() => reader.remove(created.id)).toThrowError(SqlCatalogAuthError);
        expect(seeded.list()).toHaveLength(1);
        doc.destroy();
    });

    it("distinguishes missing-grant from denied refusals", () => {
        const doc = new Y.Doc();
        try {
            serviceFor(doc, authorized({ userId: undefined })).create(PRIORITY_SOURCE);
            expect.unreachable();
        } catch (err) {
            expect(err).toBeInstanceOf(SqlCatalogAuthError);
            expect((err as SqlCatalogAuthError).code).toBe("missing-grant");
        }
        try {
            serviceFor(doc, authorized({ hasWriteGrant: false })).create(PRIORITY_SOURCE);
            expect.unreachable();
        } catch (err) {
            expect(err).toBeInstanceOf(SqlCatalogAuthError);
            expect((err as SqlCatalogAuthError).code).toBe("denied");
        }
        doc.destroy();
    });
});

describe("catalog separation (REQ-003)", () => {
    it("keeps TYPE source in its own registry, away from Table and Grid state", () => {
        const doc = new Y.Doc();
        const service = serviceFor(doc);
        service.create(PRIORITY_SOURCE);

        expect(getCatalogRegistry(doc).size).toBe(1);
        expect(doc.getMap(TABLE_REGISTRY_KEY).size).toBe(0);
        expect(doc.getMap(GRID_REGISTRY_KEY).size).toBe(0);
        // The persisted declaration round-trips through the catalog alone.
        expect(listCatalogDeclarations(doc)[0]?.name).toBe("priority_level");
        doc.destroy();
    });

    it("never presents foreign bytes under the catalog key as declarations", () => {
        const doc = new Y.Doc();
        doc.transact(() => {
            const entry = new Y.Map<unknown>();
            entry.set("source", "SELECT 1");
            getCatalogRegistry(doc).set("foreign", entry);
        });
        expect(listCatalogDeclarations(doc)).toEqual([]);
        doc.destroy();
    });
});
