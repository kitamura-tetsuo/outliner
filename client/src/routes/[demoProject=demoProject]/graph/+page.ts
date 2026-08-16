export const ssr = false;

import type { PageLoad } from "./$types";

export const load: PageLoad = ({ params }) => {
    return {
        // The demo project this graph belongs to (`demo`, `demo-ja`, …).
        project: params.demoProject,
    };
};
