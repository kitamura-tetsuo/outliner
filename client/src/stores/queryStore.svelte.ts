// Basic Svelte 5 store using runes for query state management

type QueryResult = any[]; // Define a more specific type based on expected results

interface QueryState {
  query: string;
  isRunning: boolean;
  result: QueryResult | null;
  error: string | null;
  lastExecutedQuery: string | null;
}

// Initial state
const initialState: QueryState = {
  query: '',
  isRunning: false,
  result: null,
  error: null,
  lastExecutedQuery: null,
};

// Create reactive state using $state
let queryState = $state<QueryState>(initialState);

// Actions to interact with the store
function setQuery(newQuery: string) {
  queryState.query = newQuery;
}

async function executeQuery(sql: string, executionFn: (query: string) => Promise<QueryResult>) {
  if (!sql.trim()) {
    queryState.error = 'Query cannot be empty.';
    queryState.result = null;
    return;
  }

  queryState.isRunning = true;
  queryState.error = null;
  queryState.lastExecutedQuery = sql;

  try {
    const results = await executionFn(sql);
    queryState.result = results;
    console.log('Query executed successfully, results:', results);
  } catch (err: any) {
    console.error('Error executing query:', err);
    if (typeof err === 'string') {
      queryState.error = err;
    } else {
      queryState.error = err.message || 'An unknown error occurred during query execution.';
    }
    queryState.result = null;
  } finally {
    queryState.isRunning = false;
  }
}

function clearResult() {
  queryState.result = null;
  queryState.error = null;
}

function resetStore() {
  queryState = { ...initialState, query: queryState.query }; // Keep current query text on reset
}

// Export the state and actions
// The state itself is readable directly because it's a rune.
// For modifications, use the exported action functions.
export default {
  // Read-only access to the state properties (derived if needed, or direct for simple cases)
  get query() { return queryState.query; },
  get isRunning() { return queryState.isRunning; },
  get result() { return queryState.result; },
  get error() { return queryState.error; },
  get lastExecutedQuery() { return queryState.lastExecutedQuery; },

  // Actions
  setQuery,
  executeQuery,
  clearResult,
  resetStore,
};

// Example of how to use a derived state if needed:
// export const hasResults = $derived(queryState.result !== null && queryState.result.length > 0);

console.log('queryStore.svelte.ts initialized');
