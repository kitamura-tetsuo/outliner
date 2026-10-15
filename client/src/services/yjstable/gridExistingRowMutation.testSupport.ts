import * as Y from "yjs";
import { createGridExistingRowMutationBoundary } from "./gridExistingRowMutation";
import { createGridMetadataResolver, type GridMetadataResolution } from "./gridMetadataResolver";
import { analyzeProjectQueryProvenance, type ProjectQueryProvenance } from "./projectQueryProvenance";
import { createProjectSelectSession, type ProjectSelectEvidence } from "./projectSelectSession";
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

export async function createMutationHarness(doc: Y.Doc, query: string, options: { gatedResolution?: boolean; } = {}) {
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
    const relationEngine = options.gatedResolution
        ? createTableEngineSession({ projectDoc: doc, connect: localConnector })
        : undefined;
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
                    return await relationEngine.resolveRelation(sqlName);
                },
                releaseRelation: provider => relationEngine.releaseRelation(provider),
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
