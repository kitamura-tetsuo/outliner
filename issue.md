# Bug Report: Public Demo Page Fails to Load and Remains Stuck in Loading State

**Description:**
The Public Demo page (`/demo`) fails to fully load for anonymous users and remains stuck displaying the "Loading Demo..." indicator. Checking the page console logs reveals repeated connection failures and reconnections with the underlying WebSocket.

**Root Causes:**

There are two primary causes identified in the codebase contributing to this behavior:

1. **Unauthenticated Token Request in WebSocket Client:**
   In `client/src/lib/yjs/connection.ts`, the WebSocket connection requires an authentication token. While the `createProjectConnection` function has a safeguard to bypass token fetching for the "demo" project (`if (projectId !== "demo")`), the `connectProjectDoc` and `createMinimalProjectConnection` functions do not have this check.
   Consequently, when these functions execute for an unauthenticated user on the demo page, `getFreshIdToken()` runs, throws an error (`Error: No Firebase user available for Yjs auth`), and causes the WebSocket connection logic to fail or drop necessary initial payload configurations.

2. **Improper Document Seeding on the Backend:**
   In `server/src/demo-api.ts`, the demo room is periodically reset using a template. The current implementation uses `const project = Project.fromDoc(ydoc);` to wrap the direct connection document after manually clearing its maps.
   However, `fromDoc` expects the underlying Yjs map structure (like `orderedTree` and `items`) to be properly initialized. Since they aren't fully initialized by simply clearing the maps, the server seed logic leaves the Yjs document in an invalid state. The client connects and waits for the initial synchronization of the document (specifically waiting for the `orderedTree` size or presence), which times out and leaves the UI in a loading state.

**Proposed Solutions:**

1. **Fix `client/src/lib/yjs/connection.ts`:**
   Wrap the `getFreshIdToken()` calls inside `connectProjectDoc` and `createMinimalProjectConnection` with a check for the demo project:
   ```typescript
   let initialToken = "";
   try {
       if (projectId !== "demo") {
           initialToken = await getFreshIdToken();
       }
   } catch (e) {
       console.error("[connectProjectDoc] getFreshIdToken FAILED:", e);
   }
   ```

2. **Fix `server/src/demo-api.ts`:**
   Instead of using `Project.fromDoc(ydoc)` on an empty document, initialize a new `Project` instance correctly and merge its valid Yjs state into the direct connection document using `Y.applyUpdate`.
   ```typescript
   // Create a properly structured Project with maps initialized
   const project = Project.createInstance("Demo Project");
   // Merge this initialized state into the live Y.Doc
   Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(project.doc));

   // Now safe to use fromDoc to manipulate the live document
   const docProject = Project.fromDoc(ydoc);
   const page = docProject.addPage("Demo", "seed-server");
   ```

Applying these fixes will resolve the authentication bypass errors and ensure the backend properly constructs the initial document state, allowing the client to successfully sync and render the demo workspace.
