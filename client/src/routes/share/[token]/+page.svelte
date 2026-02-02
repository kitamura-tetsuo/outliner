<script lang="ts">
    import { page } from "$app/stores";
    import { getFirebaseFunctionUrl } from "$lib/firebaseFunctionsUrl";
    import { authStore } from "$stores/authStore.svelte";
    import { userManager } from "../../../auth/UserManager";
    import { goto } from "$app/navigation";

    let token = $derived($page.params.token);
    let status = $state<"loading" | "success" | "error" | "unauthenticated">("loading");
    let message = $state<string>("Checking project invitation...");

    $effect(() => {
        // Only attempt if not already success or error
        if (status !== 'success' && status !== 'error') {
            if (authStore.isAuthenticated && token) {
                acceptLink();
            } else if (!authStore.isAuthenticated) {
                status = "unauthenticated";
                message = "Please log in to join the project.";
            }
        }
    });

    async function acceptLink() {
        // Avoid double submission
        if (status === 'loading' && message === "Joining project...") return;
        
        try {
            status = "loading";
            message = "Joining project...";
            const idToken = await userManager.auth.currentUser?.getIdToken();
            if (!idToken) {
                 status = "unauthenticated";
                 message = "Please log in to join the project.";
                 return;
            }

            const res = await fetch(getFirebaseFunctionUrl("acceptProjectShareLink"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken, token }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to join project");
            }

            status = "success";
            message = "Successfully joined! Redirecting to project...";
            setTimeout(() => {
                goto(`/${data.projectId}`);
            }, 1500);
        } catch (e: any) {
            status = "error";
            message = e.message;
        }
    }
</script>

<div class="share-page">
    <div class="card">
        <h1>Project Invitation</h1>
        <p class:error={status === 'error'} class:success={status === 'success'}>
            {message}
        </p>
        
        {#if status === 'unauthenticated'}
            <div class="actions">
                <a href="/" class="login-btn">Go to Login</a>
            </div>
        {/if}

        {#if status === 'error'}
            <div class="actions">
                <a href="/" class="home-btn">Go Home</a>
            </div>
        {/if}
        
        {#if status === 'loading'}
            <div class="spinner"></div>
        {/if}
    </div>
</div>

<style>
    .share-page {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 80vh; /* - layout header/footer */
        background: #f5f5f5;
        padding: 1rem;
    }
    .card {
        background: white;
        padding: 2rem;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        text-align: center;
        max-width: 400px;
        width: 100%;
    }
    h1 {
        margin-top: 0;
        color: #333;
    }
    p {
        color: #666;
        margin: 1.5rem 0;
    }
    .error {
        color: #d32f2f;
    }
    .success {
        color: #2e7d32;
    }
    .actions {
        margin-top: 1.5rem;
    }
    .login-btn, .home-btn {
        display: inline-block;
        padding: 0.75rem 1.5rem;
        background-color: #3b82f6;
        color: white;
        text-decoration: none;
        border-radius: 4px;
        font-weight: bold;
    }
    .login-btn:hover, .home-btn:hover {
        background-color: #2563eb;
    }
    
    .spinner {
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        width: 30px;
        height: 30px;
        animation: spin 1s linear infinite;
        margin: 0 auto;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
</style>