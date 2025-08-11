import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { Comment } from "../schema/app-schema";
import { v4 as uuid } from "uuid";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

test("comment reactions can be added and removed", () => {
    const time = new Date().getTime();
    const comment = new Comment({
        id: uuid(),
        text: "Test comment",
        author: "test-user",
        created: time,
        lastChanged: time,
        reactions: new Map(),
    });

    const user1 = "user1";
    const user2 = "user2";
    const emoji = "❤️";

    // Add a reaction
    vi.advanceTimersByTime(1000);
    comment.toggleReaction(emoji, user1);
    expect(comment.reactions.get(emoji)?.includes(user1)).toBe(true);
    expect(comment.lastChanged).toBeGreaterThan(time);

    const lastChangedAfterFirstReaction = comment.lastChanged;

    // Add another reaction from a different user
    vi.advanceTimersByTime(1000);
    comment.toggleReaction(emoji, user2);
    expect(comment.reactions.get(emoji)?.includes(user2)).toBe(true);
    expect(comment.reactions.get(emoji)?.length).toBe(2);
    expect(comment.lastChanged).toBeGreaterThan(lastChangedAfterFirstReaction);

    const lastChangedAfterSecondReaction = comment.lastChanged;

    // Remove the first user's reaction
    vi.advanceTimersByTime(1000);
    comment.toggleReaction(emoji, user1);
    expect(comment.reactions.get(emoji)?.includes(user1)).toBe(false);
    expect(comment.reactions.get(emoji)?.length).toBe(1);
    expect(comment.lastChanged).toBeGreaterThan(lastChangedAfterSecondReaction);

    const lastChangedAfterRemoveReaction = comment.lastChanged;

    // Remove the second user's reaction, which should remove the emoji from the map
    vi.advanceTimersByTime(1000);
    comment.toggleReaction(emoji, user2);
    expect(comment.reactions.has(emoji)).toBe(false);
    expect(comment.lastChanged).toBeGreaterThan(lastChangedAfterRemoveReaction);
});
