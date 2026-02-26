import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Utility functions to verify UI and Yjs tree structure simultaneously
 */
export class TreeValidator {
    /**
     * Get the tree (Yjs) data structure
     */
    static async getTreeData(page: Page): Promise<any> {
        return page.evaluate(() => {
            // Check for debug function existence (Yjs)
            if (typeof window.getYjsTreeDebugData !== "function") {
                // Fallback: Get basic data from appStore
                const appStore = (window as any).appStore;
                if (appStore && appStore.pages && appStore.pages.current) {
                    return {
                        itemCount: appStore.pages.current.length,
                        items: appStore.pages.current.map((page: any) => ({
                            text: page.text || page.id,
                            items: page.items || [],
                        })),
                    };
                }
                throw new Error("getYjsTreeDebugData function is not available and no fallback data found");
            }

            return window.getYjsTreeDebugData();
        });
    }

    /**
     * Wait until Yjs backing store (generalStore.project) is initialized
     */
    static async waitForProjectReady(page: Page, timeout: number = 5000): Promise<void> {
        try {
            await page.waitForFunction(() => {
                const gs = (window as any).generalStore || (window as any).appStore;
                return !!(gs && gs.project);
            }, { timeout });
        } catch (error) {
            console.error("TreeValidator: project not ready within timeout", error);
            throw new Error(`Project not ready within ${timeout}ms`);
        }
    }

    static async getTreePathData(page: Page, path?: string): Promise<any> {
        return page.evaluate(async path => {
            // Check for debug function existence (Yjs)
            if (typeof window.getYjsTreePathData !== "function") {
                // Fallback: Implement basic path resolution
                if (!path) return undefined;

                const appStore = (window as any).appStore;
                if (appStore && appStore.pages && appStore.pages.current) {
                    const data = {
                        itemCount: appStore.pages.current.length,
                        items: appStore.pages.current.map((page: any) => ({
                            text: page.text || page.id,
                            items: page.items || {},
                        })),
                    };

                    // Simple path resolution
                    const parts = path.split(".");
                    let current = data;
                    for (const part of parts) {
                        if (current && typeof current === "object" && part in current) {
                            current = current[part];
                        } else {
                            return undefined;
                        }
                    }
                    return current;
                }
                return undefined;
            }

            return window.getYjsTreePathData(path);
        }, path);
    }

    /**
     * Verify that tree structure and UI match after indentation operations
     */
    static async validateTreeStructure(page: Page): Promise<any> {
        // 1. Get SharedTree structure
        const treeData = await this.getTreeData(page);

        // 2. Get UI display
        const uiStructure = await this.getUIStructure(page);

        // 3. Structure comparison (log output)
        console.log("UI structure:", JSON.stringify(uiStructure, null, 2));
        console.log("SharedTree structure:", JSON.stringify(treeData, null, 2));

        // 4. Verification - Always verify without fallback
        expect(this.structureMatches(treeData, uiStructure)).toBe(true);

        return treeData;
    }

    /**
     * Analyze UI structure and extract hierarchy
     */
    static async getUIStructure(page: Page): Promise<any> {
        return page.evaluate(() => {
            // Function to reconstruct tree structure from UI
            function parseOutlinerTree() {
                // Get root element
                const container = document.querySelector(".tree-container");
                if (!container) return null;

                // Recursively extract UI hierarchy
                function parseNode(element: Element | null): any {
                    if (!element) return null;

                    // Get text content
                    const textEl = element.querySelector(".item-text");
                    const text = textEl ? textEl.textContent || "" : "";

                    // Result object
                    const result: {
                        text: string;
                        hasChildren: boolean;
                        children: any[];
                    } = {
                        text,
                        hasChildren: false,
                        children: [],
                    };

                    // Search for child elements
                    const childrenContainer = element.querySelector(".item-children");
                    if (childrenContainer) {
                        const childNodes = childrenContainer.querySelectorAll(":scope > .outliner-item");
                        result.hasChildren = childNodes.length > 0;

                        // Process each child element recursively
                        childNodes.forEach((childNode: Element) => {
                            const childResult = parseNode(childNode);
                            if (childResult !== null) {
                                result.children.push(childResult);
                            }
                        });
                    }

                    return result;
                }

                // Process child items of root element
                const result: { children: any[]; } = { children: [] };
                const rootItems = container.querySelectorAll(":scope > .outliner-item");
                rootItems.forEach((item: Element) => {
                    const itemResult = parseNode(item);
                    if (itemResult !== null) {
                        result.children.push(itemResult);
                    }
                });

                return result;
            }

            return parseOutlinerTree();
        });
    }

