import { describe, expect, it } from "vitest";
import { createAppTreeConfigurationAlpha } from "../../schema/app-schema";

describe("TreeViewConfigurationAlpha Tests", () => {
    it("createAppTreeConfigurationAlpha関数が存在する", () => {
        expect(typeof createAppTreeConfigurationAlpha).toBe("function");
    });

    it("TreeViewConfigurationAlphaを作成できる", async () => {
        const alphaConfig = await createAppTreeConfigurationAlpha();
        expect(alphaConfig).toBeDefined();
        expect(alphaConfig.constructor.name).toMatch(/TreeViewConfiguration/);
    });

    it("Alpha APIが利用できない場合は通常のTreeViewConfigurationにフォールバックする", async () => {
        // Alpha APIのインポートを一時的に無効化するテスト
        const originalImport = global.import;
        
        // @ts-ignore
        global.import = async (module: string) => {
            if (module === "fluid-framework/alpha") {
                throw new Error("Alpha API not available");
            }
            return originalImport(module);
        };

        const config = await createAppTreeConfigurationAlpha();
        expect(config).toBeDefined();
        expect(config.constructor.name).toBe("TreeViewConfiguration");

        // 元のimportを復元
        global.import = originalImport;
    });

    it("TreeViewConfigurationAlphaが存在しない場合は通常のTreeViewConfigurationにフォールバックする", async () => {
        // TreeViewConfigurationAlphaが存在しないケースをシミュレート
        const originalImport = global.import;
        
        // @ts-ignore
        global.import = async (module: string) => {
            if (module === "fluid-framework/alpha") {
                return {}; // TreeViewConfigurationAlphaが存在しない
            }
            return originalImport(module);
        };

        const config = await createAppTreeConfigurationAlpha();
        expect(config).toBeDefined();
        expect(config.constructor.name).toBe("TreeViewConfiguration");

        // 元のimportを復元
        global.import = originalImport;
    });
});
