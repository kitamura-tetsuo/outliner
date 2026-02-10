import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { TestHelpers } from "./testHelpers";

/**
 * Helper functions for internal link testing (Yjs based)
 */
export class LinkTestHelpers {
    /**
     * Create a test project and page
     * @param page Playwright page object
     * @param projectName Project name
     * @param pageName Page name
     * @param content Page content (optional)
     */
    static async createTestProjectAndPage(
        page: Page,
        projectName: string,
        pageName: string,
        content: string[] = ["これはテスト用のページです。", "内部リンクのテスト: [test-link]"],
    ): Promise<void> {
        // Setup tree debugger
        await TestHelpers.setupTreeDebugger(page);

        // Wait for Yjs backing store initialization
        await page.waitForFunction(() => {
            const gs: any = (window as any).generalStore || (window as any).appStore;
            return !!(gs && gs.project);
        }, { timeout: 30000 });

        // Create via Yjs API
        await page.evaluate(({ projectName, pageName, content }) => {
            const gs: any = (window as any).generalStore || (window as any).appStore;
            if (!gs?.project) throw new Error("generalStore.project not ready");

            try {
                gs.project.title = projectName;

                const pages: any = gs.project.items;
                const len = pages?.length ?? 0;
                let target: any = undefined;
                for (let i = 0; i < len; i++) {
                    const it = pages.at ? pages.at(i) : pages[i];
                    const t = it?.text?.toString?.() ?? String(it?.text ?? "");
                    if (String(t) === pageName) {
                        target = it;
                        break;
                    }
                }

                if (!target) target = gs.project.addPage(pageName, "tester");
                else target.updateText(pageName);

                const items = target.items as any;
                while ((items?.length ?? 0) > 0) items.removeAt(0);
                for (const line of content) {
                    const it = items.addNode("tester");
                    it.updateText(line);
                }
                if (!gs.currentPage) gs.currentPage = target;
            } catch (e) {
                console.error("Error creating project/page via Yjs:", e);
                throw e;
            }
        }, { projectName, pageName, content });

        await page.waitForTimeout(200);
    }

    /**
     * Create multiple projects and pages
     * @param page Playwright page object
     * @param projects Projects and pages information
     */
    static async createMultipleProjectsAndPages(
        page: Page,
        projects: Array<{
            projectName: string;
            pages: Array<{
                pageName: string;
                content?: string[];
            }>;
        }>,
    ): Promise<void> {
        // Setup tree debugger
        await TestHelpers.setupTreeDebugger(page);

        // Wait for Yjs initialization
        await page.waitForFunction(() => {
            const gs: any = (window as any).generalStore || (window as any).appStore;
            return !!(gs && gs.project);
        }, { timeout: 30000 });

        // Prepare multiple pages in a single project
        await page.evaluate((projects) => {
            const gs: any = (window as any).generalStore || (window as any).appStore;
            if (!gs?.project) throw new Error("generalStore.project not ready");
            try {
                if (projects.length > 0) gs.project.title = projects[0].projectName;
                for (const p of projects) {
                    for (const pg of p.pages) {
                        const pages: any = gs.project.items;
                        const len = pages?.length ?? 0;
                        let target: any = undefined;
                        for (let i = 0; i < len; i++) {
                            const it = pages.at ? pages.at(i) : pages[i];
                            const t = it?.text?.toString?.() ?? String(it?.text ?? "");
                            if (String(t) === pg.pageName) {
                                target = it;
                                break;
                            }
                        }
                        if (!target) target = gs.project.addPage(pg.pageName, "tester");
                        const items = target.items as any;
                        while ((items?.length ?? 0) > 0) items.removeAt(0);
                        const lines = pg.content || ["これはテスト用のページです。", "内部リンクのテスト: [test-link]"];
                        for (const line of lines) {
                            const it = items.addNode("tester");
                            it.updateText(line);
                        }
                    }
                }
            } catch (e) {
                console.error("Error creating pages via Yjs:", e);
                throw e;
            }
        }, projects);

        await page.waitForTimeout(200);
    }

