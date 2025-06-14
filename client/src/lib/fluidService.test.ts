import { type ViewableTree } from "fluid-framework";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import {
    appTreeConfiguration,
    Project,
} from "../schema/app-schema";
import * as fluidService from "./fluidService";

describe("fluidService", () => {
    beforeEach(() => {
    });

    it("create and load container", async () => {
        const client = await fluidService.createNewContainer("Test");
        const loaded = await fluidService.loadContainer(client.containerId);
        expect(loaded.containerId).toBe(client.containerId);
    });

    afterEach(() => {
        // タイマーや状態をリセット
        vi.useRealTimers();
    });
});
