import { test, expect } from "@playwright/test";
import { setupStrypeTest } from "../support/general";
import { assertStateOfIfFrame, enterCode, waitForEditorSettled, typeIndividually, MEDIA_SLOT_PARSED_PLACEHOLDER, pressFrameShortcut } from "../support/editor";

// This spec only runs under the dedicated "chromium-media-recording" Playwright project (see
// playwright.config.ts), which supplies Chrome's fake-device flags so getUserMedia() returns a
// canned video/audio feed instead of requiring real hardware/permissions.
test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 60000, skipPyodide: true});
});

// Opens an "if" frame and leaves the caret in its (empty) expression slot.
async function openIfFrame(page: import("@playwright/test").Page) {
    await pressFrameShortcut(page, "i");
    await waitForEditorSettled(page);
}

// Opens the record-image ("i") or record-sound ("s") dialog via the slot shortcuts pane -- Space
// at the start of an empty, non-string slot, then the shortcut letter (see Commands.vue's
// triggerSlotShortcut). Only works at exactly that caret position.
async function openMediaShortcut(page: import("@playwright/test").Page, key: "i" | "s") {
    await page.keyboard.press(" ");
    // The pane focuses its first button asynchronously (a zero-delay setTimeout in Commands.vue's
    // openSlotShortcutsPane()), so wait for that rather than pressing the shortcut letter
    // immediately -- otherwise it can race and land back on the slot itself. The default 5s
    // timeout isn't always enough under heavy CI contention (seen consistently failing on a
    // macos-latest/chromium run for the identical wait in colour-picker.spec.ts, CI run
    // 36733941422/job 109950581178) -- macOS CI runners are already known to be starved for
    // main-thread time under load (see playwright.config.ts's worker-count comment), so give this
    // more headroom rather than treat it as a real hang.
    await expect(page.locator("#addSlotShortcutsPanel .frame-cmd-btn").first()).toBeFocused({timeout: 20000});
    await page.keyboard.press(key);
}

async function waitForFakeVideoPlaying(page: import("@playwright/test").Page) {
    // readyState/videoWidth alone can be satisfied before the fake device has actually decoded a
    // real frame (seen as a flaky "stuck on Loading..." crop dialog when this runs shortly after
    // another test's getUserMedia() acquisition in the same browser process) -- currentTime > 0
    // is a stronger signal that playback has genuinely progressed and a real frame is decoded:
    await page.waitForFunction(() => {
        const video = document.querySelector(".RecordImageDlg-video") as HTMLVideoElement | null;
        return video != null && video.readyState >= 2 && video.videoWidth > 0 && video.currentTime > 0;
    });
}

async function clickVisiblePrimaryButton(page: import("@playwright/test").Page, text: string) {
    await page.locator(".btn.btn-primary", {hasText: text}).filter({visible: true}).click();
}

// The edit dialogs' size-info spans start out reading "Loading..." and only update once the
// cropper has actually finished loading the captured image/sound (EditImageDlg.vue/
// EditSoundDlg.vue's imageLoaded()/change() handlers) -- the span itself is visible immediately,
// well before that finishes, so waiting on visibility alone (as the rest of this spec used to)
// races the async load and can click OK before getUpdatedMedia() has anything to return, silently
// dropping the capture. Same pattern already used for this in media-literal-edit.spec.ts.
async function waitForEditDialogLoaded(page: import("@playwright/test").Page, sizeInfoSelector: string) {
    const spans = page.locator(sizeInfoSelector);
    const count = await spans.count();
    for (let i = 0; i < count; i++) {
        await expect(spans.nth(i)).not.toContainText("Loading", {timeout: 10000});
    }
}

// For images specifically, the size-info text (checked above) can update slightly before the
// cropper's own internal <img> has actually finished decoding -- getUpdatedMedia() reads the
// cropper's live getResult().canvas, not the size text, so on a second/re-record open that small
// extra gap is enough to still hit "canvas not ready" (seen as an unhandled "Loading" rejection
// and nothing inserted) even though the size text already looked loaded. Wait on the cropper's
// own <img> naturalWidth directly, which is the actual signal getResult() depends on.
async function waitForImageCropperReady(page: import("@playwright/test").Page) {
    await waitForEditDialogLoaded(page, "span.EditImageDlg-sizeInfo");
    await page.waitForFunction(() => {
        const img = document.getElementsByClassName("edit-image-cropper-image")[0] as HTMLImageElement | undefined;
        return img != null && img.naturalWidth > 0;
    });
    // Even the above isn't quite sufficient on a second/re-record open: the cropper library's own
    // internal getResult().canvas (which is what getUpdatedMedia() actually reads, and can only be
    // polled from inside the component, not observed here) lags slightly behind naturalWidth
    // becoming available -- confirmed by an unhandled "Loading" rejection still occurring
    // immediately after both checks above passed. A short buffer clears it reliably in practice.
    await page.waitForTimeout(300);
}

