const FIREBASE_JS_SDK_VERSION = "12.17.1";

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (ch) =>
        ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        })[ch] as string);
}

/**
 * Web config for the Firebase project used by this authorize page's Google
 * sign-in button. These values (apiKey, authDomain, appId, ...) identify a
 * Firebase *web app* and are not secrets — they are the same values already
 * shipped in the client bundle (see client/src/lib/firebase-app.ts) — but
 * this server reads the same VITE_FIREBASE_* environment values that are
 * embedded in the client build. Keeping those values in the server's runtime
 * environment does not expose a secret; Firebase web configuration is public.
 */
export function getOAuthFirebaseWebConfig() {
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID
        || process.env.FIREBASE_PROJECT_ID
        || process.env.GCLOUD_PROJECT;
    const values = {
        apiKey: process.env.VITE_FIREBASE_API_KEY,
        authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId,
        appId: process.env.VITE_FIREBASE_APP_ID,
    };

    // The Auth emulator accepts arbitrary public web-app identifiers. Supplying
    // explicit emulator-only values keeps local/test setup lightweight without
    // hiding an incomplete production deployment behind demo placeholders.
    if (process.env.NODE_ENV !== "production" && process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        return {
            apiKey: values.apiKey || "firebase-auth-emulator-api-key",
            authDomain: values.authDomain || `${projectId || "firebase-auth-emulator"}.firebaseapp.com`,
            projectId: values.projectId || "firebase-auth-emulator",
            appId: values.appId || "1:0:web:firebase-auth-emulator",
        };
    }

    const missing = Object.entries(values).filter(([, value]) => !value).map(([key]) => key);
    if (missing.length > 0) {
        throw new Error(
            `Missing required Firebase Web configuration for OAuth: ${missing.join(", ")}. `
                + "Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, and "
                + "VITE_FIREBASE_APP_ID to the same public values used by the Outliner client.",
        );
    }

    return {
        apiKey: values.apiKey!,
        authDomain: values.authDomain!,
        projectId: values.projectId!,
        appId: values.appId!,
    };
}

/**
 * Content-Security-Policy for the /oauth/authorize response. The server's
 * global helmet() middleware (server.ts) sets a default `script-src 'self'`,
 * which would block both this page's inline sign-in script and its Firebase
 * Auth SDK imports from gstatic.com — the route handler overrides the
 * header with this value instead of relying on the global default.
 */
export function getAuthorizePageContentSecurityPolicy(nonce: string): string {
    const config = getOAuthFirebaseWebConfig();
    const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    const connectSrc = [
        "'self'",
        "https://www.googleapis.com",
        "https://identitytoolkit.googleapis.com",
        "https://securetoken.googleapis.com",
        "https://apis.google.com",
    ];
    if (emulatorHost) connectSrc.push(`http://${emulatorHost}`);

    return [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.gstatic.com https://apis.google.com`,
        "style-src 'self' 'unsafe-inline'",
        `connect-src ${connectSrc.join(" ")}`,
        `frame-src https://${config.authDomain} https://accounts.google.com`,
        "img-src 'self' data: https:",
        "base-uri 'none'",
        "form-action 'self'",
    ].join("; ");
}

/**
 * Renders the standalone HTML/JS authorization page served at
 * GET /oauth/authorize. It only offers Google sign-in (via Firebase Auth's
 * GoogleAuthProvider) — email/password is intentionally never rendered here
 * so it cannot be used as an MCP/ChatGPT login path. On success it posts the
 * Firebase ID token to /oauth/authorize/callback and follows the
 * server-computed redirect back to the client (e.g. ChatGPT).
 */
export function renderAuthorizePage(
    params: { requestId: string; clientName?: string; scope: string; nonce: string; },
): string {
    const config = getOAuthFirebaseWebConfig();
    const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    const clientLabel = params.clientName ? escapeHtml(params.clientName) : "This application";

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sign in to Outliner</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; color: #1a1a1a; }
  .card { background: #fff; border-radius: 12px; padding: 32px; max-width: 380px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); text-align: center; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  p { font-size: 14px; color: #444; line-height: 1.5; }
  button { margin-top: 16px; padding: 10px 20px; border-radius: 8px; border: 1px solid #ccc; background: #fff; cursor: pointer; font-size: 15px; }
  button:hover:not(:disabled) { background: #f0f0f0; }
  button:disabled { opacity: 0.6; cursor: default; }
  .status { color: #555; margin-top: 12px; font-size: 13px; min-height: 16px; }
  .error { color: #b00020; margin-top: 8px; font-size: 13px; min-height: 16px; }
</style>
</head>
<body>
  <div class="card">
    <h1>Sign in to Outliner</h1>
    <p>${clientLabel} is requesting ${
        params.scope.split(/\s+/).includes("outliner.write") ? "read and write" : "read-only"
    } access (<code>${escapeHtml(params.scope)}</code>) to your Outliner account.</p>
    <p>Only Google-backed Outliner accounts can be used to connect ChatGPT/MCP clients.</p>
    <button id="google-signin" type="button">Sign in with Google</button>
    <div id="status" class="status"></div>
    <div id="error" class="error"></div>
  </div>
  <script type="module" nonce="${params.nonce}">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/${FIREBASE_JS_SDK_VERSION}/firebase-app.js";
    import {
      getAuth,
      GoogleAuthProvider,
      signInWithPopup,
      connectAuthEmulator,
    } from "https://www.gstatic.com/firebasejs/${FIREBASE_JS_SDK_VERSION}/firebase-auth.js";

    const app = initializeApp(${JSON.stringify(config)});
    const auth = getAuth(app);
    ${
        emulatorHost
            ? `connectAuthEmulator(auth, ${JSON.stringify(`http://${emulatorHost}`)}, { disableWarnings: true });`
            : ""
    }

    const statusEl = document.getElementById("status");
    const errorEl = document.getElementById("error");
    const button = document.getElementById("google-signin");

    button.addEventListener("click", async () => {
      errorEl.textContent = "";
      statusEl.textContent = "Signing in…";
      button.disabled = true;
      try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const idToken = await result.user.getIdToken();
        statusEl.textContent = "Completing authorization…";
        const response = await fetch("/oauth/authorize/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: ${JSON.stringify(params.requestId)}, idToken }),
        });
        const data = await response.json();
        if (!response.ok || !data.redirectTo) {
          throw new Error(data.error_description || data.error || "Authorization failed");
        }
        window.location.href = data.redirectTo;
      } catch (err) {
        console.error("OAuth authorization error:", err);
        errorEl.textContent = err instanceof Error ? err.message : "Sign-in failed. Please try again.";
        statusEl.textContent = "";
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}
