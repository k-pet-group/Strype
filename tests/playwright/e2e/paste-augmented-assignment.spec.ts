import {test, expect, Page} from "@playwright/test";
import {enterCode, waitForEditorSettled, assertStateOfVarAssignFrame} from "../support/editor";
import {setupStrypeTest} from "../support/general";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {skipPyodide: true});
});

// Strype has no dedicated frame for augmented assignment ("a += b"), so pasting one is expanded
// into the equivalent variable-assignment frame "a = a + b" instead of failing to parse.
async function checkAugAssign(page: Page, code: string, expectedLHS: string, expectedRHS: string) : Promise<void> {
    await enterCode(page, ["", "", code + "\n"]);
    await waitForEditorSettled(page);
    await assertStateOfVarAssignFrame(page, expectedLHS, expectedRHS);
}

test.describe("Pasting augmented assignment expands to a plain assignment", () => {
    const operators : [string, string][] = [
        ["+=", "+"],
        ["-=", "-"],
        ["*=", "*"],
        ["/=", "/"],
        ["//=", "//"],
        ["%=", "%"],
        ["**=", "**"],
        ["&=", "&"],
        ["|=", "|"],
        ["^=", "^"],
        [">>=", ">>"],
        ["<<=", "<<"],
    ];
    for (const [augOp, plainOp] of operators) {
        test(`Supports pasting "a ${augOp} b"`, ({page}) => checkAugAssign(page, `a ${augOp} b`, "{a}", `{a}${plainOp}{b}`));
    }

    test("Supports a more complex (subscript) target", ({page}) => checkAugAssign(page, "a[i] += b", "{a}[{i}]{}", "{a}[{i}]{}+{b}"));
    test("Supports a more complex (attribute) target", ({page}) => checkAugAssign(page, "obj.x -= y", "{obj}.{x}", "{obj}.{x}-{y}"));
});

test.describe("Pasting augmented assignment brackets the RHS only when needed", () => {
    // A single token, a function call, or a member/method-call chain don't need brackets around
    // the RHS operand to keep the expansion's meaning unambiguous:
    test("Doesn't bracket a single-token RHS", ({page}) => checkAugAssign(page, "a += b", "{a}", "{a}+{b}"));
    test("Doesn't bracket a function-call RHS", ({page}) => checkAugAssign(page, "a += f(x)", "{a}", "{a}+{f}_({x})_{}"));
    test("Doesn't bracket a method-call RHS", ({page}) => checkAugAssign(page, "a += obj.method(x)", "{a}", "{a}+{obj}.{method}_({x})_{}"));
    test("Doesn't double-bracket an already-bracketed RHS", ({page}) => checkAugAssign(page, "a += (b + c)", "{a}", "{a}+{}_({b}+{c})_{}"));

    // Anything else with an operator of its own needs brackets, otherwise the expansion would
    // silently change the meaning of the code (e.g. "a - b + c" is not the same as "a - (b + c)"):
    test("Brackets a compound RHS under a non-associative operator", ({page}) => checkAugAssign(page, "a -= b + c", "{a}", "{a}-{}_({b}+{c})_{}"));
    test("Brackets a compound RHS under multiplication", ({page}) => checkAugAssign(page, "a *= b - c", "{a}", "{a}*{}_({b}-{c})_{}"));
    test("Brackets a unary-minus RHS", ({page}) => checkAugAssign(page, "a += -b", "{a}", "{a}+{}_({}-{b})_{}"));
});

test.describe("Pasting augmented assignment works in nested locations", () => {
    test("Works inside an if body", async ({page}) => {
        await enterCode(page, ["", "", "if True:\n    total += 1\n"]);
        await waitForEditorSettled(page);
        // The if's body frame becomes the relevant "first frame" once we descend into it, but
        // assertStateOfVarAssignFrame only ever looks at the first frame in Main, so instead just
        // check the rendered text directly for the nested augmented assignment's expansion:
        const bodyText = await page.locator("#frameContainer_-3 .frame-div").first().innerText();
        expect(bodyText.replaceAll("​", "")).toEqual("if\nTrue\n:\ntotal\n⇐\ntotal\n+\n1");
    });
});
