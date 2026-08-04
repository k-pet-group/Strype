import {Page, test, expect} from "@playwright/test";
import {setupStrypeTest} from "../support/general";
import {clearDefaultProject, waitForEditorSettled} from "../support/editor";
import {AllFrameTypesIdentifier} from "../../cypress/support/frame-types";
import {
    assertFrameType,
    assertConversionDidNotHappen,
    getFirstSlotText,
    getFocusedFrameId,
    typeKeywordConversionTrigger,
} from "../support/keyword-conversion";

// These tests target the undo/redo scoping introduced to avoid diffing/cloning the WHOLE
// document's frame/slot tree on every keystroke (see cloneStateForUndo/saveStateChanges,
// src/store/store.ts, and its use in LabelSlot.vue's onInput()): plain character edits within one
// frame's slot are now cloned/diffed scoped to just that frame, rather than the whole state.
//
// "Scoped path" below means the new, narrower path (a single frame's own slot edits). "Full-scope
// path" means edits that still (deliberately) clone/diff the whole state, either because they were
// never scoped to begin with (e.g. paste, delete), or because LabelSlotsStructure.vue's
// checkSlotRefactoring explicitly re-widens a scoped clone back to a full one right before a
// keyword-frame conversion, since that can reparent/attach joint frames beyond the one frame that
// was typed into (see the comment at its call to performKeywordFrameConversion).
//
// The two "sibling frames" tests specifically guard against the scoped path corrupting frames it
// didn't declare as touched: if the scoping ever silently dropped another frame's data from a
// diff (e.g. treating it as deleted because it's simply absent from the scoped clone), undoing
// edits to one frame would wrongly affect a sibling's content -- exactly what this checks for.

test.beforeEach(async ({page, browserName}, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {skipPyodide: true});
    await clearDefaultProject(page);
    // clearDefaultProject() leaves the caret at the top of (now-empty) Imports; every test here
    // needs Main instead, which offers a plain func-call fallback for bare typed text.
    await page.keyboard.press("ArrowDown"); // Imports -> Definitions
    await waitForEditorSettled(page);
    await page.keyboard.press("ArrowDown"); // Definitions -> Main
    await waitForEditorSettled(page);
});

// Both Ctrl+Z/Ctrl+Y and Cmd+Z/Cmd+Y trigger undo/redo (Commands.vue checks event.ctrlKey ||
// event.metaKey), so Control+z/Control+y work identically on every platform Playwright runs on.
async function undo(page: Page, times = 1): Promise<void> {
    for (let i = 0; i < times; i++) {
        await page.keyboard.press("Control+z");
        await waitForEditorSettled(page);
    }
}

async function redo(page: Page, times = 1): Promise<void> {
    for (let i = 0; i < times; i++) {
        await page.keyboard.press("Control+y");
        await waitForEditorSettled(page);
    }
}

// Types a bare character at the current blank-line caret in Main, creating a func-call frame with
// that single character as its content, and returns the new frame's id.
async function createFuncCallFrame(page: Page, firstChar: string): Promise<number> {
    await page.keyboard.type(firstChar);
    await waitForEditorSettled(page);
    return await getFocusedFrameId(page);
}

test.describe("Undo/redo -- scoped path (plain typing within a single frame)", () => {
    test("undo/redo restores plain typed characters one keystroke at a time", async ({page}) => {
        const frameId = await createFuncCallFrame(page, "a");
        await page.keyboard.type("bc");
        await waitForEditorSettled(page);
        expect(await getFirstSlotText(page, frameId)).toEqual("abc");

        await undo(page, 1);
        expect(await getFirstSlotText(page, frameId)).toEqual("ab");

        await undo(page, 1);
        expect(await getFirstSlotText(page, frameId)).toEqual("a");

        await redo(page, 1);
        expect(await getFirstSlotText(page, frameId)).toEqual("ab");

        await redo(page, 1);
        expect(await getFirstSlotText(page, frameId)).toEqual("abc");
    });

    test("undoing/redoing edits to one frame does not affect a sibling frame's content", async ({page}) => {
        // Creating a frame from a bare typed character is itself its own undoable step (it goes
        // through a separate "paste the typed character into the newly-created slot" step, not
        // the scoped onInput() path -- see createFuncCallFrame's callers elsewhere in this file).
        // The undo stack is strictly chronological (LIFO), so B's 3 steps (creation + 2 edits)
        // are always on top of A's -- this walks all the way down through B's, including its own
        // creation (which removes frame B entirely), before reaching A's edits underneath.
        const frameAId = await createFuncCallFrame(page, "x"); // a1
        await page.keyboard.type("AB"); // a2, a3
        await waitForEditorSettled(page);
        expect(await getFirstSlotText(page, frameAId)).toEqual("xAB");

        // Move below frame A and create a second, sibling frame B, then two more scoped edits.
        await page.keyboard.press("Escape");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        const frameBId = await createFuncCallFrame(page, "y"); // b1
        expect(frameBId).not.toEqual(frameAId);
        await page.keyboard.type("CD"); // b2, b3
        await waitForEditorSettled(page);
        expect(await getFirstSlotText(page, frameBId)).toEqual("yCD");

        // Undo frame B's two scoped edits: only B should change, A must stay exactly as it was.
        await undo(page, 1); // undoes b3
        expect(await getFirstSlotText(page, frameBId)).toEqual("yC");
        expect(await getFirstSlotText(page, frameAId)).toEqual("xAB");

        await undo(page, 1); // undoes b2
        expect(await getFirstSlotText(page, frameBId)).toEqual("y");
        expect(await getFirstSlotText(page, frameAId)).toEqual("xAB");

        // Undo B's own creation: B disappears, but A -- lower down the stack, untouched by B's
        // scoped diffs -- must still be exactly as it was.
        await undo(page, 1); // undoes b1
        await expect(page.locator(".frame-div")).toHaveCount(1);
        expect(await getFirstSlotText(page, frameAId)).toEqual("xAB");

        // Now undo frame A's two scoped edits.
        await undo(page, 1); // undoes a3
        expect(await getFirstSlotText(page, frameAId)).toEqual("xA");

        await undo(page, 1); // undoes a2
        expect(await getFirstSlotText(page, frameAId)).toEqual("x");

        // Redo everything back: both frames restored, with B's content intact.
        await redo(page, 5);
        await expect(page.locator(".frame-div")).toHaveCount(2);
        expect(await getFirstSlotText(page, frameAId)).toEqual("xAB");
        expect(await getFirstSlotText(page, frameBId)).toEqual("yCD");
    });
});

