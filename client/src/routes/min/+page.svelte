<script lang="ts">
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
} from "firebase/auth";
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
// Firebase product SDKs
import { onMount } from "svelte";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Initialize Firestore without storing the instance
getFirestore(app);
getFunctions(app);

const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let idToken = $state("");
let verificationResult = $state("");

// テスト用に環境変数をwindowオブジェクトに公開
onMount(() => {
    if (typeof window !== "undefined") {
        (window).testEnvVars = {
            VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
            VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
            VITE_TOKEN_VERIFY_URL: import.meta.env.VITE_TOKEN_VERIFY_URL,
        };
    }
});

// Google ログインして ID トークンを取得し、バックエンドで検証する
async function signIn() {
    try {
        const result = await signInWithPopup(auth, provider);
        idToken = await result.user.getIdToken(true);
        console.log("取得した ID Token:", idToken);

        const verifyUrl = import.meta.env.VITE_TOKEN_VERIFY_URL;
        const response = await fetch(verifyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: idToken }),
        });
        const data = await response.json();
        verificationResult = JSON.stringify(data, null, 2);
    }
    catch (error) {
        console.error("ログインまたは検証処理でエラーが発生しました:", error);
    }
}
</script>

<main>
    <h1>Firebase Google Login &amp; Token Verification</h1>
    <button onclick={signIn}>Sign in with Google</button>

    {#if idToken}
        <section>
            <h2>ID Token</h2>
            <pre>{idToken}</pre>
        </section>
    {/if}

    {#if verificationResult}
        <section>
            <h2>Verification Result</h2>
            <pre>{verificationResult}</pre>
        </section>
    {/if}
</main>

<style>
main {
    font-family: Arial, sans-serif;
    padding: 2rem;
}
button {
    padding: 0.5rem 1rem;
    font-size: 1rem;
}
pre {
    background: #f0f0f0;
    padding: 1rem;
    overflow: auto;
}
</style>
