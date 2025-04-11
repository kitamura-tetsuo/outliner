<script lang="ts">
import {
    createEventDispatcher,
    onMount,
} from "svelte";
import { preventDefault } from "svelte/legacy";
import type { IUser } from "../fluid/fluidClient";
import { getFluidClient } from "../stores/fluidStore.svelte";

const dispatch = createEventDispatcher();

let savedUser = $state<IUser | null>(null);
let user = $state<IUser>({
    id: "",
    name: "",
    color: "#000000",
});

let isRegistering = $state(false);
let errorMessage = $state("");

onMount(() => {
    // 保存されているユーザー情報を読み込む
    const client = getFluidClient();
    if (client) {
        const loadedUser = client.loadSavedUser();
        if (loadedUser) {
            savedUser = loadedUser;
            user = { ...loadedUser };
        }
    }
});

async function handleSubmit() {
    if (!user.name) {
        errorMessage = "ユーザー名は必須です";
        return;
    }

    try {
        isRegistering = true;
        errorMessage = "";

        // FluidClientを使ってユーザー登録
        const client = getFluidClient();
        if (client && client.registerUser) {
            const registeredUser = await client.registerUser(user);
            savedUser = registeredUser;
            dispatch("registered", registeredUser);
        }
        else {
            throw new Error("FluidClient is not initialized or does not support user registration");
        }
    }
    catch (error: unknown) {
        console.error("ユーザー登録エラー:", error);
        errorMessage = `登録に失敗しました: ${error instanceof Error ? error.message : "不明なエラー"}`;
    }
    finally {
        isRegistering = false;
    }
}

function handleUseExisting() {
    const client = getFluidClient();
    if (savedUser && client) {
        client.currentUser = savedUser;
        dispatch("registered", savedUser);
    }
}
</script>

<div class="user-registration">
    <h2>Azure Fluid Relayへの接続</h2>

    {#if savedUser}
        <div class="saved-user">
            <p>以前のセッション情報があります:</p>
            <div class="user-info">
                <strong>{savedUser.name}</strong>
                {#if savedUser.email}<span>({savedUser.email})</span>{/if}
            </div>
            <button onclick={handleUseExisting}>この情報で続ける</button>
            <button
                onclick={() => {
                    savedUser = null;
                }}
            >
                新しいユーザーを登録
            </button>
        </div>
    {:else}
        <form onsubmit={preventDefault(handleSubmit)}>
            <div class="form-field">
                <label for="userName">名前 (必須)</label>
                <input
                    id="userName"
                    type="text"
                    bind:value={user.name}
                    placeholder="ユーザー名を入力"
                    disabled={isRegistering}
                />
            </div>

            <div class="form-field">
                <label for="userEmail">メールアドレス (任意)</label>
                <input
                    id="userEmail"
                    type="email"
                    bind:value={user.email}
                    placeholder="メールアドレスを入力"
                    disabled={isRegistering}
                />
            </div>

            {#if errorMessage}
                <div class="error">{errorMessage}</div>
            {/if}

            <button type="submit" disabled={isRegistering || !user.name}>
                {isRegistering ? "登録中..." : "登録して接続"}
            </button>
        </form>
    {/if}
</div>

<style>
.user-registration {
    max-width: 400px;
    margin: 0 auto;
    padding: 1.5rem;
    background-color: #f9f9f9;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

h2 {
    margin-top: 0;
    color: #333;
    text-align: center;
}

.form-field {
    margin-bottom: 1rem;
}

label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
}

input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
}

button {
    display: block;
    width: 100%;
    padding: 0.75rem 1rem;
    background-color: #0078d4;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    margin-top: 1rem;
}

button:hover {
    background-color: #0066b3;
}

button:disabled {
    background-color: #ccc;
    cursor: not-allowed;
}

.error {
    color: #d83b01;
    margin-top: 0.5rem;
    font-size: 0.9rem;
}

.saved-user {
    text-align: center;
}

.user-info {
    background-color: #e6f7ff;
    padding: 0.5rem;
    border-radius: 4px;
    margin: 1rem 0;
}

.saved-user button:nth-child(4) {
    background-color: #f0f0f0;
    color: #333;
}
</style>
