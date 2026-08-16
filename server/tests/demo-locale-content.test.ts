import { expect } from "chai";
import * as Y from "yjs";
import {
    buildDemoProject,
    buildDemoScheduleRulesFor,
    DEMO_LANDING_PAGE_KEY,
    demoCalendarsFor,
    demoPagesFor,
    demoTablesFor,
    registerDemoTables,
} from "../src/demo-content.js";
import { DEMO_PROJECTS, type DemoLocale } from "../src/demo-projects.js";
import { Project } from "../src/schema/app-schema.js";

// Every locale the content packs can serve, whether or not a demo project is
// registered for it yet: `demoPagesFor("ja")` must already behave (by falling
// back to English) before `demo-ja` goes live.
const CONTENT_LOCALES: DemoLocale[] = ["en", "ja"];

/**
 * Internal page links, as the outliner parses them: `[Page Title]`.
 *
 * The demo content also uses brackets for formatting (`[[bold]]`, `[/ italic]`,
 * `[-strike]`) and for cross-project links (`[/demo/Page/diff]`), so callers
 * filter the raw tokens down to the ones that actually name a page.
 */
function bracketTokens(text: string): string[] {
    return [...text.matchAll(/\[([^[\]]+)\]/g)].map(m => m[1]);
}

function pageTexts(locale: DemoLocale): string[] {
    const texts: string[] = [];
    const walk = (items: { text?: string; children?: unknown[]; }[] | undefined) => {
        for (const item of items ?? []) {
            if (item.text) texts.push(item.text);
            walk(item.children as { text?: string; children?: unknown[]; }[] | undefined);
        }
    };
    for (const page of demoPagesFor(locale)) {
        texts.push(page.title);
        for (const line of page.lines ?? []) texts.push(line);
        walk(page.items);
    }
    return texts;
}