test.describe("Record media literal -- old direct shortcuts no longer do anything", () => {
    test("Ctrl-Shift-I no longer opens the record-image dialog", async ({page}) => {
        await openIfFrame(page);
        await page.keyboard.press("ControlOrMeta+Shift+I");
        // No good positive signal for "nothing happened", so just give it a moment then assert absence.
        // Note: the dialog stays mounted (but hidden) in the DOM even when "closed", so we must check
        // visibility, not mere presence:
        await page.waitForTimeout(300);
        await expect(page.locator(".RecordImageDlg-video-wrapper")).not.toBeVisible();
    });

    test("Ctrl-Shift-U no longer opens the record-sound dialog", async ({page}) => {
        await openIfFrame(page);
        await page.keyboard.press("ControlOrMeta+Shift+U");
        await page.waitForTimeout(300);
        await expect(page.locator(".RecordSoundDlg-waveform")).not.toBeVisible();
    });
});

test.describe("Slot shortcuts pane (Space at an empty slot) -- keyboard letter activation", () => {
    test("space then i opens the record-image dialog", async ({page}) => {
        await openIfFrame(page);
        await page.keyboard.press(" ");
        // See openMediaShortcut()'s comment above for why this needs a longer timeout.
        await expect(page.locator("#addSlotShortcutsPanel .frame-cmd-btn").first()).toBeFocused({timeout: 20000});
        await page.keyboard.press("i");
        await expect(page.locator(".RecordImageDlg-video-wrapper")).toBeVisible();
        await page.locator(".RecordImageDlg-cancel-button").click();
    });

    test("space then s opens the record-sound dialog", async ({page}) => {
        await openIfFrame(page);
        await page.keyboard.press(" ");
        // See openMediaShortcut()'s comment above for why this needs a longer timeout.
        await expect(page.locator("#addSlotShortcutsPanel .frame-cmd-btn").first()).toBeFocused({timeout: 20000});
        await page.keyboard.press("s");
        await expect(page.locator(".RecordSoundDlg-waveform")).toBeVisible();
        await page.locator(".RecordSoundDlg-cancel-button").click();
    });

    test("space then enter activates the focused (first) button", async ({page}) => {
        await openIfFrame(page);
        await page.keyboard.press(" ");
        // See openMediaShortcut()'s comment above for why this needs a longer timeout.
        await expect(page.locator("#addSlotShortcutsPanel .frame-cmd-btn").first()).toBeFocused({timeout: 20000});
        await page.keyboard.press("Enter");
        await expect(page.locator(".RecordImageDlg-video-wrapper")).toBeVisible();
        await page.locator(".RecordImageDlg-cancel-button").click();
    });
});

