// @ts-nocheck
import { paraglideMiddleware } from "$lib/paraglide/server";
import type { Handle } from "@sveltejs/kit";

// creating a handle to use the paraglide middleware
const paraglideHandle: Handle = ({ event, resolve }) =>
    paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
        event.request = localizedRequest;
        // Intercept removed endpoints explicitly
        if (event.url.pathname === "/api/fluid-token" && event.request.method === "GET") {
            return new Response("Not Found", { status: 404 });
        }
        return resolve(event, {
            transformPageChunk: ({ html }) => {
                return html.replace("%lang%", locale);
            },
        });
    });

export const handle: Handle = paraglideHandle;
