import {Page, test, expect} from "@playwright/test";
import {waitForEditorSettled, typeIndividually, doPagePaste, doTextHomeEndKeyPress, enterCode, pressN} from "../support/editor";
import {loadContent} from "../support/loading-saving";
import {setupStrypeTest} from "../support/general";

// Tests for precedence-driven operator spacing (see src/helpers/operatorPrecedence.ts):
// operators are given a CSS "tier" class (dot/comma/equals/colon/high/medium/low, or
// keyword-high/keyword-medium/keyword-low for word-shaped operators) based on their
// relative precedence within one bracketed/top-level expression, plus a separate "unary
// prefix" marker (not/~/lambda) that suppresses their leading margin.
//
// Rather than asserting on final downloaded/exported text (which never contains the tier
// classes -- those are DOM/CSS only, see the "non-DOM tests pin behavior" note in the
// project's own conventions), these tests read the live DOM directly: each operator span
// carries the tier as a CSS class (see LabelSlot.vue's getSpanTypeClass()), which we read
// back via window.StrypeSCSSVarsGlobals (the same mechanism tests/playwright/support/editor.ts
// uses for its own DOM assertions).
//
// Expected tiers for every static expression case below were verified against the real
// calculatePrecedenceTiers() function (see tests/unit/operatorPrecedence.test.ts for the
// same cases as pure-function unit tests) rather than hand-traced, to avoid transcription
// errors -- this file re-verifies them end to end through the actual DOM instead.

interface OpTierInfo {
    code: string;
    tier: string;
    isUnaryPrefix: boolean;
}

function op(code: string, tier: string, isUnaryPrefix = false): OpTierInfo {
    return {code, tier, isUnaryPrefix};
}

// Reads every rendered operator span within the given frame's header (in the main code
// section) and returns its code, precedence tier, and whether it carries the unary-prefix
// "no leading margin" marker. DOM order matches visual/left-to-right order.
async function getOperatorTierInfo(page: Page, frameIndex = 0): Promise<OpTierInfo[]> {
    const scssVars: Record<string, string> = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
    const tierClassToName: Record<string, string> = {
        [scssVars.opTierDotClassName]: "dot",
        [scssVars.opTierCommaClassName]: "comma",
        [scssVars.opTierEqualsClassName]: "equals",
        [scssVars.opTierColonClassName]: "colon",
        [scssVars.opTierKeywordHighClassName]: "keyword-high",
        [scssVars.opTierKeywordMediumClassName]: "keyword-medium",
        [scssVars.opTierKeywordLowClassName]: "keyword-low",
        [scssVars.opTierHighClassName]: "high",
        [scssVars.opTierMediumClassName]: "medium",
        [scssVars.opTierLowClassName]: "low",
    };
    const header = page.locator("#frameContainer_-3 ." + scssVars.frameHeaderClassName).nth(frameIndex);
    return header.locator("." + scssVars.frameOperatorSlotClassName).evaluateAll((spans, data) => {
        return spans.map((el) => {
            const classes = Array.from(el.classList);
            const tierClassName = classes.find((c) => c in data.tierClassToName);
            return {
                code: (el.textContent ?? "").replace(/​/g, ""),
                tier: tierClassName ? data.tierClassToName[tierClassName] : "<none>",
                isUnaryPrefix: classes.includes(data.unaryPrefixClassName),
            };
        });
    }, {tierClassToName, unaryPrefixClassName: scssVars.opUnaryPrefixClassName});
}

// A minimal, self-contained .spy project file (see tests/cypress/fixtures/*.spy for the
// established format) with a single statement in the Main section.
function spyWithMainLine(line: string): string {
    return `#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
${line}
#(=> Section:End
`;
}

async function startVarAssign(page: Page, rhs: string): Promise<void> {
    // The leading space is required: on the fresh default project, the frame cursor is
    // active (not a text cursor), and a bare letter like "r" gets consumed as a frame-creation
    // shortcut key (e.g. "r" for a return frame) instead of being typed as literal text. A
    // leading space is itself the shortcut for a blank function-call frame, which is what
    // gives us an actual text cursor to type "r=<rhs>" into -- exactly the pattern used
    // throughout structured-expressions.spec.ts (e.g. its "Have \"a=\"" test types " a=").
    await typeIndividually(page, ` r=${rhs}`);
}