test.describe("Undo/redo -- full-scope path (edits reaching beyond one frame)", () => {
    test("undoing a plain (non-joint) keyword-frame conversion restores the original func-call content", async ({page}) => {
        // Typing "try " converts a func-call frame to a "try" frame in a single frame -- unlike
        // the elif/else/except/finally conversions below, "try" doesn't attach to anything else,
        // so this doesn't actually need the full-scope widen to be correct. It's still routed
        // through it (checkSlotRefactoring widens for every keyword conversion, not just joint
        // ones -- see its comment), so this checks that widening back to a full clone/diff for a
        // single-frame change doesn't itself corrupt anything.
        const frameId = await createFuncCallFrame(page, "t");
        await page.keyboard.type("ry");
        await waitForEditorSettled(page);
        expect(await getFirstSlotText(page, frameId)).toEqual("try");
        await assertConversionDidNotHappen(page, frameId);

        await page.keyboard.type(" "); // fires the conversion
        await waitForEditorSettled(page);
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.try);

        // One undo reverts the whole conversion back to a func-call frame with its typed content.
        // The trigger space itself lands in the slot as ordinary text before the conversion logic
        // consumes it, so the state captured just before converting still has it -- trim it off
        // rather than asserting an exact match, since that trailing space isn't what this is about.
        await undo(page, 1);
        await assertConversionDidNotHappen(page, frameId);
        expect((await getFirstSlotText(page, frameId)).trim()).toEqual("try");

        // Redo restores the conversion again.
        await redo(page, 1);
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.try);

        // The earlier per-character edits ("r", then "y") are still individually undoable
        // underneath, each its own scoped step (mirroring the single-frame test above):
        await undo(page, 3); // undo conversion, then "y", then "r"
        expect(await getFirstSlotText(page, frameId)).toEqual("t");
    });

    test("undoing an elif/else conversion that attaches to an existing if's joint chain leaves the if's own content untouched", async ({page}) => {
        // Build "if x :" then move to a blank line directly after it (not nested in its body).
        await page.keyboard.press(" ");
        await page.keyboard.press("i"); // if
        await waitForEditorSettled(page);
        const ifId = await getFocusedFrameId(page);
        await page.keyboard.type("x");
        await waitForEditorSettled(page);
        expect(await getFirstSlotText(page, ifId)).toEqual("x");

        await page.keyboard.press("Escape");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);

        // Typing "else" here converts a func-call frame and attaches it as a joint frame on ifId
        // -- a mutation of the if frame's own jointFrameIds, i.e. a second frame beyond the one
        // being typed into.
        const elseId = await typeKeywordConversionTrigger(page, "else");
        await assertFrameType(page, elseId, AllFrameTypesIdentifier.else);
        await expect(page.locator(".frame-div")).toHaveCount(2);

        await undo(page, 1);
        // The else conversion (and its attachment to the if) should be fully undone:
        await assertConversionDidNotHappen(page, elseId);
        await expect(page.locator(".frame-div")).toHaveCount(2);
        // Critically, the if frame's own content must be untouched by undoing a change that was
        // captured (and diffed) against the WHOLE state, not just the else frame's own subtree:
        expect(await getFirstSlotText(page, ifId)).toEqual("x");

        await redo(page, 1);
        await assertFrameType(page, elseId, AllFrameTypesIdentifier.else);
        expect(await getFirstSlotText(page, ifId)).toEqual("x");
    });
});
