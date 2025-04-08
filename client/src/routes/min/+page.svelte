<script lang="ts">
	import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
	// Import the functions you need from the SDKs you need
	import { initializeApp } from 'firebase/app';
	// TODO: Add SDKs for Firebase products that you want to use
	// https://firebase.google.com/docs/web/setup#available-libraries

	// Your web app's Firebase configuration
	// For Firebase JS SDK v7.20.0 and later, measurementId is optional

	const firebaseConfig = {
		apiKey: 'AIzaSyClVfX5Cw0XpitovZCEYQznHi2csreCUOc',
		authDomain: 'outliner2-566e4.firebaseapp.com',
		projectId: 'outliner2-566e4',
		storageBucket: 'outliner2-566e4.firebasestorage.app',
		messagingSenderId: '279816831957',
		appId: '1:279816831957:web:f5a041b4c774d8e005b35c',
		measurementId: 'G-4DMNV26YHN'
	};

	// Initialize Firebase
	const app = initializeApp(firebaseConfig);

	const auth = getAuth(app);
	const provider = new GoogleAuthProvider();

	let idToken = $state('');
	let verificationResult = $state('');

	// Google ログインして ID トークンを取得し、バックエンドで検証する
	async function signIn() {
		try {
			const result = await signInWithPopup(auth, provider);
			idToken = await result.user.getIdToken(true);
			console.log('取得した ID Token:', idToken);

			// バックエンドの検証エンドポイントへ送信
			const response = await fetch('http://localhost:3000/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: idToken })
			});
			const data = await response.json();
			verificationResult = JSON.stringify(data, null, 2);
		} catch (error) {
			console.error('ログインまたは検証処理でエラーが発生しました:', error);
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
