import {Page, test, expect} from "@playwright/test";
import {setupStrypeTest} from "../support/general";
import {checkFrameXorTextCursor, clearDefaultProject, waitForEditorSettled} from "../support/editor";
import {AllFrameTypesIdentifier} from "../../cypress/support/frame-types";
import {
    DEFS_CONTAINER_ID,
    IMPORTS_CONTAINER_ID,
    MAIN_CONTAINER_ID,
    assertConversionDidNotHappen,
    assertFrameCaretPosition,
    assertFrameHasError,
    assertFrameType,
    clearFrameContent,
    focusThenBlurFrame,
    getFocusedFrameId,
    getFrameHeaderText,
    getFrameIdByType,
    getJointParentId,
    insertBlankFuncCallAfter,
    navigateToFrameCaret,
    relocateFrameToContainer,
    typeKeywordConversionTrigger, getFirstSlotText,
    typeConversionTriggerViaEnter, typeKeywordConversionTriggerViaEnter,
    typeConversionTriggerViaColon, typeKeywordConversionTriggerViaColon,
} from "../support/keyword-conversion";

test.beforeEach(async ({page, browserName}, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {skipPyodide: true});
    await clearDefaultProject(page);
    // clearDefaultProject() leaves the caret at the top of (now-empty) Imports -- that container
    // never offers a plain func-call fallback for typed text (only its fixed import/from/library/
    // comment shortcuts), so every test in this file needs to start from Main instead, which does.
    await page.keyboard.press("ArrowDown"); // Imports -> Definitions
    await waitForEditorSettled(page);
    await page.keyboard.press("ArrowDown"); // Definitions -> Main
    await waitForEditorSettled(page);
});

// Asserts that the given frame ends up (at any depth) inside the given top-level container.
async function expectFrameInContainer(page: Page, frameId: number, containerId: number): Promise<void> {
    await expect.poll(async () => await page.evaluate((frameId) => {
        const app = (document.getElementById("app") as unknown as {__vue_app__: {config: {globalProperties: {$pinia: {_s: Map<string, any>}}}}}).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        let id = frameId;
        while (id > 0) {
            const f = store.frameObjects[id];
            id = f.jointParentId > 0 ? f.jointParentId : f.parentId;
        }
        return id;
    }, frameId)).toBe(containerId);
}

// Returns the ids of the children of the given frame/container, read from the store.
async function getChildrenIds(page: Page, parentId: number): Promise<number[]> {
    return await page.evaluate((parentId) => {
        const app = (document.getElementById("app") as unknown as {__vue_app__: {config: {globalProperties: {$pinia: {_s: Map<string, any>}}}}}).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        return [...store.frameObjects[parentId].childrenIds] as number[];
    }, parentId);
}

// Creates a class in Definitions (which comes with a default "__init__" method), then moves the
// caret into that method's (empty) body, ready for a func-call frame to be typed there.
// The caret starts in Main (see beforeEach), so this first steps back up to Definitions.
// Returns the ids of the class and of its method.
async function createClassAndEnterMethodBody(page: Page): Promise<{classId: number, methodId: number}> {
    await page.keyboard.press("ArrowUp"); // Main -> Definitions
    await waitForEditorSettled(page);
    await page.keyboard.press(" ");
    await page.keyboard.press("c");
    await waitForEditorSettled(page);
    const classId = await getFocusedFrameId(page);
    const methodId = (await getChildrenIds(page, classId))[0];
    await page.locator(`#frameBodyId_${methodId}`).click();
    await waitForEditorSettled(page);
    return {classId, methodId};
}

// Creates a function definition in Definitions ("space" then "f" -- unambiguous there, since
// Definitions offers no "for"), then moves the caret into its (empty) body, ready for a
// func-call frame to be typed there. The caret starts in Main (see beforeEach), so this first
// steps back up to Definitions.
async function createFunctionAndEnterBody(page: Page): Promise<void> {
    await page.keyboard.press("ArrowUp"); // Main -> Definitions
    await waitForEditorSettled(page);
    await page.keyboard.press(" ");
    await page.keyboard.press("f");
    await waitForEditorSettled(page);
    // The newly created funcdef starts with its (empty) name slot focused, so this is the only
    // reliable point to read its ID (see typeKeywordConversionTrigger's own doc comment for why
    // reading a frame's ID must happen while something inside it is still focused).
    const funcdefId = await getFocusedFrameId(page);
    // ArrowDown from the header's own slots navigates within/between its labels, not into the
    // body -- clicking the body's own container directly sidesteps that navigation ambiguity:
    await page.locator(`#frameBodyId_${funcdefId}`).click();
    await waitForEditorSettled(page);
}

