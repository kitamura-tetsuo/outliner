import { expect, test } from "@playwright/test";
import { testData, testData2 } from "../utils/testData";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidation } from "../utils/treeValidation";

test.describe("Collaborator Cursors", () => {
    let helpers: TestHelpers;
    let helpers2: TestHelpers;
    let tree: TreeValidation;
    let tree2: TreeValidation;

    test.beforeEach(async ({ page, context }) => {
        helpers = new TestHelpers(page);
        tree = new TreeValidation(page);

        const page2 = await context.newPage();
        helpers2 = new TestHelpers(page2);
        tree2 = new TreeValidation(page2);
    });

    test("Renders remote user cursors", async () => {
        const projectName = "cursor-test";
        await helpers.initFluidClient();
        await helpers.createNewProject(projectName, testData);

        await helpers2.initFluidClient();
        await helpers2.openProject(projectName);

        await helpers.page.getByText("text 1-1").click();
        await helpers.page.keyboard.press("ArrowRight");

        const remoteCursor = await helpers2.page.waitForSelector(".cursor[style*='background-color']");
        expect(remoteCursor).toBeTruthy();
    });
});
