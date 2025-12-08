import { getFirebaseFunctionUrl } from "$lib/firebaseFunctionsUrl";
import type { RequestEvent, RequestHandler } from "./$types";

const proxyRequest = async (event: RequestEvent) => {
    const rawPath = event.params.path ?? "";
    // The incoming path already lives under /api/, so strip any leading prefix before
    // handing it to the Functions URL helper.
    const functionPath = rawPath.startsWith("api/") ? rawPath.slice(4) : rawPath;
    const targetUrl = getFirebaseFunctionUrl(functionPath);

    const method = event.request.method.toUpperCase();
    const body = method === "GET" || method === "HEAD"
        ? undefined
        : await event.request.arrayBuffer();

    const response = await fetch(targetUrl, {
        method,
        headers: event.request.headers,
        body,
    });

    // Stream the response back to the caller, preserving status and headers.
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
};

export const GET: RequestHandler = proxyRequest;
export const POST: RequestHandler = proxyRequest;
export const PUT: RequestHandler = proxyRequest;
export const PATCH: RequestHandler = proxyRequest;
export const DELETE: RequestHandler = proxyRequest;
