# Project maintenance

Project titles are canonical resource-side metadata. Maintenance tools must
validate `projectUsers/{projectId}` before opening or changing
`projects/{projectId}` in Yjs persistence.

## Safety rules

- Use Firebase Emulator and a copied SQLite database while developing or
  testing a maintenance operation.
- Never use `userProjects` or `userContainers` as authorization evidence.
- Never infer a project title from a project ID, room name, URL, or Yjs
  document.
- Abort before writing Yjs content when the canonical descriptor is missing,
  its title is invalid, or the supplied Firebase UID is not listed in the
  resource-side ACL.
- Do not persist project titles in Yjs project documents.
- Production reset or repair commands must support a dry run, identify every
  targeted project ID, and require explicit confirmation.

## `db-debug` writes

The interactive database debugger can inspect documents without Firebase
identity context. Its **Create Page in Project** action is different: set
`MAINTENANCE_UID` to the Firebase UID that must already be authorized by the
target `projectUsers/{projectId}` document. The action validates the canonical
descriptor before it changes SQLite.

Do not run the debugger against the same SQLite database while the production
Hocuspocus server is running. Stop production writers, create a backup, perform
the narrowly scoped operation, then restart and verify both the web client and
read-only MCP.

## Seed API

The authenticated seed API derives a stable test project ID from the explicit
project name. It creates the canonical resource descriptor for a new project or
requires the existing descriptor's ACL and title to match. A mismatch fails
before the Yjs room is opened. Seeding removes a legacy Yjs title instead of
creating another title authority.

## Project-directory storage provider

All server callers reach project-directory and project-access storage through
the provider boundary in `server/src/project-directory-provider.ts`, which
covers descriptor creation, lookup, listing, title resolution and rename plus
the associated resource-side access checks and accessible-ID discovery. The
Firestore implementation is selected by default and needs no local password,
local database or new cloud configuration. The boundary performs no project-ID
validation itself: the Firestore adapter treats IDs as opaque strings matching
`^[A-Za-z0-9_-]{1,200}$`, and another producer may support a different ID
domain. Canonical reads use `projectUsers/{projectId}` only; the Boolean and
ID-list compatibility facades keep their denied/empty fallback on storage
errors, which callers must not mistake for a successful empty directory.
