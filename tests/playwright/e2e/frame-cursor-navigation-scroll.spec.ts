import {expect, Page, test} from "@playwright/test";
import {setupStrypeTest} from "../support/general";
import {waitForEditorSettled} from "../support/editor";
import {createBrowserProxy} from "../support/proxy";
import {WINDOW_STRYPE_HTMLIDS_PROPNAME} from "@/helpers/sharedIdCssWithTests";

// Regression test for a bug where pressing ArrowUp/ArrowDown to move the frame cursor, when the
// newly-focused cursor is out of view, scrolls it much further than intended. The scroll is only
// meant to bring the new cursor a small, fixed distance inside the viewport edge (a 50px
// scroll-margin around the caret container, see CaretContainer.vue's
// "scroll-margin-top"/"scroll-margin-bottom"), not to the middle of the screen. Seen on Firefox on
// almost every scroll, and on Chrome specifically when the cursor moves (up) to the gap between
// two function definitions, or (down) to the first cursor position inside a function's body.

let strypeElIds: {[varName: string]: (...args: any[]) => Promise<string>};
let scssVars: {[varName: string]: string};

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 120000, skipPyodide: true});
    strypeElIds = createBrowserProxy(page, WINDOW_STRYPE_HTMLIDS_PROPNAME);
    scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
    // A small-ish viewport makes it likely for the code to not entirely fit, so cursor movement
    // regularly needs to scroll -- without this, on a very tall viewport nothing would ever be
    // off-screen and the bug wouldn't be exercised at all.
    await page.setViewportSize({width: 1280, height: 800});
});

// Loads a project from the Strype textbook's "Book..." dialog, by chapter and exact project name.
async function loadBookProject(page: Page, chapter: string, projectName: string) : Promise<void> {
    await page.click("#" + await strypeElIds.getEditorMenuUID());
    await page.locator("." + scssVars.strypeMenuItemClassName, {hasText: "Book..."}).click();
    await page.locator(".open-book-dlg-book-group-item", {hasText: chapter}).first().click();
    await page.locator(".open-book-dlg-name", {hasText: new RegExp(`^${projectName}$`)}).click({clickCount: 2});
    await expect(page.locator(".project-name")).toHaveText(projectName, {timeout: 30000});
}

// The currently-visible frame or text cursor's DOM element, if any is shown.
async function getVisibleCaretRect(page: Page) : Promise<{top: number, bottom: number} | null> {
    return await page.evaluate(() => {
        const el = [...document.querySelectorAll(".navigationPosition.caret")].find((e) => !e.classList.contains("invisible"));
        if (!el) {
            return null;
        }
        const r = el.getBoundingClientRect();
        return {top: r.top, bottom: r.bottom};
    });
}

// "editorCodeDiv" is the id returned by src/helpers/editor.ts's getEditorMiddleUID(), which isn't
// exposed on the test window-proxy object, so it's hardcoded here (as other specs already do, e.g.
// the "#editorCodeDiv" locator elsewhere in this file).
const EDITOR_CODE_DIV_ID = "editorCodeDiv";

async function getEditorScrollTop(page: Page) : Promise<number> {
    return await page.evaluate((id) => document.getElementById(id)?.scrollTop ?? 0, EDITOR_CODE_DIV_ID);
}

async function getEditorClientHeight(page: Page) : Promise<number> {
    return await page.evaluate((id) => document.getElementById(id)?.clientHeight ?? 0, EDITOR_CODE_DIV_ID);
}

