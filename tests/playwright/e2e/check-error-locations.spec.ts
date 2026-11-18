import { test, expect, Locator } from "@playwright/test";
import { enterCode } from "../support/editor";
import { checkConsoleContent, checkFrameErrorCount, runToFinish } from "../support/execution";
import { load } from "../support/loading-saving";
import { setupStrypeTest } from "../support/general";

let scssVars: {[varName: string]: string};
test.beforeEach(async ({ page, browserName }, testInfo) => {
    // 180s, not 120s: this suite's runToFinish() calls can themselves wait up to 120s for
    // Pyodide to be ready (tests/playwright/support/execution.ts), and a 120s test-level budget
    // left no headroom for that plus the rest of the test -- confirmed as a real CI failure
    // ("Test timeout of 120000ms exceeded" racing the inner wait's own 120000ms, run 33729426452):
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 180000});
    scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
});

// Given a locator for a slot or frame header, checks if the nearest enclosing frame has an error showing
export async function expectHasVisibleErrorIcon(locator: Locator): Promise<void> {
    const parent = locator.locator(
        `xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' ${scssVars.frameHeaderClassName} ')][1]`
    );

    await expect(parent).toHaveCount(1);

    const errIcon = parent.locator(".err-icon:visible");
    await expect(errIcon).toHaveCount(1);
    // Should only be one error:
    await checkFrameErrorCount(locator.page(), 1);
}

test.describe("Check errors show", () => {
    test("Check error shows #1", async ({page}) => {
        await enterCode(page, ["", "", "print(len(None))"]);
        await runToFinish(page);
        await checkConsoleContent(page, "< TypeError: object of type 'NoneType' has no len() >\n  From the highlighted call in your code");
        await expectHasVisibleErrorIcon(page.locator("span", {hasText: "print"}));
    });
    test("Check error shows #2", async ({page}) => {
        await enterCode(page, ["", "", "print('a'.foo())"]);
        await runToFinish(page);
        await checkConsoleContent(page, "< AttributeError: 'str' object has no attribute 'foo' >\n  From the highlighted call in your code");
        await expectHasVisibleErrorIcon(page.locator("span", {hasText: "print"}));
    });
    test("Check error shows for file reading", async ({page}) => {
        await enterCode(page, ["", "", "open(\"/does/not/exist.txt\", \"r\", encoding=\"utf-8\")"]);
        await runToFinish(page);
        await checkConsoleContent(page, "< FileNotFoundError: [Errno 44] No such file or directory: '/does/not/exist.txt' >\n  From the highlighted call in your code");
        await expectHasVisibleErrorIcon(page.locator("span", {hasText: "open"}));
    });

    // Check syntax error too, this use of global shows a syntax error:
    test("Check error shows for global mis-use", async ({page}) => {
        await enterCode(page, ["", `
def test():
    a = 2
    global a
`.trimStart(), "print(\"Hi!\")\n"]);
        await runToFinish(page);
        await checkConsoleContent(page, "< SyntaxError: name 'a' is assigned to before global declaration >\n  From the highlighted call in your code");
        await expectHasVisibleErrorIcon(page.locator("div.frame-header-label", {hasText: "global"}));
    });

    test("Check error shows after manually printing", async ({page}) => {
        await enterCode(page, ["import traceback", "", `
try:
    print(len(None))
except Exception:
    traceback.print_exc()
`]);
        await runToFinish(page);
        // Should be an error, but only one:
        await checkConsoleContent(page, /.*TypeError: object of type 'NoneType' has no len\(\).*/);
        // Should not show any error counts because we caught it:
        await checkFrameErrorCount(page, 0);
    });

    test("Check error shows at right place when documentation parts have newlines", async ({page}) => {
        await load(page, "tests/cypress/fixtures/project-documented-newlines.spy");
        await runToFinish(page);
        // Two separate checks to keep things clear, one for the expected lengths of each of the docs, one for the error:
        await checkConsoleContent(page, /9\n6\n4\n11\n5\n.*/);
        await checkConsoleContent(page, /.*TypeError: object of type 'NoneType' has no len\(\).*/);
        await expectHasVisibleErrorIcon(page.locator("span", {hasText: "This will cause an error:"}));
    });

    test("Check error shows on except frame, not try frame, for invalid except clause", async ({page}) => {
        // Regression test for https://github.com/k-pet-group/Strype/issues/341 :
        // "except e:" (old Python 2 syntax) is invalid in Python 3, it raises a NameError
        // for the undefined name "e" while evaluating the except clause itself. The error
        // used to be (wrongly) shown on the frame inside the try body instead of on the
        // except frame, and an uncaught "errorElement is undefined" JS exception could occur.
        const pageErrors: string[] = [];
        page.on("pageerror", (err) => pageErrors.push(err.message));
        await enterCode(page, ["", "", `
try:
    raise ValueError
except e:
    print("Error!")
`.trimStart()]);
        await runToFinish(page);
        expect(pageErrors).toEqual([]);
        await checkConsoleContent(page, /.*NameError: name 'e' is not defined.*/);
        await expectHasVisibleErrorIcon(page.locator("div.frame-header-label", {hasText: "except"}));
    });

    test("Check error shows correctly when a funcdef with documentation follows a multiline comment", async ({page}) => {
        // astroids.spy is ~400KB, by far the largest fixture used in any Playwright test (most are a
        // few KB) -- parsing/rendering that much state is genuinely slower, not just contended, so this
        // needs more headroom than the standard load+run budget on a loaded Firefox CI runner:
        test.setTimeout(240000);
        // This fixture has a method with a documentation string directly under its header ("def ...:" then
        // a docstring on the next line), coming straight after a multiline comment. Locating the frame position
        // for such a funcdef/classdef used to be computed *after* accounting for the docstring's own line count,
        // so the line number recorded for the statement was that of its docstring rather than its own header line.
        // That, in turn, made the line-to-frame lookup miss both the exact line and the "EOF" fallback line for an
        // error reported on the header itself, throwing an uncaught exception instead of reporting the error -
        // which left the Run button stuck showing "Stop" forever. This is a regression test for that:
        const pageErrors: string[] = [];
        page.on("pageerror", (err) => pageErrors.push(err.message));
        await load(page, "tests/cypress/fixtures/astroids.spy", 120000);
        await runToFinish(page, true);
        // No uncaught JS exception should occur while tracing the error back to its frame:
        expect(pageErrors).toEqual([]);
        // The fixture has a genuine bug (the "self" parameter is both automatically added and manually
        // typed on the same method), which should be correctly flagged rather than silently swallowed:
        const errSlot = page.locator(".error-slot");
        await expect(errSlot).toHaveCount(1);
        await expect(errSlot).toHaveText("self");
    });
});

