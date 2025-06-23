import { render } from "@testing-library/svelte";
import * as echarts from "echarts";
import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import ChartPanel from "../components/ChartPanel.svelte";

// Mock HTMLCanvasElement.getContext for jsdom
beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
        fillRect: vi.fn(),
        clearRect: vi.fn(),
        getImageData: vi.fn(() => ({ data: new Array(4) })),
        putImageData: vi.fn(),
        createImageData: vi.fn(() => ({ data: new Array(4) })),
        setTransform: vi.fn(),
        drawImage: vi.fn(),
        save: vi.fn(),
        fillText: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        stroke: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
        rotate: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        measureText: vi.fn(() => ({ width: 0 })),
        transform: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
    });
});

describe("ChartPanel", () => {
    it("initializes echarts with option", () => {
        const option = { title: { text: "A" } };
        const { getByTestId } = render(ChartPanel, { option });
        const div = getByTestId("chart-panel");
        const chart = echarts.getInstanceByDom(div);
        expect(chart).toBeTruthy();
        expect(chart?.getOption().title[0].text).toBe("A");
    });
});
