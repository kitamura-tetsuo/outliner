const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'client/src/routes/demo/[page]/+page.svelte');
let content = fs.readFileSync(filePath, 'utf8');

// Add import
content = content.replace('import { getYjsClientByProjectTitle } from "../../../services";', 'import { getYjsClientByProjectTitle, removeYjsClientByProjectId } from "../../../services";');

// Add reset state
content = content.replace('let isSearchPanelVisible = $state(false);', `let isSearchPanelVisible = $state(false);\n    let isResetting = $state(false);\n    let resetDone = $state(false);`);

// Add resetDemo function
const resetDemoFunc = `
    async function resetDemo() {
        if (isResetting) return;
        try {
            isResetting = true;
            resetDone = false;
            await seedDemo({ force: true });
            removeYjsClientByProjectId(DEMO_PROJECT_NAME);
            yjsStore.yjsClient = undefined;
            store.project = undefined;
            await loadDemoPage(pageName);
            resetDone = error === undefined;
        } finally {
            isResetting = false;
        }
    }
`;
content = content.replace('function toggleSearchPanel() {', resetDemoFunc + '\n    function toggleSearchPanel() {');

// Update buttons
const oldButtons = `<div class="flex items-center space-x-2" data-testid="demo-page-toolbar">
                <button
                    onclick={toggleSearchPanel}
                    class="search-btn rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                    data-testid="search-toggle-button"
                >
                    Search
                </button>
            </div>`;
const newButtons = `<div class="flex items-center space-x-2" data-testid="demo-page-toolbar">
                <button
                    onclick={resetDemo}
                    disabled={isResetting || isLoading}
                    data-testid="demo-reset-button"
                    class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isResetting ? "Resetting..." : "Reset demo content"}
                </button>
                <button
                    onclick={toggleSearchPanel}
                    class="search-btn rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    data-testid="search-toggle-button"
                >
                    Search
                </button>
            </div>`;
content = content.replace(oldButtons, newButtons);

// Add resetDone message
const oldMsg = `<p class="mt-1 text-sm text-gray-500">
            This is a public, collaborative demo space. Content resets every 24 hours.
        </p>
    </div>`;
const newMsg = `<p class="mt-1 text-sm text-gray-500">
            This is a public, collaborative demo space. Content resets every 24 hours.
        </p>
        {#if resetDone}
            <p class="mt-1 text-sm text-green-600" data-testid="demo-reset-done">
                Demo content has been reset.
            </p>
        {/if}
    </div>`;
content = content.replace(oldMsg, newMsg);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Updated', filePath);
