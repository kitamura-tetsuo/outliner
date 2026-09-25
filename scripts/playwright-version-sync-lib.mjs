/**
 * Pure helpers shared by the Playwright image synchronisers.
 *
 * They operate on file contents rather than paths, so the same rules apply
 * whether the input comes from the working tree (sync-playwright-version.mjs)
 * or straight from a commit's blobs (publish-playwright-sync.mjs).
 */

export const DOCKERFILE = ".github/container/Dockerfile";
export const LOCKFILE = "client/package-lock.json";

const TEST_PACKAGE = "node_modules/@playwright/test";
const RELEASE = /^\d+\.\d+\.\d+$/;
// Any line that declares a Playwright base image, however it is spelled. More
// than one of them makes the correction ambiguous even if only one is in the
// complete supported form.
const PLAYWRIGHT_FROM = /^[ \t]*FROM[ \t]+(?:--\S+[ \t]+)*mcr\.microsoft\.com\/playwright\b.*$/gim;
const SUPPORTED_FROM = /^FROM mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-jammy$/;

/** Raised when an input cannot be corrected automatically. */
export class PlaywrightSyncInputError extends Error {}

/**
 * The authoritative Playwright release: the version the lockfile resolves for
 * @playwright/test, restricted to a plain MAJOR.MINOR.PATCH release.
 */
export function authoritativeVersion(lockText) {
    let lock;
    try {
        lock = JSON.parse(lockText);
    } catch {
        throw new PlaywrightSyncInputError(`${LOCKFILE} is not valid JSON.`);
    }
    const version = lock?.packages?.[TEST_PACKAGE]?.version;
    if (typeof version !== "string" || !RELEASE.test(version)) {
        throw new PlaywrightSyncInputError(
            `${LOCKFILE} has no MAJOR.MINOR.PATCH version at packages["${TEST_PACKAGE}"].version`
                + ` (found ${JSON.stringify(version)}).`,
        );
    }
    return version;
}

/**
 * Plans the Dockerfile correction for `version`.
 *
 * Returns the current image version and the corrected content, which equals
 * the input when the image is already aligned. Only the version token of the
 * single supported FROM line changes.
 */
export function planDockerfileSync(dockerfileText, version) {
    if (!RELEASE.test(version)) {
        throw new PlaywrightSyncInputError(
            `Refusing to write unsupported Playwright version ${JSON.stringify(version)}.`,
        );
    }
    const declarations = [...dockerfileText.matchAll(PLAYWRIGHT_FROM)];
    const supported = declarations.length === 1 ? SUPPORTED_FROM.exec(declarations[0][0]) : null;
    if (!supported) {
        throw new PlaywrightSyncInputError(
            `${DOCKERFILE} does not contain a uniquely identifiable expected Playwright base-image declaration`
                + ` (FROM mcr.microsoft.com/playwright:v<MAJOR.MINOR.PATCH>-jammy; found ${declarations.length} Playwright FROM line(s)).`,
        );
    }
    const currentVersion = supported[1];
    const lineStart = declarations[0].index;
    const tokenStart = lineStart + "FROM mcr.microsoft.com/playwright:v".length;
    const content = dockerfileText.slice(0, tokenStart) + version
        + dockerfileText.slice(tokenStart + currentVersion.length);
    return { currentVersion, content, changed: currentVersion !== version };
}

/** The image reference the Dockerfile must use for `version`. */
export const requiredImage = (version) => `mcr.microsoft.com/playwright:v${version}-jammy`;
