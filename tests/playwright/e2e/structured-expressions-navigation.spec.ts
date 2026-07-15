import {Page, test, expect} from "@playwright/test";
import path from "path";
import {assertStateOfIfFrame, checkFrameXorTextCursor, checkTextSlotCursorPos, doPagePaste, getDefaultStrypeProjectDocumentationFullLine, pressN, waitForEditorSettled} from "../support/editor";
import fs from "fs";
import {readFileSync} from "node:fs";
import {save} from "../support/loading-saving";
import { setupStrypeTest } from "../support/general";

let scssVars: {[varName: string]: string};
test.beforeEach(async ({ page, browserName }, testInfo) => {
    // On Github Actions, even loading the local page has been seen to take > 30s!
    // 120s wasn't enough margin even after 2455cf14's shrink: CI run 29351662646 showed all
    // three of this describe block's tests needing a retry on Firefox, two of them twice, with
    // first-attempt durations up to 136.8s against the 120s wall -- bumped for headroom.
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 180_000, skipPyodide: true, readyTimeoutMs: 60000});
    scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
});

async function clickId(page: Page, getIdClientSide: () => void) {
    const id = await page.evaluate(getIdClientSide);
    await page.click("#" + id);
}

async function loadPY(page: Page, filepath: string) {
    await clickId(page, () => (window as any)["StrypeHTMLELementsIDsGlobals"].getEditorMenuUID());
    await clickId(page, () => (window as any)["StrypeHTMLELementsIDsGlobals"].getLoadProjectLinkId());
    const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        // The "button" for the target selection is now a div element.
        clickId(page, () => (window as any)["StrypeHTMLELementsIDsGlobals"].getLoadFromFSStrypeButtonId()),
    ]);
    await fileChooser.setFiles(path.join(__dirname, filepath));

    // Wait for everything to settle. This loads a whole project's worth of frames (much bigger
    // than a single keystroke), so give it more headroom than waitForEditorSettled's default:
    await waitForEditorSettled(page, 20000);
    // Check it actually loaded:
    const count = await page.getByText("randint").count();
    expect(count).toEqual(1);

    // Get to the top, and may as well sanity check as we go:
    for (let i = 0; i < 30; i++) {
        await checkFrameXorTextCursor(page);
        await page.keyboard.press("ArrowUp");
        await waitForEditorSettled(page);
    }
}

