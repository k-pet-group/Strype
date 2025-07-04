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
/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: "./tests/playwright/e2e",
    testMatch: specFilter ? [specFilter] : ["**/*.spec.ts"], // default fallback    
    // Folder for test artifacts such as screenshots, videos, traces, etc.
    outputDir: "./tests/playwright/test-results",
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry twice on CI, as some of the random tests are slightly flaky */
    retries: process.env.CI ? 2 : 0,
    fullyParallel: true,
    /* If you need different in CI, replicate the conditional expression above: process.env.CI ? 2 : 4 */
    workers: 4,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: [["list"], ["html", {"open": "never", "outputFolder": "./tests/playwright/html-report"}]],
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: BASE_URL,

        headless: true,

        /* Store info only on test failure */
        trace: "on-first-retry",
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
