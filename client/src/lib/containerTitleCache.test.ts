import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContainerTitleCache } from "./containerTitleCache";

// Mock localStorage
const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
};

Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    writable: true,
});

describe("ContainerTitleCache", () => {
    let cache: ContainerTitleCache;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorageMock.getItem.mockReturnValue(null);
        cache = new ContainerTitleCache();
    });

    describe("setTitle and getTitle", () => {
        it("should store and retrieve container titles", () => {
            const containerId = "test-container-123";
            const title = "Test Project";

            cache.setTitle(containerId, title);
            expect(cache.getTitle(containerId)).toBe(title);
        });

        it("should not store empty or default titles", () => {
            const containerId = "test-container-123";

            cache.setTitle(containerId, "");
            expect(cache.getTitle(containerId)).toBeUndefined();

            cache.setTitle(containerId, "   ");
            expect(cache.getTitle(containerId)).toBeUndefined();

            cache.setTitle(containerId, "プロジェクト");
            expect(cache.getTitle(containerId)).toBeUndefined();
        });

        it("should trim whitespace from titles", () => {
            const containerId = "test-container-123";
            const title = "  Test Project  ";

            cache.setTitle(containerId, title);
            expect(cache.getTitle(containerId)).toBe("Test Project");
        });
    });

    describe("localStorage integration", () => {
        it("should save to localStorage when setting titles", () => {
            const containerId = "test-container-123";
            const title = "Test Project";

            cache.setTitle(containerId, title);

            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                "outliner_container_titles",
                JSON.stringify({ [containerId]: title }),
            );
        });

        it("should load from localStorage on initialization", () => {
            const storedData = { "container-1": "Project 1", "container-2": "Project 2" };
            localStorageMock.getItem.mockReturnValue(JSON.stringify(storedData));

            const newCache = new ContainerTitleCache();

            expect(newCache.getTitle("container-1")).toBe("Project 1");
            expect(newCache.getTitle("container-2")).toBe("Project 2");
        });

        it("should handle localStorage errors gracefully", () => {
            localStorageMock.getItem.mockImplementation(() => {
                throw new Error("localStorage error");
            });

            expect(() => new ContainerTitleCache()).not.toThrow();
        });
    });

    describe("removeTitle", () => {
        it("should remove titles from cache", () => {
            const containerId = "test-container-123";
            const title = "Test Project";

            cache.setTitle(containerId, title);
            expect(cache.getTitle(containerId)).toBe(title);

            cache.removeTitle(containerId);
            expect(cache.getTitle(containerId)).toBeUndefined();
        });
    });

    describe("getAllTitles", () => {
        it("should return all cached titles", () => {
            cache.setTitle("container-1", "Project 1");
            cache.setTitle("container-2", "Project 2");

            const allTitles = cache.getAllTitles();
            expect(allTitles).toEqual({
                "container-1": "Project 1",
                "container-2": "Project 2",
            });
        });
    });

    describe("clear", () => {
        it("should clear all cached titles", () => {
            cache.setTitle("container-1", "Project 1");
            cache.setTitle("container-2", "Project 2");

            cache.clear();

            expect(cache.getTitle("container-1")).toBeUndefined();
            expect(cache.getTitle("container-2")).toBeUndefined();
            expect(cache.getAllTitles()).toEqual({});
        });
    });

    describe("getStats", () => {
        it("should return cache statistics", () => {
            cache.setTitle("container-1", "Project 1");
            cache.setTitle("container-2", "Project 2");

            const stats = cache.getStats();
            expect(stats.count).toBe(2);
            expect(stats.size).toBeGreaterThan(0);
        });
    });
});
