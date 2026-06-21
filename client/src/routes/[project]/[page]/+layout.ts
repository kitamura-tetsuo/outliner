// E2E stability: Load project data before rendering any page in the route
// This ensures that when navigating directly to child routes like /schedule,
// the project data is already loaded and available in the store

import type { LayoutLoad } from "./$types";
import { getLogger } from "../../../lib/logger";
const logger = getLogger("LayoutTS");

export const load: LayoutLoad = async ({ params, url }) => {
    const projectName = decodeURIComponent(params.project ?? "");
    const pageName = decodeURIComponent(params.page ?? "");

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
