import { userManager } from "../auth/UserManager";

interface ApiRequestBody {
    [key: string]: unknown;
}

async function callApi(path: string, body: ApiRequestBody) {
    const idToken = await userManager.auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("No auth token");
    const apiBaseUrl = "http://localhost:57000";
    const res = await fetch(`${apiBaseUrl}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, ...body }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
}

export async function uploadAttachment(containerId: string, itemId: string, file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    // Convert ArrayBuffer to base64 safely (avoiding stack overflow with large files)
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = "";
    const chunkSize = 8192; // Process in chunks to avoid stack limits
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
        binary += String.fromCharCode(...uint8Array.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    const data = await callApi("api/upload-attachment", { containerId, itemId, fileName: file.name, fileData: base64 });
    return data.url as string;
}

export async function listAttachments(containerId: string, itemId: string): Promise<string[]> {
    const data = await callApi("api/list-attachments", { containerId, itemId });
    return data.urls as string[];
}

export async function deleteAttachment(containerId: string, itemId: string, fileName: string): Promise<void> {
    await callApi("api/delete-attachment", { containerId, itemId, fileName });
}
