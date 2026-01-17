import * as Sentry from "@sentry/sveltekit";

// Sentry error handler
export const handleError = Sentry.handleErrorWithSentry();
