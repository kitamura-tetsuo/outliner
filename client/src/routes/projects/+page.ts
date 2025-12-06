import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

// This page redirects to the home page since the project list is on the home page
export const load: PageLoad = async () => {
    throw redirect(302, "/");
};