async function selectAllInSlot(page: Page): Promise<void> {
    await doTextHomeEndKeyPress(page, false, false); // Home
    await doTextHomeEndKeyPress(page, true, true); // Shift+End, extends the selection across the whole slot
}

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {skipPyodide: true, timeoutMs: 60000});
});

// Reused by both "loading a file" and "pasting at the frame cursor" below, so both entry
// points are proven to reach the exact same tiering result via two different code paths
// (native .spy deserialisation vs. the paste-import AST walker in pythonToFrames.ts).
const EXPRESSION_CASES: [string, string, OpTierInfo[]][] = [
    ["a+b+c (homogeneous chain -> neutral medium)", "a+b+c", [op("+", "medium"), op("+", "medium")]],
    ["a<b<c (chained comparison -> neutral medium)", "a<b<c", [op("<", "medium"), op("<", "medium")]],
    ["a+b*c (mixed: '*' pulled tight)", "a+b*c", [op("+", "medium"), op("*", "high")]],
    ["a+b+c or d (mixed by 'or': '+' pulled tight)", "a+b+c or d", [op("+", "high"), op("+", "high"), op("or", "keyword-medium")]],
    ["a**b**c (homogeneous ** chain)", "a**b**c", [op("**", "medium"), op("**", "medium")]],
    ["a and b or c (two distinct keyword tiers)", "a and b or c", [op("and", "keyword-high"), op("or", "keyword-medium")]],
    ["a|b^c&d (three distinct bitwise tiers)", "a|b^c&d", [op("|", "low"), op("^", "medium"), op("&", "high")]],
    ["a not in b and c or d (three distinct keyword tiers)", "a not in b and c or d", [op("not in", "keyword-high"), op("and", "keyword-medium"), op("or", "keyword-low")]],
    ["a in nums and b not in nums (mixed keyword precedences)", "a in nums and b not in nums", [op("in", "keyword-high"), op("and", "keyword-medium"), op("not in", "keyword-high")]],
    ["not a (unary keyword, no leading margin)", "not a", [op("not", "keyword-medium", true)]],
    ["~a (unary symbol, no leading margin)", "~a", [op("~", "medium", true)]],
    ["a,b,c (tuple, comma tier)", "a,b,c", [op(",", "comma"), op(",", "comma")]],
    ["f(a,b=c+d) (comma + kwarg '=' + mixed '+')", "f(a,b=c+d)", [op(",", "comma"), op("=", "equals"), op("+", "medium")]],
    ["a if b>c else d (ternary)", "a if b>c else d", [op("if", "keyword-medium"), op(">", "medium"), op("else", "keyword-medium")]],
    ["[x for x in nums if x>2] (comprehension)", "[x for x in nums if x>2]", [op("for", "keyword-medium"), op("in", "keyword-medium"), op("if", "keyword-medium"), op(">", "medium")]],
    // The '-' here sits right after the colon with nothing before it, so it's a detected
    // unary sign (see storeMethods.ts's isUnarySignAt) -- same "medium"-equivalent tier as
    // an ordinary solo binary '-' would get, but with the leading margin suppressed:
    ["lambda n: -n (pass-through lambda, unary '-' after colon)", "lambda n: -n", [op("lambda", "keyword-medium", true), op(":", "colon"), op("-", "medium", true)]],
    ["-a (detected unary minus, no leading margin)", "-a", [op("-", "medium", true)]],
    // Once '-' is pulled to 'high' by mixing with a tighter/looser sibling, "high" already
    // has zero margin on both sides -- no separate unary-prefix marker is needed or applied
    // (see LabelSlot.vue: the marker is only set when the tier is exactly "sign-medium"):
    ["-a+b (unary '-' binds tighter than binary '+', pulled to 'high')", "-a+b", [op("-", "high"), op("+", "medium")]],
    ["-a*b (unary '-' still tighter than '*', pulled to 'high')", "-a*b", [op("-", "high"), op("*", "medium")]],
    ["-a**b (unary '-' looser than '**', matches Python's -a**b == -(a**b))", "-a**b", [op("-", "medium", true), op("**", "high")]],
    ["+a-b*c (unary '+' tight -> 'high' with no marker needed; binary '-' unaffected)", "+a-b*c", [op("+", "high"), op("-", "medium"), op("*", "high")]],
    ["a+b*c**d (all three real tiers at once)", "a+b*c**d", [op("+", "low"), op("*", "medium"), op("**", "high")]],
];

