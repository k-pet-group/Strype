import { test, expect } from "@playwright/test";
import { decodeFieldPlaceholders, escapeForFieldPlaceholder, FIELD_PLACEHOLDER_END, FIELD_PLACEHOLDER_START } from "@/helpers/pythonSlotsShared";

// NOTE: like operator-precedence-calculation.spec.ts, this is really a unit test (no browser involved).
//
// Regression test for a performance bug: parseCodeLiteral() (src/helpers/editor.ts) wraps the code before and
// inside each bracket in a field placeholder.  For sibling brackets, e.g. the tuples in
// "[(1,2),(3,4),...]", the "code before" already contains the previous bracket's placeholder, and it used to be
// escaped again, multiplying the length by 5 each time: with ~9 siblings, loading a project took several seconds.
//
// This deliberately checks the *size* of the result rather than the elapsed time, so that it is
// deterministic and can't be made flaky by a slow CI machine.

// Mimics how parseCodeLiteral() nests the placeholders for a series of sibling "(...)" brackets
// (each one's "code before" is the previous placeholder plus a comma), returning the last placeholder:
function nestedPlaceholder(siblingCount: number) : string {
    let placeholder = "";
    for (let i = 0; i < siblingCount; i++) {
        const before = (i == 0) ? "" : placeholder + ",";
        placeholder = FIELD_PLACEHOLDER_START + escapeForFieldPlaceholder(before + "(" + i + ")") + FIELD_PLACEHOLDER_END;
    }
    return placeholder;
}

test.describe("field placeholder escaping", () => {
    test("nested placeholders round-trip to the original code", async () => {
        expect(decodeFieldPlaceholders(nestedPlaceholder(1))).toEqual("(0)");
        expect(decodeFieldPlaceholders(nestedPlaceholder(3))).toEqual("(0),(1),(2)");
        expect(decodeFieldPlaceholders("x + " + nestedPlaceholder(2) + " - y")).toEqual("x + (0),(1) - y");
    });

    test("code containing non-ASCII characters round-trips", async () => {
        const placeholder = FIELD_PLACEHOLDER_START + escapeForFieldPlaceholder("(\"é😀\")") + FIELD_PLACEHOLDER_END;
        expect(decodeFieldPlaceholders(placeholder)).toEqual("(\"é😀\")");
    });

    test("size of nested placeholders grows linearly, not exponentially", async () => {
        // Each sibling adds about "(i)," = 4 chars, escaped at 5 chars each = ~20 chars.  The old behaviour
        // gave over a million characters for just 8 siblings.
        const placeholder = nestedPlaceholder(8);
        expect(placeholder.length).toBeLessThan(8 * 50);
        expect(decodeFieldPlaceholders(placeholder)).toEqual(Array.from({length: 8}, (_, i) => "(" + i + ")").join(","));
    });
});
