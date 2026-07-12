import {test, expect} from "@playwright/test";
import { typeIndividually, doPagePaste, doTextHomeEndKeyPress, assertStateOfIfFrame, checkFrameXorTextCursor, MEDIA_SLOT_PARSED_PLACEHOLDER, assertStateOfFuncCallFrame, waitForEditorSettled } from "../support/editor";
import fs from "fs";
import { setupStrypeTest } from "../support/general";
import { save } from "../support/loading-saving";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    if (browserName === "chromium") {
        // Chromium prevents writing non-text to clipboard during headless mode so we can't test image copying:
        testInfo.skip(true, "Skipping on Chromium due to clipboard permissions");
    }
    await setupStrypeTest(page, browserName, testInfo, {
        timeoutMs: 60000,
        skipPyodide: true,
        fakeClipboard: true,
        gotoWaitUntil: "domcontentloaded",
        skipWindowsWebkitReason: "Skipping on WebKit + Windows due to clipboard permission issues.",
    });
});

// Note: these tests have a habit of passing from Playwright but failing in real life,
// because Playwright loosens the security restrictions on clipboard access.  Still better
// to have them than nothing, but don't rely on them. 
test.describe("Media literal copying", () => {
    test("Test copying text with a media literal", async ({page}) => {
        await page.keyboard.press("End");
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await waitForEditorSettled(page);
        await assertStateOfIfFrame(page, "{$}");
        await typeIndividually(page, "set_background(");
        const image = fs.readFileSync("src/assetsFilesystem/images/cat-test.jpg").toString("base64");
        await doPagePaste(page, image, "image/jpeg");
        await typeIndividually(page, ")");
        let startIndex = 0;
        const endIndex = "set_background(X)".length;
        await doTextHomeEndKeyPress(page, false, false); // equivalent to "Home", see method for details
        for (let i = 0; i < startIndex; i++) {
            await page.keyboard.press("ArrowRight");
            await waitForEditorSettled(page);
        }
        while (startIndex < endIndex) {
            await page.keyboard.press("Shift+ArrowRight");
            await waitForEditorSettled(page);
            startIndex += 1;
        }
        await page.keyboard.press("ControlOrMeta+c");
        // Writing to the OS clipboard is an async step outside the page with no page-side signal
        // to wait on, so poll the read side instead of guessing how long the write takes:
        await expect.poll(() => page.evaluate("navigator.clipboard.readText()"))
            .toEqual("set_background(load_image(\"data:image/jpeg;base64," + image + "\"))");
        const clipboardItemCount : string = await page.evaluate("navigator.clipboard.read().then((items) => items.length)");
        expect(clipboardItemCount).toEqual(1);
    });

    test("Test copying only image literal puts an image on clipboard", async ({page}) => {
        await page.keyboard.press("End");
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await waitForEditorSettled(page);
        await assertStateOfIfFrame(page, "{$}");
        await typeIndividually(page, "set_background(");
        const image = fs.readFileSync("src/assetsFilesystem/images/cat-test-2.png").toString("base64");
        await doPagePaste(page, image, "image/png");
        await typeIndividually(page, ")");
        const startIndex = "set_background(".length;
        const endIndex = startIndex + 1;
        await doTextHomeEndKeyPress(page, false, false); // equivalent to "Home", see method for details
        // First copy a single character to effectively clear the clipboard:
        await page.keyboard.press("Shift+ArrowRight");
        await page.keyboard.press("ControlOrMeta+c");
        await expect.poll(() => page.evaluate("navigator.clipboard.readText()")).toEqual("s");
        // Back to start again:
        await page.keyboard.press("ArrowLeft");

        for (let i = 0; i < startIndex; i++) {
            await page.keyboard.press("ArrowRight");
            await waitForEditorSettled(page);
        }
        for (let i = startIndex; i < endIndex; i++) {
            await page.keyboard.press("Shift+ArrowRight");
            await waitForEditorSettled(page);
        }
        await page.keyboard.press("ControlOrMeta+c");
        await expect.poll(() => page.evaluate("navigator.clipboard.read().then((items) => items.length)")).toEqual(1);
        const clipboardImage : string = await page.evaluate(`
            navigator.clipboard.read().then(async (items) => {
                const item = items[0];
                for (const type of item.types) {
                    if (type.startsWith("image/")) {
                        const blob = await item.getType(type);
                
                        // Convert Blob to base64
                        const base64 = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob); // Data URL includes base64-encoded image
                        });
                
                        return base64;
                      }
                }
            });
`);
        expect(clipboardImage).toEqual("data:image/png;base64," + image);
    });


    test("Test copying only sound literal puts text on clipboard", async ({page}) => {
        await page.keyboard.press("End");
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await waitForEditorSettled(page);
        await assertStateOfIfFrame(page, "{$}");
        await typeIndividually(page, "type(");
        const sound = fs.readFileSync("src/assetsFilesystem/sounds/meow.wav").toString("base64");
        await doPagePaste(page, sound, "audio/x-wav");
        await typeIndividually(page, ")");
        const startIndex = "type(".length;
        const endIndex = startIndex + 1;
        await doTextHomeEndKeyPress(page, false, false); // equivalent to "Home", see method for details
        // First copy a single character to effectively clear the clipboard:
        await page.keyboard.press("Shift+ArrowRight");
        await page.keyboard.press("ControlOrMeta+c");
        await expect.poll(() => page.evaluate("navigator.clipboard.readText()")).toEqual("t");
        // Back to start again:
        await page.keyboard.press("ArrowLeft");

        for (let i = 0; i < startIndex; i++) {
            await page.keyboard.press("ArrowRight");
            await waitForEditorSettled(page);
        }
        for (let i = startIndex; i < endIndex; i++) {
            await page.keyboard.press("Shift+ArrowRight");
            await waitForEditorSettled(page);
        }
        await page.keyboard.press("ControlOrMeta+c");
        await expect.poll(() => page.evaluate("navigator.clipboard.read().then((items) => items.length)")).toEqual(1);
        const clipboardContent : string = await page.evaluate("navigator.clipboard.readText()");
        expect(clipboardContent).toEqual("load_sound(\"data:audio/x-wav;base64," + sound + "\")");
    });

    test("Test pasting image at frame cursor focuses on frame cursor", async ({page}) => {
        await page.keyboard.press("End");
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await checkFrameXorTextCursor(page, true);
        await waitForEditorSettled(page);
        const image = fs.readFileSync("src/assetsFilesystem/images/cat-test.jpg").toString("base64");
        await doPagePaste(page, image, "image/jpeg");
        // Decoding the pasted image is async; wait for it to actually finish loading rather than
        // guessing how long that takes:
        await page.waitForFunction(() => {
            const img = document.querySelector("img[data-code^='load_image']") as HTMLImageElement | null;
            return img != null && img.complete && img.naturalWidth > 0;
        });
        // Check text cursor has focus:
        await checkFrameXorTextCursor(page, false);
        await page.keyboard.press("ArrowRight");
        // Now check if the bottom frame cursor has focus:
        await checkFrameXorTextCursor(page, true);
    });
});

