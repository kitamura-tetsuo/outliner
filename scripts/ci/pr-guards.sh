#!/usr/bin/env bash
# PR guards: mechanical protection against runaway agent PRs.
#
# Motivation: in PR #3486 an agent pushed a stale workspace snapshot on top of
# an already-updated branch, silently reverting 119 files of main (all fixes
# from #3465-#3474). CI stayed green because the tests were reverted together
# with the fixes. These guards catch that failure class mechanically:
#
#   1. scope  - fail when the PR diff is anomalously large
#               (override with the "allow-large-diff" PR label)
#   2. debris - fail when known scratch/debris files are tracked in the tree
#   3. revert - fail when the PR head has UNDONE commits that are already part
#               of its own history on the base branch (the #3486 signature)
#               (override with the "allow-revert" PR label)
#
# Environment:
#   BASE_REF            base branch name (e.g. "main"). Empty => push build:
#                       only the debris guard runs.
#   PR_LABELS           space-separated PR label names (for overrides)
#   MAX_FILES           scope guard file-count threshold   (default 50)
#   MAX_ADDITIONS       scope guard added-lines threshold  (default 5000)
#   REVERT_SCAN_COMMITS how many recent base commits to scan (default 50)
#
# Requires: full clone (fetch-depth: 0) and the PR head checked out.

set -euo pipefail

BASE_REF="${BASE_REF:-}"
PR_LABELS="${PR_LABELS:-}"
MAX_FILES="${MAX_FILES:-50}"
MAX_ADDITIONS="${MAX_ADDITIONS:-5000}"
REVERT_SCAN_COMMITS="${REVERT_SCAN_COMMITS:-50}"
# Test hook: lets the test suite point the guards at a historical base commit.
BASE_COMMIT_OVERRIDE="${BASE_COMMIT_OVERRIDE:-}"

fail=0

has_label() {
    case " ${PR_LABELS} " in
        *" $1 "*) return 0 ;;
        *) return 1 ;;
    esac
}

resolve_base() {
    if [ -n "$BASE_COMMIT_OVERRIDE" ]; then
        echo "$BASE_COMMIT_OVERRIDE"
    else
        echo "origin/${BASE_REF}"
    fi
}

# ---------------------------------------------------------------------------
# Guard 1: scope anomaly
# ---------------------------------------------------------------------------
scope_guard() {
    local base merge_base files additions
    base="$(resolve_base)"
    merge_base="$(git merge-base HEAD "$base")"
    files="$(git diff --name-only "${merge_base}..HEAD" | wc -l | tr -d ' ')"
    additions="$(git diff --numstat "${merge_base}..HEAD" | awk '$1 != "-" { s += $1 } END { print s + 0 }')"

    echo "[scope] files=${files} (max ${MAX_FILES}), additions=${additions} (max ${MAX_ADDITIONS})"

    if [ "$files" -gt "$MAX_FILES" ] || [ "$additions" -gt "$MAX_ADDITIONS" ]; then
        if has_label "allow-large-diff"; then
            echo "[scope] over threshold but 'allow-large-diff' label is set -- allowed"
        else
            echo "::error::[scope] PR diff is anomalously large (${files} files, +${additions} lines)." \
                 "If intentional, add the 'allow-large-diff' label. Oversized diffs are the signature" \
                 "of an agent pushing a stale workspace snapshot (see PR #3486 incident)."
            fail=1
        fi
    fi
}

# ---------------------------------------------------------------------------
# Guard 2: tracked debris files
# ---------------------------------------------------------------------------

# Keeps only the debris paths of a newline-separated path list on stdin.
#
# Root-level scratch patterns (mirrors .gitignore) plus known one-off names
# and client/ output dumps. Legit root files (README.md, package.json, ...)
# do not match any of these.
#
# Root-level plan files (plan.md, plan.txt, plan_foo.md, ...) are agent
# work-in-progress notes: in PR #4939 an agent committed plan.md and nothing
# else. Plans belong in scratch space, never in the repository.
debris_paths() {
    grep -E \
        -e '^(fix|observe|debug|check|print|sed|revert|patch)[_-][^/]*$' \
        -e '^(get|test|update)[_-][^/]*\.(cjs|mjs|js|txt)$' \
        -e '^test\.(cjs|mjs|js)$' \
        -e '^[^/]*\.(patch|diff|png|jpg|jpeg|py)$' \
        -e '^(COMMIT_EDITMSG|PARENT_ISSUE_COMPLETION\.md|BacklinkPanel_fixed\.svelte|my_changes\.diff|error\.png)$' \
        -e '^The commit message' \
        -e '^(eslint|server_eslint)_[^/]*\.json$' \
        -e '^(demo|verify|add_coverage|cleanup-coverage)[_-][^/]*$' \
        -e '^[Pp][Ll][Aa][Nn][Ss]?([_-][^/]*)?\.(md|txt)$' \
        -e '^client/(demo[_-][^/]*\.png|[^/]*_output\.txt|svelte-check\.txt|test-bold-matching\.js|unit_test_output\.txt)$' \
        || true
}

