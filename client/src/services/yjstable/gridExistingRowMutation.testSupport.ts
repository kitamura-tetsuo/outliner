import * as Y from "yjs";
import { createGridExistingRowMutationBoundary } from "./gridExistingRowMutation";
import { createGridMetadataResolver, type GridMetadataResolution } from "./gridMetadataResolver";
import { analyzeProjectQueryProvenance, type ProjectQueryProvenance } from "./projectQueryProvenance";
import { createProjectSelectSession, type ProjectSelectEvidence } from "./projectSelectSession";
import type { RelationProvider } from "./relationProvider";
import { addRecord, createTable, getTableHandles, setSchemaText, type TableRecordValue } from "./tableDocs";
import { createTableEngineSession, type TableDocConnector } from "./tableEngine";

export const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

export function createTestTable(
    doc: Y.Doc,
    sqlName: string,
    schema: string,
    id: string,
    values: Record<string, TableRecordValue>,
) {
    const tableId = createTable(doc, sqlName.toUpperCase(), sqlName);
    const handles = getTableHandles(doc, tableId)!;
    setSchemaText(handles, schema);
    addRecord(handles, values, id);
    handles.undo.clear();
    return { tableId, handles };
}

export async function createMutationHarness(
    doc: Y.Doc,
    query: string,
    options: { gatedResolution?: boolean; failWriteNumber?: number; } = {},
) {
    const session = createProjectSelectSession({
        projectDoc: doc,
        query,
        connect: localConnector,
        requireExplicitAliases: false,
    });
    const resolver = createGridMetadataResolver({ projectDoc: doc, connect: localConnector });
    let evidence: ProjectSelectEvidence | undefined;
    let provenance: ProjectQueryProvenance | undefined;
    let metadata: GridMetadataResolution | undefined;
    let allowed = true;
    const relationEngine = options.gatedResolution || options.failWriteNumber !== undefined
        ? createTableEngineSession({ projectDoc: doc, connect: localConnector })
        : undefined;
    let writeNumber = 0;
    const wrappedProviders = new WeakMap<object, RelationProvider>();
    let releaseResolution: (() => void) | undefined;
    let resolutionStarted: (() => void) | undefined;
    const resolutionPending = options.gatedResolution
        ? new Promise<void>(resolve => resolutionStarted = resolve)
        : Promise.resolve();
    const resolutionGate = options.gatedResolution
        ? new Promise<void>(resolve => releaseResolution = resolve)
        : Promise.resolve();

    async function refresh(nextQuery?: string) {
        if (nextQuery !== undefined) session.setQuery(nextQuery);
        evidence = undefined;
        for (let attempt = 0; attempt < 5 && !evidence; attempt++) {
            if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 25));
            evidence = await session.runNow();
        }
        if (!evidence) throw new Error("The Project SELECT did not produce current evidence");
        provenance = analyzeProjectQueryProvenance(evidence);
        metadata = await resolver.resolve(evidence, provenance, session);
        return evidence;
    }
    await refresh();
    const boundary = createGridExistingRowMutationBoundary({
        projectDoc: doc,
        connect: localConnector,
        session,
        evidence: () => evidence,
        provenance: () => provenance,
        metadata: () => metadata,
        canWrite: () => true,
        allows: () => allowed,
        relationSession: relationEngine
            ? {
                async resolveRelation(sqlName) {
                    resolutionStarted?.();
                    await resolutionGate;
                    const provider = await relationEngine.resolveRelation(sqlName);
                    if (!provider || options.failWriteNumber === undefined) return provider;
                    const wrapped = Object.create(provider) as typeof provider;
                    wrapped.applyWrite = async (write) => {
                        writeNumber++;
                        if (writeNumber === options.failWriteNumber) throw new Error("controlled provider failure");
                        await provider.applyWrite(write);
                    };
                    wrappedProviders.set(wrapped, provider);
                    return wrapped;
                },
                releaseRelation: provider => relationEngine.releaseRelation(wrappedProviders.get(provider) ?? provider),
            }
            : undefined,
    });
    return {
        boundary,
        session,
        resolver,
        refresh,
        evidence: () => evidence!,
        metadata: () => metadata!,
        setMetadata: (value: GridMetadataResolution) => metadata = value,
        setAllowed: (value: boolean) => allowed = value,
        resolutionPending,
        releaseResolution: () => releaseResolution?.(),
        dispose() {
            boundary.dispose();
            resolver.dispose();
            session.dispose();
            relationEngine?.dispose();
        },
    };
}