test.describe("Media literal manipulation", () => {
    test("Test surrounding an image literal with brackets", async ({page}) => {
        await page.keyboard.press("End");
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await waitForEditorSettled(page);
        await assertStateOfIfFrame(page, "{$}");
        const image = fs.readFileSync("src/assetsFilesystem/images/cat-test.jpg").toString("base64");
        await doPagePaste(page, image, "image/jpeg");
        // Check it is appearing as an image:
        await expect(page.getByText("load_image")).not.toBeVisible();
        await expect(page.locator("img[data-code^='load_image']")).toBeVisible();
        // Select the image:
        await page.keyboard.press("Shift+ArrowLeft");
        // And bracket:
        await page.keyboard.type("(");
        // Check that the image is still an image (in bug #661, it turned into the text of the load_image call):
        await expect(page.getByText("load_image")).not.toBeVisible();
        await expect(page.locator("img[data-code^='load_image']")).toBeVisible();
    });
    test("Test surrounding a sound literal with brackets", async ({page}) => {
        await page.keyboard.press("End");
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await waitForEditorSettled(page);
        await assertStateOfIfFrame(page, "{$}");
        const image = fs.readFileSync("src/assetsFilesystem/sounds/meow.wav").toString("base64");
        await doPagePaste(page, image, "audio/wav");
        // Check it is appearing as an image:
        await expect(page.getByText("load_sound")).not.toBeVisible();
        await expect(page.locator("img[data-code^='load_sound']")).toBeVisible();
        // Select the image:
        await page.keyboard.press("Shift+ArrowLeft");
        // And bracket:
        await page.keyboard.type("(");
        // Check that the image is still an image (in bug #661, it turned into the text of the load_sound call):
        await expect(page.getByText("load_sound")).not.toBeVisible();
        await expect(page.locator("img[data-code^='load_sound']")).toBeVisible();
    });
});

