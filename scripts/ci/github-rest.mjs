/**
 * Minimal GitHub REST client and pull-request identity helpers shared by the
 * corrected-head CI handoff (request-corrected-head-ci.mjs) and its receiver
 * (resolve-pr-context.mjs).
 *
 * Every value that reaches a URL is validated or percent-encoded first, so PR
 * metadata stays data and is never interpreted as a path or shell text.
 */

export const CI_WORKFLOW = "ci.yml";

const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const PR_NUMBER = /^[1-9]\d*$/;
const REPOSITORY = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

export const isSha = (value) => typeof value === "string" && SHA.test(value);
export const isPrNumber = (value) => typeof value === "string" && PR_NUMBER.test(value);
export const isRepository = (value) => typeof value === "string" && REPOSITORY.test(value);

/** The display title of a full-CI run dispatched for PR `prNumber` at `sha` (ci.yml `run-name`). */
export const handoffRunName = (prNumber, sha) => `CI: PR #${prNumber} corrected head ${sha}`;

/** Refusal of a request whose target is not (or no longer) authorised. */
export class HandoffRefusal extends Error {
    constructor(outcome, detail) {
        super(detail);
        this.outcome = outcome;
    }
}

export class GitHubApiError extends Error {
    constructor(method, route, status, body) {
        super(`${method} ${route} -> HTTP ${status}${body ? `: ${body.slice(0, 300)}` : ""}`);
        this.status = status;
    }
}

const encodeRef = (ref) => ref.split("/").map(encodeURIComponent).join("/");

export function gitHubClient({ token = process.env.GH_TOKEN, apiUrl = process.env.GITHUB_API_URL } = {}) {
    const base = (apiUrl || "https://api.github.com").replace(/\/+$/, "");
    const requests = [];

    async function request(method, route, body) {
        requests.push(`${method} ${route}`);
        const response = await fetch(`${base}${route}`, {
            method,
            headers: {
                accept: "application/vnd.github+json",
                "x-github-api-version": "2022-11-28",
                ...(token ? { authorization: `Bearer ${token}` } : {}),
                ...(body ? { "content-type": "application/json" } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        const text = await response.text();
        if (!response.ok) throw new GitHubApiError(method, route, response.status, text);
        return text ? JSON.parse(text) : undefined;
    }

    return {
        requests,
        pull: (repo, number) => request("GET", `/repos/${repo}/pulls/${number}`),
        /** The commit a branch points at, or "" when it does not exist. */
        async branchHead(repo, ref) {
            try {
                const data = await request("GET", `/repos/${repo}/git/ref/heads/${encodeRef(ref)}`);
                return data?.ref === `refs/heads/${ref}` ? data.object?.sha ?? "" : "";
            } catch (err) {
                if (err instanceof GitHubApiError && err.status === 404) return "";
                throw err;
            }
        },
        async workflowRuns(repo, workflow, headSha) {
            const data = await request(
                "GET",
                `/repos/${repo}/actions/workflows/${
                    encodeURIComponent(workflow)
                }/runs?head_sha=${headSha}&per_page=100`,
            );
            return data?.workflow_runs ?? [];
        },
        dispatch: (repo, workflow, ref, inputs) =>
            request("POST", `/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
                ref,
                inputs,
            }),
    };
}

/**
 * Checks that the authoritative PR metadata names an open, same-repository PR
 * whose source branch is `ref` at `sha`, and that the branch itself (read
 * independently of the PR record) is at `sha` too. Returns the PR record.
 * A PR record still naming `previousSha` is reported as "lagging" rather than
 * "stale", so a caller that has just published `sha` on top of it can wait.
 */
export async function assertPrAt(api, { repository, prNumber, ref, sha, previousSha = "" }) {
    const pr = await api.pull(repository, prNumber);
    if (pr?.state !== "open") {
        throw new HandoffRefusal("refused", `${repository}#${prNumber} is ${pr?.state ?? "missing"}, not open.`);
    }
    if (pr.head?.repo?.full_name !== repository) {
        throw new HandoffRefusal(
            "refused",
            `${repository}#${prNumber} comes from ${
                pr.head?.repo?.full_name ?? "a deleted repository"
            }; only same-repository PRs are handed off.`,
        );
    }
    if (pr.head.ref !== ref) {
        throw new HandoffRefusal(
            "refused",
            `${repository}#${prNumber} has source branch ${JSON.stringify(pr.head.ref)}, not ${JSON.stringify(ref)}.`,
        );
    }
    if (pr.head.sha !== sha) {
        // Right after a push the PR record can still name the parent for a moment.
        const outcome = previousSha && pr.head.sha === previousSha ? "lagging" : "stale";
        throw new HandoffRefusal(outcome, `${repository}#${prNumber} head is ${pr.head.sha}, not ${sha}.`);
    }
    const branch = await api.branchHead(repository, ref);
    if (branch !== sha) {
        throw new HandoffRefusal(
            "stale",
            `refs/heads/${ref} in ${repository} reads ${branch || "(missing)"}, not ${sha}.`,
        );
    }
    return pr;
}
