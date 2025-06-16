import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { SharedTree } from "fluid-framework";
import { v4 as uuid } from "uuid";
import { FluidClient } from "../fluid/fluidClient";
import {
    appTreeConfiguration,
    Project,
} from "../schema/app-schema";
import {
    getAllContainerMeta,
    saveContainerMeta,
} from "./wasmDb";

// const containerSchema: ContainerSchema = {
//     initialObjects: { appData: SharedTree },
// } as any;
const containerSchema = {
    initialObjects: { appData: SharedTree },
} as any;

// テスト環境では.env.testファイルから環境変数を読み取る
const isTestEnvironment = typeof process !== "undefined" && process.env.NODE_ENV === "test";
const envPort = isTestEnvironment
    ? process.env.VITE_TINYLICIOUS_PORT
    : import.meta.env.VITE_TINYLICIOUS_PORT;
const tinyliciousPort = Number(envPort || "7092");
const client = new TinyliciousClient({ connection: { port: tinyliciousPort } });

export async function createNewContainer(title: string): Promise<FluidClient> {
    const { container, services } = await client.createContainer(containerSchema, "2");
    const id = await container.attach();
    const appData = (container.initialObjects.appData as any).viewWith(appTreeConfiguration);
    appData.initialize(Project.createInstance(title));
    const project = appData.root as Project;
    await saveContainerMeta(id, title);
    return new FluidClient({
        clientId: uuid(),
        client,
        container,
        containerId: id,
        appData,
        project,
        services,
    });
}

export async function loadContainer(id: string): Promise<FluidClient> {
    const { container, services } = await client.getContainer(id, containerSchema, "2");
    const appData = (container.initialObjects.appData as any).viewWith(appTreeConfiguration);
    if (appData.compatibility.canInitialize) {
        appData.initialize(Project.createInstance("New Project"));
    }
    const project = appData.root as Project;
    return new FluidClient({
        clientId: uuid(),
        client,
        container,
        containerId: id,
        appData,
        project,
        services,
    });
}

export async function listContainers() {
    return await getAllContainerMeta();
}
