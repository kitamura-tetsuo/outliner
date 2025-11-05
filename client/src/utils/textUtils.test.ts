// @ts-expect-error: jsdom に型定義がありません
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getClickPosition, pixelPositionToTextPosition } from "./textUtils";

let originalGetBoundingClientRect: unknown;
let originalGetComputedStyle: unknown;

beforeAll(() => {
    // グローバルに DOM をセット
    const dom = new JSDOM("<!DOCTYPE html><body></body>");
    global.window = dom.window;
    global.document = dom.window.document;
    global.Element = dom.window.Element;
    global.HTMLElement = dom.window.HTMLElement;
    global.Node = dom.window.Node;
    // getBoundingClientRect をモック: textContent 長さ * 10px
    originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function() {
        const width = (this.textContent?.length || 0) * 10;
        return { width, left: 0, top: 0, right: width, bottom: 0, height: 0, x: 0, y: 0, toJSON() {} };
    };
    // getComputedStyle の必要プロパティをモック
    originalGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = () => ({
        fontFamily: "",
        fontSize: "",
        fontWeight: "",
        letterSpacing: "",
    });
});

afterAll(() => {
    // モック解除
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    window.getComputedStyle = originalGetComputedStyle;
});

describe("getClickPosition", () => {
    it("should return nearest index based on click x coordinate", () => {
        const content = "abcdef";
        const div = document.createElement("div");
        div.textContent = content;
        document.body.appendChild(div);

        // クリック x=25 => 10*2=20 と 10*3=30 が最接近 (差5)、先に見つかる2が返る
        const offset = getClickPosition(div, { clientX: 25, clientY: 0 } as MouseEvent, content);
        expect(offset).toBe(2);

        document.body.removeChild(div);
    });
});

describe("pixelPositionToTextPosition", () => {
    it("should map screenX to correct text offset", () => {
        const content = "ABCDEFG";
        const container = document.createElement("div");
        const span = document.createElement("span");
        span.className = "item-text";
        span.textContent = content;
        container.appendChild(span);
        document.body.appendChild(container);

        // screenX=55 => 10*5=50 と 10*6=60 の差が最小 5 => 5
        const offset = pixelPositionToTextPosition(55, container);
        expect(offset).toBe(5);

        document.body.removeChild(container);
    });
});
