import {Page, test, expect} from "@playwright/test";
import path from "path";
import {assertStateOfIfFrame, checkFrameXorTextCursor, checkTextSlotCursorPos, doPagePaste, getDefaultStrypeProjectDocumentationFullLine, pressN} from "../support/editor";
import fs from "fs";
import {WINDOW_STRYPE_HTMLIDS_PROPNAME} from "@/helpers/sharedIdCssWithTests";
import {createBrowserProxy} from "../support/proxy";
import {readFileSync} from "node:fs";
import {save} from "../support/loading-saving";

let scssVars: {[varName: string]: string};
let strypeElIds: {[varName: string]: (...args: any[]) => string};
test.beforeEach(async ({ page, browserName }, testInfo) => {
    if (browserName === "webkit" && process.platform === "win32") {
        // On Windows+Webkit it just can't seem to load the page for some reason:
        testInfo.skip(true, "Skipping on Windows + WebKit due to unknown problems");
    }
    await page.goto("./", {waitUntil: "load"});
    await page.waitForSelector("body");
    scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
    strypeElIds = createBrowserProxy(page, WINDOW_STRYPE_HTMLIDS_PROPNAME);
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });
    // Make browser's console.log output visible in our logs (useful for debugging):
    page.on("console", (msg) => {
        console.log("Browser log:", msg.text());
    });
});

async function clickId(page: Page, getIdClientSide: () => void) {
    const id = await page.evaluate(getIdClientSide);
    await page.click("#" + id);
}

