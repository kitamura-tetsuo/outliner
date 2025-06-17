/** @feature BRF-0001
 *  Title   : Branch forest item extraction
 *  Source  : docs/client-features.yaml
 */
import { describe, it, expect } from "vitest";
import { DraftService } from "./draftService.svelte";

describe("tryExtractFromBranchForest", () => {
    it("extracts items from branch.forest into collection", () => {
        const service = new DraftService();
        const branch = {
            forest: [
                { id: "n1", text: "Node 1" },
                {
                    items: [
                        { id: "c1", text: "Child 1" },
                        { id: "c2", text: "Child 2" },
                    ],
                },
            ],
        };
        const items: any[] = [];
        const result = (service as any).tryExtractFromBranchForest(branch, items);
        expect(result).toBe(true);
        expect(items.length).toBe(3);
        expect(items[0].text).toBe("Node 1");
        expect(items[1].text).toBe("Child 1");
        expect(items[2].text).toBe("Child 2");
    });
});
