import { expect } from "chai";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import { shouldResetDemo } from "../src/demo-api.js";
import { DEMO_PROJECT_TITLE, DEMO_TEMPLATE_VERSION, demoPages, populateDemoProject } from "../src/demo-content.js";
import { Project } from "../src/schema/app-schema.js";

// FTR-784f295f: the demo reset button manually triggers the same reset that
// otherwise runs on the 24h schedule.
describe("Demo manual reset policy", () => {
    const now = Date.now();
    const fresh = {
        isEmpty: false,
        lastReset: now - 60 * 1000, // reset one minute ago
        templateVersion: DEMO_TEMPLATE_VERSION,
        now,
        force: false,
    };

    it("does not reset a freshly seeded document without force", () => {
        expect(shouldResetDemo(fresh)).to.equal(false);
    });

    it("resets a freshly seeded document when force is requested", () => {
        expect(shouldResetDemo({ ...fresh, force: true })).to.equal(true);
    });

    it("still resets on the 24h schedule without force", () => {
        const lastReset = now - 24 * 60 * 60 * 1000 - 1;
        expect(shouldResetDemo({ ...fresh, lastReset })).to.equal(true);
    });

    it("still resets when the document is empty or has no reset metadata", () => {
        expect(shouldResetDemo({ ...fresh, isEmpty: true })).to.equal(true);
        expect(shouldResetDemo({ ...fresh, lastReset: undefined })).to.equal(true);
    });

    it("still resets when the template version changed", () => {
        expect(shouldResetDemo({ ...fresh, templateVersion: DEMO_TEMPLATE_VERSION - 1 })).to.equal(true);
    });
});

// The reset must rebuild the template with sequential writes in the live
// document. The previous applyUpdate-from-a-fresh-doc approach made the YTree
// "root" marker a concurrent write that could lose against tombstones from
// earlier resets, leaving a document that YTree refuses to load.
describe("Demo reseed keeps the shared document tree valid", () => {
    // Mirrors the transact body of POST /api/seed-demo
    function resetCycle(ydoc: Y.Doc): void {
        const orderedTree = ydoc.getMap("orderedTree");
        Array.from(orderedTree.keys()).forEach(key => orderedTree.delete(key));
        const meta = ydoc.getMap("metadata");
        meta.set("title", DEMO_PROJECT_TITLE);
        meta.set("templateVersion", DEMO_TEMPLATE_VERSION);
        populateDemoProject(Project.fromDoc(ydoc), "seed-server");
    }

    it("stays loadable by YTree across repeated reload-and-reset cycles", () => {
        // Simulate the server reloading the persisted doc (new client id each
        // time) and force-resetting it, several times in a row.
        let persisted = (() => {
            const doc = new Y.Doc();
            resetCycle(doc);
            return Y.encodeStateAsUpdate(doc);
        })();

        for (let cycle = 0; cycle < 5; cycle++) {
            const reloaded = new Y.Doc();
            Y.applyUpdate(reloaded, persisted);
            resetCycle(reloaded);
            persisted = Y.encodeStateAsUpdate(reloaded);
        }

        // A client syncing the final state must see a valid tree with one
        // top-level page per template entry.
        const synced = new Y.Doc();
        Y.applyUpdate(synced, persisted);
        const tree = new YTree(synced.getMap("orderedTree") as Y.Map<Y.Map<unknown>>);
        const rootChildren = tree.getNodeChildrenFromKey("root");
        expect(rootChildren.length).to.equal(demoPages.length);
    });
});
