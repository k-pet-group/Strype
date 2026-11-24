import {Page, test, expect} from "@playwright/test";
import {waitForEditorSettled, typeIndividually} from "../support/editor";
import {setupStrypeTest} from "../support/general";

// The brackets of a bracketed structure are emphasised (bold) when the text cursor is right next to
// either of them, inside or outside (see LabelSlotsStructure.vue's emphasisedBracketsSlotId).
test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {skipPyodide: true, timeoutMs: 60000});
});

async function boldBrackets(page: Page): Promise<string[]> {
    await waitForEditorSettled(page);
    return page.locator("#frameContainer_-3 .bold").evaluateAll((els) => els.map((e) => e.textContent ?? ""));
}

test("brackets are emphasised next to the text cursor", async ({page}) => {
    await typeIndividually(page, " cr=");
    await typeIndividually(page, "x(abc");
    // caret before ")"
    expect(await boldBrackets(page)).toEqual(["(", ")"]);
    await page.keyboard.press("ArrowLeft");
    expect(await boldBrackets(page)).toEqual([]);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    // caret after "("
    expect(await boldBrackets(page)).toEqual(["(", ")"]);
    await page.keyboard.press("ArrowLeft");
    // caret before "("
    expect(await boldBrackets(page)).toEqual(["(", ")"]);
    await page.keyboard.press("ArrowLeft");
    expect(await boldBrackets(page)).toEqual([]);
    await page.keyboard.press("End");
    // caret after ")"
    expect(await boldBrackets(page)).toEqual(["(", ")"]);
    await page.keyboard.press("ArrowLeft");
    // caret before ")" (coming from the right)
    expect(await boldBrackets(page)).toEqual(["(", ")"]);
});
