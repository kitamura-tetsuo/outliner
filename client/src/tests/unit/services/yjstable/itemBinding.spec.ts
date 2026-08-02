import { describe, it, expect, vi } from "vitest";
import { getItemTableId, setItemTableId, observeItemTableId } from "../../../../services/yjstable/itemBinding";

describe("itemBinding", () => {
    describe("getItemTableId", () => {
        it("should return tableId when it exists and is a valid string", () => {
            const item = {
                tree: {
                    getNodeValueFromKey: vi.fn().mockReturnValue({
                        get: vi.fn().mockReturnValue("table123"),
                    }),
                },
                key: "item1",
            };
            expect(getItemTableId(item)).toBe("table123");
        });

        it("should return undefined when tableId is not a string", () => {
            const item = {
                tree: {
                    getNodeValueFromKey: vi.fn().mockReturnValue({
                        get: vi.fn().mockReturnValue(123),
                    }),
                },
                key: "item1",
            };
            expect(getItemTableId(item)).toBeUndefined();
        });

        it("should return undefined when tableId is an empty string", () => {
            const item = {
                tree: {
                    getNodeValueFromKey: vi.fn().mockReturnValue({
                        get: vi.fn().mockReturnValue(""),
                    }),
                },
                key: "item1",
            };
            expect(getItemTableId(item)).toBeUndefined();
        });

        it("should return undefined when nodeValue throws", () => {
            const item = {
                tree: {
                    getNodeValueFromKey: vi.fn().mockImplementation(() => {
                        throw new Error("test error");
                    }),
                },
                key: "item1",
            };
            expect(getItemTableId(item)).toBeUndefined();
        });

        it("should return undefined when get is undefined", () => {
             const item = {
                tree: {
                    getNodeValueFromKey: vi.fn().mockReturnValue({}),
                },
                key: "item1",
            };
            expect(getItemTableId(item)).toBeUndefined();
        });
    });

    describe("setItemTableId", () => {
        it("should set tableId when set function is available", () => {
            const setMock = vi.fn();
            const item = {
                tree: {
                    getNodeValueFromKey: vi.fn().mockReturnValue({
                        set: setMock,
                    }),
                },
                key: "item1",
            };
            setItemTableId(item, "table123");
            expect(setMock).toHaveBeenCalledWith("yjsTableId", "table123");
        });

        it("should do nothing when set function is not available", () => {
            const item = {
                tree: {
                    getNodeValueFromKey: vi.fn().mockReturnValue({}),
                },
                key: "item1",
            };
            expect(() => setItemTableId(item, "table123")).not.toThrow();
        });

        it("should do nothing when nodeValue throws", () => {
            const item = {
                tree: {
                    getNodeValueFromKey: vi.fn().mockImplementation(() => {
                        throw new Error("test error");
                    }),
                },
                key: "item1",
            };
            expect(() => setItemTableId(item, "table123")).not.toThrow();
        });
    });

    describe("observeItemTableId", () => {
        it("should call onChange when keysChanged is not provided", () => {
            const observeMock = vi.fn((handler) => handler({}));
            const unobserveMock = vi.fn();
            const item = {
                tree: {
                    getNodeValueFromKey: vi.fn().mockReturnValue({
                        observe: observeMock,
                        unobserve: unobserveMock,
                    }),
                },
                key: "item1",
            };
            const onChangeMock = vi.fn();
            observeItemTableId(item, onChangeMock);
            expect(onChangeMock).toHaveBeenCalled();
        });

        it("should call onChange when keysChanged contains yjsTableId", () => {
             const keysChanged = new Set(["yjsTableId"]);
             const observeMock = vi.fn((handler) => handler({ keysChanged }));
             const unobserveMock = vi.fn();
             const item = {
                 tree: {
                     getNodeValueFromKey: vi.fn().mockReturnValue({
                         observe: observeMock,
                         unobserve: unobserveMock,
                     }),
                 },
                 key: "item1",
             };
             const onChangeMock = vi.fn();
             observeItemTableId(item, onChangeMock);
             expect(onChangeMock).toHaveBeenCalled();
         });

        it("should not call onChange when keysChanged does not contain yjsTableId", () => {
             const keysChanged = new Set(["otherField"]);
             const observeMock = vi.fn((handler) => handler({ keysChanged }));
             const unobserveMock = vi.fn();
             const item = {
                 tree: {
                     getNodeValueFromKey: vi.fn().mockReturnValue({
                         observe: observeMock,
                         unobserve: unobserveMock,
                     }),
                 },
                 key: "item1",
             };
             const onChangeMock = vi.fn();
             observeItemTableId(item, onChangeMock);
             expect(onChangeMock).not.toHaveBeenCalled();
         });

         it("should return a function that calls unobserve", () => {
             const observeMock = vi.fn();
             const unobserveMock = vi.fn();
             const item = {
                 tree: {
                     getNodeValueFromKey: vi.fn().mockReturnValue({
                         observe: observeMock,
                         unobserve: unobserveMock,
                     }),
                 },
                 key: "item1",
             };
             const onChangeMock = vi.fn();
             const unsubscribe = observeItemTableId(item, onChangeMock);
             unsubscribe();
             expect(unobserveMock).toHaveBeenCalled();
         });

         it("should return an empty function if observe or unobserve is not available", () => {
              const item = {
                 tree: {
                     getNodeValueFromKey: vi.fn().mockReturnValue({}),
                 },
                 key: "item1",
             };
             const onChangeMock = vi.fn();
             const unsubscribe = observeItemTableId(item, onChangeMock);
             expect(() => unsubscribe()).not.toThrow();
         });

         it("should return an empty function if nodeValue throws", () => {
            const item = {
                tree: {
                    getNodeValueFromKey: vi.fn().mockImplementation(() => {
                        throw new Error("test error");
                    }),
                },
                key: "item1",
            };
            const onChangeMock = vi.fn();
            const unsubscribe = observeItemTableId(item, onChangeMock);
            expect(() => unsubscribe()).not.toThrow();
        });
    });
});
