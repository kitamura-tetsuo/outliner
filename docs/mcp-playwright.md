# Playwright MCP Setup

This project can be debugged with Playwright MCP (Model Context Protocol) so agents can navigate pages, read console, and inspect the DOM.

## Quick Start

1. Install dependencies (already in repo):

   - `client` has `mcp-playwright` installed as a dev dependency.

2. Start the app dev server (in a separate terminal):

   ```bash
   cd client
   npm run dev
   # App serves at http://localhost:7090
   ```

3. Start the Playwright MCP server:

   ```bash
   cd client
   npm run mcp:playwright
   # Starts MCP server on port 4312 (SSE transport)
   ```

   Options preconfigured:
   - `--headless`
   - `--port 4312`
   - `--viewport-size 1280,960`
   - `--caps tabs,history,wait,files`
   - `--allowed-origins http://localhost:7090;http://127.0.0.1:7090`

4. Connect your MCP‑capable client to the server

   - SSE endpoint: `http://localhost:4312` (default for `mcp-server-playwright`)
   - Tools exposed include navigation (e.g., `browser_navigate`), DOM queries, screenshots, etc.

## Gemini CLI (optional)

If you use Gemini CLI with MCP, add this server to `~/.gemini/settings.json`:

```json
{
    "mcpServers": {
        "playwright": {
            "transport": "sse",
            "url": "http://localhost:4312",
            "requiresAuth": false
        }
    }
}
```

Then you can call tools like `browser_navigate` from Gemini CLI sessions.

## Notes

- Keep the app server running on `http://localhost:7090` so the MCP browser can access it.
- In CI or containers, ensure the ports 7090 (app) and 4312 (MCP) are reachable, or adjust the script.
- The E2E suite remains headless; MCP is for interactive investigation.
