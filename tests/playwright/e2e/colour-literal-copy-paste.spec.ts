import { test, expect } from "@playwright/test";
import { pressFrameShortcut, waitForEditorSettled, doPagePaste } from "../support/editor";
import { setupStrypeTest } from "../support/general";

// Opens the colour-picker dialog via the slot shortcuts pane -- Space at the start of an empty,
// non-string slot, then "c" to activate the colour-picker shortcut (see Commands.vue's
// triggerSlotShortcut). Replaces the old direct Ctrl-Shift-Y shortcut, which no longer does
// anything (see colour-picker.spec.ts's own copy of this helper).
async function openColourPickerViaShortcut(page: import("@playwright/test").Page) {
    // The pane focuses its first button asynchronously (a zero-delay setTimeout in Commands.vue's
    // openSlotShortcutsPane()), so wait for that rather than pressing the shortcut letter
    // immediately -- otherwise it can race and land back on the slot itself. Under heavy CI
    // contention (macOS runners are known to be starved for main-thread time, see
    // playwright.config.ts's worker-count comment) the Space itself can also be lost -- e.g.
    // pressed before the slot has really taken focus after the previous dialog closed -- in which
    // case no amount of waiting helps (seen repeatedly: CI runs 36733941422, 37274489427, where
    // the first button stayed "inactive" for the whole 20s). So retry the Space whenever the pane
    // still isn't active (the slot is empty here, so a second Space is harmless), with short waits
    // between attempts instead of one long one.
    const panel = page.locator("#addSlotShortcutsPanel");
    await expect(async () => {
        // The panel is shown whenever the slot offers shortcuts; this class marks it as open:
        if (await panel.locator("xpath=self::*[contains(@class, 'frame-commands-pane-active')]").count() === 0) {
            await page.keyboard.press(" ");
        }
        await expect(panel.locator(".frame-cmd-btn").first()).toBeFocused({timeout: 3000});
    }).toPass({timeout: 30000});
    await page.keyboard.press("c");
}

// Covers §8 of the plan: copy/paste of a colour literal within Strype. Unlike image/sound
// literals (structured-expressions-media.spec.ts), a colour literal's underlying code is just a
// bare quoted string (e.g. "#aabbcc"), not a load_image(...)/load_sound(...) call, so there's no
// dedicated binary-clipboard path for it -- copying one puts its quoted hex text on the clipboard
// like any other text selection, and pasting it goes through the same paste-then-reparse pipeline
// as typing/loading it would.
//
// Copying uses a real Ctrl-C against Playwright's fake clipboard (see setupStrypeTest's
// fakeClipboard option) and reads it back via navigator.clipboard.readText() -- no clipboard
// infrastructure of our own needed there, it's a genuine OS-level (faked) round-trip. Pasting,
// however, still goes through doPagePaste() (dispatching a paste DOM event with explicit
// clipboardData) rather than a real Ctrl-V keypress: confirmed empirically while writing this
// test that a real Ctrl-V here does nothing at all (the shortcut doesn't read from the fake
// clipboard) -- structured-expressions-copy-paste.spec.ts's CUT_REPASTE case hits the same
// limitation and documents it the same way, reusing the confirmed clipboard content from the
// preceding real copy rather than a shortcut for the paste half.
test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {
        timeoutMs: 60000,
        skipPyodide: true,
        fakeClipboard: true,
        gotoWaitUntil: "domcontentloaded",
        skipWindowsWebkitReason: "Skipping on WebKit + Windows due to clipboard permission issues.",
    });
});

async function openIfFrame(page: import("@playwright/test").Page) {
    await pressFrameShortcut(page, "i");
    await waitForEditorSettled(page);
}

function colourSwatch(page: import("@playwright/test").Page) {
    return page.locator("img[data-mediatype='colour']");
}

