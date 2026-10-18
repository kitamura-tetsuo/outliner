/** @vitest-environment jsdom */
import { resolve } from "$app/paths";
import type { ResolvedPathname } from "$app/types";
import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { projectObjectsSelectedRoute } from "../lib/managementPaths";
import { projectPageRoute } from "../lib/publicProject";
import Breadcrumb from "./Breadcrumb.svelte";

describe("Breadcrumb", () => {
    it("renders official resolved URLs unchanged across the prop boundary", () => {
        const encoded = projectPageRoute("demo-ja", "設計 / 50%?#") as ResolvedPathname;
        const selected = `${projectObjectsSelectedRoute("project name", "table/id")}#details` as ResolvedPathname;
        const { container } = render(Breadcrumb, {
            props: {
                items: [
                    { label: "Home", href: resolve("/") },
                    { label: "Encoded", href: encoded },
                    { label: "Selected", href: selected },
                    { label: "Current" },
                ],
            },
        });

        const hrefs = [...container.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href"));
        expect(hrefs).toEqual([
            "/",
            "/demo-ja/%E8%A8%AD%E8%A8%88%20%2F%2050%25%3F%23",
            "/project%20name/-/objects?selected=table%2Fid#details",
        ]);
    });

    it("keeps an absent href as non-link content", () => {
        const { getByText } = render(Breadcrumb, {
            props: { items: [{ label: "Parent" }, { label: "Current" }] },
        });

        expect(getByText("Parent").tagName).toBe("SPAN");
        expect(getByText("Current").getAttribute("aria-current")).toBe("page");
    });
});
