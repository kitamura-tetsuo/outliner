import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { ContainerSchema } from "@fluidframework/fluid-static";
import { SharedTree, ViewableTree } from "fluid-framework";
import { v4 as uuid } from "uuid";
import { appTreeConfiguration, Project } from "../schema/app-schema";
import { FluidClient } from "../fluid/fluidClient";
import { saveContainerMeta, getAllContainerMeta } from "./wasmDb";

const containerSchema: ContainerSchema = {
    initialObjects: { appData: SharedTree },
} as any;

const tinyliciousPort = Number(import.meta.env.VITE_TINYLICIOUS_PORT || "7092");
const client = new TinyliciousClient({ connection: { port: tinyliciousPort } });

export async function createNewContainer(title: string): Promise<FluidClient> {
    const { container, services } = await client.createContainer(containerSchema, "2");
    const id = await container.attach();
    const appData = (container.initialObjects.appData as ViewableTree).viewWith(appTreeConfiguration);
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
    const appData = (container.initialObjects.appData as ViewableTree).viewWith(appTreeConfiguration);
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
