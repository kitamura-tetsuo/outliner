import crypto from "crypto";
import type { Item } from "../schema/app-schema.js";
import { McpReadError } from "./mcp-error.js";

/**
 * Shared optimistic-concurrency precondition every MCP mutation tool
 * accepts (issue #5208's "mutation safety contract"). `expectedRevision` is
 * an opaque content-hash token previously returned for the same entity;
 * omitting it means "apply unconditionally" (last-write-wins).
 * `operationId` lets a client safely retry a request that may or may not
 * have reached the server without duplicating the mutation. `dryRun`
 * validates the write and checks the precondition without persisting
 * anything.
 */
export interface MutationPrecondition {
    expectedRevision?: string;
    operationId?: string;
    dryRun?: boolean;
}

/** The result shape every mutation tool returns, on top of its own fields. */
export interface MutationResult {
    applied: boolean;
    priorRevision?: string;
    revision: string;
}

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
        // Only plain object literals are supported. A class instance (Y.Doc,
        // Y.Map, Y.Text, a Map/Set, a live connection, a cache, ...) can hold
        // circular references or internal state that was never meant to be
        // part of a revision token; recursing into it can throw deep inside
        // canonicalize (issue #5258) instead of at the call site that made
        // the mistake. Callers must pass an explicitly enumerated plain-data
        // descriptor instead.
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            throw new TypeError(
                `revisionOf cannot hash a ${value.constructor?.name ?? "non-plain"} object; `
                    + "pass an explicit plain-data descriptor instead",
            );
        }
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, child]) => [key, canonicalize(child)]),
        );
    }
    return value;
}

/**
 * Opaque content-hash revision token for one entity's current state. Two
 * reads of the same logical value always produce the same token; any
 * change to the value produces a different one. This is a content hash
 * rather than a monotonic counter, so it needs no extra Yjs-persisted
 * bookkeeping and works uniformly for table rows, outline items, and view
 * queries alike.
 */
export function revisionOf(value: unknown): string {
    return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex").slice(0, 16);
}

/** Throws a structured stale_revision conflict when expected != actual. */
export function assertRevision(expected: string, actual: string, debug?: Record<string, unknown>): void {
    if (expected !== actual) {
        throw new McpReadError("stale_revision", "The entity has changed since expectedRevision was read", {
            ...debug,
            expectedRevision: expected,
            currentRevision: actual,
        });
    }
}

/**
 * Content-hash revision for an outline_items relation row, shared between
 * the write path (writeOutline's precondition check) and every read tool
 * that can serve as the "read" half of a read-modify-write cycle
 * (get_item, get_subtree, get_ancestors). Both sides MUST hash the exact
 * same field set, or a revision read from one tool would never match what
 * the other computes and every expectedRevision precondition would appear
 * permanently stale.
 */
export function outlineItemRevision(item: Item): string {
    const value = item.yMap;
    return revisionOf({
        text: item.text,
        done: value.get("done"),
        tags: item.tags,
        due: value.get("due"),
        start: value.get("start"),
        allDay: value.get("allDay"),
        duration: value.get("duration"),
        rrule: value.get("rrule"),
        recurrenceDtstart: value.get("recurrenceDtstart"),
        recurrenceTimezone: value.get("recurrenceTimezone"),
    });
}

const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;

/**
 * Per-service replay cache keyed by operationId. A mutation tool checks
 * this before doing any work; a hit awaits the exact prior (or in-flight)
 * attempt instead of re-applying the mutation, so a client retrying after
 * a dropped response (network error, timeout) cannot duplicate the write
 * - and nor can two concurrent retries racing each other, since the
 * in-flight promise is cached synchronously before it is ever awaited.
 */
export class IdempotencyCache {
    private readonly entries = new Map<string, { expiresAt: number; result: Promise<unknown>; }>();

    key(...parts: (string | undefined)[]): string | undefined {
        return parts.every(part => part !== undefined) ? parts.join(" ") : undefined;
    }

    async run<T>(key: string | undefined, run: () => Promise<T> | T): Promise<{ result: T; replayed: boolean; }> {
        if (!key) return { result: await run(), replayed: false };
        const now = Date.now();
        for (const [existingKey, entry] of this.entries) {
            if (entry.expiresAt <= now) this.entries.delete(existingKey);
        }
        const cached = this.entries.get(key);
        if (cached) return { result: await cached.result as T, replayed: true };
        // Populate the cache with the in-flight promise synchronously —
        // nothing here awaits before this.entries.set() runs, so a second
        // concurrent call with the same key can never slip past the
        // `cached` check above and race this attempt.
        const promise = (async () => run())();
        this.entries.set(key, { expiresAt: now + IDEMPOTENCY_TTL_MS, result: promise });
        try {
            return { result: await promise, replayed: false };
        } catch (error) {
            // A failed attempt is never replayed; remove it so a retry
            // with the same operationId gets a fresh attempt.
            this.entries.delete(key);
            throw error;
        }
    }
}
