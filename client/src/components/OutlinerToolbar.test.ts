import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import OutlinerToolbar from "./OutlinerToolbar.svelte";

vi.mock("../utils/pathUtils", () => ({
    resolvePath: vi.fn((path) => `/resolved${path}`),
}));

describe("OutlinerToolbar", () => {
    test("renders desktop toolbar with expected buttons", () => {
        const onAddItem = vi.fn();
        const { getByText, getByLabelText } = render(OutlinerToolbar, {
            props: {
                mode: "desktop",
                projectName: "TestProject",
                pageName: "TestPage",
                onAddItem,
            },
        });

        const addItemBtn = getByText("Add Item");
        expect(addItemBtn).toBeTruthy();

        const addImageBtn = getByText("Add Image");
        expect(addImageBtn).toBeTruthy();

        const historyBtn = getByText("History / Diff");
        expect(historyBtn).toBeTruthy();
        expect((historyBtn as HTMLAnchorElement).href).toContain("/resolved/TestProject/TestPage/diff");
    });

    test("desktop mode 'Add Item' button calls onAddItem", async () => {
        const onAddItem = vi.fn();
        const { getByText } = render(OutlinerToolbar, {
            props: {
                mode: "desktop",
                onAddItem,
            },
        });

        const addItemBtn = getByText("Add Item");
        await fireEvent.click(addItemBtn);

        expect(onAddItem).toHaveBeenCalledTimes(1);
    });

    test("desktop mode handles 'demo' project diff link correctly", () => {
        const { getByText } = render(OutlinerToolbar, {
            props: {
                mode: "desktop",
                projectName: "demo",
                pageName: "TestPage",
            },
        });

        const historyBtn = getByText("History / Diff");
        expect((historyBtn as HTMLAnchorElement).href).toContain("/resolved/demo/TestPage/diff");
    });

    test("renders mobile toolbar with expected buttons and offset", () => {
        const { getByLabelText, getByTestId } = render(OutlinerToolbar, {
            props: {
                mode: "mobile",
                mobileToolbarBottomOffset: 42,
            },
        });

        const toolbar = getByTestId("mobile-action-toolbar");
        expect(toolbar.style.bottom).toBe("42px");

        expect(getByLabelText("Indent")).toBeTruthy();
        expect(getByLabelText("Outdent")).toBeTruthy();
        expect(getByLabelText("Insert Above")).toBeTruthy();
        expect(getByLabelText("Insert Below")).toBeTruthy();
        expect(getByLabelText("New Child")).toBeTruthy();
        expect(getByLabelText("Insert Sibling Below")).toBeTruthy();
        expect(getByLabelText("Vote")).toBeTruthy();
        expect(getByLabelText("Delete")).toBeTruthy();
    });

    test("mobile toolbar buttons call corresponding handlers", async () => {
        const handlers = {
            onIndent: vi.fn(),
            onOutdent: vi.fn(),
            onInsertAbove: vi.fn(),
            onInsertBelow: vi.fn(),
            onNewChild: vi.fn(),
            onInsertSiblingBelow: vi.fn(),
            onVote: vi.fn(),
            onDelete: vi.fn(),
        };

        const { getByLabelText } = render(OutlinerToolbar, {
            props: {
                mode: "mobile",
                ...handlers,
            },
        });

        await fireEvent.click(getByLabelText("Indent"));
        expect(handlers.onIndent).toHaveBeenCalledTimes(1);

        await fireEvent.click(getByLabelText("Outdent"));
        expect(handlers.onOutdent).toHaveBeenCalledTimes(1);

        await fireEvent.click(getByLabelText("Insert Above"));
        expect(handlers.onInsertAbove).toHaveBeenCalledTimes(1);

        await fireEvent.click(getByLabelText("Insert Below"));
        expect(handlers.onInsertBelow).toHaveBeenCalledTimes(1);

        await fireEvent.click(getByLabelText("New Child"));
        expect(handlers.onNewChild).toHaveBeenCalledTimes(1);

        await fireEvent.click(getByLabelText("Insert Sibling Below"));
        expect(handlers.onInsertSiblingBelow).toHaveBeenCalledTimes(1);

        await fireEvent.click(getByLabelText("Vote"));
        expect(handlers.onVote).toHaveBeenCalledTimes(1);

        await fireEvent.click(getByLabelText("Delete"));
        expect(handlers.onDelete).toHaveBeenCalledTimes(1);
    });

    test("file input triggers onFileSelect", async () => {
        const onFileSelect = vi.fn();
        const { container } = render(OutlinerToolbar, {
            props: {
                mode: "desktop",
                onFileSelect,
            },
        });

        const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
        expect(fileInput).toBeTruthy();

        await fireEvent.change(fileInput, { target: { files: [new File([""], "test.png", { type: "image/png" })] } });
        expect(onFileSelect).toHaveBeenCalledTimes(1);
    });
});