// Creates a for-loop in Main ("space" then "f"; unambiguous there since Main doesn't offer
// funcdef/from-import), types a throwaway header so the loop is structurally valid, then moves
// the caret into its (empty) body.
async function createForLoopAndEnterBody(page: Page): Promise<void> {
    await page.keyboard.press(" ");
    await page.keyboard.press("f");
    await waitForEditorSettled(page);
    const forId = await getFocusedFrameId(page);
    await page.keyboard.type("x");
    await page.keyboard.press("ArrowRight"); // from the end of "x" into the "in" slot
    await waitForEditorSettled(page);
    await page.keyboard.type("y");
    await waitForEditorSettled(page);
    // See the matching comment in createFunctionAndEnterBody: click the body's own element
    // directly rather than navigating there with arrow keys from the header's own slots.
    await page.locator(`#frameBodyId_${forId}`).click();
    await waitForEditorSettled(page);
}

// Creates an if-block in Main ("space" then "i"; index 0 of the "i" shortcut group, unambiguous
// since no disambiguation key follows -- see the same pattern in the "Frame-not-allowed-here
// error check" describe block below), types a throwaway condition, then moves the caret into its
// (empty) body. Returns the if frame's own ID (unlike createForLoopAndEnterBody/
// createFunctionAndEnterBody, joint-frame tests need this to navigate into frames added there).
async function createIfAndEnterBody(page: Page): Promise<number> {
    await page.keyboard.press(" ");
    await page.keyboard.press("i"); // if
    await waitForEditorSettled(page);
    const ifId = await getFocusedFrameId(page);
    await page.keyboard.type("x");
    await waitForEditorSettled(page);
    await page.locator(`#frameBodyId_${ifId}`).click();
    await waitForEditorSettled(page);
    return ifId;
}

// Creates a func-call frame in the given Imports/Definitions container by bare typing, then
// clears its content so it's a blank slate ready for typeKeywordConversionTrigger. Returns its
// frame ID.
async function createFuncCallFrameIn(page: Page, containerId: number): Promise<number> {
    // Caret starts in Main (see beforeEach) -- step up into the target container's own blank-line
    // caret first: 1x ArrowUp for Definitions, 2x for Imports.
    const arrowUpPresses = containerId === IMPORTS_CONTAINER_ID ? 2 : 1;
    for (let i = 0; i < arrowUpPresses; i++) {
        await page.keyboard.press("ArrowUp");
        await waitForEditorSettled(page);
    }
    // Neither container offers func-call as a pane command (only their own fixed shortcuts), but
    // bare typing still creates one there as the generic "type anything" fallback -- see Commands.vue's bare-typed-char handler.
    await page.keyboard.type("x");
    await waitForEditorSettled(page);
    const frameId = await getFocusedFrameId(page);
    // createFuncCallFrameFromTypedChar (Commands.vue) creates and focuses the frame's slot, then
    // separately dispatches the typed character into it as a further async "paste into slot" step
    // -- waitForEditorSettled can see focus/cursor/frameCount as already stable before that second
    // step lands, so clearFrameContent's backspace can race ahead of it (observed: the "x" arriving
    // late, after the clear, ending up stuck in front of whatever's typed next). Wait for it to
    // actually be there first.
    await expect(page.locator(`#frameHeader_${frameId} .label-slot-input`).first()).toHaveText("x");
    await clearFrameContent(page, frameId, "x".length);
    return frameId;
}

test.describe("Keyword-triggered frame conversion -- shapes", () => {
    test("0-slot: \"try\" converts with no editable content, caret left inside its (empty) body", async ({page}) => {
        const frameId = await typeKeywordConversionTrigger(page, "try");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.try);
        // Regression test: try allows children (it has a body), so the caret belongs inside it,
        // ready to type the first statement -- not below the whole (still-empty) try block.
        await assertFrameCaretPosition(page, frameId, "body");
    });

    test("0-slot: break/continue convert with no editable content, caret left below (no body)", async ({page}) => {
        await createForLoopAndEnterBody(page);
        const breakFrameId = await typeKeywordConversionTrigger(page, "break");
        await assertFrameType(page, breakFrameId, AllFrameTypesIdentifier.break);
        // break/continue don't allow children -- there's no body to put the caret inside, so it
        // correctly stays below, unlike the block types (try/else/finally) above/below.
        await assertFrameCaretPosition(page, breakFrameId, "below");
    });

    test("1-slot: content typed right after the trigger isn't lost or misplaced", async ({page}) => {
        // Regression test: content typed within the conversion's ~300ms debounce window used to
        // either get silently dropped, or land at the wrong position and spawn a stray sibling
        // frame, because the pending conversion cleared the browser Selection and never restored
        // proper editing focus afterwards. Both were fixed alongside generalising this mechanism.
        const frameId = await typeKeywordConversionTrigger(page, "raise", "Exception()");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.raise);
        expect(await getFrameHeaderText(page, frameId)).toContain("Exception");
        // Only one frame should exist -- confirms no stray sibling frame was spawned:
        await expect(page.locator(".frame-div")).toHaveCount(1);
    });

    test("2-slot keyword-split: \"for x in y\" splits across both labels", async ({page}) => {
        const frameId = await typeKeywordConversionTrigger(page, "for", "x in y");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.for);
        const text = await getFrameHeaderText(page, frameId);
        expect(text).toContain("x");
        expect(text).toContain("y");
    });

    test("2-slot bracket-split: \"def foo(a, b)\" splits name from params, and moves to Definitions", async ({page}) => {
        // Typed in Main, where a funcdef isn't allowed: it converts, then relocates to Definitions.
        const frameId = await typeKeywordConversionTrigger(page, "def", "foo(a, b)");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.funcdef);
        await expectFrameInContainer(page, frameId, DEFS_CONTAINER_ID);
        expect(await getFrameHeaderText(page, frameId)).toContain("foo");
    });
});

