import { userManager } from "../auth/UserManager";
import { isOnPrem, verifyDeployment } from "../lib/deployment";
import { resolveApiBaseUrl } from "../lib/yjsApiUrl";

export interface ProjectDescriptor {
    projectId: string;
    title: string;
}

type FetchOptions = Parameters<typeof fetch>[1];

async function request(path: string, init?: FetchOptions): Promise<Response> {
    const currentUser = userManager.getCurrentUser();
    if (!currentUser) throw new Error("User not logged in");
    if (isOnPrem) await verifyDeployment();
    const token = isOnPrem ? undefined : await userManager.auth.currentUser?.getIdToken();
    if (!isOnPrem && !token) throw new Error("User not logged in");
    const base = isOnPrem ? "" : resolveApiBaseUrl().replace(/\/$/, "");
    const response = await fetch(`${base}/api${path}`, {
        ...init,
        credentials: isOnPrem ? "same-origin" : init?.credentials,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            "Content-Type": "application/json",
            ...init?.headers,
        },
    });
    if (isOnPrem && response.status === 401) userManager.invalidateLocalSession();
    return response;
}

async function descriptor(response: Response): Promise<ProjectDescriptor> {
    if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))).error;
        throw new Error(detail ?? `Project request failed (${response.status})`);
    }
    return response.json() as Promise<ProjectDescriptor>;
}

export async function listAccessibleProjects(): Promise<ProjectDescriptor[]> {
    const response = await request("/projects");
    if (!response.ok) throw new Error("Could not load projects");
    return ((await response.json()) as { projects: ProjectDescriptor[]; }).projects;
}

export async function resolveProject(titleOrId: string): Promise<ProjectDescriptor | undefined> {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const path = uuid.test(titleOrId)
        ? `/projects/${encodeURIComponent(titleOrId)}`
        : `/projects/resolve?title=${encodeURIComponent(titleOrId)}`;
    const response = await request(path);
    if (response.status === 404) return undefined;
    return descriptor(response);
}

export async function createProjectDescriptor(projectId: string, title: string): Promise<ProjectDescriptor> {
    return descriptor(
        await request("/projects", {
            method: "POST",
            body: JSON.stringify({ projectId, title }),
        }),
    );
}

export async function renameProjectDescriptor(projectId: string, title: string): Promise<ProjectDescriptor> {
    return descriptor(
        await request(`/projects/${encodeURIComponent(projectId)}/rename`, {
            method: "POST",
            body: JSON.stringify({ title }),
        }),
    );
}
