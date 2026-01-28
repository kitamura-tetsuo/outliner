import { beforeAll, describe, expect, it } from "vitest";
import { ScrapboxFormatter } from "./ScrapboxFormatter";

describe("ScrapboxFormatter", () => {
    beforeAll(() => {
        // Mock localStorage for test environment detection
        // This ensures getProjectPrefix() returns "/Untitled%20Project"
        if (typeof window !== "undefined") {
            Object.defineProperty(window, "localStorage", {
                value: {
                    getItem: (key: string) => {
                        if (key === "VITE_IS_TEST") return "true";
                        return null;
                    },
                    setItem: () => {},
                    removeItem: () => {},
                    clear: () => {},
                },
                writable: true,
            });
        }
    });

    describe("bold", () => {
        it("should format text as bold", () => {
            expect(ScrapboxFormatter.bold("text")).toBe("[[text]]");
        });

        it("should remove bold formatting if already bold", () => {
            expect(ScrapboxFormatter.bold("[[text]]")).toBe("text");
        });
    });

    describe("italic", () => {
        it("should format text as italic with space", () => {
            expect(ScrapboxFormatter.italic("text")).toBe("[/ text]");
        });

        it("should remove italic formatting if already italic", () => {
            expect(ScrapboxFormatter.italic("[/ text]")).toBe("text");
        });
    });

    describe("strikethrough", () => {
        it("should format text with strikethrough", () => {
            expect(ScrapboxFormatter.strikethrough("text")).toBe("[-text]");
        });

        it("should remove strikethrough formatting if already strikethrough", () => {
            expect(ScrapboxFormatter.strikethrough("[-text]")).toBe("text");
        });
    });

    describe("code", () => {
        it("should format text as code", () => {
            expect(ScrapboxFormatter.code("text")).toBe("`text`");
        });

        it("should remove code formatting if already code", () => {
            expect(ScrapboxFormatter.code("`text`")).toBe("text");
        });
    });

    describe("underline", () => {
        it("should format text as underline", () => {
            expect(ScrapboxFormatter.underline("text")).toBe("<u>text</u>");
        });

        it("should remove underline formatting if already underlined", () => {
            expect(ScrapboxFormatter.underline("<u>text</u>")).toBe("text");
        });
    });

    describe("getFormatType", () => {
        it("should detect bold format", () => {
            expect(ScrapboxFormatter.getFormatType("[[text]]")).toBe("bold");
        });

        it("should detect italic format", () => {
            expect(ScrapboxFormatter.getFormatType("[/ text]")).toBe("italic");
        });

        it("should detect strikethrough format", () => {
            expect(ScrapboxFormatter.getFormatType("[-text]")).toBe("strikethrough");
        });

        it("should detect code format", () => {
            expect(ScrapboxFormatter.getFormatType("`text`")).toBe("code");
        });

        it("should detect underline format", () => {
            expect(ScrapboxFormatter.getFormatType("<u>text</u>")).toBe("underline");
        });

        it("should return null for unformatted text", () => {
            expect(ScrapboxFormatter.getFormatType("text")).toBe(null);
        });
    });

    describe("formatToHtml", () => {
        describe("internal links", () => {
            it("should generate correct HTML for internal links", () => {
                const input = "[test-page]";
                const result = ScrapboxFormatter.formatToHtml(input);

                // Verify that the HTML for internal links is generated correctly
                // Test environment initializes project title as "Untitled Project" via store.svelte.ts
                expect(result).toMatch(
                    /<a href="\/Untitled%20Project\/test-page"[^>]*class="[^"]*internal-link[^"]*"[^>]*>test-page<\/a>/,
                );
                expect(result).toContain('data-page="test-page"');
                expect(result).toContain('class="link-preview-wrapper"');
            });

            it("should generate correct HTML for internal links with hyphens", () => {
                const input = "[test-page-name]";
                const result = ScrapboxFormatter.formatToHtml(input);

                expect(result).toMatch(
                    /<a href="\/Untitled%20Project\/test-page-name"[^>]*class="[^"]*internal-link[^"]*"[^>]*>test-page-name<\/a>/,
                );
                expect(result).toContain('data-page="test-page-name"');
            });

            it("should generate correct HTML for project internal links", () => {
                const input = "[/project-name/page-name]";
                const result = ScrapboxFormatter.formatToHtml(input);

                // Verify that the HTML for project internal links is generated correctly
                expect(result).toMatch(
                    /<a href="\/project-name\/page-name"[^>]*class="[^"]*internal-link[^"]*project-link[^"]*"[^>]*>project-name\/page-name<\/a>/,
                );
                expect(result).toContain('data-project="project-name"');
                expect(result).toContain('data-page="page-name"');
                expect(result).toContain('class="link-preview-wrapper"');
            });

            it("should generate correct HTML for nested project internal links", () => {
                const input = "[/project-name/sub-folder/page-name]";
                const result = ScrapboxFormatter.formatToHtml(input);

                expect(result).toMatch(
                    /<a href="\/project-name\/sub-folder\/page-name"[^>]*class="[^"]*internal-link[^"]*project-link[^"]*"[^>]*>project-name\/sub-folder\/page-name<\/a>/,
                );
                expect(result).toContain('data-project="project-name"');
                expect(result).toContain('data-page="sub-folder/page-name"');
            });

            it("should handle multiple internal links in one text", () => {
                const input = "This is [test-page] and [/project/other-page]";
                const result = ScrapboxFormatter.formatToHtml(input);

                // Verify that both links are generated correctly
                expect(result).toMatch(
                    /<a href="\/Untitled%20Project\/test-page"[^>]*class="[^"]*internal-link[^"]*"[^>]*>test-page<\/a>/,
                );
                expect(result).toMatch(
                    /<a href="\/project\/other-page"[^>]*class="[^"]*internal-link[^"]*project-link[^"]*"[^>]*>project\/other-page<\/a>/,
                );
            });
        });

        describe("external links", () => {
            it("should render URL when no label is provided", () => {
                const input = "[https://example.com]";
                const result = ScrapboxFormatter.formatToHtml(input);

                expect(result).toContain(
                    '<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>',
                );
            });

            it("should display label text for bracketed URL with label", () => {
                const input = "[https://example.com Example Site]";
                const result = ScrapboxFormatter.formatToHtml(input);

                expect(result).toContain(
                    '<a href="https://example.com" target="_blank" rel="noopener noreferrer">Example Site</a>',
                );
                expect(result).not.toContain(
                    '<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>',
                );
            });

            it("should preserve label text with extra spaces", () => {
                const input = "[https://example.com     Label With Multiple Spaces]";
                const result = ScrapboxFormatter.formatToHtml(input);

                expect(result).toContain(
                    '<a href="https://example.com" target="_blank" rel="noopener noreferrer">Label With Multiple Spaces</a>',
                );
            });

            it("should fall back to URL when label is only whitespace", () => {
                const input = "[https://example.com ]";
                const result = ScrapboxFormatter.formatToHtml(input);

                expect(result).toContain(
                    '<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>',
                );
            });
        });

        describe("formatting combinations", () => {
            it("should handle bold text with internal links", () => {
                const input = "[[bold text with [internal-link]]]";
                const result = ScrapboxFormatter.formatToHtml(input);

                console.log("Bold with internal link result:", result);

                expect(result).toContain("<strong>");
                // Since the HTML structure becomes complex when there is an internal link inside bold text,
                // use more flexible matching
                expect(result).toContain('href="/Untitled%20Project/internal-link');
                expect(result).toContain('class="internal-link');
                expect(result).toContain(">internal-link");
            });

            it("should distinguish between italic and project internal links", () => {
                const input = "[/ italic] and [/project/page]";
                const result = ScrapboxFormatter.formatToHtml(input);

                // Processed as italic (with space)
                expect(result).toContain("<em>italic</em>");
                // Processed as project internal link (without space)
                expect(result).toMatch(
                    /<a href="\/project\/page"[^>]*class="[^"]*internal-link[^"]*project-link[^"]*"[^>]*>project\/page<\/a>/,
                );
            });

            it("should handle underline formatting", () => {
                const input = "<u>underlined text</u>";
                const result = ScrapboxFormatter.formatToHtml(input);

                expect(result).toContain("<u>underlined text</u>");
            });

            it("should handle bold with italic combination", () => {
                const input = "This is [[bold and [/ italic] combination]].";
                const result = ScrapboxFormatter.formatToHtml(input);

                console.log("Bold with italic result:", result);

                // Verify that the combination of bold and italic is processed correctly
                expect(result).toContain("<strong>");
                expect(result).toContain("bold and");
                expect(result).toContain("<em>");
                expect(result).toContain("italic");
                expect(result).toContain("</em>");
                expect(result).toContain(" combination");
                expect(result).toContain("</strong>");
                // Verify that it is not recognized as an internal link
                expect(result).not.toContain('class="internal-link');
            });
        });
    });

    describe("tokenize", () => {
        it("should correctly tokenize internal links", () => {
            const input = "[test-page]";
            const tokens = ScrapboxFormatter.tokenize(input);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].type).toBe("internalLink");
            expect(tokens[0].content).toBe("test-page");
        });

        it("should correctly tokenize project internal links", () => {
            const input = "[/project-name/page-name]";
            const tokens = ScrapboxFormatter.tokenize(input);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].type).toBe("internalLink");
            expect(tokens[0].content).toBe("project-name/page-name");
        });

        it("should distinguish between italic and project internal links", () => {
            const input = "[/ italic] [/project/page]";
            const tokens = ScrapboxFormatter.tokenize(input);

            expect(tokens).toHaveLength(3); // italic, space, project link
            expect(tokens[0].type).toBe("italic");
            expect(tokens[0].content).toBe("italic");
            expect(tokens[2].type).toBe("internalLink");
            expect(tokens[2].content).toBe("project/page");
        });

        it("should tokenize external links with labels", () => {
            const input = "[https://example.com Example Site]";
            const tokens = ScrapboxFormatter.tokenize(input);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].type).toBe("link");
            expect(tokens[0].content).toBe("Example Site");
            expect(tokens[0].url).toBe("https://example.com");
        });

        it("should tokenize external links with multiple spaces before label", () => {
            const input = "[https://example.com     Label With Multiple Spaces]";
            const tokens = ScrapboxFormatter.tokenize(input);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].type).toBe("link");
            expect(tokens[0].content).toBe("Label With Multiple Spaces");
            expect(tokens[0].url).toBe("https://example.com");
        });

        it("should tokenize external links with whitespace-only label as URL", () => {
            const input = "[https://example.com ]";
            const tokens = ScrapboxFormatter.tokenize(input);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].type).toBe("link");
            expect(tokens[0].content).toBe("https://example.com");
            expect(tokens[0].url).toBe("https://example.com");
        });

        it("should tokenize external links without label as URL", () => {
            const input = "[https://example.com]";
            const tokens = ScrapboxFormatter.tokenize(input);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].type).toBe("link");
            expect(tokens[0].content).toBe("https://example.com");
            expect(tokens[0].url).toBe("https://example.com");
        });
    });

    describe("hasFormatting", () => {
        it("should detect internal link formatting", () => {
            expect(ScrapboxFormatter.hasFormatting("[test-page]")).toBe(true);
        });

        it("should detect project internal link formatting", () => {
            expect(ScrapboxFormatter.hasFormatting("[/project/page]")).toBe(true);
        });

        it("should return false for plain text", () => {
            expect(ScrapboxFormatter.hasFormatting("plain text")).toBe(false);
        });
    });
});
