<script lang="ts">
    import { userManager } from "../auth/UserManager";

    function login() {
        userManager.loginWithGoogle();
    }
</script>

<div class="landing-container">
    <header class="hero-section">
        <h1>Welcome to Outliner</h1>
        <p>Your new tool for thought, designed for clarity and speed.</p>
    </header>

    <section class="features-section">
        <h2>Features</h2>
        <ul>
            <li>📝 Real-time collaborative editing</li>
            <li>🔗 Seamless project linking</li>
            <li>✨ Intuitive and clean interface</li>
        </ul>
    </section>

    <section class="cta-section">
        <button class="cta-button primary" on:click={login}>
            Sign in with Google
        </button>
        <button class="cta-button secondary" on:click={login}>
            Get Started
        </button>
    </section>
</div>

<style>
    .landing-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
        text-align: center;
    }

    .hero-section h1 {
        font-size: 2.5rem;
        margin-bottom: 0.5rem;
    }

    .hero-section p {
        font-size: 1.2rem;
        color: #666;
    }

    .features-section {
        margin: 3rem 0;
    }

    .features-section ul {
        list-style: none;
        padding: 0;
    }

    .features-section li {
        margin: 0.5rem 0;
        font-size: 1.1rem;
    }

    .cta-section .cta-button {
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: 5px;
        font-size: 1rem;
        cursor: pointer;
        margin: 0 0.5rem;
    }

    .cta-button.primary {
        background-color: #4285f4;
        color: white;
    }

    .cta-button.secondary {
        background-color: #e0e0e0;
        color: #333;
    }
</style>
