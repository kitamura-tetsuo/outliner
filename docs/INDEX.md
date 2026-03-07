# AI Knowledge Graph Entry Point

This document serves as the primary entry point for AI agents to understand the Outliner project architecture and navigate its codebase.

## Project Architecture Overview

The Outliner project is a real-time collaborative application built with the following core technologies:

- **Svelte Client**: The frontend user interface is built using Svelte 5 and SvelteKit. It emphasizes reactive state management and avoids direct DOM manipulation.
- **Yjs State Management**: Real-time collaborative state and data synchronization are managed using Yjs, utilizing a mirror pattern for reactive data binding with Svelte `$state`.
- **Firebase/Node.js Server**: The backend infrastructure relies on Firebase (Auth, Firestore, Hosting, Functions) and a Node.js Express server for authentication and specific backend operations. Emulators are used extensively for local development and testing.

## Key Directories

- [`client/src`](../client/src): Contains the SvelteKit frontend application code, including components, state stores, and Yjs integration logic.
- [`server/`](../server/): Contains the backend Express server code for authentication and API services.

## Architectural Documents

- [**AGENTS.md**](../AGENTS.md): The primary set of guidelines, development policies, and testing rules for the project. **Must be read by all AI agents.**
- [**README.md**](../README.md): General project overview, setup instructions, and deployment guides.
- [**Yjs Migration / fluid_to_yjs.md**](fluid_to_yjs.md): Details the mapping between legacy Fluid data structures and the current Yjs implementation, along with migration status.
- [**State Management / state_management.md**](state_management.md): Guidelines on how state is managed across the application, particularly interacting with Yjs.
- [**Production Setup / PRODUCTION_SETUP.md**](PRODUCTION_SETUP.md): Instructions and configurations for the production cloud backend.
