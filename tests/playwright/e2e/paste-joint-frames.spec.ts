import {test, expect, Page} from "@playwright/test";
import {enterCode, doPagePaste, waitForEditorSettled} from "../support/editor";
import {setupStrypeTest} from "../support/general";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {skipPyodide: true});
});

// Mirrors Cypress's assertVisibleError() in paste-python.cy.ts: the message banner and its close
// button are exposed via the same CSS classes on window.StrypeSCSSVarsGlobals.
async function assertMessageBanner(page: Page, expectedText: RegExp | null) : Promise<void> {
    const scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
    const banner = page.locator("." + scssVars.messageBannerContainerClassName);
    if (expectedText != null) {
        await expect(banner.locator("span").first()).toHaveText(expectedText);
        await banner.locator("." + scssVars.messageBannerCrossClassName).click();
    }
    // Whether it never existed, or we just closed it, it should now not exist:
    await expect(banner).toHaveCount(0);
}

// Finds the runtime frame ID of the (unique) top-level frame in Main whose header text starts
// with the given text (e.g. "if" or "elif"), by reading the "frameHeader_<id>" element IDs that
// Frame.vue/FrameHeader.vue render -- see getFrameHeaderUID() in src/helpers/editor.ts.
async function getFrameIdByHeaderText(page: Page, headerText: string) : Promise<number> {
    const id = await page.evaluate((headerText) => {
        const headers = Array.from(document.querySelectorAll("#frameContainer_-3 [id^=\"frameHeader_\"]"));
        const match = headers.find((h) => h.textContent?.trim().startsWith(headerText));
        return match?.id ?? null;
    }, headerText);
    if (id == null) {
        throw new Error(`Could not find a frame header in Main starting with "${headerText}"`);
    }
    return parseInt(id.replace("frameHeader_", ""), 10);
}

// Clicks the "top of body" caret (CaretPosition.body -> "caretBody" in the DOM ID) of the frame
// with the given runtime ID. The click handler lives on the caret's wrapping container element
// (see getCaretContainerUID() in src/helpers/editor.ts and CaretContainer.vue's toggleCaret()),
// not on the visual Caret element itself (which is invisible/non-interactive until selected).
async function clickBodyCaret(page: Page, frameId: number) : Promise<void> {
    // Caret containers for positions that aren't currently selected are deliberately
    // zero-size/hidden until selected, which defeats Playwright's coordinate-based click (it
    // can't compute an on-screen point to click). The container's own click handler
    // (toggleCaret() in CaretContainer.vue) only needs a real "click" event to fire though, so
    // dispatch one directly in the page instead of going through Playwright's mouse simulation:
    const id = "caret_caretBody_of_frame_" + frameId;
    await page.evaluate((id) => {
        document.getElementById(id)?.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}));
    }, id);
    await waitForEditorSettled(page);
}

// Regression tests for https://github.com/k-pet-group/Strype/issues/543 : pasting a joint frame
// (e.g. "else") at a cursor position where it can't legally attach used to either misplace it
// between existing branches or crash with an uncaught exception, and gave the user no feedback
// either way. It should instead be rejected with a visible error, leaving the existing structure
// untouched -- while still succeeding at a genuinely valid position.
test.describe("Pasting else only succeeds at a valid position in an if/elif chain", () => {
    const ifElifCode = "if True:\n    a()\nelif True:\n    b()\n";
    const elseCode = "else:\n    x = -9\n";

    test("Rejects pasting else at the top of the if's own body", async ({page}) => {
        await enterCode(page, ["", "", ifElifCode]);
        const ifId = await getFrameIdByHeaderText(page, "if");
        // The top of the "if" body (above "a()") still has the "elif" chain following it, so a
        // trailing "else" can't legally go there:
        await clickBodyCaret(page, ifId);
        const frameCountBefore = await page.locator("#frameContainer_-3 .frame-div").count();
        await doPagePaste(page, elseCode);
        await assertMessageBanner(page, /illegal code/i);
        // The structure must be completely unaffected by the rejected paste -- no "else" branch
        // added, and the same number of frames as before (not comparing innerText directly, since
        // it can pick up transient autocomplete tooltip text unrelated to the frame structure):
        await expect(page.locator("#frameContainer_-3")).not.toContainText("else");
        await expect(page.locator("#frameContainer_-3 .frame-div")).toHaveCount(frameCountBefore);
    });

    test("Allows pasting else at the top of the elif's body", async ({page}) => {
        await enterCode(page, ["", "", ifElifCode]);
        const elifId = await getFrameIdByHeaderText(page, "elif");
        // The top of the "elif" body (above "b()") is the last branch, so a trailing "else" can
        // legally attach after it:
        await clickBodyCaret(page, elifId);
        await doPagePaste(page, elseCode);
        await assertMessageBanner(page, null);
        await expect(page.locator("#frameContainer_-3")).toContainText("else");
    });
});

// Regression test for https://github.com/k-pet-group/Strype/issues/757 : a blank line immediately
// before elif/else/except/finally used to be dedented to that keyword's own (shallower) indent,
// which split the compound statement in two and made the whole paste fail to parse.
test.describe("Pasting handles a blank line before a joint continuation", () => {
    test("Allows a blank line before elif", async ({page}) => {
        await enterCode(page, ["", "", "if True:\n    a()\n\nelif True:\n    b()\n"]);
        await assertMessageBanner(page, null);
        await expect(page.locator("#frameContainer_-3")).toContainText("elif");
    });

    test("Allows a blank line before else", async ({page}) => {
        await enterCode(page, ["", "", "if True:\n    a()\n\nelse:\n    b()\n"]);
        await assertMessageBanner(page, null);
        await expect(page.locator("#frameContainer_-3")).toContainText("else");
    });

    test("Allows a blank line before except", async ({page}) => {
        await enterCode(page, ["", "", "try:\n    a()\n\nexcept:\n    b()\n"]);
        await assertMessageBanner(page, null);
        await expect(page.locator("#frameContainer_-3")).toContainText("except");
    });
});