test.describe("Keyword-triggered frame conversion -- location gating", () => {
    test("return converts inside a function body", async ({page}) => {
        await createFunctionAndEnterBody(page);
        const frameId = await typeKeywordConversionTrigger(page, "return", "5 + 1");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.return);
        const text = await getFrameHeaderText(page, frameId);
        expect(text).toContain("5");
        expect(text).toContain("1");
    });

    test("return does NOT convert directly in Main", async ({page}) => {
        const frameId = await typeKeywordConversionTrigger(page, "return");
        await assertConversionDidNotHappen(page, frameId);
    });

    test("global converts inside a function body", async ({page}) => {
        await createFunctionAndEnterBody(page);
        const frameId = await typeKeywordConversionTrigger(page, "global", "x");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.global);
    });

    test("global does NOT convert directly in Main", async ({page}) => {
        const frameId = await typeKeywordConversionTrigger(page, "global");
        await assertConversionDidNotHappen(page, frameId);
    });

    test("break converts inside a loop body", async ({page}) => {
        await createForLoopAndEnterBody(page);
        const frameId = await typeKeywordConversionTrigger(page, "break");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.break);
    });

    test("continue converts inside a loop body", async ({page}) => {
        await createForLoopAndEnterBody(page);
        const frameId = await typeKeywordConversionTrigger(page, "continue");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.continue);
    });

    test("break does NOT convert directly in Main", async ({page}) => {
        const frameId = await typeKeywordConversionTrigger(page, "break");
        await assertConversionDidNotHappen(page, frameId);
    });

    test("continue does NOT convert directly in Main", async ({page}) => {
        const frameId = await typeKeywordConversionTrigger(page, "continue");
        await assertConversionDidNotHappen(page, frameId);
    });

    test("class typed in Main converts and moves to Definitions", async ({page}) => {
        const frameId = await typeKeywordConversionTrigger(page, "class");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.classdef);
        await expectFrameInContainer(page, frameId, DEFS_CONTAINER_ID);
    });

    test("import typed in Main converts and moves to Imports", async ({page}) => {
        const frameId = await typeKeywordConversionTrigger(page, "import");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.import);
        await expectFrameInContainer(page, frameId, IMPORTS_CONTAINER_ID);
    });

    test("import typed inside a function body converts and moves to Imports", async ({page}) => {
        await createFunctionAndEnterBody(page);
        const frameId = await typeKeywordConversionTrigger(page, "import");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.import);
        await expectFrameInContainer(page, frameId, IMPORTS_CONTAINER_ID);
    });

    test("class converts when the func-call frame is in Definitions", async ({page}) => {
        const frameId = await createFuncCallFrameIn(page, DEFS_CONTAINER_ID);
        await typeKeywordConversionTrigger(page, "class");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.classdef);
    });

    test("import typed inside a method of a class converts and moves to Imports", async ({page}) => {
        await createClassAndEnterMethodBody(page);
        const frameId = await typeKeywordConversionTrigger(page, "import", "os");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.import);
        expect(await getChildrenIds(page, IMPORTS_CONTAINER_ID)).toEqual([frameId]);
    });

    test("from-import typed inside a method of a class converts and moves to Imports", async ({page}) => {
        await createClassAndEnterMethodBody(page);
        const frameId = await typeKeywordConversionTrigger(page, "from", "os import path");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.fromimport);
        expect(await getChildrenIds(page, IMPORTS_CONTAINER_ID)).toEqual([frameId]);
    });

    test("import typed inside an if inside a method of a class moves to Imports", async ({page}) => {
        await createClassAndEnterMethodBody(page);
        await createIfAndEnterBody(page);
        const frameId = await typeKeywordConversionTrigger(page, "import", "os");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.import);
        expect(await getChildrenIds(page, IMPORTS_CONTAINER_ID)).toEqual([frameId]);
    });

    test("class typed inside a method of a class converts and moves to the top level of Definitions", async ({page}) => {
        const {classId} = await createClassAndEnterMethodBody(page);
        const frameId = await typeKeywordConversionTrigger(page, "class", "Inner");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.classdef);
        // Moved to the top of Definitions, not nested in the outer class:
        expect(await getChildrenIds(page, DEFS_CONTAINER_ID)).toEqual([frameId, classId]);
    });

    test("def typed inside a method of a class (a function inside a function inside a class) converts and moves to the top level of Definitions", async ({page}) => {
        const {classId} = await createClassAndEnterMethodBody(page);
        const frameId = await typeKeywordConversionTrigger(page, "def", "helper()");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.funcdef);
        expect(await getChildrenIds(page, DEFS_CONTAINER_ID)).toEqual([frameId, classId]);
        expect(await getFrameHeaderText(page, frameId)).toContain("helper");
    });

    test("def typed inside a top-level function converts and moves to the top level of Definitions", async ({page}) => {
        await createFunctionAndEnterBody(page);
        const outerId = (await getChildrenIds(page, DEFS_CONTAINER_ID))[0];
        const frameId = await typeKeywordConversionTrigger(page, "def", "helper()");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.funcdef);
        expect(await getChildrenIds(page, DEFS_CONTAINER_ID)).toEqual([frameId, outerId]);
    });

    test("class typed inside a top-level function converts and moves to the top level of Definitions", async ({page}) => {
        await createFunctionAndEnterBody(page);
        const outerId = (await getChildrenIds(page, DEFS_CONTAINER_ID))[0];
        const frameId = await typeKeywordConversionTrigger(page, "class", "Inner");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.classdef);
        expect(await getChildrenIds(page, DEFS_CONTAINER_ID)).toEqual([frameId, outerId]);
    });

    test("an if typed inside a method of a class converts and stays in the method", async ({page}) => {
        const {methodId} = await createClassAndEnterMethodBody(page);
        const frameId = await typeKeywordConversionTrigger(page, "if", "x");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.if);
        expect(await getChildrenIds(page, methodId)).toEqual([frameId]);
    });

    test("library typed in Main converts and moves to Imports", async ({page}) => {
        const frameId = await typeKeywordConversionTrigger(page, "library");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.library);
        await expectFrameInContainer(page, frameId, IMPORTS_CONTAINER_ID);
    });

    test("if typed in Imports converts and moves to Main", async ({page}) => {
        const frameId = await createFuncCallFrameIn(page, IMPORTS_CONTAINER_ID);
        await typeKeywordConversionTrigger(page, "if", "x");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.if);
        await expectFrameInContainer(page, frameId, MAIN_CONTAINER_ID);
    });

    test("for typed in Definitions converts and moves to Main", async ({page}) => {
        const frameId = await createFuncCallFrameIn(page, DEFS_CONTAINER_ID);
        await typeKeywordConversionTrigger(page, "for", "x");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.for);
        await expectFrameInContainer(page, frameId, MAIN_CONTAINER_ID);
    });

    test("return typed in Imports does NOT convert (not valid at the top level of Main either)", async ({page}) => {
        const frameId = await createFuncCallFrameIn(page, IMPORTS_CONTAINER_ID);
        await typeKeywordConversionTrigger(page, "return");
        await assertConversionDidNotHappen(page, frameId);
    });

    test("library converts when the func-call frame is in Imports", async ({page}) => {
        const frameId = await createFuncCallFrameIn(page, IMPORTS_CONTAINER_ID);
        await typeKeywordConversionTrigger(page, "library");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.library);
    });

    test("match converts directly in Main", async ({page}) => {
        const frameId = await typeKeywordConversionTrigger(page, "match", "x");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.match);
    });

    test("case does NOT convert directly in Main", async ({page}) => {
        const frameId = await typeKeywordConversionTrigger(page, "case");
        await assertConversionDidNotHappen(page, frameId);
    });
});

