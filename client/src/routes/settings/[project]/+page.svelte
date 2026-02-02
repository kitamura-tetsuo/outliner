<script lang="ts">
    import { page } from "$app/stores";
    import { getFirebaseFunctionUrl } from "$lib/firebaseFunctionsUrl";
    import { authStore } from "$stores/authStore.svelte";

    let projectId = $derived($page.params.project);
    let generatedLink = $state<string | null>(null);
    let error = $state<string | null>(null);
    let isLoading = $state(false);

    async function generateLink() {
        if (!authStore.user) {
            error = "You must be logged in.";
            return;
        }
        isLoading = true;
        error = null;
        try {
            const token = await authStore.user.getIdToken();
            const res = await fetch(getFirebaseFunctionUrl("generateProjectShareLink"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken: token, projectId }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to generate link");
            }
            const data = await res.json();
            const origin = window.location.origin;
            generatedLink = `${origin}/share/${data.token}`;
        } catch (e: any) {
            error = e.message;
        } finally {
            isLoading = false;
        }
    }
</script>

<div class="settings-page">
    <h1>Project Settings: {projectId}</h1>

    <div class="card">
        <h2>Share Project</h2>
        <p>Generate a unique link to share this project with others.</p>
        
        {#if generatedLink}
            <div class="link-display">
                <input type="text" readonly value={generatedLink} aria-label="Generated Link" />
                <button onclick={() => navigator.clipboard.writeText(generatedLink!)} class="copy-btn">Copy</button>
            </div>
        {/if}

        {#if error}
            <div class="error">{error}</div>
        {/if}

        <button onclick={generateLink} disabled={isLoading} class="generate-btn">
            {isLoading ? "Generating..." : "Generate Invitation Link"}
        </button>
    </div>

    <div class="actions">
        <a href="/{projectId}" class="back-link">Back to Project</a>
    </div>
</div>

<style>
    .settings-page {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
    }
    .card {
        background: #f9f9f9;
        padding: 1.5rem;
        border-radius: 8px;
        margin-bottom: 2rem;
        border: 1px solid #eee;
    }
    .link-display {
        display: flex;
        gap: 0.5rem;
        margin: 1rem 0;
    }
    .link-display input {
        flex: 1;
        padding: 0.5rem;
        border: 1px solid #ccc;
        border-radius: 4px;
    }
    .error {
        color: #d32f2f;
        margin: 1rem 0;
        padding: 0.5rem;
        background: #ffebee;
        border-radius: 4px;
    }
    .actions {
        margin-top: 2rem;
    }
    .generate-btn {
        background-color: #4caf50;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
    }
    .generate-btn:disabled {
        background-color: #a5d6a7;
        cursor: not-allowed;
    }
    .copy-btn {
        background-color: #2196f3;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
    }
    .back-link {
        text-decoration: none;
        color: #666;
    }
    .back-link:hover {
        text-decoration: underline;
    }
</style>
