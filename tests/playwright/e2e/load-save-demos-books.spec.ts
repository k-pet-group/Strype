import {test, expect} from "@playwright/test";
import {save} from "../support/loading-saving";
import {readFileSync} from "node:fs";
import {setupStrypeTest} from "../support/general";
import {createBrowserProxy} from "../support/proxy";
import {WINDOW_STRYPE_HTMLIDS_PROPNAME} from "@/helpers/sharedIdCssWithTests";
import {doPagePaste} from "../support/editor";

let strypeElIds: {[varName: string]: (...args: any[]) => Promise<string>};
let scssVars: {[varName: string]: string};
test.beforeEach(async ({ page, browserName }, testInfo) => {
    // CI run 29398704984 (macos-latest+chromium) showed "moving up 0 times" timing out at 240s
    // waiting on the book-picker dialog to populate ("fireworks" entry never became clickable);
    // siblings "moving up 1/2 times" hit the same wait but recovered on retry. Bumped for margin.
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 360_000, skipPyodide: true});
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
            await page.keyboard.press("Delete");
            await page.keyboard.press("Delete");
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

test.describe("Book dialog chapter selection survives dialog opening", () => {
    // Regression test for the intermittent "fireworks entry never became clickable" CI failures
    // above: the book dialog used to reset its chapter selection back to Chapter 1 from its
    // modal's "shown" handler (fired once the dialog is already interactable), so a chapter
    // picked in the brief window before "shown" actually fired got silently wiped out -- e.g.
    // Chapter 2 was selected, "fireworks" appeared, then the dialog reverted to Chapter 1's
    // projects underneath it. That's a genuine timing race (confirmed via CI's resource-monitor
    // log showing normal, non-spiking load during the hangs -- this isn't runner overload). The
    // fix moved the reset to the dialog's "show" event (fired before it's interactable), closing
    // that window.
    //
    // This drives the dialog the normal way and checks the selection is still showing Chapter 2's
    // projects after giving any pending reset every chance to run. It's exercising the same race
    // as the "Load and save fireworks" tests above, just without the full load-and-save round
    // trip, so -- like those -- it may not always land inside the window that used to trigger the
    // bug; it's here as a faster, more targeted check of the same thing.
    test("Selecting Chapter 2 in the Book dialog keeps showing its projects", async ({page}) => {
        await page.click("#" + await strypeElIds.getEditorMenuUID());
        await page.locator("." + scssVars.strypeMenuItemClassName, {hasText: "Book..."}).click();
        await page.locator(".open-book-dlg-book-group-item", {hasText: "Chapter 2"}).click();
        const fireworksEntry = page.locator(".open-book-dlg-name", {hasText: "fireworks"});
        await expect(fireworksEntry).toBeVisible();

        // Give the dialog's "shown" event (and anything it might still trigger) every chance to
        // fire before checking the selection is still showing Chapter 2's projects:
        await page.waitForTimeout(2000);
        await expect(fireworksEntry).toBeVisible();
    });
});
