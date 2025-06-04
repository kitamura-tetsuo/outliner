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
import * as fluidService from "./fluidService.svelte";

describe("fluidService", () => {
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
        }
        catch (error) {
            console.error(error);
            expect(error).toBeUndefined();
        }
    });

    afterEach(() => {
        // タイマーや状態をリセット
        vi.useRealTimers();
    });
});
