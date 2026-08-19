import { test, expect } from "@playwright/test";
import { preprocessBeforeParse } from "@/helpers/pythonToFramesPreprocess";

// NOTE: this is really a *unit* test for the pure preprocessBeforeParse() function (see
// src/helpers/pythonToFramesPreprocess.ts) -- none of it touches a browser page, the DOM, or the
// live app. It's written as a Playwright spec purely to reuse the test infrastructure already in
// this repo (it runs alongside the rest of the Playwright suite with `npm run test:playwright`),
// rather than pulling in a second test framework (e.g. Vitest) just for one module -- see
// operator-precedence-calculation.spec.ts in this same directory for the established precedent.

test.describe("preprocessBeforeParse", () => {
    test("leaves ordinary code untouched", () => {
        const result = preprocessBeforeParse(["x = 1", "y = 2"]);
        expect(result.source).toBe("x = 1\ny = 2");
        expect(result.disabledLines).toEqual([]);
    });

    test("strips the Disabled: prefix and records the line number", () => {
        // Matches the real format written by parser.ts (indentation + "#(=> Disabled:" + code,
        // no separating space):
        const result = preprocessBeforeParse(["x = 1", "#(=> Disabled:y = 2", "z = 3"]);
        expect(result.source).toBe("x = 1\ny = 2\nz = 3");
        expect(result.disabledLines).toEqual([2]);
    });

    test("preserves indentation on a disabled line", () => {
        const result = preprocessBeforeParse(["if x:", "    #(=> Disabled:y = 2"]);
        expect(result.source).toBe("if x:\n    y = 2");
        expect(result.disabledLines).toEqual([2]);
    });

    test("leaves Library/LibraryDisabled/FrameState directive comments as plain comments", () => {
        const result = preprocessBeforeParse(["#(=> Library: foo", "x = 1"]);
        expect(result.source).toBe("#(=> Library: foo\nx = 1");
        expect(result.disabledLines).toEqual([]);
    });

    test("handles multiple disabled lines", () => {
        const result = preprocessBeforeParse([
            "#(=> Disabled:a = 1",
            "b = 2",
            "#(=> Disabled:c = 3",
        ]);
        expect(result.source).toBe("a = 1\nb = 2\nc = 3");
        expect(result.disabledLines).toEqual([1, 3]);
    });
});