test.describe("Keyword-triggered frame conversion -- joint frames (elif/else/except/finally)", () => {
    test("elif converts when typed as the last statement in an if's body", async ({page}) => {
        await createIfAndEnterBody(page);
        const frameId = await typeKeywordConversionTrigger(page, "elif", "y");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.elif);
        expect(await getFrameHeaderText(page, frameId)).toContain("y");
    });

    test("else converts when typed as the last statement in an if's body, caret left inside its (empty) body", async ({page}) => {
        await createIfAndEnterBody(page);
        const frameId = await typeKeywordConversionTrigger(page, "else");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.else);
        // Regression test: else has no editable slot (its label is fixed "else :"), but it does
        // allow children -- the caret must land inside its body, not disappear entirely.
        await assertFrameCaretPosition(page, frameId, "body");
    });

    test("elif does NOT convert directly in Main (no preceding if to attach to)", async ({page}) => {
        const frameId = await typeKeywordConversionTrigger(page, "elif", "y");
        await assertConversionDidNotHappen(page, frameId);
    });

    test("else does NOT convert directly in Main (no preceding if to attach to)", async ({page}) => {
        const frameId = await typeKeywordConversionTrigger(page, "else");
        await assertConversionDidNotHappen(page, frameId);
    });

    test("elif converts when typed inside an already-existing elif's body (chained)", async ({page}) => {
        await createIfAndEnterBody(page);
        const elifId = await typeKeywordConversionTrigger(page, "elif", "y");
        await assertFrameType(page, elifId, AllFrameTypesIdentifier.elif);
        await page.locator(`#frameBodyId_${elifId}`).click();
        await waitForEditorSettled(page);
        const secondElifId = await typeKeywordConversionTrigger(page, "elif", "z");
        await assertFrameType(page, secondElifId, AllFrameTypesIdentifier.elif);
    });

    test("else converts when typed inside an already-existing elif's body (chained)", async ({page}) => {
        await createIfAndEnterBody(page);
        const elifId = await typeKeywordConversionTrigger(page, "elif", "y");
        await assertFrameType(page, elifId, AllFrameTypesIdentifier.elif);
        await page.locator(`#frameBodyId_${elifId}`).click();
        await waitForEditorSettled(page);
        const elseId = await typeKeywordConversionTrigger(page, "else");
        await assertFrameType(page, elseId, AllFrameTypesIdentifier.else);
    });

    test("a second else does NOT convert after an if already has one (else is unique)", async ({page}) => {
        await createIfAndEnterBody(page);
        const elseId = await typeKeywordConversionTrigger(page, "else");
        await assertFrameType(page, elseId, AllFrameTypesIdentifier.else);
        // Move into the (now-converted) else's own empty body to attempt a further joint there:
        await page.locator(`#frameBodyId_${elseId}`).click();
        await waitForEditorSettled(page);
        const secondFrameId = await typeKeywordConversionTrigger(page, "else");
        await assertConversionDidNotHappen(page, secondFrameId);
    });

    test("except converts when typed as the last statement in a try's body", async ({page}) => {
        await page.keyboard.press(" ");
        await page.keyboard.press("t"); // try (auto-creates a default except joint)
        await waitForEditorSettled(page);
        const tryId = await getFrameIdByType(page, AllFrameTypesIdentifier.try);
        await page.locator(`#frameBodyId_${tryId}`).click();
        await waitForEditorSettled(page);
        const frameId = await typeKeywordConversionTrigger(page, "except", "ValueError");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.except);
        expect(await getFrameHeaderText(page, frameId)).toContain("ValueError");
    });

    test("\"except\" then space converts and focuses the (empty) expression slot", async ({page}) => {
        await page.keyboard.press(" ");
        await page.keyboard.press("t"); // try (auto-creates a default except joint)
        await waitForEditorSettled(page);
        const tryId = await getFrameIdByType(page, AllFrameTypesIdentifier.try);
        await page.locator(`#frameBodyId_${tryId}`).click();
        await waitForEditorSettled(page);
        const frameId = await typeKeywordConversionTrigger(page, "except");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.except);
        expect(await getFirstSlotText(page, frameId)).toEqual("");
        // Space keeps the user in the expression slot, ready to type the exception type -- a text
        // cursor should be focused, not a frame-level (blue) caret:
        await checkFrameXorTextCursor(page, false, "Expected a text cursor focused in except's expression slot after space");
    });

    test("\"except\" then colon converts, leaves the expression slot blank, and moves the caret into its body", async ({page}) => {
        await page.keyboard.press(" ");
        await page.keyboard.press("t"); // try (auto-creates a default except joint)
        await waitForEditorSettled(page);
        const tryId = await getFrameIdByType(page, AllFrameTypesIdentifier.try);
        await page.locator(`#frameBodyId_${tryId}`).click();
        await waitForEditorSettled(page);
        const frameId = await typeKeywordConversionTriggerViaColon(page, "except");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.except);
        expect(await getFirstSlotText(page, frameId)).toEqual("");
        // Unlike space, a colon signals "done" (a bare except) -- the caret should move into the
        // except's own (empty) body rather than staying focused in the expression slot:
        await assertFrameCaretPosition(page, frameId, "body");
    });

    test("\"except\" then Enter converts, leaves the expression slot blank, and moves the caret into its body", async ({page}) => {
        await page.keyboard.press(" ");
        await page.keyboard.press("t"); // try (auto-creates a default except joint)
        await waitForEditorSettled(page);
        const tryId = await getFrameIdByType(page, AllFrameTypesIdentifier.try);
        await page.locator(`#frameBodyId_${tryId}`).click();
        await waitForEditorSettled(page);
        const frameId = await typeKeywordConversionTriggerViaEnter(page, "except");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.except);
        expect(await getFirstSlotText(page, frameId)).toEqual("");
        // Same as colon -- Enter also signals "done" here, same as it does for return:
        await assertFrameCaretPosition(page, frameId, "body");
    });

    test("finally converts when typed inside an already-existing except's body, caret left inside its (empty) body", async ({page}) => {
        await page.keyboard.press(" ");
        await page.keyboard.press("t"); // try (auto-creates a default except joint)
        await waitForEditorSettled(page);
        const exceptId = await getFrameIdByType(page, AllFrameTypesIdentifier.except);
        await page.locator(`#frameBodyId_${exceptId}`).click();
        await waitForEditorSettled(page);
        const frameId = await typeKeywordConversionTrigger(page, "finally");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.finally);
        // Regression test: finally has no editable slot either -- same caret-placement bug as else.
        await assertFrameCaretPosition(page, frameId, "body");
    });

    test("except does NOT convert directly in Main (no preceding try to attach to)", async ({page}) => {
        const frameId = await typeKeywordConversionTrigger(page, "except", "ValueError");
        await assertConversionDidNotHappen(page, frameId);
    });

    test("finally does NOT convert directly in Main (no preceding try to attach to)", async ({page}) => {
        const frameId = await typeKeywordConversionTrigger(page, "finally");
        await assertConversionDidNotHappen(page, frameId);
    });
});

