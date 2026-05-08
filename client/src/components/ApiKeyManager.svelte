<script lang="ts">
    import { onMount } from "svelte";
    import { listApiKeys, createApiKey, revokeApiKey } from "../services/apiKeyService";

    let apiKeys: any[] = $state([]);
    let loading = $state(true);
    let error = $state<string | null>(null);

    let newKeyDescription = $state("");
    let newlyGeneratedKey = $state<string | null>(null);
    let isGenerating = $state(false);

    onMount(async () => {
        await loadKeys();
    });

    async function loadKeys() {
        loading = true;
        error = null;
        try {
            apiKeys = await listApiKeys();
        } catch (err: any) {
            error = err.message || "Failed to load API keys";
        } finally {
            loading = false;
        }
    }

    async function handleCreateKey() {
        if (!newKeyDescription.trim()) {
            error = "Please provide a description for the new API key.";
            return;
        }

        isGenerating = true;
        error = null;
        try {
            const result = await createApiKey(newKeyDescription);
            newlyGeneratedKey = result.apiKey;
            newKeyDescription = "";
            await loadKeys(); // Refresh list
        } catch (err: any) {
            error = err.message || "Failed to create API key";
        } finally {
            isGenerating = false;
        }
    }

    async function handleRevoke(id: string) {
        if (!confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) return;

        try {
            await revokeApiKey(id);
            apiKeys = apiKeys.filter(key => key.id !== id);
        } catch (err: any) {
            error = err.message || "Failed to revoke API key";
        }
    }

    function formatDate(ts: number) {
        return new Date(ts).toLocaleString();
    }
</script>

<div class="api-key-manager bg-white dark:bg-gray-800 rounded shadow p-6">
    <h3 class="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">API Keys</h3>

    <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Manage your API keys for programmatic access. <strong>Never share your API keys</strong> or commit them to version control.
    </p>

    {#if error}
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
            <span class="block sm:inline">{error}</span>
        </div>
    {/if}

    {#if newlyGeneratedKey}
        <div class="bg-yellow-50 border border-yellow-400 text-yellow-800 px-4 py-4 rounded mb-6">
            <h4 class="font-bold mb-2">Save your new API Key!</h4>
            <p class="mb-2 text-sm">Please copy this key now. For your security, it will not be shown again.</p>
            <div class="flex items-center">
                <code class="bg-white px-3 py-2 rounded border border-yellow-300 flex-1 overflow-x-auto select-all">{newlyGeneratedKey}</code>
            </div>
            <button
                class="mt-3 text-sm text-blue-600 hover:underline"
                onclick={() => newlyGeneratedKey = null}
            >
                I have saved this key
            </button>
        </div>
    {/if}

    <div class="flex gap-2 mb-8">
        <input
            type="text"
            bind:value={newKeyDescription}
            placeholder="e.g. My Script, CI Server"
            class="flex-1 border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-transparent text-gray-800 dark:text-gray-100"
            disabled={isGenerating}
        />
        <button
            onclick={handleCreateKey}
            disabled={isGenerating || !newKeyDescription.trim()}
            class="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {isGenerating ? 'Generating...' : 'Generate New Key'}
        </button>
    </div>

    {#if loading}
        <p class="text-gray-500">Loading API keys...</p>
    {:else if apiKeys.length === 0}
        <p class="text-gray-500 italic">You don't have any active API keys.</p>
    {:else}
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400">
                        <th class="py-3 px-2 font-medium">Description</th>
                        <th class="py-3 px-2 font-medium">Created</th>
                        <th class="py-3 px-2 font-medium">Last Used</th>
                        <th class="py-3 px-2 font-medium text-right">Actions</th>
                    </tr>
                </thead>
                <tbody class="text-sm">
                    {#each apiKeys as key (key.id)}
                        <tr class="border-b border-gray-100 dark:border-gray-700 last:border-0">
                            <td class="py-3 px-2 text-gray-800 dark:text-gray-200">{key.description}</td>
                            <td class="py-3 px-2 text-gray-500 dark:text-gray-400">{formatDate(key.createdAt)}</td>
                            <td class="py-3 px-2 text-gray-500 dark:text-gray-400">
                                {key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never'}
                            </td>
                            <td class="py-3 px-2 text-right">
                                <button
                                    class="text-red-600 hover:text-red-800 font-medium"
                                    onclick={() => handleRevoke(key.id)}
                                >
                                    Revoke
                                </button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>
