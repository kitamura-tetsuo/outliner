export type DeploymentMode = "cloud" | "onprem";

const configuredMode = import.meta.env.VITE_OUTLINER_DEPLOYMENT_MODE;

if (
    configuredMode !== undefined && configuredMode !== "" && configuredMode !== "cloud" && configuredMode !== "onprem"
) {
    throw new Error(`Invalid VITE_OUTLINER_DEPLOYMENT_MODE: ${configuredMode}`);
}

export const deploymentMode: DeploymentMode = configuredMode === "onprem" ? "onprem" : "cloud";

export const isOnPrem = deploymentMode === "onprem";

export interface DeploymentDescriptor {
    deploymentMode: DeploymentMode;
    supportedFeatures?: string[];
}

export async function verifyDeployment(fetcher: typeof fetch = fetch): Promise<DeploymentDescriptor> {
    const response = await fetcher("/api/deployment", { credentials: "same-origin" });
    if (!response.ok) throw new Error(`Deployment check failed (${response.status})`);
    const descriptor = await response.json() as DeploymentDescriptor;
    if (descriptor.deploymentMode !== deploymentMode) {
        throw new Error(
            `Deployment mismatch: client is ${deploymentMode}, server is ${descriptor.deploymentMode ?? "unknown"}`,
        );
    }
    return descriptor;
}

export function isFeatureSupported(feature: string, descriptor?: DeploymentDescriptor): boolean {
    return !isOnPrem || descriptor?.supportedFeatures?.includes(feature) === true;
}
