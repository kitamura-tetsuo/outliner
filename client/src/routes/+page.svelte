<script lang="ts">
    import AuthenticatedHome from "../components/AuthenticatedHome.svelte";
    import LandingContent from "../components/LandingContent.svelte";
    import { authStore } from "../stores/authStore.svelte";
</script>

{#if authStore.isAuthenticated}
    <AuthenticatedHome />
{:else}
    <LandingContent />
{/if}
