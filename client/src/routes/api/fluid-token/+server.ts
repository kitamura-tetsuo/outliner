import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
    return new Response("Not Found", { status: 404 });
};