// With regards to Chromium: several of these tests fail on Chromium in Playwright on Mac and
// I can't figure out why.  I've tried them manually in Chrome and Chromium on the same
// machine and it works fine, but I see in the video that the test fails in Playwright
// (pressing right out of a comment frame puts the cursor at the beginning and makes a frame cursor).
// Since it works in the real browsers, and on Webkit and Firefox, we just skip the tests in Chromium
test.describe("Check navigation", () => {
    test("Starts valid", async ({page}) => {
        await checkFrameXorTextCursor(page);
    });
    test("Right arrow through a file", async ({page}, testInfo) => {
        if (testInfo.project.name === "chromium") {
            test.skip(); // See comment above
        }
        await loadPY(page, "../../cypress/fixtures/structured-expr-nav-small.spy");
        for (let i = 0; i < 50; i++) {
            await checkFrameXorTextCursor(page);
            await page.keyboard.press("ArrowRight");
            await waitForEditorSettled(page);
        }
    });
    // Down by itself won't go into slots, so we do down-down-left which should get to the end.
    test("Down-down-left arrow through a file", async ({page}, testInfo) => {
        if (testInfo.project.name === "chromium") {
            test.skip(); // See comment above
        }
        await loadPY(page, "../../cypress/fixtures/structured-expr-nav-small.spy");
        for (let i = 0; i < 17; i++) {
            await checkFrameXorTextCursor(page);
            await page.keyboard.press("ArrowDown");
            await waitForEditorSettled(page);
            await checkFrameXorTextCursor(page);
            await page.keyboard.press("ArrowDown");
            await waitForEditorSettled(page);
            await checkFrameXorTextCursor(page);
            await page.keyboard.press("ArrowLeft");
            await waitForEditorSettled(page);
        }
    });
    test("Tab through a file", async ({page}, testInfo) => {
        if (testInfo.project.name === "chromium") {
            test.skip(); // See comment above
        }
        await loadPY(page, "../../cypress/fixtures/structured-expr-nav-small.spy");
        for (let i = 0; i < 50; i++) {
            await checkFrameXorTextCursor(page);
            await page.keyboard.press("Tab");
            await waitForEditorSettled(page);
        }
    });
    test("Down-down-shift-tab through a file", async ({page}, testInfo) => {
        if (testInfo.project.name === "chromium") {
            test.skip(); // See comment above
        }
        await loadPY(page, "../../cypress/fixtures/structured-expr-nav-small.spy");
        for (let i = 0; i < 17; i++) {
            await checkFrameXorTextCursor(page);
            await page.keyboard.press("ArrowDown");
            await waitForEditorSettled(page);
            await checkFrameXorTextCursor(page);
            await page.keyboard.press("ArrowDown");
            await waitForEditorSettled(page);
            await checkFrameXorTextCursor(page);
            await page.keyboard.press("Shift+Tab");
            await waitForEditorSettled(page);
        }
    });
    test("Tab through two empty assignments", async ({page}, testInfo) => {
        if (testInfo.project.name === "chromium") {
            test.skip(); // See comment above
        }
        await page.keyboard.press("Delete");
        await page.keyboard.press("Delete");
        await page.keyboard.press("=");
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await page.keyboard.press("=");
        await page.keyboard.press("ArrowUp");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowUp");
        await waitForEditorSettled(page);
        // We had a bug where tab needed to be pressed twice after coming out of the frame, so
        // we check explicitly here the ordering of text and frame.  Essentially, we start on frame cursor,
        // tab through both empty text slots then back to frame cursor.  Tab again at the end shouldn't change things:
        const expectedFrameCursor = [true, false, false, true, false, false, true, true];
        for (let i = 0; i < expectedFrameCursor.length; i++) {
            await checkFrameXorTextCursor(page, expectedFrameCursor[i]);
            await page.keyboard.press("Tab");
            await waitForEditorSettled(page);
        }
    });
});

test.describe("Check clicking near image literal", () => {
    // Bug https://github.com/k-pet-group/Strype/issues/473:
    test("Click near image literal", async ({page}) => {
        await page.keyboard.press("Delete");
        await page.keyboard.press("Delete");
        await page.keyboard.type(" ");
        await page.keyboard.type("Actor(");
        const image = fs.readFileSync("src/assetsFilesystem/images/cat-test.jpg").toString("base64");
        await doPagePaste(page, image, "image/jpeg");
        await waitForEditorSettled(page);
        const element = await page.$("." + scssVars.labelSlotMediaClassName);
        if (!element) {
            throw new Error("Element not found");
        }
        const box = await element.boundingBox();
        if (!box) {
            throw new Error("Bounding box not available");
        }
        const clickX = box.x + box.width + 5; // 5px to the right
        const clickY = box.y + box.height / 2; // vertically centered
        await page.mouse.click(clickX, clickY);
        await page.keyboard.type(".foo", {delay: 100});

        const savePath = await save(page);
        const contents = readFileSync(savePath, "utf8");
        expect(contents).toEqual(`
#(=> Strype:1:std
${getDefaultStrypeProjectDocumentationFullLine()}#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
Actor(load_image("data:image/jpeg;base64,${image}").foo) 
#(=> Section:End
`.trimStart());
    });
});

