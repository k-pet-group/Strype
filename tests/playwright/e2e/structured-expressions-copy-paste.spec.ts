import {Page, test, expect} from "@playwright/test";
import {typeIndividually, doPagePaste, doTextHomeEndKeyPress, assertStateOfIfFrame, waitForEditorSettled} from "../support/editor";
import { setupStrypeTest } from "../support/general";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {
        timeoutMs: 60_000,
        skipPyodide: true,
        fakeClipboard: true,
        gotoWaitUntil: "domcontentloaded",
        skipWindowsWebkitReason: "Skipping on WebKit + Windows due to clipboard permission issues.",
    });
});

function testSelection(code : string, startIndex: number, endIndex: number, secondEntry : string | ((page: Page) => Promise<void>), expectedAfter : string, extraTitle?: string) : void {
    test("Tests selecting in " + code + " from " + startIndex + " to " + endIndex + " then " + secondEntry + " " + extraTitle, async ({page}) => {
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await waitForEditorSettled(page);
        await assertStateOfIfFrame(page, "{$}");
        await typeIndividually(page, code);
        await doTextHomeEndKeyPress(page, false, false); // To handle the issue with macOS, see the method details (equivalent to "home").
        for (let i = 0; i < startIndex; i++) {
            await page.keyboard.press("ArrowRight");
            await waitForEditorSettled(page);
        }
        while (startIndex < endIndex) {
            await page.keyboard.press("Shift+ArrowRight");
            await waitForEditorSettled(page);
            startIndex += 1;
        }
        while (endIndex < startIndex) {
            await page.keyboard.press("Shift+ArrowLeft");
            await waitForEditorSettled(page);
            startIndex -= 1;
        }
        if (typeof secondEntry == "string") {
            await typeIndividually(page, secondEntry);
        }
        else {
            await secondEntry(page);
        }
        await waitForEditorSettled(page);
        await assertStateOfIfFrame(page, expectedAfter);
    });
}

function testPasteOverBoth(code: string, startIndex: number, endIndex: number, thenPaste: string, expectedAfter : string) : void {
    // Test selecting from start to end:
    testSelection(code, startIndex, endIndex, (page) => doPagePaste(page, thenPaste), expectedAfter, "paste " + thenPaste);
    // Then end to start (if it's not exactly the same):
    if (startIndex != endIndex) {
        testSelection(code, endIndex, startIndex, (page) => doPagePaste(page, thenPaste), expectedAfter, "paste " + thenPaste);
    }
}

enum CUT_COPY_TEST { CUT_ONLY, COPY_ONLY, CUT_REPASTE }

function testCutCopy(code : string, stepsToBegin: number, stepsWhileSelecting: number, expectedClipboard : string, expectedAfter : string, kind: CUT_COPY_TEST) : void {
    test(`Tests selecting then ${CUT_COPY_TEST[kind]} in ${code} from ${stepsToBegin} + ${stepsWhileSelecting}`, async ({page, context}) => {        
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await waitForEditorSettled(page);
        await assertStateOfIfFrame(page, "{$}");
        await typeIndividually(page, code);
        await doTextHomeEndKeyPress(page, false, false); // To handle the issue with macOS, see the method details.
        for (let i = 0; i < stepsToBegin; i++) {
            await page.keyboard.press("ArrowRight");
            await waitForEditorSettled(page);
        }
        while (stepsWhileSelecting > 0) {
            await page.keyboard.press("Shift+ArrowRight");
            await waitForEditorSettled(page);
            stepsWhileSelecting -= 1;
        }
        while (stepsWhileSelecting < 0) {
            await page.keyboard.press("Shift+ArrowLeft");
            await waitForEditorSettled(page);
            stepsWhileSelecting += 1;
        }
        await page.keyboard.press(kind == CUT_COPY_TEST.COPY_ONLY ? "ControlOrMeta+c" : "ControlOrMeta+x");
        // Writing to the OS clipboard is an async step outside the page with no page-side signal
        // to wait on, so poll the read side instead of guessing how long the write takes:
        await expect.poll(() => page.evaluate("navigator.clipboard.readText()")).toEqual(expectedClipboard);
        if (kind == CUT_COPY_TEST.CUT_REPASTE) {
            // Can't use shortcut because it doesn't read from our mock clipboard:
            //await page.keyboard.press("ControlOrMeta+v");
            // So instead we must send our own paste event. The poll above already confirmed the
            // clipboard holds exactly expectedClipboard, so re-use that instead of a fresh read:
            await doPagePaste(page, expectedClipboard);
        }
        await assertStateOfIfFrame(page, expectedAfter);
    });
}