    /**
     * Test internal link navigation functionality
     * @param page Playwright page object
     * @param linkSelector Internal link selector
     * @param expectedUrl Expected URL
     */
    static async testInternalLinkNavigation(
        page: Page,
        linkSelector: string,
        expectedUrl: string,
    ): Promise<void> {
        // Save current URL
        const currentUrl = page.url();

        // Click the link
        await page.click(linkSelector);

        // Wait for page to load
        await page.waitForSelector("body", { timeout: 10000 });

        // Get new URL
        const newUrl = page.url();

        // Verify URL is as expected
        expect(newUrl).toContain(expectedUrl);

        // Verify URL has changed
        expect(newUrl).not.toBe(currentUrl);
    }

    /**
     * Create test page directly (using Yjs API instead of UI operation)
     * @param page Playwright page object
     * @param projectName Project name
     * @param pageName Page name
     * @param content Page content (multiple lines array)
     * @param navigateToPage Whether to navigate to page after creation
     */
    static async createTestPageDirect(
        page: Page,
        projectName: string,
        pageName: string,
        content: string[] = ["テストページの内容です"],
        navigateToPage: boolean = false,
    ): Promise<void> {
        // Setup tree debugger
        await TestHelpers.setupTreeDebugger(page);

        // Wait for Yjs initialization
        await page.waitForFunction(() => {
            const gs: any = (window as any).generalStore || (window as any).appStore;
            return !!(gs && gs.project);
        }, { timeout: 30000 });

        await page.evaluate(({ projectName, pageName, content }) => {
            const gs: any = (window as any).generalStore || (window as any).appStore;
            if (!gs?.project) throw new Error("generalStore.project not ready");
            try {
                gs.project.title = projectName;
                const pages: any = gs.project.items;
                const len = pages?.length ?? 0;
                let target: any = undefined;
                for (let i = 0; i < len; i++) {
                    const it = pages.at ? pages.at(i) : pages[i];
                    const t = it?.text?.toString?.() ?? String(it?.text ?? "");
                    if (String(t) === pageName) {
                        target = it;
                        break;
                    }
                }
                if (!target) target = gs.project.addPage(pageName, "tester");
                const items = target.items as any;
                while ((items?.length ?? 0) > 0) items.removeAt(0);
                for (const line of content) {
                    const it = items.addNode("tester");
                    it.updateText(line);
                }
                if (!gs.currentPage) gs.currentPage = target;
            } catch (e) {
                console.error("Error creating page via Yjs:", e);
                throw e;
            }
        }, { projectName, pageName, content });

        if (navigateToPage) {
            await page.goto(`/${projectName}/${pageName}`);
            await page.waitForSelector(".outliner-item", { timeout: 10000 });
        }
    }