test.describe("Keyword-triggered frame conversion -- joint frames, attaching directly after the root", () => {
    // navigateToFrameCaret(page, id, "below") moves the caret to a normal sibling position one
    // level up from id's own body (not nested inside it) -- the position these tests need but that
    // createIfAndEnterBody (and the "nested" describe block above) deliberately don't reach.

    test("else converts when typed directly after an if (not nested inside its body)", async ({page}) => {
        await page.keyboard.press(" ");
        await page.keyboard.press("i"); // if
        await waitForEditorSettled(page);
        const ifId = await getFocusedFrameId(page);
        await page.keyboard.type("x");
        await waitForEditorSettled(page);
        await navigateToFrameCaret(page, ifId, "below");
        const frameId = await typeKeywordConversionTrigger(page, "else");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.else);
        expect(await getJointParentId(page, frameId)).toEqual(ifId);
    });

    test("elif converts when typed directly after an if (not nested inside its body)", async ({page}) => {
        await page.keyboard.press(" ");
        await page.keyboard.press("i"); // if
        await waitForEditorSettled(page);
        const ifId = await getFocusedFrameId(page);
        await page.keyboard.type("x");
        await waitForEditorSettled(page);
        await navigateToFrameCaret(page, ifId, "below");
        const frameId = await typeKeywordConversionTrigger(page, "elif", "y");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.elif);
        expect(await getJointParentId(page, frameId)).toEqual(ifId);
    });

    test("except converts when typed directly after a try that has no joints yet", async ({page}) => {
        await page.keyboard.press(" ");
        await page.keyboard.press("t"); // try (auto-creates a default except joint)
        await waitForEditorSettled(page);
        const tryId = await getFrameIdByType(page, AllFrameTypesIdentifier.try);
        await navigateToFrameCaret(page, tryId, "below");
        const frameId = await typeKeywordConversionTrigger(page, "except", "ValueError");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.except);
        expect(await getJointParentId(page, frameId)).toEqual(tryId);
    });

    test("finally converts when typed directly after a try that already has an except (appends at the end of the existing chain)", async ({page}) => {
        await page.keyboard.press(" ");
        await page.keyboard.press("t"); // try (auto-creates a default except joint)
        await waitForEditorSettled(page);
        const tryId = await getFrameIdByType(page, AllFrameTypesIdentifier.try);
        await navigateToFrameCaret(page, tryId, "below");
        const frameId = await typeKeywordConversionTrigger(page, "finally");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.finally);
        expect(await getJointParentId(page, frameId)).toEqual(tryId);
    });

    test("else does NOT convert when typed directly after a plain (non-joint-eligible) statement", async ({page}) => {
        await page.keyboard.type("x"); // plain func-call, not an if/try/for/while
        await waitForEditorSettled(page);
        const xId = await getFocusedFrameId(page);
        await navigateToFrameCaret(page, xId, "below");
        const frameId = await typeKeywordConversionTrigger(page, "else");
        await assertConversionDidNotHappen(page, frameId);
    });

    test("else converts directly after an if even when another statement already follows it at the same level", async ({page}) => {
        await page.keyboard.press(" ");
        await page.keyboard.press("i"); // if
        await waitForEditorSettled(page);
        const ifId = await getFocusedFrameId(page);
        await page.keyboard.type("x");
        await waitForEditorSettled(page);
        await navigateToFrameCaret(page, ifId, "below");
        await page.keyboard.type("a");
        await waitForEditorSettled(page);
        const frameId = await getFocusedFrameId(page);
        await clearFrameContent(page, frameId, "a".length);

        // Add a trailing statement directly after frameId via the store rather than navigating
        // away through the UI and back -- see insertBlankFuncCallAfter's comment for why -- so
        // frameId is no longer the last statement at its level, without disturbing its own still-
        // focused (now empty) slot.
        const trailingId = await insertBlankFuncCallAfter(page, frameId, "z");
        await waitForEditorSettled(page);

        await typeKeywordConversionTrigger(page, "else");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.else);
        expect(await getJointParentId(page, frameId)).toEqual(ifId);
        // The trailing statement should still be there, now directly after the whole if/else:
        expect(await getFrameHeaderText(page, trailingId)).toContain("z");
    });

    test("nested if inside if: else typed directly after the inner if attaches to the OUTER if (ambiguity resolves to the nested rule)", async ({page}) => {
        const outerId = await createIfAndEnterBody(page);
        await page.keyboard.press(" ");
        await page.keyboard.press("i"); // inner if
        await waitForEditorSettled(page);
        const innerId = await getFocusedFrameId(page);
        await page.keyboard.type("y");
        await waitForEditorSettled(page);
        // Below the inner if, but still nested inside the outer if's own body:
        await navigateToFrameCaret(page, innerId, "below");
        const frameId = await typeKeywordConversionTrigger(page, "else");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.else);
        expect(await getJointParentId(page, frameId)).toEqual(outerId);
        expect(await getJointParentId(page, frameId)).not.toEqual(innerId);
    });

    test("nested if inside if: else typed inside the inner if's own body attaches to the INNER if", async ({page}) => {
        const outerId = await createIfAndEnterBody(page);
        await page.keyboard.press(" ");
        await page.keyboard.press("i"); // inner if
        await waitForEditorSettled(page);
        const innerId = await getFocusedFrameId(page);
        await page.keyboard.type("y");
        await waitForEditorSettled(page);
        await page.locator(`#frameBodyId_${innerId}`).click();
        await waitForEditorSettled(page);
        const frameId = await typeKeywordConversionTrigger(page, "else");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.else);
        expect(await getJointParentId(page, frameId)).toEqual(innerId);
        expect(await getJointParentId(page, frameId)).not.toEqual(outerId);
    });
});

