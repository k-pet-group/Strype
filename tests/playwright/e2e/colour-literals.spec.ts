import { test, expect, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { setupStrypeTest } from "../support/general";
import { pressFrameShortcut, waitForEditorSettled, typeIndividually, pressN } from "../support/editor";
import { checkFrameErrorCount } from "../support/execution";
import { loadContent, save } from "../support/loading-saving";

// Covers the auto-conversion mechanic (colour-literals plan §4): a plain string whose content
// matches a hex colour (e.g. "#aabbcc") converts to a colour literal (rendered the same way as
// image/sound media literals -- see media-recording.spec.ts) once the cursor leaves the string,
// but not while still typing/partway through it. Picker-driven insertion/replacement (Ctrl-Shift-Y)
// is covered separately in colour-picker.spec.ts.
test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 60000, skipPyodide: true});
});

async function openIfFrame(page: Page) {
    await pressFrameShortcut(page, "i");
    await waitForEditorSettled(page);
}

// Types the given hex string as a plain string literal's content, then moves the caret out past
// the closing quote (arrow-out), which is what triggers the blur-conversion check (mere cursor
// movement doesn't fire onInput, see LabelSlot.vue's onLoseCaret) -- same pattern
// structured-expressions-navigation.spec.ts uses to move past a string's full width.
async function typeStringThenLeaveIt(page: Page, hex: string) {
    await typeIndividually(page, "\"" + hex);
    await waitForEditorSettled(page);
    await pressN("ArrowRight", 1 + hex.length, true)(page);
}

function colourSwatch(page: Page) {
    return page.locator("img[data-mediatype='colour']");
}

test.describe("Auto-conversion of typed hex strings to colour literals", () => {
    test("Typing a hex colour then moving out of the string converts it to a colour literal", async ({page}) => {
        await openIfFrame(page);
        await typeStringThenLeaveIt(page, "#aabbcc");
        await expect(colourSwatch(page)).toHaveAttribute("data-code", "\"#aabbcc\"");
        await checkFrameErrorCount(page, 0);
    });

    test("Uppercase/mixed-case hex is normalised to lowercase on conversion", async ({page}) => {
        await openIfFrame(page);
        await typeStringThenLeaveIt(page, "#AaBbCc");
        await expect(colourSwatch(page)).toHaveAttribute("data-code", "\"#aabbcc\"");
    });

    test("Single-quoted strings convert too, preserving the quote character", async ({page}) => {
        await openIfFrame(page);
        await typeIndividually(page, "'#aabbcc");
        await waitForEditorSettled(page);
        await pressN("ArrowRight", 1 + "#aabbcc".length, true)(page);
        await expect(colourSwatch(page)).toHaveAttribute("data-code", "'#aabbcc'");
    });

    test("Does not convert while the cursor is still inside the string", async ({page}) => {
        await openIfFrame(page);
        await typeIndividually(page, "\"#aabbcc");
        await waitForEditorSettled(page);
        // Deliberately not moving the cursor out -- still inside/at the end of the string content:
        await expect(colourSwatch(page)).toHaveCount(0);
    });

    test("f-prefixed strings never auto-convert", async ({page}) => {
        await openIfFrame(page);
        await typeIndividually(page, "f\"#aabbcc");
        await waitForEditorSettled(page);
        await pressN("ArrowRight", 1 + "#aabbcc".length, true)(page);
        await expect(colourSwatch(page)).toHaveCount(0);
    });

    test("r-prefixed strings never auto-convert", async ({page}) => {
        await openIfFrame(page);
        await typeIndividually(page, "r\"#aabbcc");
        await waitForEditorSettled(page);
        await pressN("ArrowRight", 1 + "#aabbcc".length, true)(page);
        await expect(colourSwatch(page)).toHaveCount(0);
    });

    test("Content that doesn't match a hex colour is left as a plain string", async ({page}) => {
        await openIfFrame(page);
        await typeStringThenLeaveIt(page, "not a colour");
        await expect(colourSwatch(page)).toHaveCount(0);
    });

    test("Undo after auto-conversion restores the original plain string", async ({page}) => {
        await openIfFrame(page);
        await typeStringThenLeaveIt(page, "#aabbcc");
        await expect(colourSwatch(page)).toHaveAttribute("data-code", "\"#aabbcc\"");

        await page.keyboard.press("ControlOrMeta+Z");
        await waitForEditorSettled(page);
        await expect(colourSwatch(page)).toHaveCount(0);
    });

    test("Redo after undoing an auto-conversion re-applies it", async ({page}) => {
        await openIfFrame(page);
        await typeStringThenLeaveIt(page, "#aabbcc");
        await page.keyboard.press("ControlOrMeta+Z");
        await waitForEditorSettled(page);
        await expect(colourSwatch(page)).toHaveCount(0);

        // Redo in this app is Ctrl/Cmd-Y, not the more common Ctrl-Shift-Z (see Commands.vue's
        // undo/redo keydown handling):
        await page.keyboard.press("ControlOrMeta+y");
        await waitForEditorSettled(page);
        await expect(colourSwatch(page)).toHaveAttribute("data-code", "\"#aabbcc\"");
    });
});

// Covers §6/§7 of the plan: loading a saved (.spy) project whose Main section contains a bare hex
// string renders it as a colour literal, and saving straight back out reproduces the exact same
// text -- proving parser.ts/editor.ts's generic SlotType.media codegen round-trips a colour
// literal's code unchanged, same as load-save-specific.spec.ts does for other unusual constructs.
test.describe("Loading and saving colour literals", () => {
    test.beforeEach(async ({ page, browserName }, testInfo) => {
        // Override the outer beforeEach's skipPyodide: true default with skipPyodide -- loading
        // doesn't need Python execution, matching load-save-specific.spec.ts's own setup:
        await setupStrypeTest(page, browserName, testInfo, {skipPyodide: true});
    });

    async function testLoadSaveMainLines(page: Page, content: string) {
        const spySource = [
            "#(=> Strype:1:std",
            "#(=> Section:Imports",
            "#(=> Section:Definitions",
            "#(=> Section:Main",
            content,
            "#(=> Section:End",
            "",
        ].join("\n");
        await loadContent(page, spySource);
        const output = readFileSync(await save(page, false), "utf8").replace(/\r\n/g, "\n");
        expect(output).toEqual(spySource);
    }

    test("Loading a bare hex string renders it as a colour literal", async ({page}) => {
        await loadContent(page, [
            "#(=> Strype:1:std",
            "#(=> Section:Imports",
            "#(=> Section:Definitions",
            "#(=> Section:Main",
            "myColour  = \"#aabbcc\" ",
            "#(=> Section:End",
            "",
        ].join("\n"));
        await expect(colourSwatch(page)).toHaveAttribute("data-code", "\"#aabbcc\"");
    });

    test("Loading then saving a colour literal reproduces the exact original text", async ({page}) => {
        await testLoadSaveMainLines(page, "myColour  = \"#3366cc\" ");
    });

    test("Loading then saving a single-quoted colour literal preserves the quote character", async ({page}) => {
        await testLoadSaveMainLines(page, "myColour  = '#3366cc' ");
    });

    test("A prefixed string that happens to look like a colour is loaded as a plain string, not converted", async ({page}) => {
        await loadContent(page, [
            "#(=> Strype:1:std",
            "#(=> Section:Imports",
            "#(=> Section:Definitions",
            "#(=> Section:Main",
            "myString  = f\"#aabbcc\" ",
            "#(=> Section:End",
            "",
        ].join("\n"));
        await expect(colourSwatch(page)).toHaveCount(0);
    });
});
