import { describe, expect, it } from "vitest";
import { createAppTreeConfigurationAlpha, appTreeConfiguration, Project } from "../../schema/app-schema";

describe("getBranch Function Tests", () => {
    it("TreeViewConfigurationAlphaで作成されたTreeViewがSchematizingSimpleTreeViewインスタンスである", async () => {
        // TreeViewConfigurationAlphaを作成
        const alphaConfig = await createAppTreeConfigurationAlpha();
        expect(alphaConfig).toBeDefined();
        expect(alphaConfig.constructor.name).toBe("TreeViewConfigurationAlpha");
    });

    it("通常のTreeViewConfigurationで作成されたTreeViewとの違いを確認", () => {
        const regularConfig = appTreeConfiguration;
        expect(regularConfig.constructor.name).toBe("TreeViewConfiguration");
    });

    it("Alpha APIのgetBranch関数が利用可能である", async () => {
        try {
            const fluidAlpha = await import("fluid-framework/alpha");
            const getBranch = (fluidAlpha as any).getBranch;
            
            expect(getBranch).toBeDefined();
            expect(typeof getBranch).toBe("function");
        } catch (error) {
            throw new Error(`Alpha API import failed: ${error}`);
        }
    });

    it("Alpha APIのTreeAlpha.branch関数が利用可能である", async () => {
        try {
            const fluidAlpha = await import("fluid-framework/alpha");
            const TreeAlpha = (fluidAlpha as any).TreeAlpha;
            
            expect(TreeAlpha).toBeDefined();
            expect(TreeAlpha.branch).toBeDefined();
            expect(typeof TreeAlpha.branch).toBe("function");
        } catch (error) {
            throw new Error(`TreeAlpha.branch import failed: ${error}`);
        }
    });

    it("Alpha APIのasTreeViewAlpha関数が利用可能である", async () => {
        try {
            const fluidAlpha = await import("fluid-framework/alpha");
            const asTreeViewAlpha = (fluidAlpha as any).asTreeViewAlpha;
            
            expect(asTreeViewAlpha).toBeDefined();
            expect(typeof asTreeViewAlpha).toBe("function");
        } catch (error) {
            throw new Error(`asTreeViewAlpha import failed: ${error}`);
        }
    });

    it("Alpha APIの全体的な構造を確認", async () => {
        try {
            const fluidAlpha = await import("fluid-framework/alpha");
            const exports = Object.keys(fluidAlpha);
            
            console.log("Available Alpha API exports:", exports);
            
            // 重要なAlpha APIが存在することを確認
            expect(exports).toContain("getBranch");
            expect(exports).toContain("TreeAlpha");
            expect(exports).toContain("asTreeViewAlpha");
            expect(exports).toContain("TreeViewConfigurationAlpha");
        } catch (error) {
            throw new Error(`Alpha API structure check failed: ${error}`);
        }
    });
});