test.describe("Keyword-triggered frame conversion -- Enter as trigger", () => {
    test("1-slot: \"if\" then Enter converts, same as \"if \"", async ({page}) => {
        const frameId = await typeKeywordConversionTriggerViaEnter(page, "if");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.if);
    });

    test("0-slot: \"try\" then Enter converts, caret left inside its (empty) body", async ({page}) => {
        const frameId = await typeKeywordConversionTriggerViaEnter(page, "try");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.try);
        await assertFrameCaretPosition(page, frameId, "body");
    });

    test("joint frame: \"else\" then Enter converts when typed as the last statement in an if's body", async ({page}) => {
        await createIfAndEnterBody(page);
        const frameId = await typeKeywordConversionTriggerViaEnter(page, "else");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.else);
    });

    test("location gating still applies via Enter: \"return\" then Enter does NOT convert directly in Main", async ({page}) => {
        const frameId = await typeKeywordConversionTriggerViaEnter(page, "return");
        await assertConversionDidNotHappen(page, frameId);
    });

    test("\"return\" then space converts and focuses the (empty) expression slot", async ({page}) => {
        await createFunctionAndEnterBody(page);
        const frameId = await typeKeywordConversionTrigger(page, "return");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.return);
        expect(await getFirstSlotText(page, frameId)).toEqual("");
        // Space keeps the user in the expression slot, ready to type the returned value -- a
        // text cursor should be focused, not a frame-level (blue) caret:
        await checkFrameXorTextCursor(page, false, "Expected a text cursor focused in return's expression slot after space");
    });

    test("\"return\" then Enter converts, leaves the expression slot blank, and moves the caret below", async ({page}) => {
        await createFunctionAndEnterBody(page);
        const frameId = await typeKeywordConversionTriggerViaEnter(page, "return");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.return);
        expect(await getFirstSlotText(page, frameId)).toEqual("");
        // Unlike space, Enter signals "done" -- the caret should move on to the next line rather
        // than staying focused in the now-empty expression slot:
        await assertFrameCaretPosition(page, frameId, "below");
    });

    test("an unrecognised word then Enter does not convert, and still moves the caret to the next line as normal", async ({page}) => {
        const frameId = await typeConversionTriggerViaEnter(page, "banana");
        await assertConversionDidNotHappen(page, frameId);
        expect(await getFirstSlotText(page, frameId)).toEqual("banana");
        // Enter's normal "move to the next line" behaviour must still happen when nothing converted:
        await assertFrameCaretPosition(page, frameId, "below");
    });
});