// Inserts a colour literal via the picker (not-in-string branch, see colour-picker.spec.ts's own
// cursor-placement tests) rather than the typed-string blur-conversion route: that route
// deliberately leaves nothing focused after converting (there's no cursor to restore into once
// the slot has left edit mode -- see checkSlotRefactoring's treatAsBlurred branch in
// LabelSlotsStructure.vue), whereas the picker explicitly places the cursor in the empty sibling
// field right after the swatch, which this test needs a live selection anchor to select from.
async function insertColourSwatch(page: import("@playwright/test").Page, hex: string) {
    await openColourPickerViaShortcut(page);
    await page.locator("button", {hasText: "Spectrum"}).click();
    await page.locator("#ColourPickerDlg-hex-input").fill(hex);
    await page.locator(".btn.btn-primary", {hasText: "OK"}).filter({visible: true}).click();
    await waitForEditorSettled(page);
}

// Selects the swatch just before the caret and copies it. Under CI load the Ctrl-C can arrive
// before the selection has been applied (the clipboard then stays empty -- CI runs 37138666763 and
// 37274489427, on three consecutive retries), so wait for a real selection first and keep
// re-copying until the clipboard has the expected text (copying is idempotent):
async function selectSwatchAndCopy(page: import("@playwright/test").Page, expected = "\"#aabbcc\"") {
    await page.keyboard.press("Shift+ArrowLeft");
    await expect.poll(() => page.evaluate(() => document.getSelection()?.isCollapsed === false)).toBe(true);
    await expect.poll(async () => {
        await page.keyboard.press("ControlOrMeta+c");
        return await page.evaluate("navigator.clipboard.readText()");
    }).toEqual(expected);
}

test.describe("Copying a colour literal", () => {
    test("Selecting just the swatch puts its quoted hex text on the clipboard", async ({page}) => {
        await openIfFrame(page);
        await insertColourSwatch(page, "#aabbcc");
        await expect(colourSwatch(page)).toHaveCount(1);

        // Cursor is in the empty field right after the swatch (see insertColourSwatch's comment);
        // one shift-left selects exactly it (media literals are one character wide):
        await selectSwatchAndCopy(page);
    });
});

test.describe("Pasting a copied colour literal", () => {
    // Unlike image/sound literals (whose pasted flat text is recognised immediately via a
    // load_image(...)/load_sound(...) regex match in getFrameLabelSlotLiteralCodeAndFocus's
    // useFlatMediaDataCode handling), a colour literal has no distinctive call-shape to spot in
    // flat pasted text -- it's just a quoted hex string, indistinguishable at that point from any
    // other pasted string. It still ends up converted immediately here, though, not via that
    // media-specific path: pasting the *whole* quoted string "#aabbcc" into an empty slot leaves
    // the cursor right after the closing quote (onCodePasteImpl places it at the end of the
    // inserted text), which already satisfies the blur-conversion's "cursor outside the string"
    // condition (§4) on the very same reparse the paste itself triggers -- confirmed empirically;
    // no separate arrow-out step needed, unlike typing the same content character-by-character.
    test("Pasting the copied text recreates a colour literal", async ({page}) => {
        await openIfFrame(page);
        await insertColourSwatch(page, "#aabbcc");
        await selectSwatchAndCopy(page);

        // Paste into a second, fresh if-frame's empty slot. Escape (not End) first: the caret is
        // still in the (still-empty) field right after the swatch, and Space at the start of an
        // empty slot opens the slot shortcuts pane (see LabelSlot.vue's processInput/
        // canOpenSlotShortcutsPane) -- so openIfFrame's own Space press would otherwise be caught
        // by that pane instead of reaching the frame commands pane it actually needs here.
        await page.keyboard.press("Escape");
        await openIfFrame(page);
        await waitForEditorSettled(page);
        await doPagePaste(page, "\"#aabbcc\"");

        await expect(colourSwatch(page)).toHaveCount(2);
        await expect(colourSwatch(page).last()).toHaveAttribute("data-code", "\"#aabbcc\"");
    });
});
