import { paraglideMiddleware } from "$lib/paraglide/server";
import * as Sentry from "@sentry/sveltekit";
import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";

// creating a handle to use the paraglide middleware
const paraglideHandle: Handle = ({ event, resolve }) =>
    paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
        event.request = localizedRequest;
        // (removed legacy endpoint interception)
        return resolve(event, {
            transformPageChunk: ({ html }) => {
                return html.replace("%lang%", locale);
            },
        });
    });

export const handle: Handle = sequence(Sentry.sentryHandle(), paraglideHandle);
export const handleError = Sentry.handleErrorWithSentry();
