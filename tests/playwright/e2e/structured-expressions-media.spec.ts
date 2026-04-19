import {test, expect} from "@playwright/test";
import { typeIndividually, doPagePaste, doTextHomeEndKeyPress, assertStateOfIfFrame, checkFrameXorTextCursor } from "../support/editor";
import fs from "fs";
import {addFakeClipboard} from "../support/clipboard";
import { skipPyodideLoading } from "../support/general";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    if (process.platform === "win32" && browserName === "webkit") {
        testInfo.skip(true, "Skipping on WebKit + Windows due to clipboard permission issues.");
    }
    // These tests can take longer than the default 30 seconds:
    testInfo.setTimeout(60000); // 60 seconds

    if (browserName === "chromium") {
        // Chromium prevents writing non-text to clipboard during headless mode so we can't test image copying:
        testInfo.skip(true, "Skipping on Chromium due to clipboard permissions");
    }
    // Make browser's console.log output visible in our logs (useful for debugging):
    page.on("console", (msg) => {
        console.log("Browser log:", msg.text());
    });
    await skipPyodideLoading(page);
    await addFakeClipboard(page);
    
    await page.goto("./", {waitUntil: "domcontentloaded"});
    await page.waitForSelector("body");
    //strypeElIds = await page.evaluate(() => (window as any)["StrypeHTMLELementsIDsGlobals"]);
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });
});

test.describe("Media literal copying", () => {
    test("Test copying text with a media literal", async ({page}) => {
        await page.keyboard.press("End");
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await page.waitForTimeout(100);
        await assertStateOfIfFrame(page, "{$}");
        await typeIndividually(page, "set_background(");
        const image = fs.readFileSync("src/assetsFilesystem/graphics/cat-test.jpg").toString("base64");
        await doPagePaste(page, image, "image/jpeg");
        await typeIndividually(page, ")");
        let startIndex = 0;
        const endIndex = "set_background(X)".length;
        await doTextHomeEndKeyPress(page, false, false); // equivalent to "Home", see method for details
        for (let i = 0; i < startIndex; i++) {
            await page.keyboard.press("ArrowRight");
            await page.waitForTimeout(75);
        }
        while (startIndex < endIndex) {
            await page.keyboard.press("Shift+ArrowRight");
            await page.waitForTimeout(75);
            startIndex += 1;
        }
        await page.waitForTimeout(200);
        await page.keyboard.press("ControlOrMeta+c");
        await page.waitForTimeout(300);
        const clipboardContent : string = await page.evaluate("navigator.clipboard.readText()");
        expect(clipboardContent).toEqual("set_background(load_image(\"data:image/jpeg;base64," + image + "\"))");
        const clipboardItemCount : string = await page.evaluate("navigator.clipboard.read().then((items) => items.length)");
        expect(clipboardItemCount).toEqual(1);
    });
    test("Test copying only image literal puts an image on clipboard", async ({page}, testInfo) => {
        await page.keyboard.press("End");
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await page.waitForTimeout(100);
        await assertStateOfIfFrame(page, "{$}");
        await typeIndividually(page, "set_background(");
        const image = fs.readFileSync("src/assetsFilesystem/graphics/cat-test.jpg").toString("base64");
        await doPagePaste(page, image, "image/jpeg");
        await typeIndividually(page, ")");
        const startIndex = "set_background(".length;
        const endIndex = startIndex + 1;
        await doTextHomeEndKeyPress(page, false, false); // equivalent to "Home", see method for details
        await page.waitForTimeout(1000);
        // First copy a single character to effectively clear the clipboard:
        await page.keyboard.press("Shift+ArrowRight");
        await page.waitForTimeout(200);
        await page.keyboard.press("ControlOrMeta+c");
        await page.waitForTimeout(300);
        expect(await page.evaluate("navigator.clipboard.readText()")).toEqual("s");
        // Back to start again:
        await page.keyboard.press("ArrowLeft");
        
        for (let i = 0; i < startIndex; i++) {
            await page.keyboard.press("ArrowRight");
            await page.waitForTimeout(1000);
        }
        for (let i = startIndex; i < endIndex; i++) {
            await page.keyboard.press("Shift+ArrowRight");
            await page.waitForTimeout(75);
        }
        await page.waitForTimeout(200);
        await page.keyboard.press("ControlOrMeta+c");
        await page.waitForTimeout(300);
        const clipboardItemCount : string = await page.evaluate("navigator.clipboard.read().then((items) => items.length)");
        expect(clipboardItemCount).toEqual(1);
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
        expect(clipboardImage).toEqual("data:image/jpeg;base64," + image);
        
        // Finally, try to paste it a second time in a frame inside:
        await page.keyboard.press("ArrowDown");
        await page.keyboard.type("i");
        await page.waitForTimeout(100);
        await typeIndividually(page, "set_background(");
    });

    test("Test pasting image at frame cursor focuses on frame cursor", async ({page}) => {
        await page.keyboard.press("End");
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await checkFrameXorTextCursor(page, true);
        await page.waitForTimeout(100);
        const image = fs.readFileSync("src/assetsFilesystem/graphics/cat-test.jpg").toString("base64");
        await doPagePaste(page, image, "image/jpeg");
        // Can take a moment to decode the image:
        await page.waitForTimeout(2000);
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
        await page.waitForTimeout(100);
        await assertStateOfIfFrame(page, "{$}");
        const image = fs.readFileSync("src/assetsFilesystem/graphics/cat-test.jpg").toString("base64");
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
        await page.waitForTimeout(100);
        await assertStateOfIfFrame(page, "{$}");
        const image = fs.readFileSync("src/assetsFilesystem/sounds/cat-test-meow.wav").toString("base64");
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
