#!/bin/bash
set -e

# Navigate to client directory if needed, or run from root
# The node script expects to be run such that it can find the client files.
# scripts/lint-changed-lines.js uses git diff, so it should be run from repo root.

# However, the script itself is in scripts/lint-changed-lines.js
# and it runs eslint. It assumes it's running in a way that 'npx eslint' works.
# If we are in root, we might need to cd into client to run npx eslint?

# Let's check scripts/lint-changed-lines.js again.
# It uses `npx eslint ...`. If we are in root, npx eslint might not find the local eslint in client/node_modules.

cd client
# We need to pass the base commit. For pre-commit, usually we want to check against HEAD or the index?
# But lint-changed-lines.js uses git diff BASE...HEAD.
# For pre-commit (staged files), we might want to check against HEAD (staged vs HEAD).
# But pre-commit runs on staged files.

# If we set BASE=HEAD, then `git diff HEAD...HEAD` is empty.
# We want `git diff --cached` equivalent?
# The script uses `git diff ${BASE}...HEAD`.
# If we want to check staged changes, we might need to adjust the script or how we call it.

# Actually, pre-commit usually runs on the index.
# If we use `lint-changed-lines.js`, it is designed for CI (PRs).
# For pre-commit, we want to lint what is about to be committed.

# If we set BASE to the upstream branch, it will lint everything changed since then, which is fine.
# But locally we might not have a clear upstream.

# Let's try to use a safe default or just run it.
# If we are just committing, maybe we can assume we want to check against the previous commit?
# BASE=HEAD~1 ?

# Let's try setting BASE to HEAD and see if the script handles it, or if we need to modify the script to support --cached.
# The script does: `git diff --name-only ${BASE}...HEAD`
# If we want to check staged files, we should probably use `git diff --name-only --cached`.

# For now, let's assume the user wants to check what they are working on.
# If I modify the wrapper to set BASE=origin/main, it checks everything changed compared to main.
# This is safe for "gradual adoption".

# For pre-commit, we want to check staged files.
export CHECK_STAGED=1
node ../scripts/lint-changed-lines.js
