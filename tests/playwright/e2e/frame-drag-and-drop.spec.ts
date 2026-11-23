import {test, expect, Page} from "@playwright/test";
import {typeIndividually, waitForEditorSettled} from "../support/editor";
import {setupStrypeTest} from "../support/general";

const MAIN_CODE_CONTAINER_ID = -3;

let pageErrors: string[] = [];

test.beforeEach(async ({ page, browserName }, testInfo) => {
    pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await setupStrypeTest(page, browserName, testInfo, {skipPyodide: true});
});

// The IDs of the frames in the main code, in display order.
async function getMainCodeFrameIds(page: Page): Promise<number[]> {
    return page.locator(`#frameContainer_${MAIN_CODE_CONTAINER_ID} .frame-div`)
        .evaluateAll((els) => els.map((el) => parseInt(el.id.replace("frame_id_", ""))));
}

test.describe("Frame drag and drop", () => {
    // Regression test for https://github.com/k-pet-group/Strype/issues/1125:
    // a frame whose type has changed (here, a frame converted to a "while" by typing "while ")
    // gets new caret containers, and the API registration of its "below" caret used to be removed
    // when the old ones were unmounted. Dragging a frame near that caret then threw on every mouse
    // move: no drop indicator was shown and the frame couldn't be dropped.
    test("Works after a frame has been converted to another type", async ({page}) => {
        // The default project's main code has two frames: we add a "while" between them.
        const [firstFrameId, lastFrameId] = await getMainCodeFrameIds(page);
        // (The caret container has no height while the caret isn't shown there, so Playwright can't click on it: we dispatch the click instead.)
        await page.locator(`#caret_caretBelow_of_frame_${firstFrameId}`).dispatchEvent("click");
        await waitForEditorSettled(page);
        await typeIndividually(page, "while ");
        await typeIndividually(page, "Tru");
        const mainFrameIdsBeforeDrag = await getMainCodeFrameIds(page);
        expect(mainFrameIdsBeforeDrag).toHaveLength(3);
        const whileFrameId = mainFrameIdsBeforeDrag[1];
        expect(mainFrameIdsBeforeDrag).toEqual([firstFrameId, whileFrameId, lastFrameId]);

        // Drag the last frame (while still editing the "while" frame's slot), upwards past the "while" frame,
        // to the top of the main code.
        const draggedFrameBox = await page.locator(`#frame_id_${lastFrameId}`).boundingBox();
        const dropCaretContainer = page.locator(`#caret_caretBody_of_frame_${MAIN_CODE_CONTAINER_ID}`);
        const dropCaretBox = await page.locator(`#caret_caretBody_${MAIN_CODE_CONTAINER_ID}`).boundingBox();
        expect(draggedFrameBox).not.toBeNull();
        expect(dropCaretBox).not.toBeNull();
        if (!draggedFrameBox || !dropCaretBox) {
            return;
        }
        const startX = draggedFrameBox.x + 5, startY = draggedFrameBox.y + draggedFrameBox.height / 2;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX, dropCaretBox.y + dropCaretBox.height / 2, {steps: 20});

        // The drop indicator is shown at the top of the main code:
        await expect(dropCaretContainer).toHaveClass(/(^|\s)dragging-frame(\s|$)/);
        await page.mouse.up();
        await waitForEditorSettled(page);

        // The drag is over, and the frame has been moved:
        await expect(page.locator("body")).not.toHaveClass(/(^|\s)dragging-frame(\s|$)/);
        expect(await getMainCodeFrameIds(page)).toEqual([lastFrameId, firstFrameId, whileFrameId]);
        expect(pageErrors).toEqual([]);
    });
});
