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
            const original = readFileSync("public/book_vol01/chapter03/fireworks.spy", "utf8").replace(/\r\n/g, "\n");
            for (let j = 0; j < i; j++) {
                await page.keyboard.press("ArrowUp");
            }
            await page.click("#" + await strypeElIds.getEditorMenuUID());
            await page.locator("." + scssVars.strypeMenuItemClassName, {hasText: "Book..."}).click();
            await page.locator(".open-book-dlg-book-group-item", {hasText: "Chapter 3"}).first().click();
            await page.locator(".open-book-dlg-name", {hasText: /^fireworks$/}).click({clickCount: 2});
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
            const original = readFileSync("public/book_vol01/chapter03/fireworks.spy", "utf8").replace(/\r\n/g, "\n");
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

test.describe("Loading a book project does not spuriously mark it as modified", () => {
    // Regression test for #954: loading a book/demo project restores its saved splitter/layout
    // sizes via a synthetic resize event, which used to be indistinguishable from a real user
    // drag (both carry a same-shaped "panes" array), so it wrongly flipped the project back to
    // "modified" immediately after loading. yellow-fish-v7 has a saved peaCommandsSplitterPane2Size
    // for its layout, so it reliably exercises that path.
    test("Loading yellow-fish-v7 leaves the project showing as unmodified", async ({page}) => {
        await page.click("#" + await strypeElIds.getEditorMenuUID());
        await page.locator("." + scssVars.strypeMenuItemClassName, {hasText: "Book..."}).click();
        await page.locator(".open-book-dlg-book-group-item", {hasText: "Chapter 8"}).first().click();
        await page.locator(".open-book-dlg-name", {hasText: "yellow-fish-v7"}).click({clickCount: 2});
        // As above, the ".project-name" label only updates once the load (including restoring
        // the saved divider positions) has fully completed, so no extra wait is needed here.
        await expect(page.locator(".project-name")).toHaveText("yellow-fish-v7", {timeout: 30000});
        await expect(page.locator(".gdrive-sync-label", {hasText: "Modified"})).toHaveCount(0);
    });
});

test.describe("Book dialog chapter selection survives dialog opening", () => {
    // Regression test for the intermittent "fireworks entry never became clickable" CI failures
    // above: the book dialog used to reset its chapter selection back to Chapter 1 from its
    // modal's "shown" handler (fired once the dialog is already interactable), so a chapter
    // picked in the brief window before "shown" actually fired got silently wiped out -- e.g.
    // Chapter 3 was selected, "fireworks" appeared, then the dialog reverted to Chapter 1's
    // projects underneath it. That's a genuine timing race (confirmed via CI's resource-monitor
    // log showing normal, non-spiking load during the hangs -- this isn't runner overload). The
    // fix moved the reset to the dialog's "show" event (fired before it's interactable), closing
    // that window.
    //
    // This drives the dialog the normal way and checks the selection is still showing Chapter 3's
    // projects after giving any pending reset every chance to run. It's exercising the same race
    // as the "Load and save fireworks" tests above, just without the full load-and-save round
    // trip, so -- like those -- it may not always land inside the window that used to trigger the
    // bug; it's here as a faster, more targeted check of the same thing.
    test("Selecting Chapter 3 in the Book dialog keeps showing its projects", async ({page}) => {
        await page.click("#" + await strypeElIds.getEditorMenuUID());
        await page.locator("." + scssVars.strypeMenuItemClassName, {hasText: "Book..."}).click();
        await page.locator(".open-book-dlg-book-group-item", {hasText: "Chapter 3"}).first().click();
        const fireworksEntry = page.locator(".open-book-dlg-name", {hasText: /^fireworks$/});
        await expect(fireworksEntry).toBeVisible();

        // Give the dialog's "shown" event (and anything it might still trigger) every chance to
        // fire before checking the selection is still showing Chapter 3's projects:
        await page.waitForTimeout(2000);
        await expect(fireworksEntry).toBeVisible();
    });
    test("A chapter with no projects shows a centred message", async ({page}) => {
        await page.click("#" + await strypeElIds.getEditorMenuUID());
        await page.locator("." + scssVars.strypeMenuItemClassName, {hasText: "Book..."}).click();
        // Volume 3, Chapter 3 is the third "Chapter 3" in the list and is deliberately empty:
        await page.locator(".open-book-dlg-book-group-item", {hasText: "Chapter 3"}).nth(2).click();
        const message = page.locator(".open-book-dlg-no-projects");
        await expect(message).toHaveText("This chapter has no associated projects");
        await expect(page.locator(".open-book-dlg-name")).toHaveCount(0);

        // Check it's centred both ways within the right-hand pane:
        const pane = await message.locator("xpath=..").boundingBox();
        if (!pane) {
            throw new Error("Could not find the right-hand pane");
        }
        const text = await message.evaluate((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            const r = range.getBoundingClientRect();
            return {x: r.x + r.width / 2, y: r.y + r.height / 2};
        });
        expect(Math.abs(text.x - (pane.x + pane.width / 2))).toBeLessThan(10);
        expect(Math.abs(text.y - (pane.y + pane.height / 2))).toBeLessThan(10);
    });
});