test.describe("Check clicking after an error", () => {
    test("Clicking elsewhere after an error moves the caret there even if mouseup beats selectionchange (#726)", async ({page}) => {
        // The browser reports selection changes asynchronously (a "selectionchange" event is queued as a separate task),
        // so on a busy page (seen on Firefox) the mouseup at the end of a click can be handled before the
        // selectionchange for the same click.  The mouseup handler used to look at the (stale) cursor position in the
        // store, which was still in the slot with the error, and put the caret back there, so the click appeared to be
        // ignored (although the clicked slot looked focused).  We simulate that ordering by changing the selection and
        // sending the mouseup in the same task, so the selectionchange cannot have been handled yet.
        await enterCode(page, ["", "", "a = 1\nopen(\"/does/not/exist.txt\")\n"]);
        const firstLineSlotId = await page.locator("span.label-slot-input", {hasText: /^a$/}).first().getAttribute("id") as string;
        const focusId = () => page.evaluate(() => document.querySelector("#editor")?.getAttribute("data-slot-focus-id") ?? "");
        await runToFinish(page);
        // The caret is moved to the error automatically, in the "open" slot (on the second line):
        await expect.poll(async () => {
            const id = await focusId();
            return id !== "" && id !== firstLineSlotId;
        }, {timeout: 30000}).toBe(true);
        await page.evaluate((slotId) => {
            const textNode = document.getElementById(slotId)?.firstChild as Text;
            document.getSelection()?.collapse(textNode, 1);
            document.dispatchEvent(new MouseEvent("mouseup", {bubbles: true}));
        }, firstLineSlotId);
        // Give anything that is going to (wrongly) move the caret time to do so:
        await page.waitForTimeout(1500);
        expect(await focusId()).toEqual(firstLineSlotId);
    });
});
