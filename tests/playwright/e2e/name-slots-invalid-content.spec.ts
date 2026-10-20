import { test, expect, Page } from "@playwright/test";
import { setupStrypeTest } from "../support/general";
import { doPagePaste, enterCode, pressFrameShortcut, waitForEditorSettled } from "../support/editor";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 60000, skipPyodide: true});
});

// Regression tests for https://github.com/k-pet-group/Strype/issues/682 : the name of a class or function must not
// be able to contain operators (by typing or pasting), otherwise we get names that can't be saved/loaded properly.

// Returns the text of the first slot in the (only) frame header, i.e. the frame's name
async function getNameSlotText(page: Page): Promise<string> {
    return page.evaluate(() => {
        const scssVars = (window as any)["StrypeSCSSVarsGlobals"];
        return (document.querySelector(".frame-header ." + scssVars.labelSlotInputClassName)?.textContent ?? "").replace(/​/g, "");
    });
}

async function startFrame(page: Page, shortcut: string): Promise<void> {
    await enterCode(page, ["", "", ""]);
    // Go from the top of Main to the end of Definitions:
    await page.keyboard.press("ArrowUp");
    await waitForEditorSettled(page);
    await pressFrameShortcut(page, shortcut);
    await waitForEditorSettled(page);
}

for (const {desc, shortcut} of [{desc: "class", shortcut: "c"}, {desc: "function", shortcut: "f"}]) {
    test.describe(`Name of a ${desc}`, () => {
        test("ignores typed operators", async ({page}) => {
            await startFrame(page, shortcut);
            await page.keyboard.type("foo");
            await page.keyboard.type("+-*/=<>%,.\"'");
            await waitForEditorSettled(page);
            await page.keyboard.type("bar");
            await waitForEditorSettled(page);
            expect(await getNameSlotText(page)).toBe("foobar");
        });

        test("rejects pasted operators but accepts a pasted name", async ({page}) => {
            await startFrame(page, shortcut);
            await doPagePaste(page, "1+2");
            expect(await getNameSlotText(page)).toBe("");
            await doPagePaste(page, "foo is not bar");
            expect(await getNameSlotText(page)).toBe("");
            await doPagePaste(page, "\"abc\"");
            expect(await getNameSlotText(page)).toBe("");
            await doPagePaste(page, "myName");
            expect(await getNameSlotText(page)).toBe("myName");
        });
    });
}

test.describe("Name of a class", () => {
    test("still allows a bracketed list of parent classes, with operators-like content inside", async ({page}) => {
        await startFrame(page, "c");
        await page.keyboard.type("Foo(a.b, c");
        await waitForEditorSettled(page);
        const text = await page.evaluate(() => document.querySelector(".frame-header")?.textContent?.replace(/​/g, "") ?? "");
        expect(text).toContain("Foo");
        expect(text).toContain("a.b");
        expect(text).toContain(",");
    });
});
