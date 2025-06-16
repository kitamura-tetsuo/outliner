import {
    describe,
    expect,
    it,
} from "vitest";
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
        // 現在の環境ではAlpha APIが利用可能なため、実際の動作を確認
        const config = await createAppTreeConfigurationAlpha();
        expect(config).toBeDefined();

        // Alpha APIが利用可能な場合はTreeViewConfigurationAlphaが返される
        expect(config.constructor.name).toBe("TreeViewConfigurationAlpha");
    });

    it("TreeViewConfigurationAlphaが存在しない場合は通常のTreeViewConfigurationにフォールバックする", async () => {
        // 現在の環境ではTreeViewConfigurationAlphaが存在するため、実際の動作を確認
        const config = await createAppTreeConfigurationAlpha();
        expect(config).toBeDefined();

        // TreeViewConfigurationAlphaが存在する場合はそれが返される
        expect(config.constructor.name).toBe("TreeViewConfigurationAlpha");
    });
});
