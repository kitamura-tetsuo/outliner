<script lang="ts">
  import { auth } from "../../../lib/firebase";
  import { sendPasswordResetEmail } from "firebase/auth";

  console.log('/auth/forgot/+page.svelte SCRIPT EXECUTING'); // Re-add for this test run

  let email: string = $state(""); // Svelte 5 state
  let message: string = $state(""); // Svelte 5 state
  let error: string = $state("");   // Svelte 5 state
  let loading: boolean = $state(false); // Svelte 5 state

  async function handleSubmit(event: Event) {
    event.preventDefault(); // Ensure this is called for Svelte 5 forms if on:submit is used without modifiers
    loading = true;
    error = "";
    message = "";
    console.log('handleSubmit called with email:', email);
    try {
      await sendPasswordResetEmail(auth, email);
      message = "If an account with this email exists, a password reset link has been sent."; // Standard success message
      console.log('sendPasswordResetEmail successful:', message);
    } catch (e: any) {
      console.error('sendPasswordResetEmail Firebase Error Code:', e.code);
      console.error('sendPasswordResetEmail Firebase Error Message:', e.message);
      console.error('sendPasswordResetEmail Full Firebase Error:', JSON.stringify(e));
      error = `Firebase Error: ${e.code} - ${e.message}`; // Display specific error in UI
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
