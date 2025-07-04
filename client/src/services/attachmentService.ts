import { userManager } from "../auth/UserManager";

async function callApi(path: string, body: any) {
    const idToken = await userManager.auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("No auth token");
    const apiBaseUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57000";
    const res = await fetch(`${apiBaseUrl}/api/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, ...body }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
}

export async function uploadAttachment(itemId: string, file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const data = await callApi("upload-attachment", { itemId, fileName: file.name, fileData: base64 });
    return data.url as string;
}

export async function listAttachments(itemId: string): Promise<string[]> {
    const data = await callApi("list-attachments", { itemId });
    return data.urls as string[];
}

export async function deleteAttachment(itemId: string, fileName: string): Promise<void> {
    await callApi("delete-attachment", { itemId, fileName });
}
