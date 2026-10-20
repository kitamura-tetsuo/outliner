import type { SelectRelationEvidence } from "../../../shared/src/services/viewSourceEvidence";
interface ViewBrowserTool {
    name: string;
    handler(): Promise<{ content: { text: string; }[]; }>;
}
interface ViewBrowserGlobals {
    __viewTools: Map<string, ViewBrowserTool>;
    WebMCP: { addTool(tool: ViewBrowserTool): () => void; };
}
export interface ViewProofGlobals {
    __catalogBrowserTest: {
        snapshot(id: string): { schema: string; };
        holdViewProof(query: string): Promise<{ sources: SelectRelationEvidence[]; status: string; }>;
        viewProofCurrent(): boolean;
        releaseViewProof(): void;
    };
}
import { expect, type Page, type TestInfo } from "@playwright/test";
import { CatalogBrowserServer } from "./catalogBrowserServer";
import { configureCatalogPage, installCatalogControls, navigateCatalog } from "./catalogBrowserUi";
import { SeedClient } from "./seedClient";
import { TestHelpers } from "./testHelpers";
export async function viewSourceBrowser(page: Page, info: TestInfo) {
    const server = await CatalogBrowserServer.start(info);
    const title = `Source repair ${Date.now()} ${info.title}`;
    const projectId = SeedClient.stableIdFromTitle(title);
    const token = await TestHelpers.getTestAuthToken();
    const seeded = await server.request("seed", { token, projectId, title, pageName: "Views" });
    const mcp = (name: string, args: object) =>
        server.request("mcp", { token, name, arguments: { projectId, ...args } });
    const mount = async (gridId: string) => {
        await configureCatalogPage(page, server.port);
        await page.addInitScript(() => {
            const tools = new Map<string, ViewBrowserTool>();
            (globalThis as unknown as ViewBrowserGlobals).__viewTools = tools;
            (globalThis as unknown as ViewBrowserGlobals).WebMCP = {
                addTool(tool: ViewBrowserTool) {
                    tools.set(tool.name, tool);
                    return () => {
                        if (tools.get(tool.name) === tool) tools.delete(tool.name);
                    };
                },
            };
        });
        await TestHelpers.seedProjectAndNavigate(page, info, [], undefined, {
            projectName: title,
            pageName: "Views",
            skipSeed: true,
            ws: "force",
        });
        await installCatalogControls(page);
        await navigateCatalog(page, `${new URL(page.url()).origin}/${encodeURIComponent(title)}/-/grids/${gridId}`);
        await expect.poll(async () => (await invoke("getGridResult"))?.sourceDiagnostics.execution.current).toBe(true);
    };
    const invoke = (name: string) =>
        page.evaluate(async name => {
            const tool = (globalThis as unknown as ViewBrowserGlobals).__viewTools.get(name);
            return tool ? JSON.parse((await tool.handler()).content[0].text) : undefined;
        }, name);
    return { server, title, projectId, token, seeded, mcp, mount, invoke };
}
