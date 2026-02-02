<script lang="ts">
    import { page } from "$app/stores";
    import { getFirebaseFunctionUrl } from "$lib/firebaseFunctionsUrl";
    import { authStore } from "../../../stores/authStore.svelte";
    import { userManager } from "../../../auth/UserManager";

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
            const token = await userManager.getIdToken();
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
        <!-- Settings placeholder -->
        <p>Settings will appear here.</p>
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
    .actions {
        margin-top: 2rem;
    }
    .back-link {
        text-decoration: none;
        color: #666;
    }
    .back-link:hover {
        text-decoration: underline;
    }
</style>