    /**
     * Check if two hierarchical structures match
     */
    static structureMatches(treeData: any, uiStructure: any): boolean {
        // Implement structure comparison logic here
        // Simple example: Check if number of children matches and text is the same

        // Mismatch if no data
        if (!treeData || !uiStructure) return false;

        // Verify number of children
        const treeChildren = treeData.children || [];
        const uiChildren = uiStructure.children || [];

        if (treeChildren.length !== uiChildren.length) return false;

        // Verify each child element recursively
        for (let i = 0; i < treeChildren.length; i++) {
            // Text comparison
            if (treeChildren[i]?.text !== uiChildren[i]?.text) return false;

            // Compare existence of child elements
            if (Boolean(treeChildren[i]?.hasChildren) !== Boolean(uiChildren[i]?.hasChildren)) return false;

            // Compare child elements recursively
            if (!this.structureMatches(treeChildren[i], uiChildren[i])) return false;
        }

        return true;
    }

    /**
     * Get tree content and strictly compare with expected value
     * @param page Playwright page object
     * @param expectedData Expected data structure (partial structure allowed)
     * @param strict Whether to compare strictly (default is false)
     * @returns Verification result
     */
    static async assertTreeData(page: Page, expectedData: any, strict: boolean = false): Promise<void> {
        const treeData = await this.getTreeData(page);

        if (strict) {
            // Strict comparison mode - Must match completely
            expect(JSON.stringify(treeData)).toBe(JSON.stringify(expectedData));
        } else {
            // Partial comparison mode - OK if all properties of expected value are included
            this.assertObjectContains(treeData, expectedData);
        }
    }

    /**
     * Verify that object contains all properties of expected value
     * Can verify nested objects because it validates recursively
     */
    private static assertObjectContains(actual: any, expected: any): void {
        if (expected === null || expected === undefined) {
            expect(actual).toBe(expected);
            return;
        }

        if (typeof expected !== "object") {
            expect(actual).toBe(expected);
            return;
        }

        if (Array.isArray(expected)) {
            expect(Array.isArray(actual)).toBe(true);
            expect(actual.length).toBeGreaterThanOrEqual(expected.length);

            for (let i = 0; i < expected.length; i++) {
                this.assertObjectContains(actual[i], expected[i]);
            }
            return;
        }

        // Verify each property in case of object
        for (const key in expected) {
            expect(actual).toHaveProperty(key);
            this.assertObjectContains(actual[key], expected[key]);
        }
    }

    /**
     * Get and verify data at a specific path in the tree
     * @param page Playwright page object
     * @param path Data path (e.g. "items.0.text")
     * @param expectedValue Expected value
     */
    static async assertTreePath(page: Page, path: string, expectedValue: any): Promise<void> {
        const treeData = await this.getTreeData(page);
        const actualValue = this.getValueByPath(treeData, path);
        expect(actualValue).toEqual(expectedValue);
    }

    /**
     * Get value of specified path from object
     * @param obj Target object
     * @param path Path (e.g. "items.0.text")
     * @returns Value corresponding to path
     */
    private static getValueByPath(obj: any, path: string): any {
        return path.split(".").reduce((prev, curr) => {
            return prev && prev[curr];
        }, obj);
    }

    /**
     * Save tree content as a snapshot for later comparison
     * @param page Playwright page object
     * @returns Snapshot of current tree data
     */
    static async takeTreeSnapshot(page: Page): Promise<any> {
        return await this.getTreeData(page);
    }

    /**
     * Compare current tree content with previous snapshot
     * @param page Playwright page object
     * @param snapshot Previous snapshot
     * @param ignorePaths Array of paths to ignore (e.g. ["items.0.lastChanged"])
     */
    static async compareWithSnapshot(page: Page, snapshot: any, ignorePaths: string[] = []): Promise<void> {
        const currentData = await this.getTreeData(page);
        const filteredSnapshot = this.removeIgnoredPaths(JSON.parse(JSON.stringify(snapshot)), ignorePaths);
        const filteredCurrent = this.removeIgnoredPaths(JSON.parse(JSON.stringify(currentData)), ignorePaths);

        expect(JSON.stringify(filteredCurrent)).toBe(JSON.stringify(filteredSnapshot));
    }

    /**
     * Delete property of specified path from object
     */
    private static removeIgnoredPaths(obj: any, paths: string[]): any {
        for (const path of paths) {
            const parts = path.split(".");
            const lastPart = parts.pop()!;
            const parent = parts.reduce((prev, curr) => {
                return prev && prev[curr];
            }, obj);

            if (parent && parent[lastPart] !== undefined) {
                delete parent[lastPart];
            }
        }
        return obj;
    }
}

// Extend global type definition (Add functionality to window object for testing)
declare global {
    interface Window {
        mockUser?: { id: string; name: string; email?: string; };
        getYjsTreeDebugData?: () => any;
        getYjsTreePathData?: (path?: string) => any;
    }
}
