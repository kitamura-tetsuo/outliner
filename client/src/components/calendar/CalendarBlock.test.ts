/** @vitest-environment jsdom */
import { Project } from "$shared/app-schema";
import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import CalendarBlock from "./CalendarBlock.svelte";

describe("CalendarBlock setup registry observation", () => {
    it("mounts an unbound Calendar against the canonical Table registry", () => {
        const project = Project.createInstance("Calendar block");
        const item = project.items.addNode("test-user");
        item.componentType = "calendar";

        const rendered = render(CalendarBlock, { item });

        expect(rendered.getByTestId("calendar-create-panel")).toBeTruthy();
        rendered.unmount();
    });
});
