<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  let query = $state('');

  const dispatch = createEventDispatcher<{
    execute: string; // Dispatches the query string
    queryChange: string; // Dispatches the current query as it changes
  }>();

  function handleInputChange(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    query = target.value;
    dispatch('queryChange', query);
  }

  function handleExecute() {
    console.log('Executing query:', query);
    dispatch('execute', query);
  }
</script>

<div class="query-editor">
  <textarea
    bind:value={query}
    oninput={handleInputChange}
    placeholder="Enter your SQL query here..."
    rows="5"
  ></textarea>
  <button onclick={handleExecute}>Execute Query</button>
</div>

<style>
  .query-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  textarea {
    width: 100%;
    padding: 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-family: monospace;
  }
  button {
    padding: 8px 16px;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  button:hover {
    background-color: #0056b3;
  }
</style>