test.describe("Loading a file", () => {
    for (const [label, expr, expected] of EXPRESSION_CASES) {
        test(`Loaded file tiers operators correctly: ${label}`, async ({page}) => {
            await loadContent(page, spyWithMainLine(`r = ${expr}`));
            await waitForEditorSettled(page);
            expect(await getOperatorTierInfo(page)).toEqual(expected);
        });
    }
});

test.describe("Pasting content at the frame cursor", () => {
    for (const [label, expr, expected] of EXPRESSION_CASES) {
        test(`Pasted content tiers operators correctly: ${label}`, async ({page}) => {
            await enterCode(page, ["", "", `r = ${expr}`]);
            await waitForEditorSettled(page);
            expect(await getOperatorTierInfo(page)).toEqual(expected);
        });
    }
});

test.describe("Editing an expression changes tiers dynamically", () => {
    test("a+b+c tightens once '*d' is appended, and reverts on backspace", async ({page}) => {
        await startVarAssign(page, "a+b+c");
        await waitForEditorSettled(page);
        expect(await getOperatorTierInfo(page)).toEqual([op("+", "medium"), op("+", "medium")]);

        await typeIndividually(page, "*d");
        expect(await getOperatorTierInfo(page)).toEqual([op("+", "medium"), op("+", "medium"), op("*", "high")]);

        await page.keyboard.press("Backspace");
        await waitForEditorSettled(page);
        await page.keyboard.press("Backspace");
        await waitForEditorSettled(page);
        expect(await getOperatorTierInfo(page)).toEqual([op("+", "medium"), op("+", "medium")]);
    });

    test("a+b+c keeps the same tiers when wrapped in brackets, and reverts when unwrapped", async ({page}) => {
        await startVarAssign(page, "a+b+c");
        await waitForEditorSettled(page);
        expect(await getOperatorTierInfo(page)).toEqual([op("+", "medium"), op("+", "medium")]);

        await selectAllInSlot(page);
        await doPagePaste(page, "(a+b+c)");
        expect(await getOperatorTierInfo(page)).toEqual([op("+", "medium"), op("+", "medium")]);

        await selectAllInSlot(page);
        await doPagePaste(page, "a+b+c");
        expect(await getOperatorTierInfo(page)).toEqual([op("+", "medium"), op("+", "medium")]);
    });

    test("a+b+c loosens all the way to 'high' when ' or d' is appended, and reverts on backspace", async ({page}) => {
        await startVarAssign(page, "a+b+c");
        await waitForEditorSettled(page);
        expect(await getOperatorTierInfo(page)).toEqual([op("+", "medium"), op("+", "medium")]);

        await typeIndividually(page, " or d");
        expect(await getOperatorTierInfo(page)).toEqual([op("+", "high"), op("+", "high"), op("or", "keyword-medium")]);

        // Operators are stored without their literal surrounding spaces, so the number of
        // backspaces needed to undo typing a keyword operator doesn't equal the typed
        // character count -- select-and-replace instead of guessing a backspace count:
        await selectAllInSlot(page);
        await doPagePaste(page, "a+b+c");
        expect(await getOperatorTierInfo(page)).toEqual([op("+", "medium"), op("+", "medium")]);
    });

    test("a*b tightens to 'high' once '+c' is appended, and reverts on backspace", async ({page}) => {
        await startVarAssign(page, "a*b");
        await waitForEditorSettled(page);
        expect(await getOperatorTierInfo(page)).toEqual([op("*", "medium")]);

        await typeIndividually(page, "+c");
        expect(await getOperatorTierInfo(page)).toEqual([op("*", "high"), op("+", "medium")]);

        await pressN("Backspace", 2, true)(page);
        expect(await getOperatorTierInfo(page)).toEqual([op("*", "medium")]);
    });

    test("(a+b)*(c+d): outer '*' is 'medium' alone, pulled to 'high' once '+e' mixes the outer level", async ({page}) => {
        await startVarAssign(page, "(a+b)*(c+d)");
        await waitForEditorSettled(page);
        // DOM order: inner-left '+', outer '*', inner-right '+'. The outer level has only
        // one real operator ('*'), so it's neutral/solo -- "medium", same as the inner chains:
        expect(await getOperatorTierInfo(page)).toEqual([op("+", "medium"), op("*", "medium"), op("+", "medium")]);

        await typeIndividually(page, "+e");
        // Now the outer level has two real operators ('*' and '+') at different precedences,
        // so it's genuinely mixed: '*' is pulled tight to "high", the new '+' lands at "medium".
        // The inner brackets are completely unaffected either way (per-level scoping):
        expect(await getOperatorTierInfo(page)).toEqual([op("+", "medium"), op("*", "high"), op("+", "medium"), op("+", "medium")]);

        // And removing the "+e" suffix again reverts the outer level back to solo/neutral:
        await pressN("Backspace", 2, true)(page);
        expect(await getOperatorTierInfo(page)).toEqual([op("+", "medium"), op("*", "medium"), op("+", "medium")]);
    });

    test("a+b*c keeps its mixed tiers when wrapped in brackets, and reverts when unwrapped", async ({page}) => {
        await startVarAssign(page, "a+b*c");
        await waitForEditorSettled(page);
        expect(await getOperatorTierInfo(page)).toEqual([op("+", "medium"), op("*", "high")]);

        await selectAllInSlot(page);
        await doPagePaste(page, "(a+b*c)");
        expect(await getOperatorTierInfo(page)).toEqual([op("+", "medium"), op("*", "high")]);

        await selectAllInSlot(page);
        await doPagePaste(page, "a+b*c");
        expect(await getOperatorTierInfo(page)).toEqual([op("+", "medium"), op("*", "high")]);
    });

    test("typing a|b^c&d incrementally settles on three distinct tiers", async ({page}) => {
        await startVarAssign(page, "a|b^c&d");
        await waitForEditorSettled(page);
        expect(await getOperatorTierInfo(page)).toEqual([op("|", "low"), op("^", "medium"), op("&", "high")]);
    });

    test("typing a+b*c**d incrementally settles on all three real tiers", async ({page}) => {
        await startVarAssign(page, "a+b*c**d");
        await waitForEditorSettled(page);
        expect(await getOperatorTierInfo(page)).toEqual([op("+", "low"), op("*", "medium"), op("**", "high")]);
    });

    test("typing 'not a' gives 'not' the neutral keyword tier with no leading margin", async ({page}) => {
        await startVarAssign(page, "not a");
        await waitForEditorSettled(page);
        expect(await getOperatorTierInfo(page)).toEqual([op("not", "keyword-medium", true)]);
    });

    test("typing '~a' gives '~' the neutral tier with no leading margin", async ({page}) => {
        await startVarAssign(page, "~a");
        await waitForEditorSettled(page);
        expect(await getOperatorTierInfo(page)).toEqual([op("~", "medium", true)]);
    });

    test("typing 'lambda n: -n' gives 'lambda' the neutral keyword tier with no leading margin", async ({page}) => {
        await startVarAssign(page, "lambda n:-n");
        await waitForEditorSettled(page);
        // The '-' immediately after the colon has a blank field before it, so it's a
        // detected unary sign too -- same "medium"-equivalent tier, also no leading margin:
        expect(await getOperatorTierInfo(page)).toEqual([op("lambda", "keyword-medium", true), op(":", "colon"), op("-", "medium", true)]);
    });

    test("a long homogeneous chain stays 'medium' throughout as it's typed and then shrunk by backspacing", async ({page}) => {
        await startVarAssign(page, "a+b+c+d+e");
        await waitForEditorSettled(page);
        let tiers = await getOperatorTierInfo(page);
        expect(tiers.length).toBe(4);
        expect(tiers.every((t) => t.tier === "medium")).toBe(true);

        // Backspace off "+d+e" (4 characters), leaving "a+b+c":
        await pressN("Backspace", 4, true)(page);
        tiers = await getOperatorTierInfo(page);
        expect(tiers).toEqual([op("+", "medium"), op("+", "medium")]);

        // Backspace off "+c", leaving a single solo operator "a+b":
        await pressN("Backspace", 2, true)(page);
        expect(await getOperatorTierInfo(page)).toEqual([op("+", "medium")]);
    });

    test("a comma-separated list stays on the 'comma' tier throughout as it grows and shrinks", async ({page}) => {
        await startVarAssign(page, "a,b,c");
        await waitForEditorSettled(page);
        expect(await getOperatorTierInfo(page)).toEqual([op(",", "comma"), op(",", "comma")]);

        await pressN("Backspace", 2, true)(page);
        expect(await getOperatorTierInfo(page)).toEqual([op(",", "comma")]);

        await typeIndividually(page, ",c,d");
        expect(await getOperatorTierInfo(page)).toEqual([op(",", "comma"), op(",", "comma"), op(",", "comma")]);
    });

    test("'and'/'or' get distinct keyword tiers when mixed, and revert to the neutral one when not", async ({page}) => {
        await startVarAssign(page, "a and b or c");
        await waitForEditorSettled(page);
        // Two distinct keyword precedences present ("and" tighter than "or"), so they
        // land on two different keyword tiers rather than a single flat one:
        expect(await getOperatorTierInfo(page)).toEqual([op("and", "keyword-high"), op("or", "keyword-medium")]);

        // Remove " or c", leaving a single "and": operators are stored without their literal
        // surrounding spaces, so select-and-replace rather than guess a backspace count:
        await selectAllInSlot(page);
        await doPagePaste(page, "a and b");
        // Solo again, so back to the neutral keyword default:
        expect(await getOperatorTierInfo(page)).toEqual([op("and", "keyword-medium")]);

        // Re-extend with a comparison instead of "or": now mixed with "and", so the
        // tighter-binding "==" is pulled to the tightest symbol tier ("high"), while "and"
        // -- now the sole (loosest) keyword present -- keeps its neutral "keyword-medium":
        await typeIndividually(page, "==c");
        expect(await getOperatorTierInfo(page)).toEqual([op("and", "keyword-medium"), op("==", "high")]);
    });

    test("typing 'a not in b and c or d' spreads three keyword operators across all three keyword tiers", async ({page}) => {
        await startVarAssign(page, "a not in b");
        await waitForEditorSettled(page);
        // Solo, so the neutral default:
        expect(await getOperatorTierInfo(page)).toEqual([op("not in", "keyword-medium")]);

        await typeIndividually(page, " and c");
        // Two distinct precedences now ("not in" tighter than "and"):
        expect(await getOperatorTierInfo(page)).toEqual([op("not in", "keyword-high"), op("and", "keyword-medium")]);

        await typeIndividually(page, " or d");
        // Three distinct precedences: tightest-to-loosest across all three keyword tiers:
        expect(await getOperatorTierInfo(page)).toEqual([op("not in", "keyword-high"), op("and", "keyword-medium"), op("or", "keyword-low")]);
    });

    test("building a ternary incrementally: 'if' appears first, then 'else' once typed", async ({page}) => {
        await startVarAssign(page, "a if b");
        await waitForEditorSettled(page);
        expect(await getOperatorTierInfo(page)).toEqual([op("if", "keyword-medium")]);

        await typeIndividually(page, " else c");
        expect(await getOperatorTierInfo(page)).toEqual([op("if", "keyword-medium"), op("else", "keyword-medium")]);
    });

    test("editing back and forth between mixed and unmixed keeps the tiers self-consistent", async ({page}) => {
        // A general "check everything works" sweep: build a nested, mixed expression, tear
        // most of it down, then build something different in its place, checking the tiers
        // are correct (and the editor never ends up in a broken/inconsistent state) at each step.
        await startVarAssign(page, "(a+b*c)-(d/e)");
        await waitForEditorSettled(page);
        // Outer level: '-' alone (solo, medium); inner brackets: '+','*' mixed (medium/high) and '/' alone (medium):
        expect(await getOperatorTierInfo(page)).toEqual([
            op("+", "medium"), op("*", "high"), // inside (a+b*c)
            op("-", "medium"), // outer, solo
            op("/", "medium"), // inside (d/e)
        ]);

        // Delete back to just "(a+b*c)": select-and-replace rather than guess a backspace
        // count near a bracket boundary:
        await selectAllInSlot(page);
        await doPagePaste(page, "(a+b*c)");
        expect(await getOperatorTierInfo(page)).toEqual([op("+", "medium"), op("*", "high")]);

        // Now build something different in its place:
        await typeIndividually(page, "**(f&g)");
        expect(await getOperatorTierInfo(page)).toEqual([
            op("+", "medium"), op("*", "high"), // unchanged, inside (a+b*c)
            op("**", "medium"), // outer, solo
            op("&", "medium"), // inside (f&g)
        ]);
    });

    test("typing '-a' gives a detected unary minus a suppressed leading margin, and this updates as it's mixed with other operators", async ({page}) => {
        await startVarAssign(page, "-a");
        await waitForEditorSettled(page);
        // Solo unary sign: neutral "medium"-equivalent tier, marker set (no leading margin):
        expect(await getOperatorTierInfo(page)).toEqual([op("-", "medium", true)]);

        await typeIndividually(page, "+b");
        // '-' still binds tighter than binary '+' so it's pulled to "high" -- already zero
        // margin both sides, so the marker is dropped (nothing left to suppress):
        expect(await getOperatorTierInfo(page)).toEqual([op("-", "high"), op("+", "medium")]);

        await pressN("Backspace", 2, true)(page);
        expect(await getOperatorTierInfo(page)).toEqual([op("-", "medium", true)]);
    });

    test("the same '-' token is retiered live depending on whether it sits in a unary or binary position", async ({page}) => {
        await startVarAssign(page, "a-b");
        await waitForEditorSettled(page);
        // Ordinary binary '-', preceded by a non-blank field ("a") -- neutral tier, no marker:
        expect(await getOperatorTierInfo(page)).toEqual([op("-", "medium")]);

        // Replace with a '-' that now has a blank field before it -- same code, same
        // resulting CSS class ("medium"), but now flagged as a detected unary sign:
        await selectAllInSlot(page);
        await doPagePaste(page, "-a");
        expect(await getOperatorTierInfo(page)).toEqual([op("-", "medium", true)]);

        await selectAllInSlot(page);
        await doPagePaste(page, "a-b");
        expect(await getOperatorTierInfo(page)).toEqual([op("-", "medium")]);
    });

    test("'-a' keeps its unary tier when wrapped in brackets, and reverts when unwrapped", async ({page}) => {
        await startVarAssign(page, "-a");
        await waitForEditorSettled(page);
        expect(await getOperatorTierInfo(page)).toEqual([op("-", "medium", true)]);

        await selectAllInSlot(page);
        await doPagePaste(page, "(-a)");
        expect(await getOperatorTierInfo(page)).toEqual([op("-", "medium", true)]);

        await selectAllInSlot(page);
        await doPagePaste(page, "-a");
        expect(await getOperatorTierInfo(page)).toEqual([op("-", "medium", true)]);
    });

    test("typing '-a**b' shows a detected unary minus losing out to the tighter-binding '**', matching Python's -a**b == -(a**b)", async ({page}) => {
        await startVarAssign(page, "-a**b");
        await waitForEditorSettled(page);
        // '**' is the only thing tighter than a unary sign, so '-' is pulled looser to
        // "medium" (still with its marker) while '**' takes "high":
        expect(await getOperatorTierInfo(page)).toEqual([op("-", "medium", true), op("**", "high")]);

        await pressN("Backspace", 3, true)(page);
        expect(await getOperatorTierInfo(page)).toEqual([op("-", "medium", true)]);
    });
});
