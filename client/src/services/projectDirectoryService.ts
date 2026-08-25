import { userManager } from "../auth/UserManager";
import { resolveApiBaseUrl } from "../lib/yjsApiUrl";

export interface ProjectDescriptor {
    projectId: string;
    title: string;
}

type FetchOptions = Parameters<typeof fetch>[1];

async function request(path: string, init?: FetchOptions): Promise<Response> {
    const user = userManager.auth.currentUser;
    if (!user) throw new Error("User not logged in");
    const token = await user.getIdToken();
    const base = resolveApiBaseUrl().replace(/\/$/, "");
    return fetch(`${base}/api${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...init?.headers,
        },
    });
}

async function descriptor(response: Response): Promise<ProjectDescriptor> {
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Project request failed");
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
