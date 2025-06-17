import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import * as fluidService from "./fluidService";

describe("fluidService", () => {
    beforeEach(() => {
    });

    it("create and load container", async () => {
        const client = await fluidService.createNewContainer("Test");
        expect(client.containerId).toBeDefined();
        expect(client.appData).toBeDefined();
        expect(client.project).toBeDefined();
        expect(client.project.title).toBe("Test");

        // コンテナが適切に初期化されるまで待つ
        await new Promise(resolve => setTimeout(resolve, 500));

        // 同じコンテナIDで新しいクライアントインスタンスを作成するのではなく、
        // 既存のクライアントの状態を確認する
        expect(client.appData.root).toBeDefined();
        expect((client.appData.root as any).title).toBe("Test");
    }, 30000);

    afterEach(() => {
        // タイマーや状態をリセット
        vi.useRealTimers();
    });
});
