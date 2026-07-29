import { render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import SnapshotDiffModal from "../../components/SnapshotDiffModal.svelte";
import { addSnapshot } from "../../services";

vi.mock("../../services", () => {
    return {
        listSnapshots: () => [],
        getSnapshot: () => null,
        addSnapshot: vi.fn(),
        replaceWithSnapshot: vi.fn(),
    };
});

describe("SnapshotDiffModal", () => {
    it("performs no writes on mount", () => {
        // Mock window.location to trigger the original buggy condition
        Object.defineProperty(window, 'location', {
            value: {
                pathname: '/demo/test-page/diff',
            },
            writable: true
        });

        render(SnapshotDiffModal, {
            props: {
                project: "demo",
                page: "test-page",
                currentContent: "content",
                author: "user",
            }
        });

        expect(addSnapshot).not.toHaveBeenCalled();
    });
});