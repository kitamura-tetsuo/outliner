<script lang="ts">
  import { tick, createEventDispatcher } from 'svelte';

  // TODO: Implement component logic
  // Props, state, event handlers, etc.
  let { data: initialData = [], columns = [], readonlyCells = [] }: { data?: any[][], columns?: string[], readonlyCells?: boolean[][] } = $props();

  const dispatch = createEventDispatcher<{
    editCompleted: {
      rowIndex: number;
      colIndex: number;
      oldValue: any;
      newValue: any;
    }
  }>();

  // Create a mutable copy of the data for local state management
  // This allows the component to update its display.
  // For parent component updates, events or two-way binding with stores would be needed.
  let tableData = $state(initialData.map(row => [...row]));

  $effect(() => {
    // initialData propが変更されたら、tableDataを更新
    console.log('initialData changed, updating tableData.');
    tableData = initialData.map(row => [...row]);
    // 編集状態をリセット
    editingCell = null;
  });

  let editingCell: { rowIndex: number, colIndex: number } | null = $state(null);
  let editValue: any = $state('');
  let originalEditValue: any = $state(null); // To store the value before editing starts
  let inputRef: HTMLInputElement | null = $state(null);


  async function handleCellClick(rowIndex: number, colIndex: number) {
    if (editingCell?.rowIndex === rowIndex && editingCell?.colIndex === colIndex) {
      return; // Already editing this cell
    }

    // Check if cell is readonly based on readonlyCells prop
    if (readonlyCells && readonlyCells[rowIndex] && readonlyCells[rowIndex][colIndex] === true) {
      console.log(`Cell ${rowIndex},${colIndex} is readonly. Not entering edit mode.`);
      return; // Do not enter edit mode for readonly cells
    }

    editingCell = { rowIndex, colIndex };
    const currentValue = tableData[rowIndex][colIndex];
    editValue = currentValue;
    originalEditValue = currentValue; // Store original value

    // Focus the input after it's rendered
    await tick(); // Wait for DOM update
    inputRef?.focus();
    inputRef?.select();
  }

  function handleInputBlur() {
    // For now, blur just stops editing without saving.
    // Later, this might save or be handled by Enter/Escape exclusively.
    // editingCell = null;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      if (editingCell) {
        const oldValue = originalEditValue;
        const newValue = editValue;
        console.log(`Enter keydown: oldValue=${oldValue}, newValue=${newValue}, editingCell=${JSON.stringify(editingCell)}`);
        if (newValue !== oldValue) {
          tableData[editingCell.rowIndex][editingCell.colIndex] = newValue;
          console.log('Dispatching editCompleted event...');
          dispatch('editCompleted', {
            rowIndex: editingCell.rowIndex,
            colIndex: editingCell.colIndex,
            oldValue: oldValue,
            newValue: newValue,
          });
        } else {
          console.log('Value not changed, not dispatching event.');
        }
      }
      editingCell = null;
    } else if (event.key === 'Escape') {
      console.log('Escape pressed, cancel edit');
      editingCell = null;
      // editValue is not committed, so it reverts implicitly
    }
  }

  // This function is not directly used by the input yet, but is a placeholder for future.
  function handleCellChange(event: Event, rowIndex: number, colIndex: number) {
    // TODO: Implement cell data change if using a different input mechanism
    const target = event.target as HTMLInputElement;
    console.log(`Cell changed: ${rowIndex}, ${colIndex}, Value: ${target.value}`);
  }
</script>

<div class="editable-query-grid svelte-c8q51w">
  {#if columns.length > 0}
    <table class="svelte-c8q51w">
      <thead>
        <tr>
          {#each columns as column}
            <th class="svelte-c8q51w">{column}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each tableData as row, rowIndex}
          <tr>
            {#each row as cell, colIndex}
              <td onclick={() => handleCellClick(rowIndex, colIndex)} class="svelte-c8q51w">
                {#if editingCell?.rowIndex === rowIndex && editingCell?.colIndex === colIndex}
                  <input
                    type="text"
                    bind:this={inputRef}
                    bind:value={editValue}
                    onblur={handleInputBlur}
                    onkeydown={handleKeydown}
                    style="width: 100%; box-sizing: border-box;"
                  />
                {:else}
                  {cell}
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <p>No data to display.</p>
  {/if}
</div>

<style>
  .editable-query-grid {
    /* TODO: Add styles */
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th, td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
  }
  th {
    background-color: #f2f2f2;
  }
</style>
