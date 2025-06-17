<script lang="ts">
import { resetPassword } from '$lib/email/resetPassword';
import { page } from '$app/stores';
let password = $state('');
let confirm = $state('');
let success = $state(false);
let error = $state('');

async function submitForm() {
    error = '';
    success = false;
    if (password !== confirm) {
        error = 'Passwords do not match';
        return;
    }
    const token = $page.url.searchParams.get('oobCode') ?? '';
    try {
        await resetPassword(token, password);
        success = true;
    } catch (e) {
        error = e instanceof Error ? e.message : 'Failed to reset password';
    }
}
</script>

<form on:submit|preventDefault={submitForm} class="space-y-4">
    <label>
        <span>New Password</span>
        <input type="password" bind:value={password} required class="border p-2" name="newPassword" />
    </label>
    <label>
        <span>Confirm Password</span>
        <input type="password" bind:value={confirm} required class="border p-2" name="confirmPassword" />
    </label>
    <button type="submit" class="border px-4 py-2">Reset Password</button>
</form>

{#if success}
    <p class="reset-success">Your password has been reset successfully.</p>
{:else if error}
    <p class="error">{error}</p>
{/if}