test.describe("Record and insert an image", () => {
    test("Record (immediate), edit OK, inserted at the caret position", async ({page}) => {
        await openIfFrame(page);
        await openMediaShortcut(page, "i");
        await waitForFakeVideoPlaying(page);
        await page.locator(".RecordImageDlg-record-button").click();

        // Switches to the (unchanged) existing edit dialog:
        await expect(page.locator("span.EditImageDlg-sizeInfo").first()).toBeVisible();
        await waitForImageCropperReady(page);
        await clickVisiblePrimaryButton(page, "OK");

        await page.waitForFunction(() => document.querySelector("img[data-code^='load_image']") != null);
        await typeIndividually(page, "+2");

        // Derive the actual captured base64 tail from what got inserted, then use it to verify
        // the media literal landed in exactly the right spot (right at the start of the slot) --
        // we can't know the fake camera's exact PNG bytes in advance, but we can check the splice
        // position against whatever was actually captured:
        const dataCode = await page.locator("img[data-code^='load_image']").getAttribute("data-code");
        const endOfB64 = (dataCode as string).slice(-11, -2); // strip the trailing "\")" first
        await assertStateOfIfFrame(page, "{}" + MEDIA_SLOT_PARSED_PLACEHOLDER.image + "{}+{2$}", [{mediaType: "img", endOfB64}]);
    });

    test("Record with 3s countdown then captures automatically", async ({page}) => {
        await openIfFrame(page);
        await openMediaShortcut(page, "i");
        await waitForFakeVideoPlaying(page);
        await page.locator(".RecordImageDlg-record-countdown-button").click();
        await expect(page.locator(".RecordImageDlg-countdown")).toBeVisible();
        await expect(page.locator(".RecordImageDlg-countdown")).toHaveText("3");
        // Wait for the countdown to run down and auto-capture into the edit dialog (generous
        // margin over the 3s countdown itself):
        await expect(page.locator("span.EditImageDlg-sizeInfo").first()).toBeVisible({timeout: 8000});
    });

    test("Re-record discards the first capture and only inserts the second", async ({page}) => {
        await openIfFrame(page);
        await openMediaShortcut(page, "i");
        await waitForFakeVideoPlaying(page);
        await page.locator(".RecordImageDlg-record-button").click();
        await expect(page.locator("span.EditImageDlg-sizeInfo").first()).toBeVisible();
        await waitForImageCropperReady(page);

        await page.locator(".EditImageDlg-rerecord-button").click();
        // Back on the record dialog:
        await expect(page.locator(".RecordImageDlg-video-wrapper")).toBeVisible();
        await waitForFakeVideoPlaying(page);
        await page.locator(".RecordImageDlg-record-button").click();
        await expect(page.locator("span.EditImageDlg-sizeInfo").first()).toBeVisible();
        await waitForImageCropperReady(page);
        await clickVisiblePrimaryButton(page, "OK");

        await page.waitForFunction(() => document.querySelector("img[data-code^='load_image']") != null);
        // Exactly one image literal ends up inserted, not two:
        await expect(page.locator("img[data-code^='load_image']")).toHaveCount(1);
    });

    test("Cancelling the record dialog inserts nothing and restores the cursor to the slot", async ({page}) => {
        await openIfFrame(page);
        await openMediaShortcut(page, "i");
        await expect(page.locator(".RecordImageDlg-video-wrapper")).toBeVisible();
        await page.locator(".RecordImageDlg-cancel-button").click();
        await expect(page.locator(".RecordImageDlg-video-wrapper")).not.toBeVisible();
        await expect(page.locator("img[data-code^='load_image']")).toHaveCount(0);

        // Restoring focus into the slot (from the pane button the shortcut was triggered from)
        // goes through an extra async hop compared to the old direct-shortcut flow -- settle
        // before typing, or the keypress can race ahead of the restore and land nowhere:
        await waitForEditorSettled(page);
        // The text cursor should be back in the slot (not left on the frame cursor) -- if it
        // wasn't, this keypress would do something other than extend the slot's own content:
        await typeIndividually(page, "2");
        await waitForEditorSettled(page);
        await assertStateOfIfFrame(page, "{2$}", []);
    });

    test("Cancelling the edit dialog after a capture inserts nothing and restores the cursor to the slot", async ({page}) => {
        await openIfFrame(page);
        await openMediaShortcut(page, "i");
        await waitForFakeVideoPlaying(page);
        await page.locator(".RecordImageDlg-record-button").click();
        await expect(page.locator("span.EditImageDlg-sizeInfo").first()).toBeVisible();

        await page.locator(".btn.btn-secondary", {hasText: "Cancel"}).filter({visible: true}).click();
        await expect(page.locator("span.EditImageDlg-sizeInfo").first()).not.toBeVisible();
        await expect(page.locator("img[data-code^='load_image']")).toHaveCount(0);

        await typeIndividually(page, "2");
        await waitForEditorSettled(page);
        await assertStateOfIfFrame(page, "{2$}", []);
    });
});

