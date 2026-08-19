import { test, expect } from "@playwright/test";
import { pressFrameShortcut, waitForEditorSettled, doPagePaste } from "../support/editor";
import { setupStrypeTest } from "../support/general";

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
    await page.keyboard.press("ControlOrMeta+Shift+Y");
    await page.locator("button", {hasText: "Fine-grained selector"}).click();
    // ColourPickerDlg.vue's own hexText seeding (onShownModalDlg) runs on bootstrap-vue's async
    // "shown" modal event, which can fire after the dialog is already interactable -- filling
    // immediately can race it and get silently overwritten. See colour-picker.spec.ts's
    // waitForColourPickerSeeded for the full explanation (this hit a real, reproducible CI failure).
    await page.waitForTimeout(500);
    await page.locator("#ColourPickerDlg-hex-input").fill(hex);
    await page.locator(".btn.btn-primary", {hasText: "OK"}).filter({visible: true}).click();
    await waitForEditorSettled(page);
}

test.describe("Copying a colour literal", () => {
    test("Selecting just the swatch puts its quoted hex text on the clipboard", async ({page}) => {
        await openIfFrame(page);
        await insertColourSwatch(page, "#aabbcc");
        await expect(colourSwatch(page)).toHaveCount(1);

        // Cursor is in the empty field right after the swatch (see insertColourSwatch's comment);
        // one shift-left selects exactly it (media literals are one character wide):
        await page.keyboard.press("Shift+ArrowLeft");
        await page.keyboard.press("ControlOrMeta+c");
        await expect.poll(() => page.evaluate("navigator.clipboard.readText()")).toEqual("\"#aabbcc\"");
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
        await page.keyboard.press("Shift+ArrowLeft");
        await page.keyboard.press("ControlOrMeta+c");
        await expect.poll(() => page.evaluate("navigator.clipboard.readText()")).toEqual("\"#aabbcc\"");

        // Paste into a second, fresh if-frame's empty slot:
        await page.keyboard.press("End");
        await openIfFrame(page);
        await doPagePaste(page, "\"#aabbcc\"");

        await expect(colourSwatch(page)).toHaveCount(2);
        await expect(colourSwatch(page).last()).toHaveAttribute("data-code", "\"#aabbcc\"");
    });
});
