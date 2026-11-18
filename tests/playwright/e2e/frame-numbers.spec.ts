import { test, expect, Page } from "@playwright/test";
import { setupStrypeTest } from "../support/general";
import { waitForEditorSettled } from "../support/editor";
import { load } from "../support/loading-saving";
import en from "../../../src/localisation/en/en_main.json";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 60000, skipPyodide: true});
});

const gutterSelector = ".frame-numbers-gutter";
const gutterItemSelector = ".frame-numbers-gutter .frame-number-gutter-item";

// Opens the Strype menu (it's off-canvas/hidden until opened, so the frame numbers checkbox
// isn't interactable until this is called) and toggles the "frame numbers" checkbox, which
// closes the menu again as a side effect (see its @change handler in Menu.vue).
async function toggleFrameNumbers(page: Page) {
    await page.locator("#showHideMenu").click();
    await page.locator("#frameNumbersCheckboxId").click();
}

test.describe("Frame numbers", () => {
    test("are off by default, and toggle on/off from the menu", async ({page}) => {
        // Default is off:
        await expect(page.locator(gutterSelector)).toHaveCount(0);

        // Toggling on shows the numbers:
        await toggleFrameNumbers(page);
        await waitForEditorSettled(page);
        await expect(page.locator(gutterSelector)).toBeVisible();
        await expect(page.locator(gutterItemSelector).first()).toBeVisible();

        // Toggling off hides them again:
        await toggleFrameNumbers(page);
        await waitForEditorSettled(page);
        await expect(page.locator(gutterSelector)).toHaveCount(0);
    });

    test("line up vertically with the frames they number", async ({page}) => {
        await toggleFrameNumbers(page);
        await waitForEditorSettled(page);

        // Click into a slot's text to start editing it: while a slot is being edited, no frame
        // caret is expanded on screen, so FrameNumbersGutter's "don't jitter as the caret moves"
        // correction (see its recomputeOffsets()) doesn't apply, and each number's position should
        // line up with its own frame with no slack -- the strongest version of this check.
        const scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
        await page.locator(`.${scssVars.labelSlotInputClassName}`).first().click();
        await waitForEditorSettled(page);

        const items = await page.evaluate(() => {
            const numberEls = Array.from(document.querySelectorAll(".frame-numbers-gutter .frame-number-gutter-item"));
            return numberEls.map((numberEl) => ({text: numberEl.textContent}));
        });
        // Sanity check: numbers are present and sequential (1, 2, 3, ...) in document order --
        // this also confirms the gutter's frame order matches the frames' visual order below.
        expect(items.length).toBeGreaterThan(0);
        items.forEach((item, i) => expect(item.text).toBe(String(i + 1)));

        // Pair up each gutter number with the frame it refers to (same document order as the
        // numbers themselves -- see getFrameVisualNumbers() in store.ts) and check the number's
        // top and bottom both fall within that frame's own bounding box on screen.
        const paired = await page.evaluate(() => {
            const numberEls = Array.from(document.querySelectorAll(".frame-numbers-gutter .frame-number-gutter-item"));
            // The project's documentation header (id "frameHeader_-10") also matches
            // "[id^='frameHeader_']" but isn't wrapped in a Frame.vue "frame_id_..." div (it's
            // rendered directly by App.vue) and isn't part of getFrameVisualNumbers -- filter it
            // (and anything else not backed by a numbered frame) out rather than assume the two
            // node lists are already in step.
            const headerEls = Array.from(document.querySelectorAll("[id^=\"frameHeader_\"]"))
                .filter((headerEl) => headerEl.closest("[id^=\"frame_id_\"]") !== null);
            return numberEls.map((numberEl, i) => {
                const headerEl = headerEls[i];
                const frameEl = headerEl.closest("[id^=\"frame_id_\"]") as HTMLElement;
                const numberRect = numberEl.getBoundingClientRect();
                const frameRect = frameEl.getBoundingClientRect();
                return {
                    numberTop: numberRect.top,
                    numberBottom: numberRect.bottom,
                    frameTop: frameRect.top,
                    frameBottom: frameRect.bottom,
                };
            });
        });

        expect(paired.length).toBe(items.length);
        const tolerancePx = 2;
        for (const {numberTop, numberBottom, frameTop, frameBottom} of paired) {
            expect(numberTop).toBeGreaterThanOrEqual(frameTop - tolerancePx);
            expect(numberBottom).toBeLessThanOrEqual(frameBottom + tolerancePx);
        }
    });
});

