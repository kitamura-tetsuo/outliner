<script lang="ts">
import { sendResetLink, validateResetToken } from '$lib/email/resetPassword';
import { page } from '$app/stores';
import { onMount } from 'svelte';

let email = $state('');
let sent = $state(false);
let error = $state('');
let tokenValid = $state(false);

onMount(async () => {
    const token = $page.url.searchParams.get('oobCode');
    if (token) {
        try {
            await validateResetToken(token);
            tokenValid = true;
        } catch (e) {
            error = e instanceof Error ? e.message : 'Invalid or expired token';
        }
    }
});

async function submitForm() {
    sent = false;
    error = '';
    try {
        await sendResetLink(email);
        sent = true;
    } catch (e) {
        error = e instanceof Error ? e.message : 'Failed to send link';
    }
}
</script>

{#if tokenValid}
    <p class="token-valid">Token validated. <a href="/auth/reset-password?oobCode={$page.url.searchParams.get('oobCode')}">Reset password</a>.</p>
{:else}
    <form on:submit|preventDefault={submitForm} class="space-y-4">
        <label>
            <span>Email</span>
            <input type="email" bind:value={email} required class="border p-2" />
        </label>
        <button type="submit" class="border px-4 py-2">Send Reset Link</button>
    </form>
{/if}

{#if sent}
    <p class="reset-link-sent">If an account with this email exists, a password reset link has been sent.</p>
{:else if error}
    <p class="error">{error}</p>
{/if}