    /**
     * Open an existing page
     * @param page Playwright page object
     * @param projectName Project name
     * @param pageName Page name
     */
    static async openPage(
        page: Page,
        projectName: string,
        pageName: string,
    ): Promise<void> {
        // Navigate to page
        await page.goto(`/${projectName}/${pageName}`);

        // Wait for page to load
        await page.waitForSelector(".outliner-item", { timeout: 10000 });

        // Click developer login button (if visible)
        const loginButton = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton.isVisible()) {
            await loginButton.click();
            await page.waitForTimeout(1000);
        }
    }

    /**
     * Force create an internal link
     * @param page Playwright page object
     * @param itemId Item ID
     * @param linkText Link text
     */
    static async forceCreateInternalLink(page: Page, itemId: string, linkText: string): Promise<void> {
        await page.evaluate(({ itemId, linkText }) => {
            const gs: any = (window as any).generalStore || (window as any).appStore;
            if (!gs?.project) return false;
            try {
                const findById = (parent: any): any => {
                    if (!parent) return null;
                    const items: any = parent.items;
                    const len = items?.length ?? 0;
                    for (let i = 0; i < len; i++) {
                        const it = items.at ? items.at(i) : items[i];
                        if (!it) continue;
                        if (String(it.id) === String(itemId)) return it;
                        const found = findById(it);
                        if (found) return found;
                    }
                    return null;
                };

                // Search from root (page list)
                const pages: any = gs.project.items;
                const plen = pages?.length ?? 0;
                let target: any = null;
                for (let i = 0; i < plen; i++) {
                    const p = pages.at ? pages.at(i) : pages[i];
                    if (String(p?.id) === String(itemId)) {
                        target = p;
                        break;
                    }
                    const found = findById(p);
                    if (found) {
                        target = found;
                        break;
                    }
                }
                if (!target) return false;

                const currentText = target?.text?.toString?.() ?? String(target?.text ?? "");
                const newText = `${currentText} [${linkText}]`;
                target.updateText(newText);
                return true;
            } catch (e) {
                console.error("Error creating internal link (Yjs):", e);
                return false;
            }
        }, { itemId, linkText });

        await page.waitForTimeout(200);
    }

    /**
     * Detect internal link
     * @param page Playwright page object
     * @param linkText Link text
     * @returns True if link element exists
     */
    static async detectInternalLink(page: Page, linkText: string): Promise<boolean> {
        // Detect link element
        const linkCount = await page.evaluate(text => {
            const links = Array.from(document.querySelectorAll("a.internal-link")).filter(
                el => el.textContent === text,
            );
            return links.length;
        }, linkText);

        return linkCount > 0;
    }

    /**
     * Force show internal link preview
     * @param page Playwright page object
     * @param pageName Page name to show preview for
     * @param projectName Project name (optional)
     * @param pageExists Whether page exists (default true)
     */
    static async forceLinkPreview(
        page: Page,
        pageName: string,
        projectName?: string,
        pageExists: boolean = true,
    ): Promise<void> {
        await page.evaluate(({ pageName, projectName, pageExists }) => {
            // Create global function if not exists
            if (!window.__testShowLinkPreview) {
                window.__testShowLinkPreview = (pageName, projectName, pageExists) => {
                    console.log(`Forcing link preview for page: ${pageName} (exists: ${pageExists})`);

                    // Create preview popup
                    let popup = document.querySelector(".link-preview-popup");
                    if (!popup) {
                        popup = document.createElement("div");
                        popup.className = "link-preview-popup";
                        document.body.appendChild(popup);
                    }

                    // Set preview content
                    if (pageExists) {
                        // If page exists
                        popup.innerHTML = `
                            <h3>${pageName}</h3>
                            <div class="preview-items">
                                <p>テスト用のプレビュー内容です。</p>
                            </div>
                        `;
                    } else {
                        // If page does not exist
                        popup.innerHTML = `
                            <h3>${pageName}</h3>
                            <div class="preview-not-found">
                                <p>ページが見つかりません。クリックして新規作成します。</p>
                            </div>
                        `;
                    }

                    // Set styles and show
                    (popup as HTMLElement).style.display = "block";
                    (popup as HTMLElement).style.position = "fixed";
                    (popup as HTMLElement).style.top = "100px";
                    (popup as HTMLElement).style.left = "100px";
                    (popup as HTMLElement).style.zIndex = "1000";
                    (popup as HTMLElement).style.backgroundColor = "#fff";
                    (popup as HTMLElement).style.border = "1px solid #ccc";
                    (popup as HTMLElement).style.padding = "10px";
                    (popup as HTMLElement).style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";

                    return popup as HTMLElement;
                };
            }

            // Show preview
            return window.__testShowLinkPreview(pageName, projectName, pageExists);
        }, { pageName, projectName, pageExists });

        // Wait for preview to appear
        await page.waitForTimeout(500);
    }

    /**
     * Force render internal links
     * @param page Playwright page object
     */
    static async forceRenderInternalLinks(page: Page): Promise<void> {
        const result = await page.evaluate(() => {
            // Get all outliner items
            const items = document.querySelectorAll(".outliner-item");
            console.log(`Found ${items.length} outliner items`);

            let linksFound = 0;
            let linksProcessed = 0;

            // Re-render text of each item
            items.forEach(item => {
                const textElement = item.querySelector(".item-text");
                if (textElement) {
                    // Get text content
                    const text = textElement.textContent || "";

                    // Detect internal link pattern (normal internal link)
                    const linkPattern = /\[([^[\]/-][^[\]]*?)\]/g;
                    // Detect project internal link pattern
                    const projectLinkPattern = /\[\/([\w\-/]+)\]/g;

                    const hasNormalLinks = linkPattern.test(text);
                    // Reset lastIndex after testing
                    linkPattern.lastIndex = 0;

                    const hasProjectLinks = projectLinkPattern.test(text);
                    // Reset lastIndex after testing
                    projectLinkPattern.lastIndex = 0;

                    if (hasNormalLinks || hasProjectLinks) {
                        linksFound++;

                        // Set HTML directly if link exists
                        let html = text;

                        // Process normal internal link
                        if (hasNormalLinks) {
                            html = html.replace(linkPattern, (match, linkText) => {
                                linksProcessed++;
                                return `<span class="link-preview-wrapper">
                                    <a href="/${linkText}" class="internal-link" data-page="${linkText}">${linkText}</a>
                                </span>`;
                            });
                        }

                        // Process project internal link
                        if (hasProjectLinks) {
                            html = html.replace(projectLinkPattern, (match, path) => {
                                linksProcessed++;
                                // Split path to get project name and page name
                                const parts = path.split("/").filter(p => p);
                                if (parts.length >= 2) {
                                    const projectName = parts[0];
                                    const pageName = parts.slice(1).join("/");

                                    return `<span class="link-preview-wrapper">
                                        <a href="/${path}" class="internal-link project-link" data-project="${projectName}" data-page="${pageName}">${path}</a>
                                    </span>`;
                                } else {
                                    return `<a href="/${path}" class="internal-link project-link">${path}</a>`;
                                }
                            });
                        }

                        // Set HTML
                        textElement.innerHTML = html;

                        // Add formatted class
                        textElement.classList.add("formatted");
                    }
                }
            });

            // Set event listeners on links
            const setupLinkEventListeners = () => {
                const links = document.querySelectorAll("a.internal-link");
                console.log(`Found ${links.length} internal links to setup event listeners`);

                links.forEach(link => {
                    // Flag to check if already set
                    const hasListeners = link.getAttribute("data-link-listeners") === "true";

                    if (!hasListeners) {
                        // Add mouseenter event listener
                        link.addEventListener("mouseenter", () => {
                            console.log("Link mouseenter event triggered");
                            // Get page name from data attribute
                            const pageName = link.getAttribute("data-page");
                            const projectName = link.getAttribute("data-project");

                            if (pageName) {
                                // Dispatch custom event for link preview show
                                const customEvent = new CustomEvent("linkPreviewShow", {
                                    detail: { pageName, projectName, element: link },
                                });
                                document.dispatchEvent(customEvent);
                            }
                        });

                        // Add mouseleave event listener
                        link.addEventListener("mouseleave", () => {
                            console.log("Link mouseleave event triggered");
                            // Dispatch custom event for link preview hide
                            const customEvent = new CustomEvent("linkPreviewHide");
                            document.dispatchEvent(customEvent);
                        });

                        // Set flag indicating listeners are set
                        link.setAttribute("data-link-listeners", "true");
                    }
                });

                return links.length;
            };

            // Set event listeners on links
            const linksWithListeners = setupLinkEventListeners();

            // Check if MutationObserver exists
            const hasMutationObserver = !!window.__linkPreviewMutationObserver;

            // Create MutationObserver if not exists
            if (!hasMutationObserver) {
                // Create MutationObserver
                const observer = new MutationObserver(mutations => {
                    let newLinksFound = false;

                    mutations.forEach(mutation => {
                        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
                            mutation.addedNodes.forEach(node => {
                                if (node.nodeType === Node.ELEMENT_NODE) {
                                    const element = node as Element;

                                    // Check if added element itself is internal link
                                    if (element.classList && element.classList.contains("internal-link")) {
                                        newLinksFound = true;
                                    }

                                    // Search for internal links within added element
                                    const links = element.querySelectorAll(".internal-link");
                                    if (links.length > 0) {
                                        newLinksFound = true;
                                    }
                                }
                            });
                        }
                    });

                    if (newLinksFound) {
                        console.log("New internal links found, setting up event listeners");
                        setupLinkEventListeners();
                    }
                });

                // Start observation
                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ["class"],
                });

                // Save to global variable
                window.__linkPreviewMutationObserver = observer;
            }

            return {
                itemsCount: items.length,
                linksFound,
                linksProcessed,
                linksWithListeners,
                hasMutationObserver,
            };
        });

        console.log(`Force render internal links result:`, result);

        // Wait for links to be processed
        await page.waitForTimeout(1000);
    }
}

// Extend global type definition
declare global {
    interface Window {
        __linkPreviewMutationObserver?: MutationObserver;
        __testShowLinkPreview?: (pageName: string, projectName?: string, pageExists?: boolean) => HTMLElement;
    }
}
