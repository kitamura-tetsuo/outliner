/**
 * Registry of the public demo projects, one per locale.
 *
 * The demo is the living showcase of the product (see docs/demo-project.md).
 * Each locale is a separate, independently editable Yjs document rather than a
 * translation layer over one shared document, because the demo content *is*
 * user data: visitors edit it, and the page titles they navigate by are
 * themselves translated.
 *
 * The slug carries three identities at once, and they must stay equal:
 *
 *   slug === project title === `projects/<slug>` room id === first URL segment
 *
 * Internal links are rendered from `project.title` (see the comment at the top
 * of server/src/demo-content.ts), so a document whose title disagreed with its
 * room id would emit links pointing at a different project. Keeping the three
 * in lockstep is what lets `/demo-ja/<page>` resolve with no locale-aware
 * routing logic anywhere in the app.
 *
 * Adding a locale means one entry here plus one `demo-content.<locale>.ts`.
 *
 * This module is compiled into both bundles, so it deliberately has no
 * dependencies — no Yjs, no logger.
 */

export type DemoLocale = "en" | "ja";

export interface DemoProjectDescriptor {
    /** Project title, Yjs room segment and first URL segment. */
    slug: string;
    locale: DemoLocale;
}

/**
 * The English demo keeps the bare `demo` slug rather than `demo-en` so the
 * long-published https://outliner-d57b0.web.app/demo URLs never move.
 */
export const DEFAULT_DEMO_SLUG = "demo";

export const DEMO_PROJECTS: readonly DemoProjectDescriptor[] = [
    { slug: DEFAULT_DEMO_SLUG, locale: "en" },
    { slug: "demo-ja", locale: "ja" },
];

export const DEMO_PROJECT_SLUGS: readonly string[] = DEMO_PROJECTS.map(p => p.slug);

/**
 * True for a known demo project. This is the authorization predicate for
 * anonymous access, so it matches exactly — never by prefix. `/demo-ja` starts
 * with `demo`, and `demonstration` does too.
 */
export function isDemoProjectSlug(slug: string | undefined): boolean {
    if (!slug) return false;
    return DEMO_PROJECTS.some(p => p.slug === slug);
}

export function demoLocaleForSlug(slug: string | undefined): DemoLocale | undefined {
    if (!slug) return undefined;
    return DEMO_PROJECTS.find(p => p.slug === slug)?.locale;
}

export function demoSlugForLocale(locale: DemoLocale): string | undefined {
    return DEMO_PROJECTS.find(p => p.locale === locale)?.slug;
}

/**
 * The demo project owning `pathname`, matched on its first segment.
 *
 * Callers previously tested `pathname.startsWith("/demo")`, which also matches
 * `/demo-ja` and `/demonstration`. Route params are the better source where
 * they are available; this exists for the components that only hold a URL.
 */
export function demoProjectFromPath(pathname: string | undefined): string | undefined {
    if (!pathname) return undefined;
    const [rawFirstSegment] = pathname.split("?")[0].split("/").filter(Boolean);
    if (!rawFirstSegment) return undefined;
    let firstSegment = rawFirstSegment;
    try {
        firstSegment = decodeURIComponent(rawFirstSegment);
    } catch (_e) {
        // Malformed percent-encoding: fall back to the raw segment, which
        // simply will not match any registered slug.
    }
    return isDemoProjectSlug(firstSegment) ? firstSegment : undefined;
}
