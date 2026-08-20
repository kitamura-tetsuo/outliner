// A hand-rolled stand-in for the Monaco runtime, used by component tests.
//
// Running the real editor under jsdom is impractical (it needs layout, workers
// and a real font stack), and none of the logic worth testing in SqlEditor is
// about rendering: it is the value round-trip, the external-update guard and the
// disposal of editors, models and listeners. This fake exposes exactly the
// surface SqlEditor uses, plus `type()` / `blur()` hooks so a test can play the
// part of the user.
//
// It is imported through `vi.mock("../../lib/monaco/monacoLoader", ...)`, so no
// test-only code reaches the production loader.

interface Listener<T> {
    (event: T): void;
}

class FakeEmitter<T> {
    private readonly listeners = new Set<Listener<T>>();

    subscribe(listener: Listener<T>): { dispose: () => void; } {
        this.listeners.add(listener);
        return {
            dispose: () => {
                this.listeners.delete(listener);
            },
        };
    }

    fire(event: T): void {
        for (const listener of [...this.listeners]) listener(event);
    }

    get size(): number {
        return this.listeners.size;
    }
}

interface FakeEditOperation {
    range: unknown;
    text: string;
}

export class FakeTextModel {
    disposed = false;
    private text: string;
    private readonly contentChanged = new FakeEmitter<void>();

    constructor(text: string, readonly language: string) {
        this.text = text;
    }

    getValue(): string {
        return this.text;
    }

    setValue(next: string): void {
        this.replace(next);
    }

    getFullModelRange() {
        const lines = this.text.split("\n");
        return {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: lines.length,
            endColumn: (lines.at(-1)?.length ?? 0) + 1,
        };
    }

    pushEditOperations(_before: unknown, operations: FakeEditOperation[]): null {
        this.replace(operations[operations.length - 1]?.text ?? this.text);
        return null;
    }

    onDidChangeContent(listener: Listener<void>) {
        return this.contentChanged.subscribe(listener);
    }

    dispose(): void {
        this.disposed = true;
    }

    /** Test hook: behave as if the user had typed `next`. */
    type(next: string): void {
        this.replace(next);
    }

    /** Number of live content listeners, to assert they were disposed. */
    get listenerCount(): number {
        return this.contentChanged.size;
    }

    private replace(next: string): void {
        if (next === this.text) return;
        this.text = next;
        this.contentChanged.fire();
    }
}

export class FakeCodeEditor {
    disposed = false;
    private readonly blurred = new FakeEmitter<void>();
    private readonly contentSizeChanged = new FakeEmitter<{ contentHeight: number; }>();

    constructor(
        readonly container: HTMLElement,
        readonly options: Record<string, unknown>,
        readonly model: FakeTextModel,
    ) {}

    getModel(): FakeTextModel {
        return this.model;
    }

    getSelections(): null {
        return null;
    }

    focus(): void {}

    layout(): void {}

    onDidBlurEditorWidget(listener: Listener<void>) {
        return this.blurred.subscribe(listener);
    }

    onDidContentSizeChange(listener: Listener<{ contentHeight: number; }>) {
        return this.contentSizeChanged.subscribe(listener);
    }

    dispose(): void {
        this.disposed = true;
    }

    /** Test hook: move focus out of the editor widget. */
    blur(): void {
        this.blurred.fire();
    }

    /** Test hook: report a new content height. */
    reportContentHeight(contentHeight: number): void {
        this.contentSizeChanged.fire({ contentHeight });
    }
}

/** Everything the fake runtime has created since the last `reset()`. */
export const fakeMonacoRegistry = {
    models: [] as FakeTextModel[],
    editors: [] as FakeCodeEditor[],
    reset(): void {
        fakeMonacoRegistry.models = [];
        fakeMonacoRegistry.editors = [];
    },
    /** The editor created most recently; tests usually render exactly one. */
    lastEditor(): FakeCodeEditor {
        const editor = fakeMonacoRegistry.editors.at(-1);
        if (!editor) throw new Error("No fake Monaco editor has been created");
        return editor;
    },
    lastModel(): FakeTextModel {
        const model = fakeMonacoRegistry.models.at(-1);
        if (!model) throw new Error("No fake Monaco model has been created");
        return model;
    },
};

export const fakeMonaco = {
    editor: {
        createModel(value: string, language: string): FakeTextModel {
            const model = new FakeTextModel(value, language);
            fakeMonacoRegistry.models.push(model);
            return model;
        },
        create(container: HTMLElement, options: Record<string, unknown>): FakeCodeEditor {
            const editor = new FakeCodeEditor(container, options, options.model as FakeTextModel);
            fakeMonacoRegistry.editors.push(editor);
            return editor;
        },
    },
};
