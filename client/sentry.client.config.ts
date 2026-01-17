import * as Sentry from "@sentry/sveltekit";

Sentry.init({
    dsn: "https://8616a38af594a48a70f6e2333b51010c@o470306.ingest.us.sentry.io/4510723439722496",

    // Tracing
    tracesSampleRate: 1.0,

    // Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    beforeSend(event) {
        if (event.request?.headers) {
            delete event.request.headers["Authorization"];
            delete event.request.headers["Cookie"];
            delete event.request.headers["authorization"];
            delete event.request.headers["cookie"];
        }

        if (event.user) {
            delete event.user.email;
            delete event.user.ip_address;
        }

        return event;
    },
});
