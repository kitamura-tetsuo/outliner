// Test-only IPC host. No catalog HTTP endpoint is added to the application.
import { getAuth } from "firebase-admin/auth";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Y from "yjs";
import { readSqlCatalog } from "../../shared/src/services/sqlCatalog.js";
import { checkContainerAccess } from "../src/access-control.js";
import { loadConfig } from "../src/config.js";
import { initializeFirebase } from "../src/firebase-init.js";
import { createDocumentLoader, createDocumentStore } from "../src/persistence.js";
import { ensureProjectDescriptorForWrite } from "../src/project-directory.js";
import { Project } from "../src/schema/app-schema.js";
import { startServer } from "../src/server.js";
import { SqlCatalogMutationService } from "../src/sql-catalog-service.js";

if (!process.send || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Catalog browser fixture requires IPC and explicit Firebase emulator hosts");
}
if (process.env.ALLOW_TEST_ACCESS !== "false") throw new Error("The fixture must keep resource authorization enabled");
await initializeFirebase();
const directory = await mkdtemp(join(tmpdir(), "outliner-catalog-browser-"));
let server = await boot(0);
let service = catalogService();

async function boot(port: number) {
    // Firebase Auth emulator tokens are verified by the real Admin SDK. The
    // production cache's alg:none fast path is intentionally not enabled.
    const running = await startServer(
        loadConfig({ PORT: String(port), DATABASE_PATH: directory, LOG_LEVEL: "silent" }),
        undefined,
        {
            verifyIdTokenCached: token => getAuth().verifyIdToken(token),
        },
    );
    if (!running.server.listening) await new Promise<void>(resolve => running.server.once("listening", resolve));
    return running;
}
function port() {
    return (server.server.address() as { port: number; }).port;
}
function catalogService() {
    return new SqlCatalogMutationService(
        server.hocuspocus,
        checkContainerAccess,
        createDocumentStore(server.persistence!),
    );
}
async function room<T>(name: string, action: (doc: Y.Doc) => T | Promise<T>): Promise<T> {
    const connection = await server.hocuspocus.openDirectConnection(name, {});
    try {
        return await action(connection.document as unknown as Y.Doc);
    } finally {
        await connection.disconnect();
    }
}
function documentState(projectId: string, doc: Y.Doc) {
    return {
        catalog: readSqlCatalog(projectId, doc as never),
        tables: [...doc.getMap<Y.Map<unknown>>("yjsTables")].map(([id, entry]) => ({
            id,
            sqlName: entry.get("sqlName"),
        })),
        grids: doc.getMap("yjsGrids").toJSON(),
        calendars: doc.getMap("calendars").toJSON(),
    };
}
function tableState(doc: Y.Doc) {
    return {
        schema: doc.getText("schema").toString(),
        records: Object.fromEntries(
            [...doc.getMap<Y.Map<unknown>>("data")].sort(([a], [b]) => a.localeCompare(b)).map((
                [id, value],
            ) => [id, value.toJSON()]),
        ),
    };
}
async function snapshot(projectId: string, tableId: string, persisted: boolean) {
    const projectRoom = `projects/${projectId}`;
    const tableRoom = `${projectRoom}/tables/${tableId}`;
    if (!persisted) {
        return {
            project: await room(projectRoom, doc => documentState(projectId, doc)),
            table: await room(tableRoom, tableState),
        };
    }
    const load = createDocumentLoader(server.persistence!);
    const project = await load(projectRoom);
    const table = await load(tableRoom);
    try {
        return {
            project: project ? documentState(projectId, project) : undefined,
            table: table ? tableState(table) : undefined,
        };
    } finally {
        project?.destroy();
        table?.destroy();
    }
}

async function dispatch(command: string, input: Record<string, any>) {
    if (command === "seed") {
        const user = await getAuth().verifyIdToken(input.token);
        await ensureProjectDescriptorForWrite(user.uid, input.projectId, input.title);
        const project = Project.createInstance(input.title);
        project.addPage(input.pageName, user.uid).items.addNode(user.uid).updateText("Catalog integration");
        await room(`projects/${input.projectId}`, async doc => {
            Y.applyUpdate(doc, Y.encodeStateAsUpdate(project.ydoc));
            await createDocumentStore(server.persistence!)(`projects/${input.projectId}`, doc);
        });
        project.ydoc.destroy();
        return { uid: user.uid, port: port() };
    }
    if (command === "apply") {
        const before = await service.read(input.uid, input.projectId);
        const object = { id: "catalog-state", kind: "enum" as const, source: input.source };
        return await service.apply(input.uid, input.projectId, {
            expectedRevision: before.revision,
            intent: { operation: before.objects.some(entry => entry.id === object.id) ? "replace" : "create", object },
        });
    }
    if (command === "snapshot") return await snapshot(input.projectId, input.tableId, Boolean(input.persisted));
    if (command === "remoteValue") {
        if (!await checkContainerAccess(input.uid, input.projectId)) throw new Error("Forbidden remote fixture update");
        // Deliberately inconsistent synchronized input: runtime must preserve it.
        return await room(`projects/${input.projectId}/tables/${input.tableId}`, doc => {
            const record = doc.getMap<Y.Map<unknown>>("data").get(input.recordId);
            if (!record) throw new Error("The target record must already exist");
            record.set(input.column, input.value);
        });
    }
    if (command === "restart") {
        const priorPort = port();
        await server.shutdown();
        server.persistence?.db?.close();
        server = await boot(priorPort);
        service = catalogService();
        return { port: port() };
    }
    throw new Error(`Unknown fixture command: ${command}`);
}

process.on("message", (message: { id: number; command: string; input: Record<string, any>; }) => {
    void dispatch(message.command, message.input).then(
        result => process.send?.({ id: message.id, result }),
        error => process.send?.({ id: message.id, error: error instanceof Error ? error.stack : String(error) }),
    );
});
process.on("disconnect", () => {
    void server.shutdown().finally(async () => {
        server.persistence?.db?.close();
        await rm(directory, { recursive: true, force: true });
        process.exit(0);
    });
});
process.send({ ready: true, port: port() });