test.describe("Keyword-triggered frame conversion -- colon as trigger for colon-ending types", () => {
    test("0-slot with a colon label: \"try:\" converts, same as \"try \"", async ({page}) => {
        const frameId = await typeKeywordConversionTriggerViaColon(page, "try");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.try);
        await assertFrameCaretPosition(page, frameId, "body");
    });

    test("joint frame: \"else:\" converts when typed as the last statement in an if's body", async ({page}) => {
        await createIfAndEnterBody(page);
        const frameId = await typeKeywordConversionTriggerViaColon(page, "else");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.else);
    });

    test("joint frame: \"finally:\" converts when typed inside an already-existing except's body", async ({page}) => {
        await page.keyboard.press(" ");
        await page.keyboard.press("t"); // try (auto-creates a default except joint)
        await waitForEditorSettled(page);
        const exceptId = await getFrameIdByType(page, AllFrameTypesIdentifier.except);
        await page.locator(`#frameBodyId_${exceptId}`).click();
        await waitForEditorSettled(page);
        const frameId = await typeKeywordConversionTriggerViaColon(page, "finally");
        await assertFrameType(page, frameId, AllFrameTypesIdentifier.finally);
    });

    test("location gating still applies via colon: \"else:\" does NOT convert directly in Main (no preceding if)", async ({page}) => {
        const frameId = await typeConversionTriggerViaColon(page, "else");
        await assertConversionDidNotHappen(page, frameId);
    });

    test("location gating still applies via colon: \"except:\" does NOT convert directly in Main (no preceding try)", async ({page}) => {
        const frameId = await typeKeywordConversionTriggerViaColon(page, "except");
        await assertConversionDidNotHappen(page, frameId);
    });

    test("0-slot WITHOUT a colon label: \"break:\" does NOT convert (break has no colon to complete)", async ({page}) => {
        await createForLoopAndEnterBody(page);
        const frameId = await typeConversionTriggerViaColon(page, "break");
        await assertConversionDidNotHappen(page, frameId);
        // ":" is parsed as its own operator slot rather than staying part of the name field, so the
        // full header text (not just the first slot) is needed to see it's still there literally:
        expect(await getFrameHeaderText(page, frameId)).toContain("break");
        expect(await getFrameHeaderText(page, frameId)).toContain(":");
    });
});

