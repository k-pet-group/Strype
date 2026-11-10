import { test, expect, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { loadContent, save } from "../support/loading-saving";
import { clearDefaultProject, doPagePaste, enterTestingSection, pressFrameShortcut, switchToTestingFromMain, typeIndividually, waitForEditorSettled } from "../support/editor";
import { checkFrameErrorCount } from "../support/execution";
import { setupStrypeTest } from "../support/general";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    // Pyodide readiness (including pytest, which is loaded on the first test run) can be slow
    // under CI worker contention -- see console-execution.spec.ts for the same reasoning:
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 180000});
});

// The "My code" heading (which toggles to Testing when clicked) and the Run button:
function heading(page: Page) {
    return page.locator("#frameContainer_-3 .frame-container-header");
}

function runButton(page: Page) {
    return page.locator("#runButton");
}

// From elsewhere in the editor (e.g. after editing the definitions), get the frame cursor back to the top of
// My code by clicking just inside the bottom edge of its last frame and then pressing Home:
async function goToTopOfMainCode(page: Page): Promise<void> {
    const lastMainFrameBox = await page.locator("#frameContainer_-3 > .container-frames .frame-div").last().boundingBox();
    if (!lastMainFrameBox) {
        throw new Error("No frame in My code to click");
    }
    await page.mouse.click(lastMainFrameBox.x + 3, lastMainFrameBox.y + lastMainFrameBox.height - 2);
    await waitForEditorSettled(page);
    await page.keyboard.press("Home");
    await waitForEditorSettled(page);
}

// The gap between the heading text and the box of code below it, for whichever of My code/Testing is showing
async function gapBelowHeading(page: Page, containerId: string): Promise<number> {
    const headingBox = await heading(page).locator(".frame-container-label-span").boundingBox();
    const codeBox = await page.locator(`${containerId} .container-frames`).boundingBox();
    if (!headingBox || !codeBox) {
        throw new Error("Could not measure the heading or the code below it");
    }
    return codeBox.y - (headingBox.y + headingBox.height);
}

