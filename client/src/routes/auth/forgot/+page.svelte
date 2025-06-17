<script lang="ts">
import { sendResetLink } from '$lib/email/resetPassword';
let email = $state('');
let sent = $state(false);
let error = $state('');

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

<form on:submit|preventDefault={submitForm} class="space-y-4">
    <label>
        <span>Email</span>
        <input type="email" bind:value={email} required class="border p-2" />
    </label>
    <button type="submit" class="border px-4 py-2">Send Reset Link</button>
</form>

{#if sent}
    <p class="reset-link-sent">If an account with this email exists, a password reset link has been sent.</p>
{:else if error}
    <p class="error">{error}</p>
{/if}
