import { defineConfig, devices } from "@playwright/test";
import path from "path";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

export const BASE_URL = process.env.BASE_URL || "http://localhost:8081/editor/";
// Both SPEC and EXCLUDE_SPEC accept a single spec path or a comma-separated list of them.
const specFilter = process.env.SPEC;
const grepFilter = process.env.GREP;
const excludeSpecFilter = process.env.EXCLUDE_SPEC;

// media-recording.spec.ts needs Chromium's fake-device flags (real getUserMedia access isn't
// available/scriptable in CI), so it only runs under the dedicated "chromium-media-recording"
// project below, not under the plain chromium/firefox/webkit projects:
const mediaRecordingSpecPattern = "**/media-recording.spec.ts";
const excludeMediaRecordingSpec = [...(excludeSpecFilter ? excludeSpecFilter.split(",") : []), mediaRecordingSpecPattern];
/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: "./tests/playwright/e2e",
    testMatch: specFilter ? specFilter.split(",") : ["**/*.spec.ts"], // default fallback
    testIgnore: excludeSpecFilter ? excludeSpecFilter.split(",") : undefined,
    grep: grepFilter ? new RegExp(grepFilter) : undefined,
    // Folder for test artifacts such as screenshots, videos, traces, etc.
    outputDir: "./tests/playwright/test-results",
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry thrice on CI, as some of the random tests are slightly flaky */
    retries: process.env.CI ? 3 : 0,
    fullyParallel: true,
    /* macos-latest CI runners only have 3 vCPUs (vs. 4 on ubuntu-latest/windows-latest), so the
     * usual 4 workers oversubscribes them -- this starves the main thread badly enough under real
     * contention to cause genuine test failures/slowness (confirmed by local repro with
     * --workers=20 on a quiet machine -- see WEBKIT_STOP_INVESTIGATION.md at commit e5c91b29).
     * RUNNER_OS is set automatically by GitHub Actions (Linux/Windows/macOS), no workflow changes needed.
     * Locally (process.env.CI unset) always use 4, regardless of host OS. */
    workers: (process.env.CI && process.env.RUNNER_OS === "macOS") ? 3 : 4,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: [
        ["list"],
        ["html", {"open": "never", "outputFolder": "./tests/playwright/html-report"}],
        // useDetails wraps each spec file's results in a collapsible <details> block.
        // Blocks whose summary icon is fail/flaky (❌/⚠️) are then force-expanded by
        // the "Expand failed/flaky sections" CI step, since this reporter doesn't
        // support conditionally setting `open` on its own.
        ["@estruyf/github-actions-reporter", { useDetails: true }],
    ],
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: BASE_URL,

        headless: true,

        /* Store info only on test failure */
        trace: process.env.CI ? "on-first-retry" : "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: "chromium",
            testIgnore: excludeMediaRecordingSpec,
            use: { ...devices["Desktop Chrome"], contextOptions: {
                // chromium-specific permissions
                permissions: ["clipboard-read"],
            },
            },
        },

        {
            name: "firefox",
            testIgnore: excludeMediaRecordingSpec,
            use: { ...devices["Desktop Firefox"], launchOptions: {
                firefoxUserPrefs: {
                    "dom.events.asyncClipboard.readText": true,
                    "dom.events.testing.asyncClipboard": true,
                },
            },
            },
        },

        {
            name: "webkit",
            testIgnore: excludeMediaRecordingSpec,
            use: { ...devices["Desktop Safari"], deviceScaleFactor: 1 },
        },

        // Chromium-only project for tests that need webcam/microphone access. Uses Chrome's
        // fake-device flags to feed a canned video/audio file into getUserMedia, and
        // --use-fake-ui-for-media-stream to auto-accept the permission prompt (which otherwise
        // has no UI to click in a headless/CI context).
        {
            name: "chromium-media-recording",
            testMatch: [mediaRecordingSpecPattern],
            use: { ...devices["Desktop Chrome"], contextOptions: {
                permissions: ["camera", "microphone"],
            },
            launchOptions: { args: [
                "--use-fake-device-for-media-stream",
                "--use-fake-ui-for-media-stream",
                `--use-file-for-fake-video-capture=${path.resolve(process.cwd(), "tests/playwright/fixtures/fake-video.y4m")}`,
                `--use-file-for-fake-audio-capture=${path.resolve(process.cwd(), "tests/playwright/fixtures/fake-audio.wav")}`,
            ] },
            },
        },
    ],
});
