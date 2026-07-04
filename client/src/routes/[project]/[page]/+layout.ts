// E2E stability: Load project data before rendering any page in the route
// This ensures that when navigating directly to child routes like /schedule,
// the project data is already loaded and available in the store

import { getLogger } from "../../../lib/logger";
import type { LayoutLoad } from "./$types";
const logger = getLogger("LayoutTS");

export const load: LayoutLoad = async ({ params, url }) => {
    let projectName = params.project ?? "";
    try {
        projectName = decodeURIComponent(projectName);
    } catch {}
    let pageName = params.page ?? "";
    try {
        pageName = decodeURIComponent(pageName);
    } catch {}

    // Validate required parameters
    if (!projectName || !pageName) {
        return {};
    }

    // Log for debugging
    logger.debug(`[+layout.ts] Loading for project="${projectName}", page="${pageName}", url="${url.pathname}"`);

    return {
        projectName,
        pageName,
        isChildRoute: url.pathname.includes("/schedule") || url.pathname.includes("/graph"),
    };
};
