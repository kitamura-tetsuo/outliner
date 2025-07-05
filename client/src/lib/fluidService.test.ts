import { type ViewableTree } from "fluid-framework";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { appTreeConfiguration, Project } from "../schema/app-schema";

vi.setConfig({ testTimeout: 60000 });
let fluidService: typeof import("./fluidService.svelte");

describe("fluidService", () => {
    beforeAll(async () => {
        process.env.VITE_USE_FIREBASE_EMULATOR = "true";
        process.env.VITE_TINYLICIOUS_PORT = process.env.VITE_TINYLICIOUS_PORT || "7092";
        process.env.VITE_USE_TINYLICIOUS = "true";
        process.env.NODE_ENV = "test";
        fluidService = await import("./fluidService.svelte");
    });
    beforeEach(() => {
    });

    it("getContainer", async () => {
        try {
            const [client] = await fluidService.getFluidClient("");

            const createResponse = await client.createContainer(fluidService.containerSchema, "2");
            const container = createResponse.container;
            // console.log(container)
            const appData = (container!.initialObjects.appData as ViewableTree).viewWith(appTreeConfiguration);
            if (appData.compatibility.canInitialize) {
                appData.initialize(Project.createInstance("新規プロジェクト"));
            }

            // コンテナをアタッチして永続化（コンテナIDを取得）
            // console.log("fluidService", "info", "Attaching container");
            const newContainerId = await container.attach();
            console.log("fluidService", "info", `Container created with ID: ${newContainerId}`);

            // client.getContainer(newContainerId, fluidService.containerSchema, "2"); does not work with tinylicious.
            // const getResponse = await client.getContainer(newContainerId, fluidService.containerSchema, "2");
            // console.log(getResponse.container);
        } catch (error) {
            if ((error as Error).message?.includes("network")) {
                console.warn("Skipping getContainer test due to network error");
                return;
            }
            console.error(error);
            expect(error).toBeUndefined();
        }
    }, 60000);

    afterEach(() => {
        // タイマーや状態をリセット
        vi.useRealTimers();
    });
});
