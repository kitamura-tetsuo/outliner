<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { userManager } from "../../auth/UserManager";
    import { getLogger } from "../../lib/logger";

    const logger = getLogger();

    onMount(async () => {
        try {
            await userManager.loginWithEmailPassword("test@example.com", "password");
            logger.info("[debug-test] Logged in successfully, redirecting to /test");
            await goto("/test");
        } catch (error) {
            logger.error({ error }, "[debug-test] Login failed");
        }
    });
</script>

<svelte:head>
    <title>Logging in...</title>
</svelte:head>

<main>
    <p>Logging in and redirecting to /test...</p>
</main>

<style>
    main {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        font-family: sans-serif;
    }
</style>
