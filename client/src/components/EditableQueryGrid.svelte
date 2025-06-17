<script lang="ts">
// @ts-ignore
import { Grid } from "wx-svelte-grid";
import { onMount, tick } from "svelte"; // Removed afterUpdate
import { mapEdit } from "../services/editMapper";
import type { ColumnMeta } from "../services/sqlService";

type Props = {
    rows?: any[];
    columns?: ColumnMeta[];
    onedit?: (info: any) => void;
};
let { rows = [], columns = [], onedit }: Props = $props();

// wx-svelte-gridに必要なidプロパティを持つ行データを作成
const gridRows = $derived(
    rows.length === 0
        ? [{ id: 1, name: "Loading...", value: "Please wait" }]
        : rows.map((row, index) => {
            // より確実なユニークID生成
            const uniqueId = row.id || row.tbl_pk || `row_${index}_${Date.now()}`;
            return {
                ...row,
                id: uniqueId,
            };
        }),
);

// デバッグ情報を追加
$effect(() => {
    console.log("EditableQueryGrid data update:", {
        rowsCount: rows.length,
        columnsCount: columns.length,
        gridRowsCount: gridRows.length,
        rows: rows,
        columns: columns,
        gridRows: gridRows,
    });
});

function onEdit(e: any) {
    const { rowIndex, columnIndex, value } = e.detail;
    const row = rows[rowIndex];
    const info = mapEdit(columns, row, columnIndex, value);
    if (info && onedit) onedit(info);
}

function applyDataAttributes() {
    tick().then(() => {
        const grid = document.querySelector('[data-testid="editable-grid"]');
        if (!grid) return;
        const rowsEls = grid.querySelectorAll('.wx-row');
        rowsEls.forEach((rowEl, rIndex) => {
            (rowEl as HTMLElement).setAttribute('data-row-index', String(rIndex));
            const cells = rowEl.querySelectorAll('.wx-cell[role="gridcell"]');
            cells.forEach((cell, cIndex) => {
                (cell as HTMLElement).setAttribute('data-item-id', `cell-${rIndex}-${cIndex}`);
            });
        });
    });
}

onMount(applyDataAttributes); // Keep onMount for initial setup

// Use $effect to re-apply attributes when gridRows or columns change
$effect(() => {
    applyDataAttributes();
    // Explicitly depend on gridRows and columns if necessary,
    // though $effect should pick them up if they are used by applyDataAttributes indirectly
    // or if applyDataAttributes is called due to changes in them.
    // Forcing dependency if auto-detection is not enough:
    gridRows;
    columns;
});
</script>

<div data-testid="editable-grid" class="wx-grid-container">
    <Grid
        data={gridRows}
        columns={columns.length > 0 ? columns.map((c, index) => ({
            id: c.column || `col_${index}`, // idプロパティ（必須）
            header: c.column || `Column ${index + 1}`, // headerプロパティ
            flexgrow: 1, // レスポンシブ対応
            sort: true, // ソート機能を有効化
            editor: !!(c.table && c.column) ? "text" : undefined, // 編集可能な場合はエディタを設定
        })) : [
            { id: "name", header: "Name", flexgrow: 1, sort: true },
            { id: "value", header: "Value", flexgrow: 1, sort: true },
        ]}
        on:cellEditCommit={onEdit}
    />
</div>

<style>
.wx-grid-container {
    width: 100%;
    height: 400px;
    border: 1px solid #ddd;
}

/* wx-svelte-gridの基本スタイル */
:global(.wx-grid) {
    width: 100%;
    height: 100%;
    display: block;
}

:global(.wx-table-box) {
    width: 100%;
    height: 100%;
    overflow: auto;
}

:global(.wx-cell) {
    border: 1px solid #e0e0e0;
    padding: 8px;
    background: white;
    min-height: 32px;
    display: flex;
    align-items: center;
}

:global(.wx-cell[role="columnheader"]) {
    background: #f5f5f5;
    font-weight: bold;
}

:global(.wx-cell[role="gridcell"]) {
    background: white;
    cursor: pointer;
}

:global(.wx-cell[role="gridcell"]:hover) {
    background: #f9f9f9;
}
</style>