test.describe("Testing section", () => {
    test("Clicking the arrow on the My code heading switches between My code and Testing", async ({page}) => {
        const testsContainer = page.locator("#frameContainer_-4");
        const mainFrames = page.locator("#frameContainer_-3 .container-frames");
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("My code");
        await expect(mainFrames).toBeVisible();
        // Only one of the two is ever showing, and there is no separate Testing heading:
        await expect(testsContainer).toBeHidden();
        await expect(runButton(page)).toHaveText(/^\s*Run$/, {timeout: 120000});

        const headingText = heading(page).locator(".frame-container-label-span");
        const visibleFrameCursors = page.locator(".caret:not(.invisible)");

        const gapInMainCode = await gapBelowHeading(page, "#frameContainer_-3");

        // A double-headed arrow to the right of the heading (always there) shows that it can be clicked to switch:
        const arrow = heading(page).locator(".frame-container-heading-arrows svg");
        await expect(arrow).toHaveCount(1);
        const textBox = await headingText.boundingBox();
        const arrowBox = await arrow.boundingBox();
        if (!textBox || !arrowBox) {
            throw new Error("Could not measure the heading or its arrow");
        }
        expect(arrowBox.x).toBeGreaterThanOrEqual(textBox.x + textBox.width);
        // The label of the other section is on the other side of the arrow, in dark grey and not bold. The labels stay where they
        // are ("My code:" on the left, "Test code:" on the right): it is which is green and which is grey that swaps over.
        const otherLabel = heading(page).locator(".frame-container-heading-inactive");
        await expect(otherLabel).toHaveText("Test code:");
        await expect(otherLabel).toHaveCSS("color", "rgb(85, 85, 85)");
        await expect(otherLabel).toHaveCSS("font-weight", "400");
        await expect(headingText).toHaveCSS("font-weight", "600");
        const otherLabelBox = await otherLabel.boundingBox();
        if (!otherLabelBox) {
            throw new Error("Could not measure the other section's label");
        }
        expect(otherLabelBox.x).toBeGreaterThanOrEqual(arrowBox.x + arrowBox.width);
        await heading(page).locator(".frame-container-heading-arrows").click();
        await waitForEditorSettled(page);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("Test code");
        // The frame cursor goes to the top of the section now showing:
        await expect(visibleFrameCursors).toHaveCount(1);
        await expect(otherLabel).toHaveText("My code:");
        await expect(otherLabel).toHaveCSS("color", "rgb(85, 85, 85)");
        await expect(otherLabel).toHaveCSS("font-weight", "400");
        const myCodeLabelBox = await otherLabel.boundingBox();
        const testingLabelBox = await headingText.boundingBox();
        const arrowBoxWhenTesting = await arrow.boundingBox();
        if (!myCodeLabelBox || !testingLabelBox || !arrowBoxWhenTesting) {
            throw new Error("Could not measure the labels or the arrow");
        }
        expect(myCodeLabelBox.x + myCodeLabelBox.width).toBeLessThanOrEqual(arrowBoxWhenTesting.x);
        expect(testingLabelBox.x).toBeGreaterThanOrEqual(arrowBoxWhenTesting.x + arrowBoxWhenTesting.width);
        expect(arrowBoxWhenTesting.x).toBeCloseTo(arrowBox.x, 0); // the arrow doesn't move either
        await expect(testsContainer).toBeVisible();
        await expect(mainFrames).toBeHidden();
        await expect(page.locator(".frame-container-header")).toHaveCount(3);
        // The testing code sits under its heading with the same spacing as the main code does:
        expect(await gapBelowHeading(page, "#frameContainer_-4")).toBeCloseTo(gapInMainCode, 0);
        await expect(runButton(page)).toHaveText(/^\s*Run tests$/);

        await heading(page).locator(".frame-container-heading-arrows").click();
        await waitForEditorSettled(page);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("My code");
        await expect(mainFrames).toBeVisible();
        await expect(testsContainer).toBeHidden();
        await expect(runButton(page)).toHaveText(/^\s*Run$/);
        await expect(visibleFrameCursors).toHaveCount(1);
    });

    test("The Run button runs the tests while Testing is showing, and the program while My code is", async ({page}) => {
        const consoleLoc = page.locator("#peaConsole");
        await switchToTestingFromMain(page);
        await expect(runButton(page)).toBeEnabled({timeout: 120000});
        await runButton(page).click();
        await expect.poll(async () => await consoleLoc.inputValue(), {timeout: 120000}).toContain("1 passed, 0 failed");
        await expect(runButton(page)).toHaveText(/^\s*Run tests$/, {timeout: 120000});

        // Switch back to My code and run the program, which also clears the console:
        await heading(page).locator(".frame-container-heading-arrows").click();
        await waitForEditorSettled(page);
        await expect(runButton(page)).toHaveText(/^\s*Run$/);
        await runButton(page).click();
        await expect(consoleLoc).toHaveValue("Hello from Strype\n", {timeout: 120000});
    });

    test("A project with no tests reports that, and each run clears the console first", async ({page}) => {
        await switchToTestingFromMain(page);
        await expect(runButton(page)).toBeEnabled({timeout: 120000});
        await runButton(page).click();
        const consoleLoc = page.locator("#peaConsole");
        await expect.poll(async () => await consoleLoc.inputValue(), {timeout: 120000}).toMatch(/^Running tests\.\.\.\n1 passed, 0 failed\n$/);
        await checkFrameErrorCount(page, 0);

        // A second run clears the console first, as a normal Run does, rather than appending:
        await expect(runButton(page)).toHaveText(/^\s*Run tests$/, {timeout: 120000});
        await runButton(page).click();
        await expect.poll(async () => await consoleLoc.inputValue(), {timeout: 120000}).toMatch(/^Running tests\.\.\.\n1 passed, 0 failed\n$/);
    });

    test("Test functions show a tick or a cross after a run, and a failed assert shows a cross", async ({page}) => {
        // A wide window, so that the Run tests button's outcome badge has room to show its "Pass"/"Fail" text too (when narrow, just its tick or cross is shown):
        await page.setViewportSize({width: 1800, height: 900});
        await loadContent(page, `#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
print("hi") 
#(=> Section:Testing
def test_passes ( ) :
    assert 1 < 2 
def test_fails ( ) :
    assert 1 > 2 
def test_errors ( ) :
    assert undefined_name 
#(=> Section:End
`);
        const testFunctions = page.locator("#frameContainer_-4 .frame-div[data-frameType='funcdef']");
        const asserts = page.locator("#frameContainer_-4 .frame-div[data-frameType='assert']");
        await expect(testFunctions).toHaveCount(3);
        // Nothing is shown before the tests have been run:
        await expect(page.locator(".test-outcome-badge")).toHaveCount(0);

        await goToTopOfMainCode(page);
        await switchToTestingFromMain(page);
        await expect(runButton(page)).toBeEnabled({timeout: 120000});
        await runButton(page).click();
        await expect.poll(async () => await page.locator("#peaConsole").inputValue(), {timeout: 120000}).toContain("1 passed, 2 failed");

        // A "Pass" or "Fail" badge with a tick or cross (drawn as an SVG, as in the overall outcome) in the header of each test function,
        // with a green or red background and white text:
        const outcomeIcon = (index: number) => testFunctions.nth(index).locator(".test-outcome-badge").first();
        await expect(outcomeIcon(0)).toHaveText("Pass");
        await expect(outcomeIcon(0).locator("svg.test-outcome-icon")).toHaveCount(1);
        await expect(outcomeIcon(0)).toHaveClass(/test-outcome-passed/);
        await expect(outcomeIcon(0)).toHaveCSS("background-color", "rgb(42, 138, 58)");
        await expect(outcomeIcon(0)).toHaveCSS("color", "rgb(255, 255, 255)");
        await expect(outcomeIcon(1)).toHaveText("Fail");
        await expect(outcomeIcon(1).locator("svg.test-outcome-icon")).toHaveCount(1);
        await expect(outcomeIcon(1)).toHaveClass(/test-outcome-failed/);
        await expect(outcomeIcon(1)).toHaveCSS("background-color", "rgb(201, 76, 76)");
        await expect(outcomeIcon(1)).toHaveCSS("color", "rgb(255, 255, 255)");
        await expect(outcomeIcon(2)).toHaveText("Fail");
        await expect(outcomeIcon(2)).toHaveClass(/test-outcome-failed/);
        // The badge is a rounded box:
        expect(parseFloat(await outcomeIcon(0).evaluate((el) => getComputedStyle(el).borderTopLeftRadius))).toBeGreaterThan(3);

        // The overall outcome of the run (some tests failed) is shown to the left of the Run tests button, when there's room:
        const overallSlot = page.locator(".pea-test-outcome-slot");
        const overallIcon = overallSlot.locator(".pea-test-outcome-icon");
        const overallText = overallSlot.locator(".pea-test-outcome-text");
        await expect(overallText).toHaveText("Fail");
        await expect(overallIcon.locator("svg path")).toHaveAttribute("d", /M8 2 L2 8/); // the cross (a tick would be a different path)
        await expect(overallSlot).toHaveClass(/pea-test-outcome-failed/);
        await expect(overallIcon).toHaveCSS("background-color", "rgb(201, 76, 76)");
        expect(await overallIcon.evaluate((icon, button) => icon.getBoundingClientRect().right <= button.getBoundingClientRect().left, await runButton(page).elementHandle())).toBe(true);

        // A failed assert statement is marked with a cross, whereas an error from evaluating it (the NameError) keeps the triangle:
        await expect(asserts.nth(0).locator(".err-icon")).toHaveCount(0);
        await expect(asserts.nth(1).locator(".err-icon")).toHaveClass(/fa-times/);
        await expect(asserts.nth(1).locator(".err-icon")).not.toHaveClass(/fa-exclamation-triangle/);
        await expect(asserts.nth(2).locator(".err-icon")).toHaveClass(/fa-exclamation-triangle/);
        await expect(asserts.nth(2).locator(".err-icon")).not.toHaveClass(/fa-times/);

        // Editing the code makes the outcomes out of date, which greys them out:
        await asserts.nth(0).locator(".label-slot-input", {hasText: /^2$/}).click();
        await page.keyboard.type("0");
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await expect(outcomeIcon(0)).toHaveClass(/test-outcome-stale/);
        await expect(outcomeIcon(1)).toHaveClass(/test-outcome-stale/);
        await expect(outcomeIcon(0)).not.toHaveClass(/test-outcome-passed/);
        await expect(overallSlot).toHaveClass(/pea-test-outcome-stale/);
        await expect(overallIcon).toHaveCSS("background-color", "rgb(112, 110, 110)");

        // In a narrow window there is only room for the icon, which keeps its width and fills the height of the slot, so that
        // no part of the word, wrapped out of view, is seen beneath it:
        const iconWidthWhenWide = (await overallIcon.boundingBox())?.width;
        await page.setViewportSize({width: 1150, height: 900});
        await expect.poll(async () => await overallText.evaluate((text) => text.getBoundingClientRect().top >= (text.parentElement?.getBoundingClientRect().bottom ?? 0) - 0.5)).toBe(true);
        expect(await overallIcon.evaluate((icon) => Math.abs(icon.getBoundingClientRect().height - (icon.parentElement?.getBoundingClientRect().height ?? -1)) < 0.5)).toBe(true);
        expect(Math.abs(((await overallIcon.boundingBox())?.width ?? 0) - (iconWidthWhenWide ?? -1))).toBeLessThan(0.5);
    });

    test("The Testing Your Functions demo project opens showing its tests, which pass, and its program runs", async ({page}) => {
        await loadContent(page, readFileSync("public/demos/console/testing_example.spy", "utf8"));
        const consoleLoc = page.locator("#peaConsole");
        // It was saved with the Testing code showing, so that's how it opens (with the cursor in it):
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("Test code");
        await expect(page.locator("#frameContainer_-4")).toBeVisible();
        await expect(page.locator("#frameContainer_-3 > .container-frames")).toBeHidden();
        await expect(runButton(page)).toBeEnabled({timeout: 120000});
        await expect(runButton(page)).toHaveText(/Run tests$/);
        await runButton(page).click();
        await expect.poll(async () => await consoleLoc.inputValue(), {timeout: 120000}).toMatch(/^Running tests\.\.\.\n4 passed, 0 failed\n$/);
        await checkFrameErrorCount(page, 0);

        // And the program in My code uses the functions (clicking the heading switches to it):
        await heading(page).locator(".frame-container-label-span").click();
        await waitForEditorSettled(page);
        await expect(runButton(page)).toHaveText(/^\s*Run$/);
        await runButton(page).click();
        await expect.poll(async () => await consoleLoc.inputValue(), {timeout: 120000}).toContain("fun is testing");
        expect(await consoleLoc.inputValue()).toContain("9 is not prime");
    });

    test("A project saved with My code showing has no Testing header", async ({page}) => {
        expect(readFileSync(await save(page, true), "utf8")).not.toContain("testingShowing");
    });

    test("A project saved with the Testing code showing has a header saying so", async ({page}) => {
        await switchToTestingFromMain(page);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("Test code");
        const saved = readFileSync(await save(page, true), "utf8").replace(/\r\n/g, "\n");
        expect(saved).toContain("\n#(=> testingShowing:true\n");
    });

    test("A project with the Testing header opens showing the Testing code, and one without it opens showing My code", async ({page}) => {
        const spyWithTestingShowing = `#(=> Strype:1:std
#(=> testingShowing:true
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
print("hi") 
#(=> Section:Testing
def test_a ( ) :
    assert 1 < 2 
#(=> Section:End
`;
        // A project with the header opens showing the Testing code, with the cursor at the top of it...
        await loadContent(page, spyWithTestingShowing);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("Test code");
        await expect(page.locator("#frameContainer_-4")).toBeVisible();
        await expect(page.locator("#caret_caretBody_-4")).not.toHaveClass(/invisible/);
        await expect(runButton(page)).toHaveText(/Run tests$/, {timeout: 120000});
        // ...so a frame added there goes into it:
        await pressFrameShortcut(page, "s");
        await waitForEditorSettled(page);
        await expect(page.locator("#frameContainer_-4 .frame-div[data-frameType='funcdef']")).toHaveCount(2);

        // And one without the header opens showing My code again:
        await loadContent(page, spyWithTestingShowing.replace("#(=> testingShowing:true\n", ""));
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("My code");
        await expect(page.locator("#frameContainer_-4")).toBeHidden();
    });

    test("Clicking the heading, or its arrow, switches between My code and Testing; the cursor goes into the section", async ({page}) => {
        const headingText = heading(page).locator(".frame-container-label-span");
        const arrow = heading(page).locator(".frame-container-heading-arrows");
        // The arrow is always there, with a tooltip saying what clicking does (as has the heading):
        await expect(arrow).toHaveCount(1);
        await expect(arrow).toHaveAttribute("title", "Toggle testing mode");
        await expect(headingText).toHaveAttribute("title", "Toggle testing mode");
        // (The Run button only shows its "Run"/"Run tests" label once the Python worker is ready, until then it says it is initialising:)
        await expect(runButton(page)).toBeEnabled({timeout: 120000});

        // The cursor goes to the top of the Testing section:
        await headingText.click();
        await waitForEditorSettled(page);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("Test code");
        await expect(page.locator("#frameContainer_-4")).toBeVisible();
        await expect(page.locator("#frameContainer_-4 .caret:not(.invisible)")).toHaveCount(1);
        await expect(runButton(page)).toHaveText(/^\s*Run tests$/);

        // The same for the arrow, going back to the top of My code:
        await arrow.click();
        await waitForEditorSettled(page);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("My code");
        await expect(page.locator("#frameContainer_-3 .caret:not(.invisible)")).toHaveCount(1);
        await expect(runButton(page)).toHaveText(/^\s*Run$/);
    });

    test("Switching with frames selected cancels the selection and puts the cursor in the new section", async ({page}) => {
        // Select the two frames in My code with the keyboard (the cursor starts at the top of My code):
        await page.keyboard.press("Shift+ArrowDown");
        await page.keyboard.press("Shift+ArrowDown");
        await waitForEditorSettled(page);
        const selectedFrames = page.locator("#frameContainer_-3 .frame-div.selected, #frameContainer_-3 .selected .frame-div");
        await expect(selectedFrames.first()).toBeVisible();

        await heading(page).locator(".frame-container-label-span").click();
        await waitForEditorSettled(page);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("Test code");
        await expect(page.locator(".selected")).toHaveCount(0);
        await expect(page.locator("#frameContainer_-4 .caret:not(.invisible)")).toHaveCount(1);
        // Back in My code, the frames are still not selected, and the cursor is at the top of it:
        await heading(page).locator(".frame-container-heading-arrows").click();
        await waitForEditorSettled(page);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("My code");
        await expect(page.locator(".selected")).toHaveCount(0);
        await expect(page.locator("#frameContainer_-3 .caret:not(.invisible)")).toHaveCount(1);
    });

    test("Switching with text selected in a slot cancels the selection and puts the cursor in the new section", async ({page}) => {
        // Select the text of the argument to print in My code ("myString"):
        const slot = page.locator("#frameContainer_-3 .label-slot-input", {hasText: /^myString$/}).last();
        await slot.click();
        await waitForEditorSettled(page);
        // (The click puts the cursor part-way through the text, so go to the start first:)
        await page.keyboard.press("Home");
        await page.keyboard.press("Shift+End");
        await waitForEditorSettled(page);
        expect(await page.evaluate(() => (document.getSelection()?.toString() ?? ""))).toContain("myString");

        await heading(page).locator(".frame-container-label-span").click();
        await waitForEditorSettled(page);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("Test code");
        // No text is selected any more, and no slot is being edited:
        expect(await page.evaluate(() => (document.getSelection()?.toString() ?? ""))).toEqual("");
        expect(await page.evaluate(() => document.activeElement?.classList.contains("label-slot-input") ?? false)).toBe(false);
        await expect(page.locator("#frameContainer_-4 .caret:not(.invisible)")).toHaveCount(1);
    });

    test("The heading can't be clicked or triggered while a program is running", async ({page}) => {
        await loadContent(page, `#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
while True  :
#(=> Section:End
`);
        const headingText = heading(page).locator(".frame-container-label-span");
        await expect(runButton(page)).toBeEnabled({timeout: 120000});
        await runButton(page).click();
        await expect(runButton(page)).toHaveText(/Stop$/, {timeout: 120000});

        // Clicking the heading does nothing while it runs, and the heading doesn't look clickable:
        await expect(headingText).not.toHaveClass(/frame-container-heading-clickable/);
        await headingText.click();
        await waitForEditorSettled(page);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("My code");
        await expect(runButton(page)).toHaveText(/Stop$/);

        // Once stopped, it works again:
        await runButton(page).click();
        await expect(runButton(page)).toHaveText(/^\s*Run$/, {timeout: 120000});
        await expect(headingText).toHaveClass(/frame-container-heading-clickable/);
        await headingText.click();
        await waitForEditorSettled(page);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("Test code");
    });

    test("pytest is imported for the tests automatically, so pytest.raises works without an import", async ({page}) => {
        await loadContent(page, `#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
print("hi") 
#(=> Section:Testing
def test_raises ( ) :
    with pytest.raises(ZeroDivisionError)  as error  :
        result  = 1 / 0 
#(=> Section:End
`);
        await goToTopOfMainCode(page);
        await switchToTestingFromMain(page);
        // The editor doesn't flag pytest as unknown:
        await checkFrameErrorCount(page, 0);
        await expect(runButton(page)).toBeEnabled({timeout: 120000});
        await runButton(page).click();
        await expect.poll(async () => await page.locator("#peaConsole").inputValue(), {timeout: 120000}).toMatch(/^Running tests\.\.\.\n1 passed, 0 failed\n$/);
        await checkFrameErrorCount(page, 0);
    });

    test("Pasting Python with test functions at the Testing section puts them there, and an assert can't be pasted into an ordinary function", async ({page}) => {
        await enterTestingSection(page);
        await doPagePaste(page, "def test_pasted():\n    assert 1 < 2\n");
        await expect(page.locator("#frameContainer_-4 .frame-div[data-frameType='funcdef']")).toHaveCount(2);
        await expect(page.locator("#frameContainer_-4 .frame-div[data-frameType='assert']")).toHaveCount(1);
        await expect(page.locator("#frameContainer_-2 .frame-div")).toHaveCount(0);
        // The tests have the new function:
        await expect(runButton(page)).toBeEnabled({timeout: 120000});
        await runButton(page).click();
        await expect.poll(async () => await page.locator("#peaConsole").inputValue(), {timeout: 120000}).toContain("2 passed, 0 failed");

        // An assert doesn't go in an ordinary function in Definitions (the paste is refused). Clicking the heading
        // goes back to the top of My code, and one step up from there is Definitions:
        await heading(page).locator(".frame-container-label-span").click();
        await waitForEditorSettled(page);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("My code");
        await page.keyboard.press("ArrowUp");
        await waitForEditorSettled(page);
        await doPagePaste(page, "def helper():\n    assert 1 < 2\n");
        await waitForEditorSettled(page);
        await expect(page.locator("#frameContainer_-2 .frame-div")).toHaveCount(0);
        await expect(page.locator(".frame-div[data-frameType='assert']")).toHaveCount(1);
    });

    test("A frame that moves to My code from another section switches from Testing to My code", async ({page}) => {
        // Typing "while " in Definitions turns the frame into a while loop, which is moved to My code:
        await goToTopOfMainCode(page);
        await switchToTestingFromMain(page);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("Test code");
        await page.keyboard.press("ArrowUp"); // up from the top of Testing to Definitions
        await waitForEditorSettled(page);
        await page.keyboard.type("x");
        await waitForEditorSettled(page);
        await expect(page.locator("#frameContainer_-2 .frame-div[data-frameType='funccall']")).toHaveCount(1);
        await page.keyboard.press("Backspace");
        await page.keyboard.type("while ");
        await page.keyboard.type("True");
        await waitForEditorSettled(page);
        const mainWhile = page.locator("#frameContainer_-3 .frame-div[data-frameType='while']");
        await expect(mainWhile).toHaveCount(1);
        // My code is now showing, with the heading's style on its label, and the moved frame can be seen:
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("My code");
        await expect(heading(page).locator(".frame-container-heading-inactive")).toContainText("Test code");
        await expect(page.locator("#frameContainer_-3 .container-frames")).toBeVisible();
        await expect(page.locator("#frameContainer_-4")).toBeHidden();
        await expect(mainWhile).toBeVisible();

        // Likewise, pasting statements for My code while the cursor is in Definitions, with Testing showing:
        await goToTopOfMainCode(page);
        await switchToTestingFromMain(page);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("Test code");
        await page.keyboard.press("ArrowUp");
        await waitForEditorSettled(page);
        await doPagePaste(page, "for i in range(3):\n    print(i)\n");
        await expect(page.locator("#frameContainer_-3 .frame-div[data-frameType='for']")).toHaveCount(1);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("My code");
        await expect(page.locator("#frameContainer_-4")).toBeHidden();
    });

    test("Typing assert outside a test function moves it into a new test function in the Testing section", async ({page}) => {
        const testFunctions = page.locator("#frameContainer_-4 .frame-div[data-frameType='funcdef']");
        const functionName = (index: number) => testFunctions.nth(index).locator(".label-slot-input").first();
        await goToTopOfMainCode(page);
        await page.keyboard.type("x");
        await waitForEditorSettled(page);
        await page.keyboard.press("Backspace");
        await page.keyboard.type("assert ");
        // Typing the keyword moves the frame into the new test function, so let that finish before typing the condition:
        await waitForEditorSettled(page);
        await typeIndividually(page, "1 == 1");
        await waitForEditorSettled(page);

        // Testing is now showing, with a new test function at the top (above the starter one), holding the assert:
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("Test code");
        await expect(page.locator("#frameContainer_-3 .frame-div[data-frameType='assert']")).toHaveCount(0);
        await expect(testFunctions).toHaveCount(2);
        await expect(functionName(0)).toHaveText("test_1");
        const newAssert = testFunctions.nth(0).locator(".frame-div[data-frameType='assert']");
        await expect(newAssert).toHaveCount(1);
        await expect(newAssert).toBeVisible();
        await expect(newAssert).toContainText(/1\s*==\s*1/);

        // Again, from My code: the next name is used (test_2), also at the top:
        await page.locator("#frameContainer_-3 .frame-container-heading-inactive, #frameContainer_-3 .frame-container-label-span").first().click();
        await waitForEditorSettled(page);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("My code");
        await goToTopOfMainCode(page);
        await page.keyboard.type("x");
        await waitForEditorSettled(page);
        await page.keyboard.press("Backspace");
        await page.keyboard.type("assert ");
        // Typing the keyword moves the frame into the new test function, so let that finish before typing the condition:
        await waitForEditorSettled(page);
        await typeIndividually(page, "2 == 2");
        await waitForEditorSettled(page);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("Test code");
        await expect(testFunctions).toHaveCount(3);
        await expect(functionName(0)).toHaveText("test_2");
        await expect(functionName(1)).toHaveText("test_1");

        // Typed inside a test function, it just converts there:
        await page.keyboard.press("Escape");
        await expect(testFunctions.nth(0).locator(".frame-div[data-frameType='assert']")).toHaveCount(1);
        await expect(testFunctions).toHaveCount(3);
    });

    test("The frame commands pane offers a new test function in the Testing section only", async ({page}) => {
        // In My code, there is no test function command:
        await page.keyboard.press("Tab");
        await expect(page.locator("#addFramePanel .frame-cmd-container", {hasText: "function"}).first()).toBeVisible();
        await expect(page.locator("#addFramePanel .frame-cmd-container", {hasText: "test function"})).toHaveCount(0);
        await page.keyboard.press("Escape");

        // In Testing, it is there, and clicking it adds a function named test_ with the cursor after the name:
        await enterTestingSection(page);
        await page.keyboard.press("Tab");
        const testFunctionCommand = page.locator("#addFramePanel .frame-cmd-container", {hasText: "test function"});
        await expect(testFunctionCommand).toBeVisible();
        await testFunctionCommand.click();
        await waitForEditorSettled(page);
        const newFunction = page.locator("#frameContainer_-4 .frame-div[data-frameType='funcdef']");
        // (It goes at the top of the Testing section, above the default test function:)
        await expect(newFunction).toHaveCount(2);
        await expect(newFunction.first().locator(".label-slot-input").first()).toHaveText("test_");
        await page.keyboard.type("clicked");
        await waitForEditorSettled(page);
        await expect(newFunction.first().locator(".label-slot-input").first()).toHaveText("test_clicked");
    });

    test("Stopping a run of tests that doesn't finish works", async ({page}) => {
        await loadContent(page, `#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
print("hi") 
#(=> Section:Testing
def test_forever ( ) :
    while True  :
#(=> Section:End
`);
        await goToTopOfMainCode(page);
        await switchToTestingFromMain(page);
        await expect(runButton(page)).toBeEnabled({timeout: 120000});
        await runButton(page).click();
        await expect(runButton(page)).toHaveText(/Stop$/, {timeout: 120000});
        // The heading can't be used while the tests are running:
        await heading(page).locator(".frame-container-label-span").click();
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("Test code");
        await expect(runButton(page)).toHaveText(/Stop$/);
        await runButton(page).click();
        await expect(runButton(page)).toHaveText(/Run tests$/, {timeout: 120000});
        // And we can go on to run (and stop) again:
        await runButton(page).click();
        await expect(runButton(page)).toHaveText(/Stop$/, {timeout: 120000});
        await runButton(page).click();
        await expect(runButton(page)).toHaveText(/Run tests$/, {timeout: 120000});
    });

    test("clearDefaultProject() clears the Testing section too, and ends up at the top of Imports", async ({page}) => {
        await loadContent(page, `#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
print("hi") 
#(=> Section:Testing
def test_a ( ) :
    assert 1 < 2 
#(=> Section:End
`);
        await expect(page.locator(".frame-div")).toHaveCount(3);
        await clearDefaultProject(page);
        await expect(page.locator(".frame-div")).toHaveCount(0);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("My code");
        await expect(page.locator("#frameContainer_-4")).toBeHidden();
        // The cursor is at the top of Imports: a frame typed there goes there
        await pressFrameShortcut(page, "i");
        await waitForEditorSettled(page);
        await expect(page.locator("#frameContainer_-1 .frame-div[data-frameType='if']")).toHaveCount(0);
        await expect(page.locator("#frameContainer_-1 .frame-div")).toHaveCount(1);
    });

    test("Which of My code and Testing is showing survives a page refresh", async ({page}) => {
        await switchToTestingFromMain(page);
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("Test code");
        await page.reload();
        await page.waitForSelector(".frame-container");
        await expect(heading(page).locator(".frame-container-label-span")).toContainText("Test code");
        await expect(page.locator("#frameContainer_-4")).toBeVisible();
    });

    test("Running tests reports a failure and highlights the offending frame", async ({page}) => {
        await enterTestingSection(page);

        // Build: def test_fail():\n    int("x")
        await pressFrameShortcut(page, "d");
        await waitForEditorSettled(page);
        await page.keyboard.type("test_fail");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown"); // name -> function description
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown"); // function description -> body
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "c");
        await waitForEditorSettled(page);
        await page.keyboard.type("int(\"x\")");
        await waitForEditorSettled(page);

        // Sanity check the above actually landed inside Testing and not elsewhere (e.g. Definitions
        // -- an earlier version of this test silently mis-navigated there):
        await expect(page.locator("#frameContainer_-4 span", {hasText: /^int$/})).toHaveCount(1);

        await expect(runButton(page)).toBeEnabled({timeout: 120000});
        await runButton(page).click();

        const consoleLoc = page.locator("#peaConsole");
        await expect.poll(async () => await consoleLoc.inputValue(), {timeout: 120000}).toContain("1 passed, 1 failed");
        const consoleContent = await consoleLoc.inputValue();
        expect(consoleContent).toContain("FAILED test_fail:");
        expect(consoleContent).toContain("ValueError: invalid literal for int()");

        // The failing test's int("x") call should be highlighted in the editor, the same way a
        // normal Run's runtime error is (see highlightTestFailures() in PythonExecutionArea.vue).
        // Mirrors expectHasVisibleErrorIcon() in check-error-locations.spec.ts: the label text lives
        // in a <span>, and the error icon is shown on the nearest enclosing frame header. Matches on
        // the exact label text (not a substring) since "int" is also a substring of "print":
        await checkFrameErrorCount(page, 1);
        const scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
        const intSpan = page.locator("#frameContainer_-4 span", {hasText: /^int$/});
        const failingFrameHeader = intSpan.locator(
            `xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' ${scssVars.frameHeaderClassName} ')][1]`
        );
        await expect(failingFrameHeader).toHaveCount(1);
        await expect(failingFrameHeader.locator(".err-icon:visible")).toHaveCount(1);
    });

    test("Test function shortcut prefills test_ and test functions are shaded light brown", async ({page}) => {
        await enterTestingSection(page);

        // The shortcut creates a function definition named "test_" with the text cursor at the end of the name:
        await pressFrameShortcut(page, "s");
        await waitForEditorSettled(page);
        await page.keyboard.type("works");
        await waitForEditorSettled(page);
        const allFuncDefs = page.locator("#frameContainer_-4 .frame-div[data-frameType='funcdef']");
        await expect(allFuncDefs).toHaveCount(2); // the new one is at the top, above the default test function
        const funcDefFrame = allFuncDefs.first();
        await expect(funcDefFrame.locator(".label-slot-input").first()).toHaveText("test_works");
        await expect(funcDefFrame).toHaveCSS("background-color", "rgb(230, 210, 181)");

        // Renaming away from the test_ prefix removes the shading:
        await funcDefFrame.locator(".label-slot-input").first().click();
        await page.keyboard.press("Home");
        await page.keyboard.press("Delete");
        await waitForEditorSettled(page);
        await expect(funcDefFrame).not.toHaveCSS("background-color", "rgb(230, 210, 181)");
    });

    test("Assert frame is only available inside a test function, not at the top level of Testing or in other sections", async ({page}) => {
        const assertFrames = page.locator(".frame-div[data-frameType='assert']");
        await expect(assertFrames).toHaveCount(0);

        // Not in My code (the default caret). The unmatched shortcut leaves the frame commands pane open:
        await pressFrameShortcut(page, "k");
        await waitForEditorSettled(page);
        await expect(assertFrames).toHaveCount(0);
        await page.keyboard.press("Escape");
        await waitForEditorSettled(page);

        await enterTestingSection(page);

        // Nor at the top level of the Testing section:
        await pressFrameShortcut(page, "k");
        await waitForEditorSettled(page);
        await expect(assertFrames).toHaveCount(0);
        await page.keyboard.press("Escape");
        await waitForEditorSettled(page);

        // Nor are the other statements of My code, such as a while loop (nor a class):
        await pressFrameShortcut(page, "w");
        await waitForEditorSettled(page);
        await expect(page.locator("#frameContainer_-4 .frame-div[data-frameType='while']")).toHaveCount(0);
        await page.keyboard.press("Escape");
        await pressFrameShortcut(page, "c");
        await waitForEditorSettled(page);
        await expect(page.locator("#frameContainer_-4 .frame-div[data-frameType='classdef']")).toHaveCount(0);
        await page.keyboard.press("Escape");

        // Only functions (and comments, blanks and variable assignments) are:
        await pressFrameShortcut(page, "=");
        await waitForEditorSettled(page);
        await expect(page.locator("#frameContainer_-4 .frame-div[data-frameType='varassign']")).toHaveCount(1);
    });

    test("A statement typed at the top level of the Testing section moves into a new test function", async ({page}) => {
        const testFunctions = page.locator("#frameContainer_-4 .frame-div[data-frameType='funcdef']");
        await enterTestingSection(page);
        await page.keyboard.type("x");
        await waitForEditorSettled(page);
        await page.keyboard.press("Backspace");
        await page.keyboard.type("while ");
        // Typing the keyword moves the frame into the new test function, so let that finish before typing the condition:
        await waitForEditorSettled(page);
        await typeIndividually(page, "True");

        await expect(heading(page).locator(".frame-container-label-span")).toContainText("Test code");
        // A new test function at the top (above the starter one), holding the while loop, and nothing else at the top level:
        await expect(testFunctions).toHaveCount(2);
        await expect(testFunctions.nth(0).locator(".label-slot-input").first()).toHaveText("test_1");
        await expect(testFunctions.nth(0).locator(".frame-div[data-frameType='while']")).toHaveCount(1);
        await expect(page.locator("#frameContainer_-4 .frame-div[data-frameType='while']")).toHaveCount(1);
        await expect(page.locator("#frameContainer_-3 .frame-div[data-frameType='while']")).toHaveCount(0);
    });

    test("Pasting statements at the top level of the Testing section is refused, but functions are fine", async ({page}) => {
        await enterTestingSection(page);
        await doPagePaste(page, "print(1)\n");
        await waitForEditorSettled(page);
        await expect(page.locator("#frameContainer_-4 .frame-div[data-frameType='funccall']")).toHaveCount(0);
        await doPagePaste(page, "if True:\n    pass\n");
        await waitForEditorSettled(page);
        await expect(page.locator("#frameContainer_-4 .frame-div[data-frameType='if']")).toHaveCount(0);
        // Functions, with any statements inside, go in:
        await doPagePaste(page, "def helper():\n    if True:\n        print(1)\n");
        await expect(page.locator("#frameContainer_-4 .frame-div[data-frameType='funcdef']")).toHaveCount(2);
        await expect(page.locator("#frameContainer_-4 .frame-div[data-frameType='if']")).toHaveCount(1);
    });

    test("Assert frame can be used inside a test function", async ({page}) => {
        const assertFrames = page.locator(".frame-div[data-frameType='assert']");
        await enterTestingSection(page);
        await pressFrameShortcut(page, "s");
        await waitForEditorSettled(page);
        await page.keyboard.type("fails");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown"); // name -> function description
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown"); // function description -> body
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "k");
        await waitForEditorSettled(page);
        await page.keyboard.type("1 > 2");
        await waitForEditorSettled(page);
        await expect(assertFrames).toHaveCount(1);

        const runTestsButton = runButton(page);
        await expect(runTestsButton).toBeEnabled({timeout: 120000});
        await runTestsButton.click();
        const consoleLoc = page.locator("#peaConsole");
        await expect.poll(async () => await consoleLoc.inputValue(), {timeout: 120000}).toContain("1 passed, 1 failed");
        const consoleContent = await consoleLoc.inputValue();
        expect(consoleContent).toContain("FAILED test_fails:");
        // Just pytest's explanation of what failed (its lines prefixed with E) is shown after the FAILED line: not the
        // excerpt of the test's code, nor the closing line giving the file and line number:
        expect(consoleContent).toMatch(/\nE {7}assert 1 > 2/);
        expect(consoleContent).not.toContain("def test_fails");
        expect(consoleContent).not.toMatch(/\.py:\d+: /);
        expect(consoleContent).not.toContain(">  ");
    });

    test("Main code's top-level variables are not visible to the tests", async ({page}) => {
        await enterTestingSection(page);
        await pressFrameShortcut(page, "s");
        await waitForEditorSettled(page);
        await page.keyboard.type("uses_main");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown"); // name -> function description
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown"); // function description -> body
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "k");
        await waitForEditorSettled(page);
        // myString is assigned in the default project's main code section only:
        await page.keyboard.type("myString");
        await waitForEditorSettled(page);

        const runTestsButton = runButton(page);
        await expect(runTestsButton).toBeEnabled({timeout: 120000});
        await runTestsButton.click();
        const consoleLoc = page.locator("#peaConsole");
        await expect.poll(async () => await consoleLoc.inputValue(), {timeout: 120000}).toContain("1 passed, 1 failed");
        expect(await consoleLoc.inputValue()).toContain("NameError");
    });

    test("Tests can read files from the assets file system", async ({page}) => {
        await enterTestingSection(page);
        await pressFrameShortcut(page, "s");
        await waitForEditorSettled(page);
        await page.keyboard.type("reads_asset");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown"); // name -> function description
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown"); // function description -> body
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "k");
        await waitForEditorSettled(page);
        // Reading the bytes (not just opening) needs the worker to fetch the asset via the main thread;
        // a non-empty bytes object is truthy:
        await page.keyboard.type("open(\"/images/animals/panda.png\", \"rb\").read()");
        await waitForEditorSettled(page);

        const runTestsButton = runButton(page);
        await expect(runTestsButton).toBeEnabled({timeout: 120000});
        await runTestsButton.click();
        const consoleLoc = page.locator("#peaConsole");
        await expect.poll(async () => await consoleLoc.inputValue(), {timeout: 120000}).toContain("passed");
        expect(await consoleLoc.inputValue()).toContain("2 passed, 0 failed");
    });

    test("Tests can call functions defined in the Definitions section", async ({page}) => {
        // Create "def five(): return 5" in the (empty) Definitions section by clicking into it:
        await page.locator("#frameContainer_-2 .container-frames").click();
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "d");
        await waitForEditorSettled(page);
        await page.keyboard.type("five");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown"); // name -> function description
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown"); // function description -> body
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "r");
        await waitForEditorSettled(page);
        await page.keyboard.type("5");
        await waitForEditorSettled(page);
        await expect(page.locator("#frameContainer_-2 .frame-div[data-frameType='funcdef']")).toHaveCount(1);

        // Then a test that calls it (an unimported name would be a NameError):
        await goToTopOfMainCode(page);
        await enterTestingSection(page);
        await pressFrameShortcut(page, "s");
        await waitForEditorSettled(page);
        await page.keyboard.type("calls_five");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "k");
        await waitForEditorSettled(page);
        await page.keyboard.type("five()");
        await waitForEditorSettled(page);

        const runTestsButton = runButton(page);
        await expect(runTestsButton).toBeEnabled({timeout: 120000});
        await runTestsButton.click();
        const consoleLoc = page.locator("#peaConsole");
        await expect.poll(async () => await consoleLoc.inputValue(), {timeout: 120000}).toContain("passed");
        expect(await consoleLoc.inputValue()).toContain("2 passed, 0 failed");
    });

    test("Test function shortcut is not available outside the Testing section", async ({page}) => {
        // The default caret is in My code; "s" must not create a function definition there:
        await pressFrameShortcut(page, "s");
        await waitForEditorSettled(page);
        // (The only function definition in the project is the default test function in Testing)
        await expect(page.locator(".frame-div[data-frameType='funcdef']")).toHaveCount(1);
        await expect(page.locator("#frameContainer_-3 .frame-div[data-frameType='funcdef'], #frameContainer_-2 .frame-div[data-frameType='funcdef']")).toHaveCount(0);
    });
});