describe("Demo locale content", () => {
    describe("page keys", () => {
        it("uses English keys identical to the titles earlier versions derived ids from", () => {
            // `templatePageId` used to be `title.trim().toLowerCase()`. Keeping the
            // English keys byte-identical to that is what lets already-seeded
            // `projects/demo` documents keep matching without a migration.
            for (const page of demoPagesFor("en")) {
                expect(page.key, `key of "${page.title}"`).to.equal(page.title.trim().toLowerCase());
            }
        });

        it("keeps keys unique and stable across locales", () => {
            const englishKeys = demoPagesFor("en").map(p => p.key);
            expect(new Set(englishKeys).size).to.equal(englishKeys.length);
            for (const locale of CONTENT_LOCALES) {
                expect(demoPagesFor(locale).map(p => p.key), locale).to.deep.equal(englishKeys);
            }
        });

        it("has a landing page under the shared landing key in every locale", () => {
            for (const locale of CONTENT_LOCALES) {
                const landing = demoPagesFor(locale).find(p => p.key === DEMO_LANDING_PAGE_KEY);
                expect(landing, `landing page of ${locale}`).to.not.equal(undefined);
            }
        });

        it("stores the key, not the title, as templatePageId", () => {
            for (const { slug, locale } of DEMO_PROJECTS) {
                const project = buildDemoProject("seed-test", slug);
                const expected = demoPagesFor(locale).map(p => p.key);
                const actual: string[] = [];
                for (let i = 0; i < project.items.length; i++) {
                    const page = project.items.at(i);
                    if (page?.templatePageId) actual.push(page.templatePageId);
                }
                expect(actual, slug).to.deep.equal(expected);
            }
        });
    });

    describe("internal links", () => {
        it("links only to page titles of the same locale", () => {
            // The trap the English fallback creates: a landing page translated to
            // link `[書式]` while the Formatting page itself fell back to English
            // leaves a link no page in that project answers to. Any bracket token
            // that names a page in *some* locale must name one in *this* locale.
            const titlesAnywhere = new Set(
                CONTENT_LOCALES.flatMap(locale => demoPagesFor(locale).map(p => p.title)),
            );

            for (const locale of CONTENT_LOCALES) {
                const titlesHere = new Set(demoPagesFor(locale).map(p => p.title));
                for (const text of pageTexts(locale)) {
                    for (const token of bracketTokens(text)) {
                        if (!titlesAnywhere.has(token)) continue;
                        expect(
                            titlesHere.has(token),
                            `${locale}: link [${token}] in "${text}" names no page of this locale`,
                        ).to.be.true;
                    }
                }
            }
        });

        it("links to every feature page from the landing page of each locale", () => {
            for (const locale of CONTENT_LOCALES) {
                const pages = demoPagesFor(locale);
                const landing = pages.find(p => p.key === DEMO_LANDING_PAGE_KEY)!;
                const landingText = [
                    ...(landing.lines ?? []),
                    ...JSON.stringify(landing.items ?? []).split("\n"),
                ].join("\n");
                for (const page of pages) {
                    if (page.key === DEMO_LANDING_PAGE_KEY) continue;
                    expect(landingText, `${locale}: landing links to ${page.title}`)
                        .to.contain(`[${page.title}]`);
                }
            }
        });
    });

    describe("translation coverage", () => {
        // The English fallback works per page: a page a locale has not
        // translated seeds in English. A page it *has* translated is owned by
        // that locale wholesale — so extending the English version of an
        // already-translated page does not reach it.
        //
        // That is deliberate (interleaving new English bullets into translated
        // prose would produce a half-translated page in arbitrary order), but
        // it means "the demo demonstrates the current feature set" only holds
        // for a translated page if the translation is kept in step. This test
        // is what makes that enforceable rather than aspirational: it fails,
        // naming the page, the moment an English page grows past its
        // translation.
        const countNodes = (items: { children?: unknown[]; }[] | undefined): number => {
            let total = 0;
            for (const item of items ?? []) {
                total += 1 + countNodes(item.children as { children?: unknown[]; }[] | undefined);
            }
            return total;
        };
        const entryCount = (page: { lines?: string[]; items?: { children?: unknown[]; }[]; }): number =>
            (page.lines?.length ?? 0) + countNodes(page.items);

        it("keeps every translated page in step with its English original", () => {
            const english = new Map(demoPagesFor("en").map(p => [p.key, p]));
            for (const locale of CONTENT_LOCALES) {
                if (locale === "en") continue;
                for (const page of demoPagesFor(locale)) {
                    const base = english.get(page.key)!;
                    // An untranslated page *is* the English one; nothing to check.
                    if (page === base) continue;
                    expect(
                        entryCount(page),
                        `${locale}: page "${page.key}" has ${entryCount(page)} entries but English has `
                            + `${entryCount(base)} — translate the new content, or drop the override to fall back`,
                    ).to.equal(entryCount(base));
                }
            }
        });

        it("uses the same content shape as English for a translated page", () => {
            // A page written with `lines` in English but `items` in a locale
            // would silently drop the structured seeding (components, votes,
            // comments, attachments) that only `items` can express.
            const english = new Map(demoPagesFor("en").map(p => [p.key, p]));
            for (const locale of CONTENT_LOCALES) {
                if (locale === "en") continue;
                for (const page of demoPagesFor(locale)) {
                    const base = english.get(page.key)!;
                    if (page === base) continue;
                    expect(Boolean(page.lines), `${locale}: page "${page.key}" lines form`)
                        .to.equal(Boolean(base.lines));
                    expect(Boolean(page.items), `${locale}: page "${page.key}" items form`)
                        .to.equal(Boolean(base.items));
                }
            }
        });
    });

    describe("shared structure", () => {
        it("keeps table ids, SQL and queries identical across locales", () => {
            const base = demoTablesFor("en");
            for (const locale of CONTENT_LOCALES) {
                const tables = demoTablesFor(locale);
                expect(tables.map(t => t.tableId), locale).to.deep.equal(base.map(t => t.tableId));
                expect(tables.map(t => t.sqlName), locale).to.deep.equal(base.map(t => t.sqlName));
                expect(tables.map(t => t.schemaSql), locale).to.deep.equal(base.map(t => t.schemaSql));
                expect(tables.map(t => t.query), locale).to.deep.equal(base.map(t => t.query));
                // Record ids address rows across locales; only values may differ.
                expect(tables.map(t => t.records.map(r => r.id)), locale)
                    .to.deep.equal(base.map(t => t.records.map(r => r.id)));
            }
        });

        it("keeps calendar ids and queries identical across locales", () => {
            const base = demoCalendarsFor("en");
            for (const locale of CONTENT_LOCALES) {
                const calendars = demoCalendarsFor(locale);
                expect(calendars.map(c => c.calendarId), locale).to.deep.equal(base.map(c => c.calendarId));
                expect(calendars.map(c => c.query), locale).to.deep.equal(base.map(c => c.query));
            }
        });

        it("keeps schedule rule ids, RRULEs and SQL identical across locales", () => {
            const base = buildDemoScheduleRulesFor("en");
            for (const locale of CONTENT_LOCALES) {
                const rules = buildDemoScheduleRulesFor(locale);
                expect(rules.map(r => r.ruleId), locale).to.deep.equal(base.map(r => r.ruleId));
                expect(rules.map(r => r.rrule), locale).to.deep.equal(base.map(r => r.rrule));
                expect(rules.map(r => r.sql), locale).to.deep.equal(base.map(r => r.sql));
            }
        });
    });

    describe("table subdocs", () => {
        it("gives each demo project its own subdoc guids", () => {
            // Table ids are shared, the documents are not: `/demo` and `/demo-ja`
            // each own `projects/<slug>/tables/<tableId>`. Yjs-bound components
            // remount on `ydoc.guid` (AGENTS.md §11), so a guid shared between
            // locales would leave a table view showing the other demo's document.
            const guidsFor = (slug: string): string[] => {
                const project = Project.createInstance(slug);
                registerDemoTables(project.ydoc, slug, "en");
                const registry = project.ydoc.getMap<Y.Map<unknown>>("yjsTables");
                return [...registry.keys()]
                    .map(id => (registry.get(id)!.get("doc") as Y.Doc).guid)
                    .sort();
            };

            const demoGuids = guidsFor("demo");
            const otherGuids = guidsFor("demo-ja");
            expect(demoGuids.length).to.be.greaterThan(0);
            expect(demoGuids.length).to.equal(otherGuids.length);
            for (const guid of demoGuids) {
                expect(otherGuids, `guid ${guid} is reused by another demo project`).to.not.contain(guid);
            }
        });
    });
});
