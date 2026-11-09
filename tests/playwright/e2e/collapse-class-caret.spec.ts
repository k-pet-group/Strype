import { test, expect } from "@playwright/test";
import { setupStrypeTest } from "../support/general";
import { enterCode, waitForEditorSettled, checkFrameXorTextCursor } from "../support/editor";
import en from "../../../src/localisation/en/en_main.json";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 60000, skipPyodide: true});
});

test.describe("Collapsing a class", () => {
    // Regression test for https://github.com/k-pet-group/Strype/issues/723 : with the frame caret in
    // the class's body (before __init__), collapsing the class used to leave the caret hidden inside it.
    test("keeps a visible frame caret when the caret was in its body (#723)", async ({page}) => {
        await enterCode(page, ["", "class Foo:\n    def __init__(self):\n        pass\n", ""]);
        // The caret is at the top of Main; go up until it is in the class's body (just before __init__):
        const visibleCaretIsBeforeInit = () => page.evaluate(() => {
            const scssVars = (window as any)["StrypeSCSSVarsGlobals"];
            const caret = document.querySelector("." + scssVars.caretClassName + ":not(." + scssVars.invisibleClassName + ")");
            return caret?.id.startsWith("caret_caretBody_") === true
                && caret.parentElement?.nextElementSibling?.textContent?.startsWith("def __init__") === true;
        });
        for (let i = 0; i < 12 && !(await visibleCaretIsBeforeInit()); i++) {
            await page.keyboard.press("ArrowUp");
            await waitForEditorSettled(page);
        }
        expect(await visibleCaretIsBeforeInit()).toBe(true);

        // Collapse the class via its context menu:
        await page.locator(".frame-header:has-text('Foo')").first().click({button: "right"});
        await page.getByRole("menuitem", {name: new RegExp("^" + en.contextMenu.collapseHeader)}).click({timeout: 2000});
        await waitForEditorSettled(page);

        // A frame caret should still be visible somewhere on screen:
        const caret = await checkFrameXorTextCursor(page, true);
        // ...and it must really be on screen (not just un-flagged but inside the hidden class body):
        const box = await caret.evaluate((el) => ({width: (el as HTMLElement).getBoundingClientRect().width, shown: (el as HTMLElement).offsetParent !== null}));
        expect(box.shown).toBe(true);
        expect(box.width).toBeGreaterThan(0);
    });
});
