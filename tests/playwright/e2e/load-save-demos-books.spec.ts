import {test, expect} from "@playwright/test";
import {save} from "../support/loading-saving";
import {readFileSync} from "node:fs";
import {setupStrypeTest} from "../support/general";
import {createBrowserProxy} from "../support/proxy";
import {WINDOW_STRYPE_HTMLIDS_PROPNAME} from "@/helpers/sharedIdCssWithTests";
import {clearDefaultProject, doPagePaste, pressN} from "../support/editor";

let strypeElIds: {[varName: string]: (...args: any[]) => Promise<string>};
let scssVars: {[varName: string]: string};
test.beforeEach(async ({ page, browserName }, testInfo) => {
    // CI run 29398704984 (macos-latest+chromium) showed "moving up 0 times" timing out at 240s
    // waiting on the book-picker dialog to populate ("fireworks" entry never became clickable);
    // siblings "moving up 1/2 times" hit the same wait but recovered on retry. Bumped for margin.
    // CI run 29564701756 (same job) still timed out at 360s on "moving up 2 times" (same symptom --
    // the "fireworks" entry resolved, then went "detached from the DOM, retrying" until timeout,
    // through all 4 attempts), so bumping again:
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 480_000, skipPyodide: true});
    strypeElIds = createBrowserProxy(page, WINDOW_STRYPE_HTMLIDS_PROPNAME);
    scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
});

test.describe("Load/save book projects", () => {
    for (let i = 0; i <= 2; i++) {
        test(`Load and save fireworks after moving up ${i} times`, async ({page}) => {
            // There was a bug where fireworks would sometimes load weirdly, e.g.
            // the comment would be blank in the body, or the imports or defs would end up
            // in the main code section.  It was caused by having the frame cursor in the
            // imports or defs
            const original = readFileSync("public/book_projects/chapter02/fireworks.spy", "utf8").replace(/\r\n/g, "\n");
            for (let j = 0; j < i; j++) {
                await page.keyboard.press("ArrowUp");
            }
            await page.click("#" + await strypeElIds.getEditorMenuUID());
            await page.locator("." + scssVars.strypeMenuItemClassName, {hasText: "Book..."}).click();
            await page.locator(".open-book-dlg-book-group-item", {hasText: "Chapter 2"}).click();
            await page.locator(".open-book-dlg-name", {hasText: "fireworks"}).click({clickCount: 2});
            // Selecting a book example loads it asynchronously (Menu.vue awaits
            // selectedProject.projectFile before applying the new state); the visible
            // ".project-name" label only updates once that's truly in place, mirroring the same
            // signal loading-saving.ts's load() uses for regular file loads -- wait for that
            // rather than guessing how long the load takes:
            await expect(page.locator(".project-name")).toHaveText("fireworks", {timeout: 30000});
            const output = readFileSync(await save(page, true), "utf8").replace(/\r\n/g, "\n");
            expect(output).toEqual(original);
        });

        test(`Paste fireworks after moving up ${i} times`, async ({page}) => {
            // Check same as above but with pasting:
            const original = readFileSync("public/book_projects/chapter02/fireworks.spy", "utf8").replace(/\r\n/g, "\n");
            await clearDefaultProject(page);
            // clearDefaultProject leaves the caret at the top of (now empty) Imports; return to
            // Main so the "move up i times" logic below still exercises pasting with the caret in
            // Main/Defs/Imports respectively, now that Imports itself has also been cleared of its
            // default content:
            await pressN("ArrowDown", 2)(page);
            for (let j = 0; j < i; j++) {
                await page.keyboard.press("ArrowUp");
            }
            // doPagePaste already waits for the editor to settle after the paste, including
            // through the frame count changing while a large multi-frame paste is rendered:
            await doPagePaste(page, original);
            const output = readFileSync(await save(page, true), "utf8").replace(/\r\n/g, "\n");
            expect(output).toEqual(original);
        });
    }
});
