import { test, expect } from "@playwright/test";
import { setupStrypeTest } from "../support/general";
import { assertStateOfIfFrame, waitForEditorSettled, typeIndividually, MEDIA_SLOT_PARSED_PLACEHOLDER } from "../support/editor";

// This spec only runs under the dedicated "chromium-media-recording" Playwright project (see
// playwright.config.ts), which supplies Chrome's fake-device flags so getUserMedia() returns a
// canned video/audio feed instead of requiring real hardware/permissions.
test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 60000, skipPyodide: true});
});

// Opens an "if" frame and leaves the caret in its (empty) expression slot.
async function openIfFrame(page: import("@playwright/test").Page) {
    await page.keyboard.press("i");
    await waitForEditorSettled(page);
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

test.describe("Record media literal shortcut gating", () => {
    test("Ctrl-Shift-I does nothing inside a string slot", async ({page}) => {
        await openIfFrame(page);
        await page.keyboard.type("\"abc");
        await waitForEditorSettled(page);
        await page.keyboard.press("ControlOrMeta+Shift+I");
        // No good positive signal for "nothing happened", so just give it a moment then assert absence.
        // Note: the dialog stays mounted (but hidden) in the DOM even when "closed", so we must check
        // visibility, not mere presence:
        await page.waitForTimeout(300);
        await expect(page.locator(".RecordImageDlg-video-wrapper")).not.toBeVisible();
    });

    test("Ctrl-Shift-U does nothing inside a comment frame", async ({page}) => {
        await page.keyboard.press("#");
        await waitForEditorSettled(page);
        await page.keyboard.type("hello");
        await waitForEditorSettled(page);
        await page.keyboard.press("ControlOrMeta+Shift+U");
        await page.waitForTimeout(300);
        await expect(page.locator(".RecordSoundDlg-waveform")).not.toBeVisible();
    });

    test("Ctrl-Shift-I opens the record-image dialog in a plain expression slot", async ({page}) => {
        await openIfFrame(page);
        await page.keyboard.press("ControlOrMeta+Shift+I");
        await expect(page.locator(".RecordImageDlg-video-wrapper")).toBeVisible();
        // Release the fake camera before the test ends, rather than leaving it open across the
        // context teardown -- avoids any risk of the next test's getUserMedia() request racing
        // with this context's release of the (process-wide) fake video device:
        await page.locator(".RecordImageDlg-cancel-button").click();
    });

    test("Ctrl-Shift-U opens the record-sound dialog in a plain expression slot", async ({page}) => {
        await openIfFrame(page);
        await page.keyboard.press("ControlOrMeta+Shift+U");
        await expect(page.locator(".RecordSoundDlg-waveform")).toBeVisible();
        await page.locator(".RecordSoundDlg-cancel-button").click();
    });
});

test.describe("Record and insert an image", () => {
    test("Record (immediate), edit OK, inserted at the caret position", async ({page}) => {
        await openIfFrame(page);
        // Deliberately not ending in a dangling operator (e.g. "1+") when the shortcut fires --
        // that splices the raw unparsed text "1+" in as a single field (the same as pasting would),
        // which a later refactor pass can re-tokenize oddly (seen turning into "+1"); inserting
        // after a plain, already-complete operand avoids that unrelated edge case:
        await typeIndividually(page, "1");
        await page.keyboard.press("ControlOrMeta+Shift+I");
        await waitForFakeVideoPlaying(page);
        await page.locator(".RecordImageDlg-record-button").click();

        // Switches to the (unchanged) existing edit dialog:
        await expect(page.locator("span.EditImageDlg-sizeInfo").first()).toBeVisible();
        await waitForImageCropperReady(page);
        await clickVisiblePrimaryButton(page, "OK");

        await page.waitForFunction(() => document.querySelector("img[data-code^='load_image']") != null);
        await typeIndividually(page, "+2");

        // Derive the actual captured base64 tail from what got inserted, then use it to verify
        // the media literal landed in exactly the right spot (right after the typed "1") --
        // we can't know the fake camera's exact PNG bytes in advance, but we can check the splice
        // position against whatever was actually captured:
        const dataCode = await page.locator("img[data-code^='load_image']").getAttribute("data-code");
        const endOfB64 = (dataCode as string).slice(-11, -2); // strip the trailing "\")" first
        await assertStateOfIfFrame(page, "{1}" + MEDIA_SLOT_PARSED_PLACEHOLDER.image + "{}+{2$}", [{mediaType: "img", endOfB64}]);
    });

    test("Record with 3s countdown then captures automatically", async ({page}) => {
        await openIfFrame(page);
        await page.keyboard.press("ControlOrMeta+Shift+I");
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
        await page.keyboard.press("ControlOrMeta+Shift+I");
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

    test("Cancelling the record dialog inserts nothing", async ({page}) => {
        await openIfFrame(page);
        await page.keyboard.press("ControlOrMeta+Shift+I");
        await expect(page.locator(".RecordImageDlg-video-wrapper")).toBeVisible();
        await page.locator(".RecordImageDlg-cancel-button").click();
        await expect(page.locator(".RecordImageDlg-video-wrapper")).not.toBeVisible();
        await expect(page.locator("img[data-code^='load_image']")).toHaveCount(0);
    });

    test("Cancelling the edit dialog after a capture inserts nothing", async ({page}) => {
        await openIfFrame(page);
        await page.keyboard.press("ControlOrMeta+Shift+I");
        await waitForFakeVideoPlaying(page);
        await page.locator(".RecordImageDlg-record-button").click();
        await expect(page.locator("span.EditImageDlg-sizeInfo").first()).toBeVisible();

        await page.locator(".btn.btn-secondary", {hasText: "Cancel"}).filter({visible: true}).click();
        await expect(page.locator("span.EditImageDlg-sizeInfo").first()).not.toBeVisible();
        await expect(page.locator("img[data-code^='load_image']")).toHaveCount(0);
    });
});

test.describe("Record and insert a sound", () => {
    test("Live waveform changes over time while the dialog is open", async ({page}) => {
        await openIfFrame(page);
        await page.keyboard.press("ControlOrMeta+Shift+U");
        const canvas = page.locator(".RecordSoundDlg-waveform");
        await expect(canvas).toBeVisible();
        const firstFrame = await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL());
        await expect.poll(() => canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL()), {timeout: 5000}).not.toEqual(firstFrame);
    });

    test("Record, stop, edit OK, inserted at the caret position", async ({page}) => {
        await openIfFrame(page);
        // See the equivalent image test above for why this doesn't end in a dangling operator:
        await typeIndividually(page, "1");
        await page.keyboard.press("ControlOrMeta+Shift+U");
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
        await assertStateOfIfFrame(page, "{1}" + MEDIA_SLOT_PARSED_PLACEHOLDER.sound + "{}+{2$}", [{mediaType: "snd", endOfB64}]);
    });

    test("Cancelling the record dialog inserts nothing", async ({page}) => {
        await openIfFrame(page);
        await page.keyboard.press("ControlOrMeta+Shift+U");
        await expect(page.locator(".RecordSoundDlg-waveform")).toBeVisible();
        await page.locator(".RecordSoundDlg-cancel-button").click();
        await expect(page.locator(".RecordSoundDlg-waveform")).not.toBeVisible();
        await expect(page.locator("img[data-code^='load_sound']")).toHaveCount(0);
    });
});