test.describe("Check navigation around grapheme clusters in strings", () => {
    test("Move rightwards to the very end of string literal", async ({page}) => {
        const strWithGraphemes = "a ✈️ with 👻 with 𡨴 plus 👨‍👩‍👧‍👦 and plus 🛠️, it's great!";
        const strWithGraphemesSize = Array.from(new Intl.Segmenter("en", { granularity: "grapheme" }).segment(strWithGraphemes)).length;
        // Adds a function call frame with empty literal
        await page.keyboard.type(" \"");
        await waitForEditorSettled(page);
        // Types the content of the literal, with some grapheme clusters
        await page.keyboard.type(strWithGraphemes);
        // Gets back above that frame and in the frame
        await page.keyboard.press("ArrowUp");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        // Move right until the end of the literal (not past the closing quote, and we need +1 for passing the opening quote)
        await pressN("ArrowRight", 1 + strWithGraphemesSize, true)(page);
        await waitForEditorSettled(page);
        // Check the cursor position is as expected
        await checkTextSlotCursorPos(page, strWithGraphemes.length);
    });

    test("Move leftwards to the very start of string literal", async ({page}) => {
        const strWithGraphemes = "a ✈️ with 👻 with 𡨴 plus 👨‍👩‍👧‍👦 and plus 🛠️, it's great!";
        const strWithGraphemesSize = Array.from(new Intl.Segmenter("en", { granularity: "grapheme" }).segment(strWithGraphemes)).length;
        // Adds a function call frame with empty literal
        await page.keyboard.type(" \"");
        await waitForEditorSettled(page);
        // Types the content of the literal, with some grapheme clusters
        await page.keyboard.type(strWithGraphemes);
        // Gets back below that frame and in the frame
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowLeft");
        await waitForEditorSettled(page);
        // Move left until the start of the literal (not past the opening quote, and we need +3 for passing the brackets and closing quote)
        await pressN("ArrowLeft", 3 + strWithGraphemesSize, true)(page);
        await waitForEditorSettled(page);
        // Check the cursor position is as expected
        await checkTextSlotCursorPos(page, 0);
    });

    test("Delete (del) parts of the string literal", async ({page}) => {
        const strWithGraphemes = "a ✈️ with 👻 with 𡨴 plus 👨‍👩‍👧‍👦 and plus 🛠️, it's great!";
        const strWithGraphemesSize = Array.from(new Intl.Segmenter("en", { granularity: "grapheme" }).segment(strWithGraphemes)).length;
        // Delete existing frames, adds an if frame and adds an empty string literal (no sense for condition but it's only a test)
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await waitForEditorSettled(page);
        await page.keyboard.type(" \"");
        await waitForEditorSettled(page);
        await assertStateOfIfFrame(page, "{}_“$”_{}");
        // Types the content of the literal, with some grapheme clusters
        await page.keyboard.type(strWithGraphemes);
        await waitForEditorSettled(page);
        // Gets back above that frame and in the frame (after the opening quote)
        await page.keyboard.press("ArrowUp");
        await pressN("ArrowRight", 2, true)(page);
        // Delete to keep "it's great"
        await pressN("Delete", strWithGraphemesSize - "it's great!".length, true)(page);
        await waitForEditorSettled(page);
        // Check the cursor position is as expected
        await checkTextSlotCursorPos(page, 0);
        // Check the content is as expected
        await assertStateOfIfFrame(page, "{}_“$it's great!”_{}");
    });

    test("Delete (backspace) parts of the string literal", async ({page}) => {
        const strWithGraphemes = "a ✈️ with 👻 with 𡨴 plus 👨‍👩‍👧‍👦 and plus 🛠️, it's great!";
        const strWithGraphemesSize = Array.from(new Intl.Segmenter("en", { granularity: "grapheme" }).segment(strWithGraphemes)).length;
        // Delete existing frames, adds an if frame and adds an empty string literal (no sense for condition but it's only a test)
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await waitForEditorSettled(page);
        await page.keyboard.type(" \"");
        await waitForEditorSettled(page);
        await assertStateOfIfFrame(page, "{}_“$”_{}");
        // Types the content of the literal, with some grapheme clusters
        await page.keyboard.type(strWithGraphemes);
        await waitForEditorSettled(page);
        // Gets back below that frame and in the frame (before the closing quote)
        await page.keyboard.press("ArrowDown");
        await pressN("ArrowLeft", 2, true)(page);
        // Delete to keep "a"
        await pressN("Backspace", strWithGraphemesSize - 1, true)(page);
        await waitForEditorSettled(page);
        // Check the cursor position is as expected
        await checkTextSlotCursorPos(page, 1);
        // Check the content is as expected
        await assertStateOfIfFrame(page, "{}_“a$”_{}");
    });
});
