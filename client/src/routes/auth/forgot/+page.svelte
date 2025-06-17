<script lang="ts">
import { auth } from "../../../lib/firebase";
import { sendPasswordResetEmail } from "firebase/auth";
import { sendResetLink } from '$lib/email/resetPassword';

console.log('/auth/forgot/+page.svelte SCRIPT EXECUTING');

let email: string = $state("");
let message: string = $state("");
let error: string = $state("");
let loading: boolean = $state(false);

async function handleSubmit(event: Event) {
    event.preventDefault();
    loading = true;
    error = "";
    message = "";
    console.log('handleSubmit called with email:', email);

    try {
        // Try Firebase Auth first, fallback to custom API
        try {
            await sendPasswordResetEmail(auth, email);
            message = "If an account with this email exists, a password reset link has been sent.";
            console.log('sendPasswordResetEmail successful:', message);
        } catch (firebaseError: any) {
            console.log('Firebase Auth failed, trying custom API:', firebaseError.code);
            await sendResetLink(email);
            message = "If an account with this email exists, a password reset link has been sent.";
            console.log('sendResetLink successful');
        }
    } catch (e: any) {
        console.error('Password reset failed:', e);
        error = e instanceof Error ? e.message : 'Failed to send reset link';
    } finally {
        loading = false;
        console.log('handleSubmit finished. Loading:', loading, 'Message:', message, 'Error:', error);
    }
}
</script>

<div class="container" style="max-width: 500px; margin: auto; padding: 20px;">
    <h1>Forgot Password</h1>
    <form onsubmit={handleSubmit}>
        <div>
            <label for="email-input">Email Address</label>
            <input type="email" id="email-input" bind:value={email} required />
        </div>
        <button type="submit" disabled={loading}>
            {#if loading}Sending...{:else}Send Password Reset Email{/if}
        </button>
        {#if message}
            <p class="message" id="success-message" style="color: green;">{message}</p>
        {/if}
        {#if error}
            <p class="error" id="error-message" style="color: red;">{error}</p>
        {/if}
    </form>
</div>

<svelte:head>
    <title>Forgot Password</title>
</svelte:head>