// Presses the given key repeatedly, and after every press where the editor's scroll position
// changed, checks that the newly-focused cursor ended up close to an edge of the editor viewport
// (as intended by the 50px scroll-margin around the caret container), rather than stranded near
// the middle -- which is the symptom of the bug.
async function checkBoundedScrollOnNavigation(page: Page, key: "ArrowUp" | "ArrowDown", times: number) : Promise<void> {
    const clientHeight = await getEditorClientHeight(page);
    // Generous bound: a legitimate "bring it just into view" scroll should land the cursor within
    // this many pixels of the near edge. The bug reliably lands the cursor much further in than
    // this (observed: within a few px of the exact middle of the viewport).
    const maxDistanceFromEdge = clientHeight * 0.3;
    for (let i = 0; i < times; i++) {
        const before = await getEditorScrollTop(page);
        await page.keyboard.press(key);
        // Plain cursor navigation doesn't trigger the kind of restructuring debounce
        // waitForEditorSettled exists for (see the "Undo scrolls location into view" tests'
        // rationale in scroll-into-view.spec.ts), and calling it after every single arrow press
        // here is expensive enough to blow the test timeout over 90 repeats. The actual scroll
        // (CaretContainer.vue's putCaretContainerInView) fires from a 100ms setTimeout after the
        // caret has moved, so just wait past that before reading the final scroll position.
        await page.waitForTimeout(200);
        const after = await getEditorScrollTop(page);
        if (after === before) {
            continue;
        }
        const rect = await getVisibleCaretRect(page);
        if (rect == null) {
            continue;
        }
        const distanceFromTop = rect.top;
        const distanceFromBottom = clientHeight - rect.bottom;
        const distanceFromNearestEdge = Math.min(Math.abs(distanceFromTop), Math.abs(distanceFromBottom));
        expect(distanceFromNearestEdge,
            `After pressing ${key} (press ${i + 1}/${times}), the cursor scrolled from ${before} to ${after} ` +
            `but ended up at top=${rect.top}, bottom=${rect.bottom} in a ${clientHeight}px-tall viewport -- ` +
            "too far from either edge to be a \"just scrolled into view\" position.")
            .toBeLessThanOrEqual(maxDistanceFromEdge);
    }
}


// After every press (checked almost immediately, not after the generous wait above), the frame
// cursor must be fully inside the editor's own scrolling area. Regression test for a bug (seen on
// Safari) where moving up let the cursor go out of view: the cursor was tested against the window
// rather than the editor area (which starts below the menu), and the scroll was delayed 100ms so
// fast key repeat outran it.
async function checkCursorAlwaysVisible(page: Page, key: "ArrowUp" | "ArrowDown", times: number) : Promise<void> {
    for (let i = 0; i < times; i++) {
        await page.keyboard.press(key);
        await page.waitForTimeout(30);
        const result = await page.evaluate((id) => {
            const area = document.getElementById(id)?.getBoundingClientRect();
            const el = [...document.querySelectorAll(".navigationPosition.caret")].find((e) => !e.classList.contains("invisible"));
            const r = el?.getBoundingClientRect();
            return (area && r) ? {areaTop: area.top, areaBottom: area.bottom, top: r.top, bottom: r.bottom} : null;
        }, EDITOR_CODE_DIV_ID);
        if (result == null) {
            continue;
        }
        // 1px tolerance for sub-pixel layout:
        expect(result.top, `After ${key} press ${i + 1}/${times}: cursor above the editor area`).toBeGreaterThanOrEqual(result.areaTop - 1);
        expect(result.bottom, `After ${key} press ${i + 1}/${times}: cursor below the editor area`).toBeLessThanOrEqual(result.areaBottom + 1);
    }
}

// Escape out of any text-editing into frame-cursor mode, then drive the cursor as far as it'll go
// in one direction (further presses past either end are harmless no-ops), to reach a known,
// deterministic starting point without depending on the project's default caret position.
async function goToExtreme(page: Page, key: "ArrowUp" | "ArrowDown") : Promise<void> {
    await page.keyboard.press("Escape");
    for (let i = 0; i < 90; i++) {
        await page.keyboard.press(key);
    }
    await waitForEditorSettled(page);
    await page.waitForTimeout(200);
}

test.describe("Frame cursor keyboard navigation scrolls only a bounded amount", () => {
    test("Moving down through a long, deeply-nested project", async ({page}) => {
        await loadBookProject(page, "Chapter 8", "smoke");
        await goToExtreme(page, "ArrowUp");
        await checkBoundedScrollOnNavigation(page, "ArrowDown", 90);
    });

    test("Moving up through a long, deeply-nested project", async ({page}) => {
        await loadBookProject(page, "Chapter 8", "smoke");
        await goToExtreme(page, "ArrowDown");
        await checkBoundedScrollOnNavigation(page, "ArrowUp", 90);
    });

    test("Cursor stays in view when moving up quickly", async ({page}) => {
        await loadBookProject(page, "Chapter 8", "smoke");
        await goToExtreme(page, "ArrowDown");
        await checkCursorAlwaysVisible(page, "ArrowUp", 90);
    });

    test("Cursor stays in view when moving down quickly", async ({page}) => {
        await loadBookProject(page, "Chapter 8", "smoke");
        await goToExtreme(page, "ArrowUp");
        await checkCursorAlwaysVisible(page, "ArrowDown", 90);
    });
});
