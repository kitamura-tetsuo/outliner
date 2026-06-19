<script lang="ts">
    import SvelteSEO from "svelte-seo";
    import AuthenticatedHome from "../components/AuthenticatedHome.svelte";
    import LandingContent from "../components/LandingContent.svelte";
    import { authStore } from "../stores/authStore.svelte";
</script>

<SvelteSEO title="Home" />

{#if authStore.isAuthenticated}
    <AuthenticatedHome />
{:else}
    <LandingContent />
{/if}
