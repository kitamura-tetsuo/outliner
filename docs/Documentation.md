# Documentation Guidelines

This project uses a dual-purpose documentation architecture under the `docs/` directory.
The Markdown files here are designed to be consumed by **both human developers (via VitePress SSG) and AI coding agents (via raw file parsing).**

Whenever you create, update, or reorganize documentation, you MUST strictly adhere to the following rules to prevent breaking the context for either audience.

## 1. Dual-Purpose Architecture

- **For Humans**: The `docs/` directory is built into a static site using VitePress (deployed to GitHub Pages).
- **For AI Agents**: Agents read the raw Markdown files directly from the repository tree to build their knowledge graph and context.

## 2. Frontmatter is Sacred

AI agents rely heavily on YAML frontmatter to understand the context and relationships between documents and source code.

- **NEVER** remove existing YAML frontmatter from Markdown files.
- When creating a new document, you MUST include frontmatter with `title`, `description`, and importantly, `related_files` (pointing to the actual source code paths).
  ```yaml
  ---
  title: Feature Name
  description: Brief description of the feature
  related_files:
    - client/src/components/TargetComponent.svelte
  ---
  ```

## 3. Sidebar Navigation Separation

We separate what humans see from what AI agents see using the VitePress configuration.

- Human navigation is strictly controlled by the `sidebar` array in `docs/.vitepress/config.mts`.
- **DO NOT** add AI-specific entry points (like `docs/INDEX.md` or raw prompt files) to the VitePress `sidebar`. They must remain hidden from the human UI but exist in the file tree for AI consumption.

## 4. Link and Path Conventions

- Write internal links using **exact relative file paths** (e.g., `[Yjs Setup](./architecture/yjs-setup.md)`), NOT VitePress route URLs (e.g., `/architecture/yjs-setup`). AI agents need actual file paths to navigate the repository.
- VitePress is configured with `ignoreDeadLinks: true` to prevent build failures from raw paths or AI-only files. **DO NOT** change this configuration.

## 5. One Topic Per File (Chunking)

- Keep documents focused and granular. AI agents have limited context windows, and humans prefer scannable pages.
- Avoid monolithic, massive Markdown files. Split them by topic (e.g., Tutorial, How-to, Reference, Explanation).
