import { test, expect } from "@playwright/test";
import { setupStrypeTest } from "../support/general";
import { assertStateOfIfFrame, waitForEditorSettled, typeIndividually, MEDIA_SLOT_PARSED_PLACEHOLDER } from "../support/editor";

// This spec only runs under the dedicated "chromium-media-recording" Playwright project (see
// playwright.config.ts), which supplies Chrome's fake-device flags so getUserMedia() returns a
// canned video/audio feed instead of requiring real hardware/permissions.
//
// KNOWN INTERMITTENT FAILURE (unresolved as of this commit): the three tests that carry a
// capture through to "OK" and expect an actual insertion --
//   "Record and insert an image > Record (immediate), edit OK, inserted at the caret position"
//   "Record and insert an image > Re-record discards the first capture and only inserts the second"
//   "Record and insert a sound > Record, stop, edit OK, inserted at the caret position"
// -- can fail with a 60s timeout waiting for the media literal to appear. Root cause confirmed so
// far: EditImageDlg/EditSoundDlg's cropper (vue-advanced-cropper) sometimes never fires its
// "ready" event for the captured image/sound data, leaving its internal <img> stuck at the
// library's own placeholder src ("data:,", naturalWidth 0) instead of the real captured data --
// so getUpdatedMedia() rejects with "Loading" (an unhandled rejection, since App.vue's
// .then(callback) has no .catch()) and nothing gets inserted. Confirmed NOT the cause: corrupted
// capture data (the captured PNG/WAV decodes validly every time this was checked), image size,
// a second-open effect, prior-test interference, parallel workers, Vite dev-server staleness, the
// extra "Re-record" button/recordOptions param, or a fixed delay before opening the edit dialog
// (tried up to 150ms -- made no difference). The failure rate appears high but not 100% and its
// trigger is still unknown; suspected but unconfirmed area is a timing interaction between
// vue-advanced-cropper's src-prop handling and the Bootstrap modal show transition when one modal
// (the record dialog) hands off to another (the edit dialog) entirely synchronously within one
// JS tick, which this capture-to-edit handoff does but the pre-existing paste-to-edit flow does
// not (paste is triggered by a separate user click, not a same-tick dialog handoff).
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
        await typeIndividually(page, "1+");
        await page.keyboard.press("ControlOrMeta+Shift+I");
        await waitForFakeVideoPlaying(page);
        await page.locator(".RecordImageDlg-record-button").click();

        // Switches to the (unchanged) existing edit dialog:
        await expect(page.locator("span.EditImageDlg-sizeInfo").first()).toBeVisible();
        await clickVisiblePrimaryButton(page, "OK");

        await page.waitForFunction(() => document.querySelector("img[data-code^='load_image']") != null);
        await typeIndividually(page, "+2");

        // Derive the actual captured base64 tail from what got inserted, then use it to verify
        // the media literal landed in exactly the right spot (between the two typed numbers) --
        // we can't know the fake camera's exact PNG bytes in advance, but we can check the splice
        // position against whatever was actually captured:
        const dataCode = await page.locator("img[data-code^='load_image']").getAttribute("data-code");
        const endOfB64 = (dataCode as string).slice(-11, -2); // strip the trailing "\")" first
        await assertStateOfIfFrame(page, "{1}+{}" + MEDIA_SLOT_PARSED_PLACEHOLDER.image + "{}+{2$}", [{mediaType: "img", endOfB64}]);
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

        await page.locator(".EditImageDlg-rerecord-button").click();
        // Back on the record dialog:
        await expect(page.locator(".RecordImageDlg-video-wrapper")).toBeVisible();
        await waitForFakeVideoPlaying(page);
        await page.locator(".RecordImageDlg-record-button").click();
        await expect(page.locator("span.EditImageDlg-sizeInfo").first()).toBeVisible();
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
        await typeIndividually(page, "1+");
        await page.keyboard.press("ControlOrMeta+Shift+U");
        await expect(page.locator(".RecordSoundDlg-waveform")).toBeVisible();
        await page.locator(".RecordSoundDlg-record-button").click();
        // Let a moment of (fake) audio actually get recorded:
        await page.waitForTimeout(500);
        await page.locator(".RecordSoundDlg-stop-button").click();

        await expect(page.locator("span.EditSoundDlg-sizeInfo").first()).toBeVisible();
        await clickVisiblePrimaryButton(page, "OK");

        await page.waitForFunction(() => document.querySelector("img[data-code^='load_sound']") != null);
        await typeIndividually(page, "+2");

        const dataCode = await page.locator("img[data-code^='load_sound']").getAttribute("data-code");
        const endOfB64 = (dataCode as string).slice(-11, -2);
        await assertStateOfIfFrame(page, "{1}+{}" + MEDIA_SLOT_PARSED_PLACEHOLDER.sound + "{}+{2$}", [{mediaType: "snd", endOfB64}]);
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
