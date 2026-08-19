import { defineConfig } from "cypress";
import {rimraf} from "rimraf";
import fs from "fs";
const cypressSplit = require("cypress-split");

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function writeFlakyTestsSummary(flakyTests: { spec: string; title: string; attempts: number }[]): void {
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryFile) {
        return;
    }
    let body;
    if (flakyTests.length === 0) {
        body = "<h3>0 flaky tests ✅</h3>\n";
    }
    else {
        const rows = flakyTests
            .map((t) => `<tr><td>${escapeHtml(t.spec)}</td><td>${escapeHtml(t.title)}</td><td>${t.attempts}</td></tr>`)
            .join("\n");
        body = `<h3>${flakyTests.length} flaky test${flakyTests.length === 1 ? "" : "s"} (passed only after a retry) ⚠️</h3>\n`
            + `<table><tr><th>Spec</th><th>Test</th><th>Attempts</th></tr>\n${rows}\n</table>\n`;
    }
    fs.appendFileSync(summaryFile, body);
}

export default defineConfig({
    retries: 1,
    downloadsFolder: "tests/cypress/downloads",
    fixturesFolder:	"tests/cypress/fixtures",
    screenshotsFolder: "tests/cypress/screenshots",
    supportFolder: "tests/cypress/support",
    videosFolder: "tests/cypress/videos",
    video: true,
    // Cypress's default (50) keeps up to 50 previous tests' full DOM snapshots and command-log
    // state alive for its time-travel debugging UI, regardless of experimentalMemoryManagement
    // (a separate flag -- that one makes Chromium itself clean up more aggressively, but doesn't
    // change how many test snapshots Cypress's own runner retains). Headless CI runs (`cypress
    // run`) get essentially no benefit from that debugging feature -- nobody is scrubbing through
    // the time-travel UI on a CI runner -- so keeping a large backlog there is close to pure
    // memory waste. Some of the longest specs in this suite (e.g.
    // structured-expressions-brackets.cy.ts, ~69 tests) run long enough that the default window
    // covers most of the file, plausibly contributing to CI's intermittent "WebAssembly.Memory():
    // could not allocate memory" failures (tree-sitter's WASM parser needs a fresh ~32MB
    // allocation on every single test's page load -- see src/helpers/treeSitterPython.ts -- on
    // top of whatever Cypress itself is still retaining). Lowered aggressively since CI doesn't
    // use the debugging feature this trades away:
    numTestsKeptInMemory: 2,
    e2e: {
        experimentalMemoryManagement: true,
        // Targets the DOM-visibility-check inefficiency that was a major contributor to
        // cypress-io/cypress#27415 (the "WebAssembly.Memory(): could not allocate memory"
        // OOM issue this repo has been mitigating); added in Cypress 15.8.0, part of the
        // fixes that led to #27415 being closed in 15.18.0:
        experimentalFastVisibility: true,
        specPattern: "tests/cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
        supportFile: false,
        // Inspired by https://docs.cypress.io/api/plugins/configuration-api#Usage
        setupNodeEvents(on: Cypress.PluginEvents, config: Cypress.PluginConfigOptions) {
            require("cypress-terminal-report/src/installLogsPrinter")(on, {defaultTrimLength: 5000});

            on("task", {
                deleteFile(filePath) {

                    return new Promise((resolve, reject) => {
                        rimraf(filePath, {maxRetries: 10}).then(()=>resolve(null), (err) => {
                            if (err && !err.message.startsWith("ENOENT")) {
                                console.error(err);
                                return reject(err);
                            }
                            resolve(null);
                        });
                    });
                },
                renameFile(args: {srcPath: string, destPath: string}) {
                    fs.renameSync(args.srcPath, args.destPath);
                    return null;
                },
            });
            // Allow logging to console (although only the first message seems to get logged?)
            on("task", {
                log (message) {
                    console.log(message); 
                    return null;
                },
            });

            // Chrome's headless renderer defaults to a V8 old-space heap ceiling that's far
            // smaller than the actual machine's available memory (community reports put the
            // default around ~500MB even on a 4GB box), regardless of how much RAM the CI runner
            // actually has free -- see https://github.com/cypress-io/cypress/issues/27415 (an
            // upstream Cypress/Chromium issue affecting many unrelated projects, not something
            // specific to this repo) and the fix this mirrors:
            // https://www.bigbinary.com/blog/how-we-fixed-the-cypress-out-of-memory-error-in-chromium-browsers.
            // This raises that ceiling explicitly via Chrome's --js-flags, as a mitigation for
            // CI's intermittent "WebAssembly.Memory(): could not allocate memory" crashes in our
            // longest specs (e.g. structured-expressions-brackets.cy.ts) -- note this caps V8's
            // JS object heap specifically, not WASM linear memory directly (a different
            // allocator), so it's not a guaranteed fix for that exact error, but the two compete
            // for the same renderer process's overall memory budget, and Chrome's broader
            // OOM-avoidance heuristics (most likely what's actually rejecting the WASM
            // allocation) key off overall pressure, not just the JS heap alone. GitHub Actions'
            // ubuntu-latest runners have several GB of RAM actually free, so 4096 (4GB) is
            // comfortably below genuine physical exhaustion while well above whatever
            // conservative default Chrome would otherwise pick:
            on("before:browser:launch", (browser, launchOptions) => {
                if (browser.family === "chromium") {
                    launchOptions.args.push("--js-flags=--max-old-space-size=4096");
                }
                return launchOptions;
            });

            // downloads is a task which lists all the files in the Cypress downloads directory:
            on("task", {
                downloads:  () => {
                    return new Promise((resolve, reject) => {
                        fs.readdir("tests/cypress/downloads", (err, files) => {
                            if (err) {
                                return reject(err);
                            }

                            resolve(files);
                        });
                    });
                },
            });

            const specFromEnv = process.env.SPEC;
            if (specFromEnv) {
                config.specPattern = "tests/cypress/e2e/" + specFromEnv;
            }

            // Surface flaky tests (failed on an earlier attempt, passed on retry) in the
            // GitHub Actions job summary, alongside cypress-split's own per-chunk table --
            // that table only shows final pass/fail counts, so a flaky test currently looks
            // identical to a clean pass. cypress-split registers its own "after:spec" and
            // "after:run" handlers, and Cypress only keeps the LAST on(event, ...)
            // registration for a given lifecycle event name; calling `on` again after
            // cypressSplit(on, config) would silently replace its handlers and break its
            // summary/timings output. So instead we intercept its registrations here and
            // layer our own logic around them, leaving cypress-split with exactly one
            // registration per event as normal.
            const flakyTests: { spec: string; title: string; attempts: number }[] = [];
            const onWithFlakyTracking = ((event: string, handler: (...args: unknown[]) => unknown) => {
                if (event === "after:spec") {
                    return on(event as "after:spec", (spec, results) => {
                        for (const test of results?.tests ?? []) {
                            if (test.attempts.length > 1 && test.state === "passed") {
                                flakyTests.push({spec: spec.relative, title: test.title.join(" > "), attempts: test.attempts.length});
                            }
                        }
                        handler(spec, results);
                    });
                }
                if (event === "after:run") {
                    return on(event as "after:run", (results) => {
                        handler(results);
                        writeFlakyTestsSummary(flakyTests);
                    });
                }
                return on(event as never, handler as never);
            }) as Cypress.PluginEvents;

            cypressSplit(onWithFlakyTracking, config);

            config.baseUrl = config.env.mode == "microbit" ? "http://localhost:8081/microbit/" : "http://localhost:8081/editor/";
            return config;
        },
    },
});