debris_guard() {
    local violations
    violations="$(git ls-files | debris_paths)"

    if [ -n "$violations" ]; then
        echo "::error::[debris] Debris/scratch files are tracked in this tree. Remove them (they" \
             "belong in .gitignore'd scratch space). Their reappearance usually means an agent" \
             "committed a stale workspace snapshot (see PR #3486 incident):"
        echo "$violations" | sed 's/^/  - /'
        fail=1
    else
        echo "[debris] no tracked debris files"
    fi
}

# ---------------------------------------------------------------------------
# Guard 3: undone base commits (the #3486 signature)
# ---------------------------------------------------------------------------
# For each recent commit C on the base branch that is ALREADY an ancestor of
# the PR head (i.e. the branch has been updated with it), test whether C's
# patch applies cleanly FORWARD onto the head tree. If it does, the tree looks
# exactly like the pre-C state in the touched areas => C has been undone.
# To distinguish the PR's doing from history (e.g. a later cleanup commit on
# the base branch legitimately removed what C added), only flag commits that
# are undone in HEAD but NOT undone in the base tip itself.
# Commits merely missing from a stale branch are not ancestors and are skipped,
# so ordinary out-of-date PRs do not trigger this guard.
# Commits that only touch debris files are skipped too: deleting debris is what
# the debris guard asks for, and it can never clobber real work.

# True when the patch in $2 applies cleanly onto the tree of commit-ish $1
# (checked against a throwaway index; the working tree is not touched).
patch_applies_to() {
    local idx rc
    idx="$(mktemp)"
    if ! GIT_INDEX_FILE="$idx" git read-tree "$1" 2>/dev/null; then
        rm -f "$idx"
        return 1
    fi
    GIT_INDEX_FILE="$idx" git apply --cached --check "$2" 2>/dev/null
    rc=$?
    rm -f "$idx"
    return $rc
}

# True when every file the commit $1 touches is a debris path.
touches_only_debris() {
    local touched debris
    touched="$(git show "$1" --format= --name-only)"
    [ -n "$touched" ] || return 1
    debris="$(printf '%s\n' "$touched" | debris_paths)"
    [ "$(printf '%s\n' "$touched" | wc -l)" -eq "$(printf '%s\n' "$debris" | grep -c . || true)" ]
}

revert_guard() {
    local base patch_file c undone=0
    base="$(resolve_base)"
    patch_file="$(mktemp)"

    for c in $(git rev-list --no-merges -n "$REVERT_SCAN_COMMITS" "$base"); do
        git merge-base --is-ancestor "$c" HEAD || continue
        if touches_only_debris "$c"; then
            echo "[revert] skipping debris-only base commit $(git log -1 --format='%h %s' "$c")"
            continue
        fi
        git show "$c" --format= --patch > "$patch_file"
        [ -s "$patch_file" ] || continue
        if patch_applies_to HEAD "$patch_file" && ! patch_applies_to "$base" "$patch_file"; then
            echo "::error::[revert] PR head has UNDONE base commit $(git log -1 --format='%h %s' "$c")"
            undone=$((undone + 1))
        fi
    done
    rm -f "$patch_file"

    if [ "$undone" -gt 0 ]; then
        if has_label "allow-revert"; then
            echo "[revert] ${undone} undone commit(s) but 'allow-revert' label is set -- allowed"
        else
            echo "::error::[revert] ${undone} base-branch commit(s) have been undone by this PR." \
                 "If this is an intentional revert, add the 'allow-revert' label. Otherwise the" \
                 "branch has clobbered newer work -- typically an agent pushing a stale workspace" \
                 "after the branch was updated (see PR #3486 incident). Do NOT merge; rebuild the" \
                 "branch from current ${BASE_REF:-base} instead."
            fail=1
        fi
    else
        echo "[revert] no undone base commits (scanned ${REVERT_SCAN_COMMITS})"
    fi
}

# ---------------------------------------------------------------------------

debris_guard

if [ -n "$BASE_REF" ] || [ -n "$BASE_COMMIT_OVERRIDE" ]; then
    scope_guard
    revert_guard
else
    echo "[scope]/[revert] skipped (no BASE_REF; push build)"
fi

if [ "$fail" -ne 0 ]; then
    echo ""
    echo "PR guards FAILED. See errors above."
    exit 1
fi
echo ""
echo "PR guards passed."