test.describe("Frame numbers with folded frames", () => {
    // Checks that the *visible* gutter numbers correspond one-to-one with the frame headers that
    // are actually on screen: numbers for hidden (folded-away) frames must not be shown at all
    // (they used to pile up on top of each other at the top of the gutter), and no two visible
    // numbers may sit at the same vertical position.
    async function expectGutterMatchesVisibleHeaders(page: Page) {
        await expect.poll(async () => page.evaluate(() => {
            const headerCount = Array.from(document.querySelectorAll("[id^=\"frameHeader_\"]"))
                .filter((headerEl) => headerEl.closest("[id^=\"frame_id_\"]") !== null).length;
            const tops = Array.from(document.querySelectorAll(".frame-numbers-gutter .frame-number-gutter-item"))
                .filter((el) => getComputedStyle(el).display !== "none")
                .map((el) => Math.round(el.getBoundingClientRect().top));
            return {headerCount, shown: tops.length, distinct: new Set(tops).size};
        })).toEqual(expect.objectContaining({shown: expect.any(Number)}));
        const result = await page.evaluate(() => {
            const headerCount = Array.from(document.querySelectorAll("[id^=\"frameHeader_\"]"))
                .filter((headerEl) => headerEl.closest("[id^=\"frame_id_\"]") !== null).length;
            const tops = Array.from(document.querySelectorAll(".frame-numbers-gutter .frame-number-gutter-item"))
                .filter((el) => getComputedStyle(el).display !== "none")
                .map((el) => Math.round(el.getBoundingClientRect().top));
            return {headerCount, shown: tops.length, distinct: new Set(tops).size};
        });
        expect(result.shown).toBe(result.headerCount);
        expect(result.distinct).toBe(result.shown);
    }

    test("are hidden for folded frames after load and across fold/unfold", async ({page}) => {
        await load(page, "public/book_vol01/chapter03/fireworks-finished.spy");
        await toggleFrameNumbers(page);
        await waitForEditorSettled(page);
        await expect(page.locator(gutterSelector)).toBeVisible();

        // After load (several functions are folded to header-only):
        await expectGutterMatchesVisibleHeaders(page);
        const foldedCount = await page.evaluate(() => document.querySelectorAll(".frame-numbers-gutter .frame-number-gutter-item").length);

        // Frozen functions can't be fully expanded, so unfreeze "prepare" first:
        const header = page.locator(".frame-header:has-text('prepare')").first();
        // Right-click on the header's first line (the "def" line): once unfolded, the header also holds the function's
        // docstring, and clicking in its middle would land in the docstring, which doesn't open the frame's menu:
        const rightClickHeader = async () => {
            const box = await header.boundingBox();
            await header.click({button: "right", position: {x: (box?.width ?? 20) / 2, y: 10}});
        };
        await rightClickHeader();
        await page.getByRole("menuitem", {name: en.contextMenu.unfreeze, exact: true}).click({timeout: 2000});
        await waitForEditorSettled(page);
        await expectGutterMatchesVisibleHeaders(page);

        // Unfold it (its body frames now become visible):
        await rightClickHeader();
        await page.getByRole("menuitem", {name: new RegExp("^" + en.contextMenu.collapseFull)}).click({timeout: 2000});
        await waitForEditorSettled(page);
        await expectGutterMatchesVisibleHeaders(page);
        const shownAfterUnfold = await page.locator(".frame-numbers-gutter .frame-number-gutter-item:visible").count();
        expect(shownAfterUnfold).toBeGreaterThan(0);

        // Fold it again:
        await rightClickHeader();
        await page.getByRole("menuitem", {name: new RegExp("^" + en.contextMenu.collapseHeader)}).click({timeout: 2000});
        await waitForEditorSettled(page);
        await expectGutterMatchesVisibleHeaders(page);
        expect(foldedCount).toBeGreaterThan(0);
    });
});
