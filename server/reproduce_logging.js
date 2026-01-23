import WebSocket from "ws";

const projectId = "d4fefa44-cb76-4fe2-ad26-37c7d05e06ca";
const port = 7093;
const wsUrl = `ws://localhost:${port}/projects/${projectId}`;

function generateMockToken() {
    // Generate valid mock token for dev environment to pass auth
    const header = JSON.stringify({ alg: "none", typ: "JWT" });
    const payload = JSON.stringify({
        uid: "test-user-logging",
        sub: "test-user-logging",
        aud: "outliner-d57b0",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: "https://securetoken.google.com/outliner-d57b0",
    });
    const b64 = (str) => Buffer.from(str).toString("base64").replace(/=/g, "");
    return `${b64(header)}.${b64(payload)}.`;
}

const token = generateMockToken();
const fullUrl = `${wsUrl}?token=${token}`;

console.log(`Connecting to ${wsUrl}`);

const ws = new WebSocket(fullUrl);

ws.on("open", () => {
    console.log("OPEN");
    setTimeout(() => {
        console.log("Closing...");
        ws.close();
        process.exit(0);
    }, 2000);
});

ws.on("close", (code, reason) => {
    console.log(`CLOSE: code=${code}, reason=${reason}`);
    process.exit(0);
});

ws.on("error", (err) => {
    console.log(`ERROR: ${err.message}`);
    process.exit(1);
});