test.describe("Record and insert a sound", () => {
    test("Live waveform changes over time while the dialog is open", async ({page}) => {
        await openIfFrame(page);
        await openMediaShortcut(page, "s");
        const canvas = page.locator(".RecordSoundDlg-waveform");
        await expect(canvas).toBeVisible();
        const firstFrame = await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL());
        await expect.poll(() => canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL()), {timeout: 5000}).not.toEqual(firstFrame);
    });

    test("Record, stop, edit OK, inserted at the caret position", async ({page}) => {
        await openIfFrame(page);
        await openMediaShortcut(page, "s");
        await expect(page.locator(".RecordSoundDlg-waveform")).toBeVisible();
        await page.locator(".RecordSoundDlg-record-button").click();
        // Let a moment of (fake) audio actually get recorded:
        await page.waitForTimeout(500);
        await page.locator(".RecordSoundDlg-stop-button").click();

        await expect(page.locator("span.EditSoundDlg-sizeInfo").first()).toBeVisible();
        await waitForEditDialogLoaded(page, "span.EditSoundDlg-sizeInfo");
        await clickVisiblePrimaryButton(page, "OK");

        await page.waitForFunction(() => document.querySelector("img[data-code^='load_sound']") != null);
        await typeIndividually(page, "+2");

        const dataCode = await page.locator("img[data-code^='load_sound']").getAttribute("data-code");
        const endOfB64 = (dataCode as string).slice(-11, -2);
        await assertStateOfIfFrame(page, "{}" + MEDIA_SLOT_PARSED_PLACEHOLDER.sound + "{}+{2$}", [{mediaType: "snd", endOfB64}]);
    });

    test("Cancelling the record dialog inserts nothing and restores the cursor to the slot", async ({page}) => {
        await openIfFrame(page);
        await openMediaShortcut(page, "s");
        await expect(page.locator(".RecordSoundDlg-waveform")).toBeVisible();
        await page.locator(".RecordSoundDlg-cancel-button").click();
        await expect(page.locator(".RecordSoundDlg-waveform")).not.toBeVisible();
        await expect(page.locator("img[data-code^='load_sound']")).toHaveCount(0);

        // Restoring focus into the slot (from the pane button the shortcut was triggered from)
        // goes through an extra async hop compared to the old direct-shortcut flow -- settle
        // before typing, or the keypress can race ahead of the restore and land nowhere:
        await waitForEditorSettled(page);
        // The text cursor should be back in the slot (not left on the frame cursor) -- if it
        // wasn't, this keypress would do something other than extend the slot's own content:
        await typeIndividually(page, "2");
        await waitForEditorSettled(page);
        await assertStateOfIfFrame(page, "{2$}", []);
    });
});

// Image and sound literals need load_image/load_sound to be imported, so recording one should add
// the import if the project doesn't have it:
test.describe("Record media literal -- adds the necessary import", () => {
    test("Recording an image adds the strype.graphics import", async ({page}) => {
        await enterCode(page, ["", "", ""]);
        await expect(page.locator("#frameContainer_-1")).not.toContainText("strype.graphics");
        await openIfFrame(page);
        await openMediaShortcut(page, "i");
        await waitForFakeVideoPlaying(page);
        await page.locator(".RecordImageDlg-record-button").click();
        await expect(page.locator("span.EditImageDlg-sizeInfo").first()).toBeVisible();
        await waitForImageCropperReady(page);
        await clickVisiblePrimaryButton(page, "OK");
        await page.waitForFunction(() => document.querySelector("img[data-code^='load_image']") != null);
        await expect(page.locator("#frameContainer_-1")).toContainText("strype.graphics");
        await expect(page.locator("#frameContainer_-1")).not.toContainText("strype.sound");
    });

    test("Recording a sound adds the strype.sound import", async ({page}) => {
        await enterCode(page, ["", "", ""]);
        await expect(page.locator("#frameContainer_-1")).not.toContainText("strype.sound");
        await openIfFrame(page);
        await openMediaShortcut(page, "s");
        await expect(page.locator(".RecordSoundDlg-waveform")).toBeVisible();
        await page.locator(".RecordSoundDlg-record-button").click();
        await page.waitForTimeout(500);
        await page.locator(".RecordSoundDlg-stop-button").click();
        await expect(page.locator("span.EditSoundDlg-sizeInfo").first()).toBeVisible();
        await waitForEditDialogLoaded(page, "span.EditSoundDlg-sizeInfo");
        await clickVisiblePrimaryButton(page, "OK");
        await page.waitForFunction(() => document.querySelector("img[data-code^='load_sound']") != null);
        await expect(page.locator("#frameContainer_-1")).toContainText("strype.sound");
        await expect(page.locator("#frameContainer_-1")).not.toContainText("strype.graphics");
    });
});
