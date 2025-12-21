# State Management Architecture

This document describes the state management architecture of the application, focusing on `GeneralStore`, `YjsStore`, and the initialization process.

## Component Overview

The application uses a hybrid state management approach:

1. **Svelte 5 Runes**: `GeneralStore` (`store.svelte.ts`) uses `$state` and `$derived` for reactive UI state.
2. **Yjs**: Distributed state for collaborative features (Project, Page, Items).
3. **YjsStore**: A bridge that monitors `YjsClient` connection status and synchronizes the collaborative `Project` model into the reactive `GeneralStore`.

```mermaid
classDiagram
    class GeneralStore {
        +Project? project
        +Item? currentPage
        +Object pages
        +string? openCommentItemId
        +set project(Project v)
    }
    note for GeneralStore "Singleton: `store` export.\nMain ViewModel for UI."

    class YjsStore {
        +YjsClient? yjsClient
        +boolean isConnected
        -string? _lastProjectGuid
        +set yjsClient(YjsClient? v)
    }
    note for YjsStore "Singleton: `yjsStore` export.\nBridge between Network & UI."

    class YjsService {
        +createNewProject()
        +createClient()
        +getClientByProjectTitle()
    }
    note for YjsService "Stateless Factory (mostly).\nManages Client Registry."

    class YjsClient {
        +Project getProject()
        +string containerId
        +boolean isContainerConnected
    }

    class Project {
        +string title
        +Y.Doc ydoc
        +Items items
    }

    GeneralStore <-- YjsStore : Updates .project
    YjsStore --> YjsClient : Watches
    YjsClient --> Project : Manages
    YjsService ..> YjsClient : Creates/Connects
    YjsService ..> YjsStore : Sets .yjsClient
```

## Initialization Process

The initialization flow ensures that the UI has _something_ to show immediately (Provisional Project), and then seamlessly switches to the collaborative data when the connection is established.

```mermaid
sequenceDiagram
    participant Browser
    participant Layout as +layout.svelte
    participant Store as GeneralStore
    participant YService as YjsService
    participant YStore as YjsStore
    participant YClient as YjsClient

    Note over Browser, Store: 1. Provisional Phase (Immediate)
    Browser->>Layout: Load Page (URL: /proj/page)
    Layout->>Store: Check/Init Provisional Project
    Store-->>Layout: Project ready (Local only)
    Layout->>Store: Set Provisional currentPage
    Note right of Layout: UI renders immediately with local data

    Note over Browser, Store: 2. Connection Phase (Async)
    Layout->>YService: Import & Init
    YService->>YClient: connect(projectId)
    YClient-->>YService: Connected Client
    YService->>YStore: set yjsStore.yjsClient = client
    
    Note over YStore, Store: 3. Synchronization Phase
    YStore->>YClient: getProject()
    YClient-->>YStore: Connected Project (Y.Doc)
    YStore->>Store: set project = Connected Project
    
    par Merge State
        Store->>Store: Detect Project Switch
        Store->>Store: Migrate Page Title/ID if needed
        Store->>Store: Re-bind currentPage to new Project
    end
    
    Store-->>Layout: Reactivity Update
    Note right of Layout: UI updates to show real collaborative data
```

## Test Dependency Injection

In E2E tests (Playwright), we need to inspect and manipulate the internal state. Since Svelte stores are singletons, we expose them to `window` for test access.

```mermaid
graph TD
    subgraph Browser Window
        G[window.generalStore] --> S[GeneralStore Singleton]
        Y[window.__YJS_STORE__] --> YS[YjsStore Singleton]
        R[window.__YJS_CLIENT_REGISTRY__] --> Reg[Client Registry]
    end

    subgraph Test Runner [TestHelpers.ts]
        TH[TestHelpers]
    end

    TH -- page.evaluate() --> G
    TH -- page.evaluate() --> Y
    TH -- Seeding --> S
    
    note["Test Strategy: <br/>1. Access store via window globals<br/>2. Poll for state changes (waitForFunction)<br/>3. Direct manipulation for seeding"]
    
    TH -.-> note
```

## Key Files

- `client/src/stores/store.svelte.ts`: **GeneralStore**. Core application state.
- `client/src/stores/yjsStore.svelte.ts`: **YjsStore**. Reactivity bridge.
- `client/src/lib/yjsService.svelte.ts`: **YjsService**. High-level connection logic.
- `client/src/routes/+layout.svelte`: **Bootstrapper**. Orchestrates the init flow.
