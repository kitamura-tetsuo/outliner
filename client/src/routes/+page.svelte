<script lang="ts">
    import SvelteSEO from "svelte-seo";
    import AuthenticatedHome from "../components/AuthenticatedHome.svelte";
    import LandingContent from "../components/LandingContent.svelte";
    import AuthComponent from "../components/AuthComponent.svelte";
    import { isOnPrem } from "../lib/deployment";
    import { authStore } from "../stores/authStore.svelte";
</script>

<SvelteSEO title="Home" />

{#if authStore.isAuthenticated}
    <AuthenticatedHome />
{:else}
    {#if isOnPrem}
        <main class="mx-auto max-w-md px-4 py-16">
            <h1 class="mb-6 text-3xl font-bold">Outliner</h1>
            <AuthComponent />
        </main>
    {:else}
        <LandingContent />
    {/if}
{/if}
