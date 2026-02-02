<script lang="ts">
    import { page } from "$app/stores";

    let projectId = $derived($page.params.project);
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
