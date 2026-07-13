import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

export const BASE_URL = process.env.BASE_URL || "http://localhost:8081/editor/";
const specFilter = process.env.SPEC;
const grepFilter = process.env.GREP;
/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: "./tests/playwright/e2e",
    testMatch: specFilter ? [specFilter] : ["**/*.spec.ts"], // default fallback
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
     * --workers=20 on a quiet machine -- see docs/claude-improve-testing/WEBKIT_STOP_INVESTIGATION.md).
     * RUNNER_OS is set automatically by GitHub Actions (Linux/Windows/macOS), no workflow changes needed.
     * Locally (process.env.CI unset) always use 4, regardless of host OS. */
    workers: (process.env.CI && process.env.RUNNER_OS === "macOS") ? 2 : 4,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: [
        ["list"],
        ["html", {"open": "never", "outputFolder": "./tests/playwright/html-report"}],
        ["@estruyf/github-actions-reporter"],
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
            use: { ...devices["Desktop Chrome"], contextOptions: {
                // chromium-specific permissions
                permissions: ["clipboard-read"],
            },
            },
        },

        {
            name: "firefox",
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
            use: { ...devices["Desktop Safari"], deviceScaleFactor: 1 },
        },
    ],
});
