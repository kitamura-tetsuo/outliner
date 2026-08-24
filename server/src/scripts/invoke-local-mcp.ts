import { getAuth } from "firebase-admin/auth";
import { initializeFirebase } from "../firebase-init.js";
import { localMcpDiagnosticsConfig } from "../mcp/local-diagnostics.js";
import { signAccessToken } from "../oauth/tokens.js";

const [rawUrl, email = "test@example.com"] = process.argv.slice(2);
if (!rawUrl) throw new Error("Usage: npm run mcp:resolve:local -- <outliner-url> [identity-email]");

const diagnostics = localMcpDiagnosticsConfig();
if (!diagnostics.enabled) throw new Error("Set MCP_LOCAL_DIAGNOSTICS=true to use the local MCP reproducer");

await initializeFirebase();
const user = await getAuth().getUserByEmail(email);
const { token } = signAccessToken({ uid: user.uid, scope: "outliner.read", clientId: "local-mcp-diagnostics" });
const endpoint = process.env.MCP_LOCAL_ENDPOINT || "http://localhost:7093/mcp";
const requestId = crypto.randomUUID();
const response = await fetch(endpoint, {
    method: "POST",
    headers: {
        "accept": "application/json, text/event-stream",
        "authorization": `Bearer ${token}`,
        "content-type": "application/json",
        "x-request-id": requestId,
    },
    body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "resolve_url", arguments: { url: rawUrl } },
    }),
});
const text = await response.text();
const data = text.split("\n").find(line => line.startsWith("data: "))?.slice(6) ?? text;
console.log(JSON.stringify(
    {
        requestId: response.headers.get("x-request-id") || requestId,
        firebaseMode: diagnostics.firebaseMode,
        identity: { email, uidSuffix: user.uid.slice(-6) },
        oauthValidation: "post-authentication diagnostic only; complete OAuth requires a Google-backed test account",
        status: response.status,
        result: JSON.parse(data),
    },
    undefined,
    2,
));