async function loadPY(page: Page, filepath: string) {
    await clickId(page, () => (window as any)["StrypeHTMLELementsIDsGlobals"].getEditorMenuUID());
    await clickId(page, () => (window as any)["StrypeHTMLELementsIDsGlobals"].getLoadProjectLinkId());
    // The "button" for the target selection is now a div element.
    await page.locator("#" + await strypeElIds.getImportFileInputId()).setInputFiles(path.join(__dirname, filepath));
    await clickId(page, () => (window as any)["StrypeHTMLELementsIDsGlobals"].getLoadFromFSStrypeButtonId());
    // Wait for everything to settle:
    await page.waitForTimeout(2000);
    // Check it actually loaded:
    const count = await page.getByText("BUILDINGS_TO_RECIPES").count();
    expect(count).toEqual(5);
    
    // Get to the top, and may as well sanity check as we go:
    for (let i = 0; i < 200; i++) {
        await checkFrameXorTextCursor(page);
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(150);
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
        test.setTimeout(500_000);
        if (testInfo.project.name === "chromium") {
            test.skip(); // See comment above
        }
        await loadPY(page, "../../cypress/fixtures/python-code.py");
        for (let i = 0; i < 500; i++) {
            await checkFrameXorTextCursor(page);
            await page.keyboard.press("ArrowRight");
            await page.waitForTimeout(200);
        }
    });
    // Down by itself won't go into slots, so we do down-down-left which should get to the end.
    test("Down-down-left arrow through a file", async ({page}, testInfo) => {
        if (testInfo.project.name === "chromium") {
            test.skip(); // See comment above
        }
        test.setTimeout(1_000_000);
        await loadPY(page, "../../cypress/fixtures/python-code.py");
        for (let i = 0; i < 100; i++) {
            await checkFrameXorTextCursor(page);
            await page.keyboard.press("ArrowDown");
            await page.waitForTimeout(200);
            await checkFrameXorTextCursor(page);
            await page.keyboard.press("ArrowDown");
            await page.waitForTimeout(200);
            await checkFrameXorTextCursor(page);
            await page.keyboard.press("ArrowLeft");
            await page.waitForTimeout(200);
        }
    });
    test("Tab through a file", async ({page}, testInfo) => {
        if (testInfo.project.name === "chromium") {
            test.skip(); // See comment above
        }
        test.setTimeout(1_000_000);
        await loadPY(page, "../../cypress/fixtures/python-code.py");
        for (let i = 0; i < 500; i++) {
            await checkFrameXorTextCursor(page);
            await page.keyboard.press("Tab");
            await page.waitForTimeout(150);
        }
    });
    test("Down-down-shift-tab through a file", async ({page}, testInfo) => {
        if (testInfo.project.name === "chromium") {
            test.skip(); // See comment above
        }
        test.setTimeout(1_000_000);
        await loadPY(page, "../../cypress/fixtures/python-code.py");
        for (let i = 0; i < 100; i++) {
            await checkFrameXorTextCursor(page);
            await page.keyboard.press("ArrowDown");
            await page.waitForTimeout(150);
            await checkFrameXorTextCursor(page);
            await page.keyboard.press("ArrowDown");
            await page.waitForTimeout(150);
            await checkFrameXorTextCursor(page);
            await page.keyboard.press("Shift+Tab");
            await page.waitForTimeout(150);
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
        await page.waitForTimeout(200);
        await page.keyboard.press("=");
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(200);
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(200);
        // We had a bug where tab needed to be pressed twice after coming out of the frame, so
        // we check explicitly here the ordering of text and frame.  Essentially, we start on frame cursor,
        // tab through both empty text slots then back to frame cursor.  Tab again at the end shouldn't change things:
        const expectedFrameCursor = [true, false, false, true, false, false, true, true];
        for (let i = 0; i < expectedFrameCursor.length; i++) {
            await checkFrameXorTextCursor(page, expectedFrameCursor[i]);
            await page.keyboard.press("Tab");
            await page.waitForTimeout(150);
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
        const image = fs.readFileSync("public/graphics_images/cat-test.jpg").toString("base64");
        await doPagePaste(page, image, "image/jpeg");
        await page.waitForTimeout(500);
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
        await page.waitForTimeout(200);
        // Types the content of the literal, with some grapheme clusters
        await page.keyboard.type(strWithGraphemes);
        // Gets back above that frame and in the frame
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(200);
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(200);
        // Move right until the end of the literal (not past the closing quote, and we need +1 for passing the opening quote)
        await pressN("ArrowRight", 1 + strWithGraphemesSize, true)(page);
        await page.waitForTimeout(100);
        // Check the cursor position is as expected
        await checkTextSlotCursorPos(page, strWithGraphemes.length);
    });

    test("Move leftwards to the very start of string literal", async ({page}) => {
        const strWithGraphemes = "a ✈️ with 👻 with 𡨴 plus 👨‍👩‍👧‍👦 and plus 🛠️, it's great!";
        const strWithGraphemesSize = Array.from(new Intl.Segmenter("en", { granularity: "grapheme" }).segment(strWithGraphemes)).length;
        // Adds a function call frame with empty literal
        await page.keyboard.type(" \"");
        await page.waitForTimeout(200);
        // Types the content of the literal, with some grapheme clusters
        await page.keyboard.type(strWithGraphemes);
        // Gets back below that frame and in the frame
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(200);
        await page.keyboard.press("ArrowLeft");
        await page.waitForTimeout(200);
        // Move left until the start of the literal (not past the opening quote, and we need +3 for passing the brackets and closing quote)
        await pressN("ArrowLeft", 3 + strWithGraphemesSize, true)(page);
        await page.waitForTimeout(100);
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
        await page.waitForTimeout(100);                
        await page.keyboard.type(" \"");
        await page.waitForTimeout(100);
        await assertStateOfIfFrame(page, "{}_“$”_{}");
        // Types the content of the literal, with some grapheme clusters
        await page.keyboard.type(strWithGraphemes);
        await page.waitForTimeout(100);
        // Gets back above that frame and in the frame (after the opening quote)
        await page.keyboard.press("ArrowUp");
        await pressN("ArrowRight", 2, true)(page);
        // Delete to keep "it's great"
        await pressN("Delete", strWithGraphemesSize - "it's great!".length, true)(page);
        await page.waitForTimeout(100);
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
        await page.waitForTimeout(100);                
        await page.keyboard.type(" \"");
        await page.waitForTimeout(100);
        await assertStateOfIfFrame(page, "{}_“$”_{}");
        // Types the content of the literal, with some grapheme clusters
        await page.keyboard.type(strWithGraphemes);
        await page.waitForTimeout(100);
        // Gets back below that frame and in the frame (before the closing quote)
        await page.keyboard.press("ArrowDown");
        await pressN("ArrowLeft", 2, true)(page);
        // Delete to keep "a"
        await pressN("Backspace", strWithGraphemesSize - 1, true)(page);
        await page.waitForTimeout(100);
        // Check the cursor position is as expected
        await checkTextSlotCursorPos(page, 1);
        // Check the content is as expected
        await assertStateOfIfFrame(page, "{}_“a$”_{}");
    });
});
