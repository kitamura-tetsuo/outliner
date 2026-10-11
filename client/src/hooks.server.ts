import { paraglideMiddleware } from "$lib/paraglide/server";
import * as Sentry from "@sentry/sveltekit";
import { type Handle, sequence } from "@sveltejs/kit/hooks";

// creating a handle to use the paraglide middleware.
// `RequestEvent.request` is read-only since SvelteKit 3, so the middleware's
// de-localized request is not swapped in; URL de-localization is already done
// by the `reroute` hook in src/hooks.ts.
const paraglideHandle: Handle = ({ event, resolve }) =>
    paraglideMiddleware(event.request, ({ locale }) => {
        return resolve(event, {
            transformPageChunk: ({ html }) => {
                return html.replace("%lang%", locale);
            },
        });
    });

export const handle: Handle = sequence(Sentry.sentryHandle(), paraglideHandle);

// Sentry error handler
export const handleError = Sentry.handleErrorWithSentry();
