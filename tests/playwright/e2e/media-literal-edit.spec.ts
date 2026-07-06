import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { doPagePaste } from "../support/editor";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    if (browserName === "webkit" && process.platform === "win32") {
        // On Windows+Webkit it just can't seem to load the page for some reason:
        testInfo.skip(true, "Skipping on Windows + WebKit due to unknown problems");
    }

    await page.goto("./", {waitUntil: "load"});
    await page.waitForSelector("body");
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });
    // Make browser's console.log output visible in our logs (useful for debugging):
    page.on("console", (msg) => {
        console.log("Browser log:", msg.text());
    });
});

/**
 * Generates a data URL for a solid black PNG.
 *
 * @param width Image width in pixels
 * @param height Image height in pixels
 * @returns A base64 encode of the image
 */
export function createBlackPngBase64(width: number, height: number): string {
    if (width <= 0 || height <= 0) {
        throw new Error("Width and height must be positive");
    }

    const png = new PNG({ width, height });

    // Every pixel defaults to 0, so set alpha to 255.
    for (let i = 0; i < png.data.length; i += 4) {
        png.data[i + 3] = 255; // A
    }

    const buffer = PNG.sync.write(png);

    return buffer.toString("base64");
}

function expectWithin(a: number, b: number, tolerance: number) {
    expect(a).toBeGreaterThanOrEqual(b - tolerance);
    expect(a).toBeLessThanOrEqual(b + tolerance);
}



test.describe("Media literal resizing", async () => {
    // We previously had a bug where resizing media literals could be a pixel off after resizing.
    // We are not super interested in whether the resize is accurate (but we do check it's within a pixel)
    // but more that the preview size displayed in the dialog is the same as the final size
    for (const srcSizes of [[100, 100], [600, 600], [800, 600], [237, 526], [23, 41]]) {
        for (const percentage of [1, 10, 28, 100, 107, 193]) {
            test("Resizing " + JSON.stringify(srcSizes) + " to " + percentage + "%", async ({page}) => {
                const srcX = srcSizes[0];
                const srcY = srcSizes[1];
                const srcImage = createBlackPngBase64(srcX, srcY);
                
                // Make a print and put the image in the params:
                await page.keyboard.press("p");
                await doPagePaste(page, srcImage, "image/png");
                
                // Now hover over it and bring up the edit dialog:
                await page.locator("img.label-slot-media").hover();
                await page.locator(".MediaPreviewPopup-header-edit-button").click();
                
                // Have to wait a sec for it to load (check "Loading" is gone):
                const spans = page.locator("span.EditImageDlg-sizeInfo");
                const count = await spans.count();
                for (let i = 0; i < count; i++) {
                    await expect(spans.nth(i)).not.toContainText("Loading", {timeout: 5000});
                }
                
                // Move the slider to the right percentage:
                const slider = page.locator("input#EditImageDlg-imageScale");

                await slider.evaluate((el: HTMLInputElement, val: string) => {
                    el.value = val;
                    el.dispatchEvent(new Event("input", { bubbles: true }));
                    el.dispatchEvent(new Event("change", { bubbles: true }));
                }, "" + percentage);
                
                // Check the size in the preview list:
                const previewSizeRegex = /Changed[^0-9]+([0-9]+)[^0-9]+([0-9]+)/;
                const span = page.locator("span").filter({ hasText:  previewSizeRegex}).first();

                const text = await span.textContent() as string;

                const [, oldValue, newValue] = text.match(previewSizeRegex) as RegExpMatchArray;

                const resizedX = Number(oldValue), resizedY = Number(newValue);
                // Check size is reasonable for resize:
                expectWithin(resizedX, srcX * percentage / 100, 1.5);
                expectWithin(resizedY, srcY * percentage / 100, 1.5);
                
                // Now check it matches exactly the new size:
                await page.locator(".btn.btn-primary", {hasText: "OK"}).filter({visible: true}).click();
                // Give it a moment to update:
                await page.waitForTimeout(1500);
                
                await page.locator("img.label-slot-media").hover();
                const newSizeText = await page.locator(".MediaPreviewPopup-header-text").textContent();
                expect(newSizeText).toMatch(new RegExp(resizedX + " × " + resizedY));
            });
        }
    }
});
