import {expect, test} from "@playwright/test";
import {setupStrypeTest} from "../support/general";
import {waitForEditorSettled} from "../support/editor";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {skipPyodide: true});
});

// The default starter project always has a "myString = "Hello from Strype"" assignment followed
// by a "print(myString)" call -- these give us a plain code slot (the "myString" argument to
// print) and a string literal slot ("Hello from Strype") to focus/select in the tests below.
function getPlainCodeSlot(page: import("@playwright/test").Page) {
    return page.locator(".label-slot-input").filter({hasText: /^myString$/}).last();
}

function getStringLiteralSlot(page: import("@playwright/test").Page) {
    return page.locator(".label-slot-input").filter({hasText: "Hello"}).first();
}

test.describe("Frame commands pane -- frame cursor", () => {
    test("shows the basic frame commands, without elif/else, at an empty line", async ({page}) => {
        await expect(page.locator("#addFrameCmd_if")).toBeVisible();
        await expect(page.locator("#addFrameCmd_elif")).toHaveCount(0);
        await expect(page.locator("#addFrameCmd_else")).toHaveCount(0);
    });

    test("shows elif/else once positioned after an if frame", async ({page}) => {
        await page.keyboard.press("i");
        await waitForEditorSettled(page);
        // Leave the condition slot -- the frame cursor lands right after the if frame, where
        // joint (elif/else) frames become valid additions:
        await page.keyboard.press("Escape");
        await waitForEditorSettled(page);

        await expect(page.locator("#addFrameCmd_elif")).toBeVisible();
        await expect(page.locator("#addFrameCmd_else")).toBeVisible();
    });
});

test.describe("Commands pane -- code completion shortcut", () => {
    test("shown while editing a plain code slot", async ({page}) => {
        const panel = page.locator("#addFramePanel");
        await getPlainCodeSlot(page).click();

        await expect(panel).toContainText("Code completion");
        await expect(panel).not.toContainText("file paths");
    });

    test("shown with the file-paths label while editing a string literal slot", async ({page}) => {
        const panel = page.locator("#addFramePanel");
        await getStringLiteralSlot(page).click();

        await expect(panel).toContainText("Code completion (file paths)");
    });

    test("not shown while editing a comment", async ({page}) => {
        const panel = page.locator("#addFramePanel");
        await page.keyboard.press("#");
        await waitForEditorSettled(page);
        await page.keyboard.type("hello world");

        await expect(panel).not.toContainText("Code completion");
    });
});

test.describe("Commands pane -- wrap-selection shortcuts", () => {
    test("shown for a selection inside a plain code slot", async ({page}) => {
        const panel = page.locator("#addFramePanel");
        await getPlainCodeSlot(page).dblclick();

        await expect(panel).toContainText("Wrap in ()");
        await expect(panel).toContainText("Wrap in []");
        await expect(panel).toContainText("Wrap in {}");
        await expect(panel).toContainText("Wrap in \"");
        await expect(panel).toContainText("Wrap in '");

        // Collapsing the selection back to a plain cursor should hide them again:
        await page.keyboard.press("ArrowRight");
        await expect(panel).not.toContainText("Wrap in");
    });

    test("not shown for a selection inside a string literal slot", async ({page}) => {
        const panel = page.locator("#addFramePanel");
        await getStringLiteralSlot(page).dblclick();

        await expect(panel).toContainText("Code completion (file paths)");
        await expect(panel).not.toContainText("Wrap in");
    });

    test("not shown for a selection inside a comment", async ({page}) => {
        const panel = page.locator("#addFramePanel");
        await page.keyboard.press("#");
        await waitForEditorSettled(page);
        await page.keyboard.type("hello world");
        await waitForEditorSettled(page);
        await page.keyboard.press("Home");
        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.up("Shift");

        await expect(panel).not.toContainText("Wrap in");
        await expect(panel).not.toContainText("Code completion");
    });
});