function testCutCopyBothWays(code: string, stepsToStart: number, stepsToEnd: number, stepsBetweenWithShift: number, expectedClipboard: string, expectedAfterCut : string, expectedAfterCopy: string) : void {
    // Test cutting from start to end then end to start:
    testCutCopy(code, stepsToStart, stepsBetweenWithShift, expectedClipboard, expectedAfterCut, CUT_COPY_TEST.CUT_ONLY);
    testCutCopy(code, stepsToEnd, -stepsBetweenWithShift, expectedClipboard, expectedAfterCut, CUT_COPY_TEST.CUT_ONLY);
    // Copying is similar, but state should be unchanged:
    // Only thing is, because selection remains, cursor pos is different each way,
    // so we label with | and $ and remove/swap accordingly:
    testCutCopy(code, stepsToStart, stepsBetweenWithShift, expectedClipboard, expectedAfterCopy.replace("|", ""), CUT_COPY_TEST.COPY_ONLY);
    testCutCopy(code, stepsToEnd, -stepsBetweenWithShift, expectedClipboard, expectedAfterCopy.replace("$", "").replace("|", "$"), CUT_COPY_TEST.COPY_ONLY);
    
    // Now, test cutting followed by pasting.  Note that state after is the unmodified one,
    // so it's actually expectedAfterCopy even though we are cutting and pasting.
    // But the cursor will always be at the end, never at the beginning:
    testCutCopy(code, stepsToStart, stepsBetweenWithShift, expectedClipboard, expectedAfterCopy.replace("|", ""), CUT_COPY_TEST.CUT_REPASTE);
    testCutCopy(code, stepsToEnd, -stepsBetweenWithShift, expectedClipboard, expectedAfterCopy.replace("|", ""), CUT_COPY_TEST.CUT_REPASTE);
}

test.describe("Selecting then cutting/copying", () => {
     
    testCutCopyBothWays("123456", 2, 4, 2, "34", "{12$56}", "{12|34$56}");
    testCutCopyBothWays("123+456", 2, 5, 3, "3+4", "{12$56}", "{12|3}+{4$56}");

    // Note that to select the bracket is one, so to go from before 3 to before 0 is actually 4 steps
    testCutCopyBothWays("123+(456*789)-0", 2, 14, 4, "3+(456*789)-", "{12$0}", "{12|3}+{}_({456}*{789})_{}-{$0}");
    
    // Check we don't see zero-width spaces:
    testCutCopyBothWays("fax()", 2, 5, 2, "x()", "{fa$}", "{fa|x}_({})_{$}");
    
    // Check that strings are copied correctly:
    testCutCopyBothWays("\"\"", 0, 2, 1, "\"\"", "{$}", "{|}_“”_{$}");
    testCutCopyBothWays("''", 0, 2, 1, "''", "{$}", "{|}_‘’_{$}");
});

test.describe("Paste over selection", () => {
    testPasteOverBoth("foo", 0, 0, "to", "{to$foo}");
    testPasteOverBoth("man", 1, 2, "oo", "{moo$n}");
    testPasteOverBoth("foo.bar", 3, 4, "z", "{fooz$bar}");

    testPasteOverBoth("\"hi\"", 0, 4, "bye", "{bye$}");
    testPasteOverBoth("474+8", 0, 5, "1/2", "{1}/{2$}");
    testPasteOverBoth("474+8", 0, 5, "\"bye\"", "{}_“bye”_{$}");
    testPasteOverBoth("474+8", 0, 5, "foo", "{foo$}");

    testPasteOverBoth("(474+8)", 0, 7, "1/2", "{1}/{2$}");
    testPasteOverBoth("(474+8)", 0, 7, "\"bye\"", "{}_“bye”_{$}");
    testPasteOverBoth("(474+8)", 0, 7, "foo", "{foo$}");
    
    testPasteOverBoth("(474+8)", 3, 5, "foo", "{}_({47foo$8})_{}");
    testPasteOverBoth("(474+8)", 3, 5, "2.", "{}_({472.$8})_{}");
    testPasteOverBoth("(474+8)", 3, 5, "1/", "{}_({471}/{$8})_{}");

    testPasteOverBoth("11+(22*33)/44", 4, 9, "55", "{11}+{}_({55$})_{}/{44}");
    testPasteOverBoth("11+(22*33)/44", 5, 8, "55", "{11}+{}_({255$3})_{}/{44}");
    testPasteOverBoth("11+(22*33)/44", 4, 9, "55*(66-77)", "{11}+{}_({55}*{}_({66}-{77})_{$})_{}/{44}");
});


