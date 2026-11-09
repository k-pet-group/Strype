import { test, expect, Page } from "@playwright/test";
import { setupStrypeTest } from "../support/general";
import { enterCode, waitForEditorSettled } from "../support/editor";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 60000, skipPyodide: true});
});

// Returns the index (within the popup's items) of the currently selected item, or -1 if none
async function getSelectedACIndex(page: Page): Promise<number> {
    return page.evaluate(() => {
        const scssVars = (window as any)["StrypeSCSSVarsGlobals"];
        const items = Array.from(document.querySelectorAll("." + scssVars.acItemClassName));
        return items.findIndex((el) => el.classList.contains(scssVars.acItemSelectedClassName));
    });
}

test.describe("Code completion", () => {
    // Regression test for https://github.com/k-pet-group/Strype/issues/977
    test("keeps its selected item when modifier keys are pressed", async ({page}) => {
        await enterCode(page, ["", "", ""]);
        // Ctrl+Space at the bare frame caret creates a func-call frame and opens the a/c in it:
        await page.keyboard.press("Control+Space");
        const scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
        await expect(page.locator("." + scssVars.acItemClassName).nth(2)).toBeVisible();

        // The a/c list is rebuilt asynchronously (and debounced) after opening, which resets the
        // selection to the top when it lands. There's no observable signal for that finishing, so
        // allow time for it before navigating (otherwise this test is racy):
        await waitForEditorSettled(page);
        await page.waitForTimeout(800);
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await expect.poll(() => getSelectedACIndex(page)).toBe(2);

        for (const modifier of ["Shift", "Control", "Alt", "Meta"]) {
            await page.keyboard.down(modifier);
            await page.keyboard.up(modifier);
            // Allow time for any (wrongly) triggered, debounced, a/c update to take effect:
            await waitForEditorSettled(page);
            await page.waitForTimeout(400);
            expect(await getSelectedACIndex(page), `after pressing ${modifier}`).toBe(2);
        }
    });
});
