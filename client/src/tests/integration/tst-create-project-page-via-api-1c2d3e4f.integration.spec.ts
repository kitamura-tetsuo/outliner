import { describe, expect, it } from "vitest";
import { TestHelpers } from "../../../e2e/utils/testHelpers";
import { Project } from "../../schema/app-schema";
import { store as generalStore } from "../../stores/store.svelte";

class FakePage {
    async evaluate(fn: any, args: any) {
        return fn(args);
    }
}

describe("TST-1c2d3e4f: createTestProjectAndPageViaAPI", () => {
    it("creates a page with provided lines", async () => {
        (globalThis as any).window = globalThis;
        (globalThis as any).generalStore = generalStore;
        const project = Project.createInstance("test");
        generalStore.project = project;
        const page: any = new FakePage();

        await TestHelpers.createTestProjectAndPageViaAPI(page, "test", "page", ["first", "second"]);

        const created = project.items.at(0)!;
        const items = created.items;
        expect(items.length).toBe(2);
        expect(items.at(0)!.text).toBe("first");
        expect(items.at(1)!.text).toBe("second");
    });
});
