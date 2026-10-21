import * as Y from "yjs";
import {
    createGrid,
    getGridHandles,
    readGridComponents,
    setGridColumnOrder,
    setGridComponentField,
    setGridConfirmRowDelete,
    setGridShowAddRowButton,
} from "../../../services/yjstable/gridDocs";
import { addRecord, createTable, getTableHandles, setSchemaText } from "../../../services/yjstable/tableDocs";

export const QUERY = "SELECT id AS id, title AS title, due_date AS due_date, done AS done FROM tasks ORDER BY title";

/** Round-trip the actual saved definition and Table subdoc before mounting the production runtime. */
export function setupSavedPresentation() {
    const doc = new Y.Doc();
    const tableId = createTable(doc, "Tasks", "tasks");
    const handles = getTableHandles(doc, tableId)!;
    setSchemaText(handles, "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, due_date DATE, done BOOLEAN)");
    addRecord(handles, { title: "Write report", due_date: "2026-10-31", done: false }, "r1");
    addRecord(handles, { title: "Pay bills", due_date: "2026-11-30", done: true }, "r2");
    const gridId = createGrid(doc, { name: "Tasks", query: QUERY });
    const grid = getGridHandles(doc, gridId)!;
    setGridComponentField(grid, "due_date", "label", "期限");
    setGridComponentField(grid, "done", "label", "完了");
    setGridComponentField(grid, "done", "type", "checkbox");
    setGridComponentField(grid, "id", "hidden", true);
    setGridColumnOrder(grid, ["done", "due_date"]);
    setGridShowAddRowButton(grid, false);
    setGridConfirmRowDelete(grid, true);
    const separateId = createGrid(doc, { name: "Separate", query: QUERY });
    const synced = new Y.Doc();
    Y.applyUpdate(synced, Y.encodeStateAsUpdate(doc));
    const subdoc = (synced.getMap("yjsTables").get(tableId) as Y.Map<unknown>).get("doc") as Y.Doc;
    Y.applyUpdate(subdoc, Y.encodeStateAsUpdate(handles.doc));
    doc.destroy();
    const reloadedGrid = getGridHandles(synced, gridId)!;
    const separateBefore = readGridComponents(getGridHandles(synced, separateId)!);
    return {
        grid: reloadedGrid,
        handles: getTableHandles(synced, tableId)!,
        projectDoc: synced,
        separateId,
        separateBefore,
    };
}
