import { expect } from "chai";
import {
    DEFAULT_DEMO_SLUG,
    DEMO_PROJECT_SLUGS,
    DEMO_PROJECTS,
    demoLocaleForSlug,
    demoProjectFromPath,
    demoSlugForLocale,
    isDemoProjectSlug,
} from "../src/demo-projects.js";

// The room validator's segment rule (server/src/room-validator.ts). Every demo
// slug becomes a room segment (`projects/<slug>`), so a slug that failed this
// would be unreachable over the websocket no matter what the routes say.
const SEGMENT_RE = /^[A-Za-z0-9_-]{1,128}$/;

describe("demo project registry", () => {
    it("keeps the English demo on the bare `demo` slug", () => {
        // The published https://outliner-d57b0.web.app/demo URL must never move.
        expect(DEFAULT_DEMO_SLUG).to.equal("demo");
        expect(demoSlugForLocale("en")).to.equal("demo");
        expect(demoLocaleForSlug("demo")).to.equal("en");
    });

    it("uses slugs that are valid room segments", () => {
        for (const { slug } of DEMO_PROJECTS) {
            expect(SEGMENT_RE.test(slug), `slug ${slug} is not a valid room segment`).to.be.true;
        }
    });

    it("registers each slug and each locale exactly once", () => {
        expect(new Set(DEMO_PROJECTS.map(p => p.slug)).size).to.equal(DEMO_PROJECTS.length);
        expect(new Set(DEMO_PROJECTS.map(p => p.locale)).size).to.equal(DEMO_PROJECTS.length);
        expect([...DEMO_PROJECT_SLUGS]).to.deep.equal(DEMO_PROJECTS.map(p => p.slug));
    });

    it("matches slugs exactly, never by prefix", () => {
        for (const slug of DEMO_PROJECT_SLUGS) {
            expect(isDemoProjectSlug(slug), slug).to.be.true;
        }
        // `demonstration` and `demo-xx` both survive a startsWith("demo") test,
        // which is exactly the bug this predicate exists to prevent.
        for (const notADemo of ["demonstration", "demo-xx", "Demo", "demos", "", undefined]) {
            expect(isDemoProjectSlug(notADemo), String(notADemo)).to.be.false;
        }
        expect(demoLocaleForSlug("demo-xx")).to.equal(undefined);
    });

    describe("demoProjectFromPath", () => {
        it("resolves the owning demo from the first path segment", () => {
            expect(demoProjectFromPath("/demo")).to.equal("demo");
            expect(demoProjectFromPath("/demo/")).to.equal("demo");
            expect(demoProjectFromPath("/demo/Formatting")).to.equal("demo");
            expect(demoProjectFromPath("/demo/Formatting/diff")).to.equal("demo");
            expect(demoProjectFromPath("/demo?q=1")).to.equal("demo");
        });

        it("decodes percent-encoded segments", () => {
            // A page title, not a project: the first segment is what decides.
            expect(demoProjectFromPath("/demo/%E6%9B%B8%E5%BC%8F")).to.equal("demo");
        });

        it("returns undefined for paths that merely start with the slug", () => {
            expect(demoProjectFromPath("/demonstration")).to.equal(undefined);
            expect(demoProjectFromPath("/demonstration/page")).to.equal(undefined);
            expect(demoProjectFromPath("/")).to.equal(undefined);
            expect(demoProjectFromPath("")).to.equal(undefined);
            expect(demoProjectFromPath(undefined)).to.equal(undefined);
        });

        it("tolerates malformed percent-encoding", () => {
            expect(demoProjectFromPath("/%E0%A4%A")).to.equal(undefined);
        });
    });
});
