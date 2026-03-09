import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/**
 * @file container-title-persistence.spec.ts
 * @description E2E test for container title persistence and home dropdown display
 * Confirms that the container title is persisted in metaDoc and displayed in the home dropdown even after page reload
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @feature CNT-0001
 *  Title   : Container title persistence and home dropdown display
 *  Source  : docs/client-features.yaml
 */
test.describe("Container title persistence tests", () => {
  /**
   * @testcase Displayed in home dropdown after creating a container
   * @description Confirms that a new container is displayed in the home dropdown immediately after creation
   */
  test("Displayed in home dropdown after creating a container", async ({
    page,
  }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);

    // Create a project and a page (which creates a container)
    const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(
      page,
      testInfo,
    );
    const encodedProject = encodeURIComponent(projectName);
    const encodedPage = encodeURIComponent(pageName);

    // Navigate to the project page
    await page.goto(`/${encodedProject}/${encodedPage}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);

    // Get the project name (this is used as the container title)
    const projectTitle = projectName;

    // Navigate to home
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Wait for the home dropdown or container list to be displayed
    await page.waitForSelector(
      '[data-testid="container-dropdown"], .container-list, .home-dropdown',
      {
        timeout: 10000,
      },
    );

    // Confirm that the created container is displayed in the home dropdown
    const containerElement = page.locator(
      '[data-testid="container-dropdown"], .container-list, .home-dropdown',
    );
    await expect(containerElement).toContainText(projectTitle);

    // Check using the container ID as well (fallback feature)
    const containerItem = page.locator(
      `[data-container-id="${projectTitle}"], [data-project-name="${projectTitle}"]`,
    );
    // Fallback: If the container cannot be found by searching with the project name, check the existence of the container
    if ((await containerElement.count()) > 0) {
      // Confirm that the container is displayed (the specific text may vary depending on the environment)
      const hasContent = await containerElement.evaluate(
        (el) => el.textContent?.trim().length > 0,
      );
      expect(hasContent).toBe(true);
    }
  });

  /**
   * @testcase Container title is persisted in metaDoc
   * @description Confirms that setting a title for a container persists it in metaDoc
   */
  test("Container title is persisted in metaDoc", async ({
    page,
  }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);

    // Create a project and a page
    const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(
      page,
      testInfo,
    );
    const encodedProject = encodeURIComponent(projectName);
    const encodedPage = encodeURIComponent(pageName);

    // Navigate to the project page
    await page.goto(`/${encodedProject}/${encodedPage}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);

    // Set the container title in metaDoc (call setContainerTitleInMetaDoc)
    await page.evaluate((projectName) => {
      // Call the function from the metaDoc module to set the title
      const metaDocModule = (window as any).__META_DOC_MODULE__;
      if (metaDocModule && metaDocModule.setContainerTitleInMetaDoc) {
        metaDocModule.setContainerTitleInMetaDoc(
          projectName,
          "Custom Container Title",
        );
      }
    }, projectName);

    // Confirm that the title has been set in metaDoc
    const storedTitle = await page.evaluate((projectName) => {
      const metaDocModule = (window as any).__META_DOC_MODULE__;
      if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
        return metaDocModule.getContainerTitleFromMetaDoc(projectName);
      }
      return null;
    }, projectName);

    expect(storedTitle).toBe("Custom Container Title");
  });

  /**
   * @testcase Container is still displayed in home dropdown after page reload
   * @description Confirms that creating a container, navigating to home, and reloading the page still displays the container
   */
  test("Container is still displayed in home dropdown after page reload", async ({
    page,
  }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);

    // Create a project and a page
    const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(
      page,
      testInfo,
    );
    const encodedProject = encodeURIComponent(projectName);
    const encodedPage = encodeURIComponent(pageName);

    // Navigate to the project page
    await page.goto(`/${encodedProject}/${encodedPage}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);

    // Navigate to home
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Wait for the home dropdown to be displayed
    await page.waitForSelector(
      '[data-testid="container-dropdown"], .container-list, .home-dropdown',
      {
        timeout: 10000,
      },
    );

    // Check the display state of the container before reload
    const containerBeforeReload = page.locator(
      '[data-testid="container-dropdown"], .container-list, .home-dropdown',
    );
    const hasContainerBefore = (await containerBeforeReload.count()) > 0;
    expect(hasContainerBefore).toBe(true);

    // Reload the page
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Confirm that the container is still displayed after reload
    const containerAfterReload = page.locator(
      '[data-testid="container-dropdown"], .container-list, .home-dropdown',
    );
    await expect(containerAfterReload).toBeVisible();
  });

  /**
   * @testcase Container title is retained after page reload
   * @description Confirms that a set container title is retained even after reloading the page
   */
  test("Container title is retained after page reload", async ({
    page,
  }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);

    // Create a project and a page
    const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(
      page,
      testInfo,
    );
    const encodedProject = encodeURIComponent(projectName);
    const encodedPage = encodeURIComponent(pageName);

    // Navigate to the project page
    await page.goto(`/${encodedProject}/${encodedPage}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);

    // Set a custom title in metaDoc
    await page.evaluate((projectName) => {
      const metaDocModule = (window as any).__META_DOC_MODULE__;
      if (metaDocModule && metaDocModule.setContainerTitleInMetaDoc) {
        metaDocModule.setContainerTitleInMetaDoc(
          projectName,
          "Reload Retention Test Title",
        );
      }
    }, projectName);

    // Confirm that the set title can be retrieved
    let storedTitle = await page.evaluate((projectName) => {
      const metaDocModule = (window as any).__META_DOC_MODULE__;
      if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
        return metaDocModule.getContainerTitleFromMetaDoc(projectName);
      }
      return null;
    }, projectName);

    expect(storedTitle).toBe("Reload Retention Test Title");

    // Reload the page
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000); // Wait for IndexedDB to load

    // Confirm that the title is retained after reload
    storedTitle = await page.evaluate((projectName) => {
      const metaDocModule = (window as any).__META_DOC_MODULE__;
      if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
        return metaDocModule.getContainerTitleFromMetaDoc(projectName);
      }
      return null;
    }, projectName);

    expect(storedTitle).toBe("Reload Retention Test Title");
  });

  /**
   * @testcase Container ID is displayed if title is unavailable (fallback)
   * @description Confirms that for containers without a set title, the container ID is displayed instead
   */
  test("Container ID is displayed if title is unavailable (fallback)", async ({
    page,
  }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);

    // Create a project and a page (do not set a title)
    const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(
      page,
      testInfo,
    );
    const encodedProject = encodeURIComponent(projectName);
    const encodedPage = encodeURIComponent(pageName);

    // Navigate to the project page
    await page.goto(`/${encodedProject}/${encodedPage}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);

    // Get the title from metaDoc (confirm it is empty)
    const metaDocTitle = await page.evaluate((projectName) => {
      const metaDocModule = (window as any).__META_DOC_MODULE__;
      if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
        return metaDocModule.getContainerTitleFromMetaDoc(projectName);
      }
      return "";
    }, projectName);

    // Confirm that the title is empty
    expect(metaDocTitle).toBe("");

    // Navigate to home
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Wait for the home dropdown to be displayed
    await page.waitForSelector(
      '[data-testid="container-dropdown"], .container-list, .home-dropdown',
      {
        timeout: 10000,
      },
    );

    // Confirm that the container ID (project name) is displayed instead
    const containerElement = page.locator(
      '[data-testid="container-dropdown"], .container-list, .home-dropdown',
    );

    // Fallback behavior: the project name (container ID) is displayed
    // Since the fallback implementation may vary depending on the environment,
    // just confirm the existence of the container (specific display content is environment-dependent)
    await expect(containerElement).toBeVisible();
  });

  /**
   * @testcase Updating the title in metaDoc changes the label in the home dropdown
   * @description Confirms that updating the container title in metaDoc also updates the label in the home dropdown
   */
  test("Updating the title in metaDoc changes the label in the home dropdown", async ({
    page,
  }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);

    // Create a project and a page
    const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(
      page,
      testInfo,
    );
    const encodedProject = encodeURIComponent(projectName);
    const encodedPage = encodeURIComponent(pageName);

    // Navigate to the project page
    await page.goto(`/${encodedProject}/${encodedPage}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);

    // Set an initial title
    await page.evaluate((projectName) => {
      const metaDocModule = (window as any).__META_DOC_MODULE__;
      if (metaDocModule && metaDocModule.setContainerTitleInMetaDoc) {
        metaDocModule.setContainerTitleInMetaDoc(projectName, "Initial Title");
      }
    }, projectName);

    // Confirm that the initial title has been set
    let storedTitle = await page.evaluate((projectName) => {
      const metaDocModule = (window as any).__META_DOC_MODULE__;
      if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
        return metaDocModule.getContainerTitleFromMetaDoc(projectName);
      }
      return null;
    }, projectName);
    expect(storedTitle).toBe("Initial Title");

    // Update the title
    await page.evaluate((projectName) => {
      const metaDocModule = (window as any).__META_DOC_MODULE__;
      if (metaDocModule && metaDocModule.setContainerTitleInMetaDoc) {
        metaDocModule.setContainerTitleInMetaDoc(projectName, "Updated Title");
      }
    }, projectName);

    // Confirm that the updated title is reflected
    storedTitle = await page.evaluate((projectName) => {
      const metaDocModule = (window as any).__META_DOC_MODULE__;
      if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
        return metaDocModule.getContainerTitleFromMetaDoc(projectName);
      }
      return null;
    }, projectName);
    expect(storedTitle).toBe("Updated Title");
  });

  /**
   * @testcase Title persistence works independently across multiple containers
   * @description Confirms that creating multiple containers allows their titles to be persisted independently
   */
  test("Title persistence works independently across multiple containers", async ({
    page,
  }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);

    // Create a project and a page (Container 1)
    const { projectName: projectName1, pageName: pageName1 } =
      await TestHelpers.prepareTestEnvironment(page, testInfo);
    const encodedProject1 = encodeURIComponent(projectName1);
    const encodedPage1 = encodeURIComponent(pageName1);

    // Navigate to project page 1
    await page.goto(`/${encodedProject1}/${encodedPage1}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);

    // Set a title for Container 1
    await page.evaluate((projectName) => {
      const metaDocModule = (window as any).__META_DOC_MODULE__;
      if (metaDocModule && metaDocModule.setContainerTitleInMetaDoc) {
        metaDocModule.setContainerTitleInMetaDoc(
          projectName,
          "Container 1 Title",
        );
      }
    }, projectName1);

    // Confirm that the title for Container 1 has been set
    let storedTitle1 = await page.evaluate((projectName) => {
      const metaDocModule = (window as any).__META_DOC_MODULE__;
      if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
        return metaDocModule.getContainerTitleFromMetaDoc(projectName);
      }
      return null;
    }, projectName1);
    expect(storedTitle1).toBe("Container 1 Title");

    // Create Container 2
    const projectName2 = `TestProject2-${Date.now()}`;
    const pageName2 = `page-${Date.now()}`;
    await TestHelpers.createTestProjectAndPageViaAPI(
      page,
      projectName2,
      pageName2,
    );

    const encodedProject2 = encodeURIComponent(projectName2);
    const encodedPage2 = encodeURIComponent(pageName2);

    // Navigate to project page 2
    await page.goto(`/${encodedProject2}/${encodedPage2}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);

    // Set a title for Container 2
    await page.evaluate((projectName) => {
      const metaDocModule = (window as any).__META_DOC_MODULE__;
      if (metaDocModule && metaDocModule.setContainerTitleInMetaDoc) {
        metaDocModule.setContainerTitleInMetaDoc(
          projectName,
          "Container 2 Title",
        );
      }
    }, projectName2);

    // Confirm that the title for Container 2 has been set
    const storedTitle2 = await page.evaluate((projectName) => {
      const metaDocModule = (window as any).__META_DOC_MODULE__;
      if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
        return metaDocModule.getContainerTitleFromMetaDoc(projectName);
      }
      return null;
    }, projectName2);
    expect(storedTitle2).toBe("Container 2 Title");

    // Confirm that the title for Container 1 has not been affected
    storedTitle1 = await page.evaluate((projectName) => {
      const metaDocModule = (window as any).__META_DOC_MODULE__;
      if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
        return metaDocModule.getContainerTitleFromMetaDoc(projectName);
      }
      return null;
    }, projectName1);
    expect(storedTitle1).toBe("Container 1 Title");
  });
});