test.describe("Edition in expressions with media",() => {
    test("With keyword operators (basic)", async ({page}) => {
        // Write the expression (inside if): <media> or 5
        await page.keyboard.press("i"),
        await waitForEditorSettled(page);
        const image = fs.readFileSync("src/assetsFilesystem/images/cat-test.jpg").toString("base64");
        const last10B64ImgChars = image.slice(-10);
        await doPagePaste(page, image, "image/jpeg");
        await page.keyboard.type(" and 5");
        await assertStateOfIfFrame(page, `{}${MEDIA_SLOT_PARSED_PLACEHOLDER.image}{}and{5$}`, [{mediaType: "img", endOfB64: last10B64ImgChars}]);
    });

    test("With keyword operators (a bit more complex)", async ({page}) => {
        // Write the expression (inside if): test(<media>, 5 and 6)
        await page.keyboard.type("itest("),
        await waitForEditorSettled(page);
        const image = fs.readFileSync("src/assetsFilesystem/images/cat-test.jpg").toString("base64");
        const last10B64ImgChars = image.slice(-10);
        await doPagePaste(page, image, "image/jpeg");
        await page.keyboard.type(",5 and 6");
        await assertStateOfIfFrame(page, `{test}({}${MEDIA_SLOT_PARSED_PLACEHOLDER.image}{},{5}and{6$}){}`, [{mediaType: "img", endOfB64: last10B64ImgChars}]);
    });

    test("With keyword operators (and 2 media)", async ({page}) => {
        // Write the expression (inside if): <media1>+<media2> and "abc")
        await page.keyboard.press("i"),
        await waitForEditorSettled(page);
        const mediaInfo: {mediaType: "img" | "snd", endOfB64: string}[] = [];
        const image = fs.readFileSync("src/assetsFilesystem/images/cat-test.jpg").toString("base64");
        mediaInfo.push({mediaType: "img", endOfB64: image.slice(-10)});
        await doPagePaste(page, image, "image/jpeg");
        await page.keyboard.type("+");
        const sound = fs.readFileSync("src/assetsFilesystem/sounds/meow.wav").toString("base64");
        mediaInfo.push({mediaType: "snd", endOfB64: sound.slice(-10)});
        await doPagePaste(page, sound, "audio/x-wav");
        await page.keyboard.type("and \"abc");
        await assertStateOfIfFrame(page, `{}${MEDIA_SLOT_PARSED_PLACEHOLDER.image}{}+{}${MEDIA_SLOT_PARSED_PLACEHOLDER.sound}{}and{}“abc$”{}`, mediaInfo);
    });

    test("Undo/redo pasting image over a selection", async ({page}) => {
        // First get the initial content for comparison later
        const initialContentFile = await save(page, true, "initial");
        const initialContentCode = fs.readFileSync(initialContentFile).toString();
        // Select all content of the main section
        await waitForEditorSettled(page);
        await page.keyboard.press("ControlOrMeta+a");
        await waitForEditorSettled(page);
        // Paste an image (we make a quick check it's pasted - the paste keeps the caret in the inserted frame text slot so why not)
        const image = fs.readFileSync("src/assetsFilesystem/images/panda.png").toString("base64");
        const mediaInfo: {mediaType: "img", endOfB64: string}[]  = [{mediaType: "img", endOfB64: image.slice(-10)}];
        await doPagePaste(page, image, "image/png");
        await assertStateOfFuncCallFrame(page, `{}${MEDIA_SLOT_PARSED_PLACEHOLDER.image}{$}`, mediaInfo);
        const pastedContentFile = await save(page, false, "initial");
        const pastedContentCode = fs.readFileSync(pastedContentFile).toString();
        // Get out the frame, then undo : should be back the initial state.
        await page.keyboard.press("ArrowDown"),
        await waitForEditorSettled(page);
        await page.keyboard.press("ControlOrMeta+z"),
        await waitForEditorSettled(page);
        const undoContentFile = await save(page, false, "initial");
        const undoContentCode = fs.readFileSync(undoContentFile).toString();
        expect(undoContentCode).toEqual(initialContentCode);
        // Redo: should be back to the pasted state
        await page.keyboard.press("ControlOrMeta+y"),
        await waitForEditorSettled(page);
        const redoContentFile = await save(page, false, "initial");
        const redoContentCode = fs.readFileSync(redoContentFile).toString();
        expect(redoContentCode).toEqual(pastedContentCode);
    });
});
