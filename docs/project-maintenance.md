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