test.describe("Frame-not-allowed-here error check", () => {
    test("normal if/elif/else and try/except/finally do not spuriously error", async ({page}) => {
        await page.keyboard.press(" ");
        await page.keyboard.press("i"); // if
        await waitForEditorSettled(page);
        await page.keyboard.type("x");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown"); // out of the if's (empty) body
        await waitForEditorSettled(page);
        await page.keyboard.press(" ");
        await page.keyboard.press("e"); // else
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowUp"); // back onto the if to add try/except inside its body
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await page.keyboard.press(" ");
        await page.keyboard.press("t"); // try (auto-creates an except)
        await waitForEditorSettled(page);

        const ifFrameId = await getFrameIdByType(page, AllFrameTypesIdentifier.if);
        const tryFrameId = await getFrameIdByType(page, AllFrameTypesIdentifier.try);
        await assertFrameHasError(page, ifFrameId, false);
        await assertFrameHasError(page, tryFrameId, false);
    });

    test("a frame relocated somewhere its parent forbids is flagged, and clears once fixed", async ({page}) => {
        await page.keyboard.type("x");
        await waitForEditorSettled(page);
        const frameId = await getFocusedFrameId(page);
        // funccall is forbidden directly inside Definitions (only funcdef/classdef/comment/
        // varassign are allowed there -- see DefsContainerDefinition.forbiddenChildrenTypes):
        await relocateFrameToContainer(page, frameId, DEFS_CONTAINER_ID);
        await focusThenBlurFrame(page, frameId);
        await assertFrameHasError(page, frameId, true);

        // Move it back to Main, where funccall is allowed, and confirm the error clears:
        await relocateFrameToContainer(page, frameId, MAIN_CONTAINER_ID);
        await focusThenBlurFrame(page, frameId);
        await assertFrameHasError(page, frameId, false);
    });
});
