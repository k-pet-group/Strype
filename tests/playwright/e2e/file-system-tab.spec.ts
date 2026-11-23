import { test, expect, Page, Locator } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { rename } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import en from "../../../src/localisation/en/en_main.json";
import { setupStrypeTest, DEFAULT_STARTING_FRAME_COUNT } from "../support/general";
import { startRunning, runButtonShowsRun, runToFinish, checkConsoleContent } from "../support/execution";
import { enterCode } from "../support/editor";
import { save, load } from "../support/loading-saving";
import { strypeElIds } from "../support/proxy";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    // Needs a real Pyodide worker (downloading an asset file goes via it -- see
    // fileSystemTabIO.ts/python-execution.ts's readFsFile), and some tests below also Run code, so
    // this mirrors console-execution.spec.ts's budget rather than the shorter default. fakeClipboard
    // is needed for the "click to copy path" tests below (see setupStrypeTest's own comment on it,
    // and colour-literal-copy-paste.spec.ts for the same pattern):
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 180000, fakeClipboard: true});
});

async function openFilesTab(page: Page): Promise<void> {
    await page.click("#filesPEATab");
    // The pane builds the asset-root and "/local" trees on the main thread (FileSystemPane.vue's
    // mounted() -> refresh() -- see fileSystemTabIO.ts's listFsRootTree()), no worker round trip
    // involved, but still wait for the loading placeholder to be gone rather than for a fixed delay:
    await expect(page.locator(".file-system-pane-loading")).toHaveCount(0, {timeout: 30000});
}

// The asset roots (/data, /books, etc) sit under one always-expanded "Built-in files" heading, but
// each root is itself collapsed by default (see FileSystemTree's own startExpanded default).
// Expands the given root (e.g. "/data/") and returns its <li>, scoped so assertions only see that
// root's own subtree. Matched by an exact label (not a substring) since a root's children now also
// carry its label as an invisible alignment prefix (see FileSystemTree.vue's invisiblePrefix) --
// which would otherwise also match a plain hasText search for the root's own label text.
async function openBuiltInSection(page: Page, rootLabel: string): Promise<Locator> {
    const exactLabel = new RegExp(`^${rootLabel.replace(/[/]/g, "\\/")}$`);
    const rootLi = page.locator("li", { has: page.locator(".file-system-tree-label", { hasText: exactLabel }) });
    await rootLi.locator(".file-system-tree-chevron").first().click();
    return rootLi;
}

// See load-save-frame-content.spec.ts's identically-named helper for the same reasoning (a full
// page reload, needed here so /local's in-memory cache -- localFsCache.ts -- is genuinely reset,
// not just re-rendered, before checking that a pinned file gets restored into it from scratch):
async function newProject(page: Page): Promise<void> {
    await page.click("#" + await strypeElIds(page).getEditorMenuUID());
    await page.click("#" + await strypeElIds(page).getNewProjectLinkId(), {noWaitAfter: true});
    await expect(page.locator(".frame-div")).toHaveCount(DEFAULT_STARTING_FRAME_COUNT, {timeout: 20000});
}

function localUploadInput(page: Page) {
    // Only "/local" ever renders an upload button/input (see FileSystemTree.vue's allow-upload
    // prop) -- the asset roots are read-only, so this is unambiguous as long as no subfolder has
    // been created under "/local" (none of these tests do):
    return page.locator(".file-system-tree-upload-input");
}

test.describe("File system tab -- /data (read-only bundled assets)", () => {
    test("the Built-in files heading can't be folded, but every root under it starts collapsed", async ({ page }) => {
        await openFilesTab(page);
        // "Built-in files" itself is a plain heading -- every root is visible straight away, each
        // still collapsed on its own (no chevron click needed to see the root labels themselves,
        // but their file lists stay hidden until each root's own chevron is clicked):
        const builtInHeading = page.locator("h4", { hasText: en.fileSystemTab.builtIn });
        await expect(builtInHeading).toBeVisible();
        await expect(builtInHeading.locator(".file-system-tree-chevron")).toHaveCount(0);
        await expect(page.locator(".file-system-tree-label", { hasText: "/data/" })).toBeVisible();
        await expect(page.getByText("london-temperature-2025.txt")).toHaveCount(0);
    });

    test("lists the bundled data files", async ({ page }) => {
        await openFilesTab(page);
        const dataSection = await openBuiltInSection(page, "/data/");
        await expect(dataSection).toContainText("london-temperature-2025.txt");
        await expect(dataSection).toContainText("word_counts.txt");
    });

    test("does not offer an upload button", async ({ page }) => {
        await openFilesTab(page);
        const dataSection = await openBuiltInSection(page, "/data/");
        await expect(dataSection.locator(".file-system-tree-upload-btn")).toHaveCount(0);
    });

    test("does not offer a delete button", async ({ page }) => {
        await openFilesTab(page);
        const dataSection = await openBuiltInSection(page, "/data/");
        await expect(dataSection.locator(".file-system-tree-delete-btn")).toHaveCount(0);
    });

    test("downloading a file produces its real content", async ({ page }) => {
        await openFilesTab(page);
        await openBuiltInSection(page, "/data/");
        const row = page.locator(".file-system-tree-file", { hasText: "london-temperature-2025.txt" });
        // The download button only shows on hover (see FileSystemTree.vue's CSS) -- hover the row
        // first so Playwright's actionability check doesn't refuse to click a hidden element:
        await row.hover();
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            row.locator(".file-system-tree-download-btn").click(),
        ]);
        const downloadedPath = await download.path();
        expect(downloadedPath).not.toBeNull();
        const actual = readFileSync(downloadedPath as string, "utf8");
        const expected = readFileSync(
            path.join(__dirname, "..", "..", "..", "src", "assetsFilesystem", "data", "london-temperature-2025.txt"),
            "utf8"
        );
        expect(actual).toEqual(expected);
    });

    test("clicking a file name copies its path to the clipboard", async ({ page }) => {
        await openFilesTab(page);
        const dataSection = await openBuiltInSection(page, "/data/");
        await dataSection.locator(".file-system-tree-label", { hasText: "word_counts.txt" }).click();
        await expect.poll(() => page.evaluate("navigator.clipboard.readText()")).toEqual("/data/word_counts.txt");
    });

    test("clicking a directory name copies its path to the clipboard", async ({ page }) => {
        await openFilesTab(page);
        const dataSection = await openBuiltInSection(page, "/data/");
        // Exact match: a child's own label also carries "/data/" as an invisible alignment prefix
        // (see FileSystemTree.vue), so a plain substring search would match more than just the
        // root's own label:
        await dataSection.locator(".file-system-tree-label", { hasText: /^\/data\/$/ }).click();
        await expect.poll(() => page.evaluate("navigator.clipboard.readText()")).toEqual("/data");
    });
});

test.describe("File system tab -- /images (read-only bundled assets)", () => {
    test("hides files with \"-test\" in the name", async ({ page }) => {
        // cat-test.jpg, cat-test-2.png and mouse-test.jpg are real photos bundled purely as
        // Playwright/Cypress fixtures (see fileIO.spec.ts) -- see assets_file_index.ts's
        // buildAssetTree() for the "-test" naming convention that hides them here:
        await openFilesTab(page);
        const imagesSection = await openBuiltInSection(page, "/images/");
        // The images are grouped into subfolders (e.g. animals/fish.png), so expand one to see its files:
        await imagesSection.locator("li", { has: page.locator(".file-system-tree-label", { hasText: /^\/images\/animals\/$/ }) })
            .last().locator(".file-system-tree-chevron").first().click();
        await expect(imagesSection).toContainText("fish.png");
        await expect(imagesSection).not.toContainText("-test");
    });
});

test.describe("File system tab -- scrolling", () => {
    test("the pane scrolls when its expanded content is taller than the visible area", async ({ page }) => {
        // Regression test: .pea-tab-content-container (PythonExecutionArea.vue) used to have no
        // "overflow: hidden" of its own, so it (and everything above FileSystemPane.vue's own
        // .file-system-pane in the DOM) just grew to fit however much content the tree expanded
        // to, rather than clipping it -- meaning .file-system-pane's own overflow:auto never
        // actually had anything to scroll (it was already exactly as tall as its content), and the
        // whole thing was only clipped, with no scrollbar at all, by an outer Splitpanes pane.
        await openFilesTab(page);
        // Expand every built-in root (each has plenty of files/subfolders) so the tree is
        // comfortably taller than the pane's own visible height:
        for (const root of ["/books/", "/data/", "/images/", "/sounds/"]) {
            await openBuiltInSection(page, root);
        }

        const pane = page.locator(".file-system-pane");
        const overflow = await pane.evaluate((el) => ({ clientHeight: el.clientHeight, scrollHeight: el.scrollHeight }));
        expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight);

        await pane.evaluate((el) => {
            el.scrollTop = 500;
        });
        await expect.poll(() => pane.evaluate((el) => el.scrollTop)).toBe(500);
    });

    test("does not affect Console/Graphics -- their container still has no overflow clipping", async ({ page }) => {
        // The fix above (.pea-tab-content-container.pea-files-showing) is deliberately scoped to
        // only apply while the Files tab itself is showing, via PythonExecutionArea.vue's
        // isFilesAreaShowing -- confirm Console and Graphics keep their pre-existing
        // "overflow: visible" container, unaffected by the Files-tab-only fix:
        await page.click("#consolePEATab");
        const container = page.locator(".pea-tab-content-container");
        await expect(container).not.toHaveClass(/pea-files-showing/);
        await expect(container).toHaveCSS("overflow", "visible");

        await page.click("#graphicsPEATab");
        await expect(container).not.toHaveClass(/pea-files-showing/);
        await expect(container).toHaveCSS("overflow", "visible");
    });
});

test.describe("File system tab -- /local (writeable scratch area)", () => {
    test("starts empty", async ({ page }) => {
        await openFilesTab(page);
        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await expect(localSection).toContainText(en.fileSystemTab.emptyFolder);
    });

    test("uploading a file makes it appear, and downloading it round-trips the content", async ({ page }) => {
        await openFilesTab(page);
        const content = "hello from the file system tab test\n";
        const filePath = testFixturePath(test.info().outputDir, "upload-test.txt", content);

        await localUploadInput(page).setInputFiles(filePath);

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await expect(localSection).toContainText("upload-test.txt");

        const row = page.locator(".file-system-tree-file", { hasText: "upload-test.txt" });
        await row.hover();
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            row.locator(".file-system-tree-download-btn").click(),
        ]);
        const downloadedPath = await download.path();
        expect(downloadedPath).not.toBeNull();
        expect(readFileSync(downloadedPath as string, "utf8")).toEqual(content);
    });

    test("uploading a file with the same name as an existing one asks to overwrite, and Cancel leaves the original untouched", async ({ page }) => {
        await openFilesTab(page);
        const originalContent = "original content\n";
        const replacementContent = "replacement content, should not be used\n";
        const originalPath = testFixturePath(test.info().outputDir, "clash.txt", originalContent);
        // Same file name, but from a different source directory, so the browser's file picker
        // doesn't just re-select the exact same path -- it's the name clash on "/local" that
        // matters here, not the source path:
        const replacementPath = testFixturePath(path.join(test.info().outputDir, "clash-source"), "clash.txt", replacementContent);
        await localUploadInput(page).setInputFiles(originalPath);

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await expect(localSection).toContainText("clash.txt");

        await localUploadInput(page).setInputFiles(replacementPath);
        const overwriteDlgBody = page.locator("#fileSystemOverwriteConfirmDlg-body");
        await expect(overwriteDlgBody).toContainText("clash.txt");
        await page.getByRole("button", { name: en.buttonLabel.cancel, exact: true }).click();

        // Only one row for "clash.txt" -- the upload was abandoned, not merged/duplicated -- and its
        // content is still the original:
        await expect(localSection.locator(".file-system-tree-file", { hasText: "clash.txt" })).toHaveCount(1);
        const row = localSection.locator(".file-system-tree-file", { hasText: "clash.txt" });
        await row.hover();
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            row.locator(".file-system-tree-download-btn").click(),
        ]);
        const downloadedPath = await download.path();
        expect(downloadedPath).not.toBeNull();
        expect(readFileSync(downloadedPath as string, "utf8")).toEqual(originalContent);
    });

    test("uploading a file with the same name as an existing one and confirming Overwrite replaces its content", async ({ page }) => {
        await openFilesTab(page);
        const originalContent = "original content\n";
        const replacementContent = "replacement content, should be used\n";
        const originalPath = testFixturePath(test.info().outputDir, "clash-overwrite.txt", originalContent);
        const replacementPath = testFixturePath(path.join(test.info().outputDir, "clash-overwrite-source"), "clash-overwrite.txt", replacementContent);
        await localUploadInput(page).setInputFiles(originalPath);

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await expect(localSection).toContainText("clash-overwrite.txt");

        await localUploadInput(page).setInputFiles(replacementPath);
        const overwriteDlgBody = page.locator("#fileSystemOverwriteConfirmDlg-body");
        await expect(overwriteDlgBody).toContainText("clash-overwrite.txt");
        await page.getByRole("button", { name: en.fileSystemTab.overwrite, exact: true }).click();

        await expect(localSection.locator(".file-system-tree-file", { hasText: "clash-overwrite.txt" })).toHaveCount(1);
        const row = localSection.locator(".file-system-tree-file", { hasText: "clash-overwrite.txt" });
        await row.hover();
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            row.locator(".file-system-tree-download-btn").click(),
        ]);
        const downloadedPath = await download.path();
        expect(downloadedPath).not.toBeNull();
        expect(readFileSync(downloadedPath as string, "utf8")).toEqual(replacementContent);
    });

    test("an uploaded file survives Run restarting the Pyodide worker", async ({ page }) => {
        // Regression test: "/local" used to be wiped on every run because
        // terminateAndRestartPyodide() fully discards and recreates the worker -- see
        // localFsCache.ts and main_thread_python_handler.ts's snapshot/restore around that call.
        await openFilesTab(page);
        const content = "should survive a run\n";
        const filePath = testFixturePath(test.info().outputDir, "survives-run.txt", content);
        await localUploadInput(page).setInputFiles(filePath);
        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await expect(localSection).toContainText("survives-run.txt");

        await runToFinish(page);

        // Re-open the tab (it's unmounted/remounted per tab switch -- see PythonExecutionArea.vue's
        // v-if on FileSystemPane -- so this also re-fetches from the cache):
        await page.click("#consolePEATab");
        await openFilesTab(page);
        await expect(localSection).toContainText("survives-run.txt");
    });

    test("a freshly uploaded file is visible to the very next Run", async ({ page }) => {
        // Regression test: localFsCache (the main-thread mirror behind "/local") was only ever
        // pushed into a live Pyodide worker's real "/local" on a worker swap, which happens after
        // a run/stop finishes rather than before the next run starts -- see restoreLocalFs()'s call
        // site in PythonExecutionArea.vue's execPythonCode(). A file uploaded since the last swap
        // (i.e. before any run has happened at all in this session) was therefore invisible to the
        // very first Run to look for it, only appearing from the run after that.
        await openFilesTab(page);
        const content = "visible on the first run\n";
        const filePath = testFixturePath(test.info().outputDir, "first-run.txt", content);
        await localUploadInput(page).setInputFiles(filePath);
        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await expect(localSection).toContainText("first-run.txt");

        await enterCode(page, ["print(open(\"first-run.txt\").read())"]);
        await runToFinish(page);

        await checkConsoleContent(page, content + "\n");
    });

    test("a file written by a run appears without leaving the Files tab", async ({ page }) => {
        await openFilesTab(page);
        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await expect(localSection).not.toContainText("written-by-run.txt");

        await enterCode(page, ["open(\"written-by-run.txt\", \"w\").write(\"hi\")"]);
        await runToFinish(page);

        await expect(localSection).toContainText("written-by-run.txt");
    });

    test("a file deleted by a run disappears without leaving the Files tab", async ({ page }) => {
        await openFilesTab(page);
        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await localUploadInput(page).setInputFiles(testFixturePath(test.info().outputDir, "doomed.txt", "bye\n"));
        await expect(localSection).toContainText("doomed.txt");

        await enterCode(page, ["import os", "os.remove(\"doomed.txt\")"]);
        await runToFinish(page);

        await expect(localSection).not.toContainText("doomed.txt");
    });

    // A program stuck in a loop that never waits (no sleep/print/input) can't answer any request from
    // the main thread, so what it wrote to /local can't be fetched from it when Stop is clicked: the
    // worker has to have sent each file change as it happened.
    test.describe("files changed by a busy loop that is then stopped", () => {
        async function stopBusyProgram(page: Page, code: string[]): Promise<void> {
            // (enterCode's sections are imports, definitions, main code -- it's all in the main code here)
            await enterCode(page, ["", "", code.join("\n") + "\nwhile True:\n    pass\n"]);
            const runButton = await startRunning(page);
            // Give the program time to reach its loop:
            await page.waitForTimeout(3000);
            await runButton.click();
            await runButtonShowsRun(runButton);
        }

        test("a flushed file keeps its content", async ({ page }) => {
            await openFilesTab(page);
            await stopBusyProgram(page, ["f = open(\"flushed.txt\", \"w\")", "f.write(\"flushed content\")", "f.flush()"]);

            const row = page.locator(".file-system-tree-file", { hasText: "flushed.txt" });
            await expect(row).toBeVisible();
            await row.hover();
            await row.locator(".file-system-tree-view-btn").click();
            await expect(page.locator("#fileSystemFileViewerDlg-body")).toContainText("flushed content");
        });

        test("a file that was just created appears", async ({ page }) => {
            await openFilesTab(page);
            await stopBusyProgram(page, ["open(\"created.txt\", \"w\")"]);

            await expect(page.locator(".file-system-tree-file", { hasText: "created.txt" })).toBeVisible();
        });

        test("a deleted file disappears", async ({ page }) => {
            await openFilesTab(page);
            const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
            await localUploadInput(page).setInputFiles(testFixturePath(test.info().outputDir, "deleted-by-busy.txt", "bye\n"));
            await expect(localSection).toContainText("deleted-by-busy.txt");

            await stopBusyProgram(page, ["import os", "os.remove(\"deleted-by-busy.txt\")"]);

            await expect(localSection).not.toContainText("deleted-by-busy.txt");
        });
    });

    test("uploading does nothing while Python is executing, other than flashing the run/stop button", async ({ page }) => {
        await enterCode(page, ["import time", "", "while True:\n    time.sleep(0.1)\n"]);
        const runButton = await startRunning(page);
        await openFilesTab(page);

        // The upload button stays enabled (not greyed out) even while running -- clicking it does
        // nothing but flash the run/stop button red instead, the same mechanism Menu.vue reuses for
        // shortcuts blocked while running (see PythonExecutionArea.vue's #runButton.highlighted CSS):
        const uploadButton = page.locator(".file-system-tree-upload-btn");
        await expect(uploadButton).toBeEnabled();
        await expect(runButton).not.toHaveClass(/highlighted/);
        await uploadButton.click();
        await expect(runButton).toHaveClass(/highlighted/);

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await expect(localSection).toContainText(en.fileSystemTab.emptyFolder);

        // Clean up: stop the program so it doesn't bleed into the next test:
        await runButton.click();
        await runButtonShowsRun(runButton);
    });

    test("clicking a file name copies its path to the clipboard, without the /local/ prefix", async ({ page }) => {
        await openFilesTab(page);
        const content = "for clipboard test\n";
        const filePath = testFixturePath(test.info().outputDir, "clip-test.txt", content);
        await localUploadInput(page).setInputFiles(filePath);

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await localSection.locator(".file-system-tree-label", { hasText: "clip-test.txt" }).click();
        // "/local" is the working directory the code runs from, so the copied path is relative to
        // it (just "clip-test.txt"), not the absolute "/local/clip-test.txt" -- see FileSystemTree
        // .vue's pathToCopy.
        await expect.poll(() => page.evaluate("navigator.clipboard.readText()")).toEqual("clip-test.txt");
    });

    test("clicking a directory name copies its path to the clipboard, without the /local/ prefix", async ({ page }) => {
        await openFilesTab(page);
        const zipPath = await testZipFixturePath(test.info().outputDir, "clip-dir-test.zip", {
            "sub/a.txt": "content a\n",
        });
        await localUploadInput(page).setInputFiles(zipPath);
        await page.getByRole("button", { name: en.fileSystemTab.unzipContents }).click();

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await localSection.locator(".file-system-tree-dir", { hasText: "sub" }).locator(".file-system-tree-label").click();
        await expect.poll(() => page.evaluate("navigator.clipboard.readText()")).toEqual("sub");
    });

    test("clicking the delete button removes the file", async ({ page }) => {
        await openFilesTab(page);
        const filePath = testFixturePath(test.info().outputDir, "delete-me.txt", "content\n");
        await localUploadInput(page).setInputFiles(filePath);

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await expect(localSection).toContainText("delete-me.txt");

        const row = localSection.locator(".file-system-tree-file", { hasText: "delete-me.txt" });
        // The delete button only shows on hover (see FileSystemTree.vue's CSS):
        await row.hover();
        await row.locator(".file-system-tree-delete-btn").click();

        await expect(localSection).not.toContainText("delete-me.txt");
        await expect(localSection).toContainText(en.fileSystemTab.emptyFolder);
    });

    test("deleting one of several files removes only that one", async ({ page }) => {
        await openFilesTab(page);
        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });

        for (const name of ["keep-a.txt", "delete-me.txt", "keep-b.txt"]) {
            const filePath = testFixturePath(test.info().outputDir, name, `content of ${name}\n`);
            await localUploadInput(page).setInputFiles(filePath);
            await expect(localSection).toContainText(name);
        }

        const row = localSection.locator(".file-system-tree-file", { hasText: "delete-me.txt" });
        await row.hover();
        await row.locator(".file-system-tree-delete-btn").click();

        await expect(localSection).not.toContainText("delete-me.txt");
        await expect(localSection).toContainText("keep-a.txt");
        await expect(localSection).toContainText("keep-b.txt");
        // Two files remain, so this must NOT show as empty:
        await expect(localSection).not.toContainText(en.fileSystemTab.emptyFolder);
    });

    test("deleting a directory removes only its own contents, leaving a sibling file", async ({ page }) => {
        await openFilesTab(page);
        const zipPath = await testZipFixturePath(test.info().outputDir, "delete-dir-test.zip", {
            "keep.txt": "keep me\n",
            "sub/a.txt": "content a\n",
            "sub/nested/b.txt": "content b\n",
        });
        await localUploadInput(page).setInputFiles(zipPath);
        await page.getByRole("button", { name: en.fileSystemTab.unzipContents }).click();

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await expect(localSection).toContainText("keep.txt");
        await expect(localSection).toContainText("sub");

        // Deleting a directory works straight off the already-loaded tree data (see the equivalent
        // download-as-zip test above), with no need to have expanded it in the UI first:
        const subDir = localSection.locator(".file-system-tree-dir", { hasText: "sub" });
        await subDir.hover();
        await subDir.locator(".file-system-tree-delete-btn").click();

        await expect(localSection).not.toContainText("sub");
        await expect(localSection).toContainText("keep.txt");
    });

    test("pinning a file saves it into the project file, and it's restored on load", async ({ page }) => {
        await openFilesTab(page);
        const content = "pin me and save me\n";
        const filePath = testFixturePath(test.info().outputDir, "pin-me.txt", content);
        await localUploadInput(page).setInputFiles(filePath);

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        const row = localSection.locator(".file-system-tree-file", { hasText: "pin-me.txt" });
        await row.hover();
        await row.locator(".file-system-tree-pin-btn").click();
        await expect(row.locator(".file-system-tree-pin-btn")).toHaveClass(/file-system-tree-pin-btn-pinned/);

        const savedPath = await save(page, true, "pin-round-trip");
        await newProject(page);
        // The downloaded file has no ".spy" extension (Playwright's download gives it a bare temp
        // name) -- load() derives the expected post-load project name from the file's own name, so
        // it needs a real ".spy" name first (see load-save-frame-content.spec.ts's identical step):
        await rename(savedPath, savedPath + ".spy");
        await load(page, savedPath + ".spy");

        await openFilesTab(page);
        await expect(localSection).toContainText("pin-me.txt");
        const reloadedRow = localSection.locator(".file-system-tree-file", { hasText: "pin-me.txt" });
        await expect(reloadedRow.locator(".file-system-tree-pin-btn")).toHaveClass(/file-system-tree-pin-btn-pinned/);

        await reloadedRow.hover();
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            reloadedRow.locator(".file-system-tree-download-btn").click(),
        ]);
        const downloadedPath = await download.path();
        expect(downloadedPath).not.toBeNull();
        expect(readFileSync(downloadedPath as string, "utf8")).toEqual(content);
    });

    test("a pinned file survives a plain page refresh", async ({ page }) => {
        await openFilesTab(page);
        const content = "pinned across a refresh\n";
        const filePath = testFixturePath(test.info().outputDir, "pin-refresh.txt", content);
        await localUploadInput(page).setInputFiles(filePath);

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        const row = localSection.locator(".file-system-tree-file", { hasText: "pin-refresh.txt" });
        await row.hover();
        await row.locator(".file-system-tree-pin-btn").click();
        await expect(row.locator(".file-system-tree-pin-btn")).toHaveClass(/file-system-tree-pin-btn-pinned/);

        // A refresh (unlike New project, then Load) is restored from the session's autosave:
        await page.reload();
        await page.waitForSelector(".frame-container");
        await openFilesTab(page);

        await expect(localSection).toContainText("pin-refresh.txt");
        const reloadedRow = localSection.locator(".file-system-tree-file", { hasText: "pin-refresh.txt" });
        await expect(reloadedRow.locator(".file-system-tree-pin-btn")).toHaveClass(/file-system-tree-pin-btn-pinned/);

        await reloadedRow.hover();
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            reloadedRow.locator(".file-system-tree-download-btn").click(),
        ]);
        const downloadedPath = await download.path();
        expect(downloadedPath).not.toBeNull();
        expect(readFileSync(downloadedPath as string, "utf8")).toEqual(content);
    });

    test("deleting a pinned file un-pins it too, so it isn't restored on load", async ({ page }) => {
        await openFilesTab(page);
        const keptContent = "kept and pinned\n";
        const keptPath = testFixturePath(test.info().outputDir, "keep-pinned.txt", keptContent);
        const deletedPath = testFixturePath(test.info().outputDir, "delete-pinned.txt", "pinned then deleted\n");
        await localUploadInput(page).setInputFiles(keptPath);
        await localUploadInput(page).setInputFiles(deletedPath);

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        const keptRow = localSection.locator(".file-system-tree-file", { hasText: "keep-pinned.txt" });
        const deletedRow = localSection.locator(".file-system-tree-file", { hasText: "delete-pinned.txt" });
        await keptRow.hover();
        await keptRow.locator(".file-system-tree-pin-btn").click();
        await deletedRow.hover();
        await deletedRow.locator(".file-system-tree-pin-btn").click();
        await expect(keptRow.locator(".file-system-tree-pin-btn")).toHaveClass(/file-system-tree-pin-btn-pinned/);
        await expect(deletedRow.locator(".file-system-tree-pin-btn")).toHaveClass(/file-system-tree-pin-btn-pinned/);

        // Deleting a pinned file must clear its pinned status too (see localFsCache.ts's
        // deleteFile()), otherwise it would keep being saved into the project even though it's
        // gone from "/local":
        await deletedRow.hover();
        await deletedRow.locator(".file-system-tree-delete-btn").click();
        await expect(localSection).not.toContainText("delete-pinned.txt");

        const savedPath = await save(page, true, "pin-delete-round-trip");
        await newProject(page);
        await rename(savedPath, savedPath + ".spy");
        await load(page, savedPath + ".spy");

        await openFilesTab(page);
        await expect(localSection).toContainText("keep-pinned.txt");
        await expect(localSection).not.toContainText("delete-pinned.txt");
    });

    test("pinning a file in a subfolder restores it (and the subfolder) on load, with no mkdir step needed", async ({ page }) => {
        // localFsCache.ts has no real directory objects (see its own comment) -- a pinned path's
        // subfolder is purely reconstructed from the flat path string by listTree(), and
        // loadPinnedLocalFiles() just writes straight to that flat path, so this must work with no
        // separate "create the folder first" step, for any nesting depth:
        await openFilesTab(page);
        const content = "hello nested pinned file\n";
        const zipPath = await testZipFixturePath(test.info().outputDir, "nested-pin-test.zip", {
            "outputs/nested.txt": content,
        });
        await localUploadInput(page).setInputFiles(zipPath);
        await page.getByRole("button", { name: en.fileSystemTab.unzipContents }).click();

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await expect(localSection).toContainText("outputs");
        await localSection.locator(".file-system-tree-dir", { hasText: "outputs" }).locator(".file-system-tree-chevron").click();
        const row = localSection.locator(".file-system-tree-file", { hasText: "nested.txt" });
        await row.hover();
        await row.locator(".file-system-tree-pin-btn").click();
        await expect(row.locator(".file-system-tree-pin-btn")).toHaveClass(/file-system-tree-pin-btn-pinned/);

        const savedPath = await save(page, true, "nested-pin-round-trip");
        await newProject(page);
        await rename(savedPath, savedPath + ".spy");
        await load(page, savedPath + ".spy");

        await openFilesTab(page);
        await expect(localSection).toContainText("outputs");
        await localSection.locator(".file-system-tree-dir", { hasText: "outputs" }).locator(".file-system-tree-chevron").click();
        const reloadedRow = localSection.locator(".file-system-tree-file", { hasText: "nested.txt" });
        await expect(reloadedRow.locator(".file-system-tree-pin-btn")).toHaveClass(/file-system-tree-pin-btn-pinned/);

        await reloadedRow.hover();
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            reloadedRow.locator(".file-system-tree-download-btn").click(),
        ]);
        const downloadedPath = await download.path();
        expect(downloadedPath).not.toBeNull();
        expect(readFileSync(downloadedPath as string, "utf8")).toEqual(content);
    });

    test("pinning several files at once -- at the root, sharing a subfolder, and in different subfolders -- all round-trip together", async ({ page }) => {
        await openFilesTab(page);
        const rootContent = "hello from the root\n";
        const sharedContentOne = "first file in the shared subfolder\n";
        const sharedContentTwo = "second file in the shared subfolder\n";
        const otherContent = "hello from a different subfolder\n";
        const zipPath = await testZipFixturePath(test.info().outputDir, "multi-pin-test.zip", {
            "root.txt": rootContent,
            "outputs/one.txt": sharedContentOne,
            "outputs/two.txt": sharedContentTwo,
            "logs/three.txt": otherContent,
        });
        await localUploadInput(page).setInputFiles(zipPath);
        await page.getByRole("button", { name: en.fileSystemTab.unzipContents }).click();

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await expect(localSection).toContainText("outputs");
        await expect(localSection).toContainText("logs");

        async function pinFile(name: string): Promise<void> {
            const row = localSection.locator(".file-system-tree-file", { hasText: name });
            await row.hover();
            await row.locator(".file-system-tree-pin-btn").click();
            await expect(row.locator(".file-system-tree-pin-btn")).toHaveClass(/file-system-tree-pin-btn-pinned/);
        }

        await pinFile("root.txt");
        await localSection.locator(".file-system-tree-dir", { hasText: "outputs" }).locator(".file-system-tree-chevron").click();
        await pinFile("one.txt");
        await pinFile("two.txt");
        await localSection.locator(".file-system-tree-dir", { hasText: "logs" }).locator(".file-system-tree-chevron").click();
        await pinFile("three.txt");

        const savedPath = await save(page, true, "multi-pin-round-trip");
        await newProject(page);
        await rename(savedPath, savedPath + ".spy");
        await load(page, savedPath + ".spy");

        await openFilesTab(page);
        await expect(localSection).toContainText("outputs");
        await expect(localSection).toContainText("logs");
        await localSection.locator(".file-system-tree-dir", { hasText: "outputs" }).locator(".file-system-tree-chevron").click();
        await localSection.locator(".file-system-tree-dir", { hasText: "logs" }).locator(".file-system-tree-chevron").click();

        async function checkReloaded(name: string, expectedContent: string): Promise<void> {
            const row = localSection.locator(".file-system-tree-file", { hasText: name });
            await expect(row.locator(".file-system-tree-pin-btn")).toHaveClass(/file-system-tree-pin-btn-pinned/);
            await row.hover();
            const [download] = await Promise.all([
                page.waitForEvent("download"),
                row.locator(".file-system-tree-download-btn").click(),
            ]);
            const downloadedPath = await download.path();
            expect(downloadedPath).not.toBeNull();
            expect(readFileSync(downloadedPath as string, "utf8")).toEqual(expectedContent);
        }

        await checkReloaded("root.txt", rootContent);
        await checkReloaded("one.txt", sharedContentOne);
        await checkReloaded("two.txt", sharedContentTwo);
        await checkReloaded("three.txt", otherContent);
    });

    test("a file at or over 1MB can't be pinned, but pinning still works just under the limit", async ({ page }) => {
        await openFilesTab(page);
        // One byte under the 1MB limit (see MAX_PINNABLE_FILE_SIZE, fileSystemTabIO.ts):
        const smallEnoughPath = testFixturePath(test.info().outputDir, "just-fits.txt", "a".repeat(1024 * 1024 - 1));
        // One byte at (over) the limit:
        const tooBigPath = testFixturePath(test.info().outputDir, "too-big.txt", "a".repeat(1024 * 1024));

        await localUploadInput(page).setInputFiles(smallEnoughPath);
        await localUploadInput(page).setInputFiles(tooBigPath);

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        const smallRow = localSection.locator(".file-system-tree-file", { hasText: "just-fits.txt" });
        const bigRow = localSection.locator(".file-system-tree-file", { hasText: "too-big.txt" });

        await smallRow.hover();
        await expect(smallRow.locator(".file-system-tree-pin-btn")).toBeEnabled();
        await bigRow.hover();
        await expect(bigRow.locator(".file-system-tree-pin-btn")).toBeDisabled();
    });
});

test.describe("File system tab -- viewing a file", () => {
    // FileViewerDlg.vue's own body: BootstrapVueNext gives every BModal's body the id "<id>-body"
    // (see ArchiveImportDialog's identical use of this pattern in the archive tests below).
    function viewerBody(page: Page): Locator {
        return page.locator("#fileSystemFileViewerDlg-body");
    }

    async function clickView(row: Locator): Promise<void> {
        await row.hover();
        await row.locator(".file-system-tree-view-btn").click();
    }

    test("shows a text file's content", async ({ page }) => {
        await openFilesTab(page);
        const content = "Hello, this is previewable text.\nSecond line.\n";
        const filePath = testFixturePath(test.info().outputDir, "view-me.txt", content);
        await localUploadInput(page).setInputFiles(filePath);

        const row = page.locator(".file-system-tree-file", { hasText: "view-me.txt" });
        await clickView(row);

        await expect(viewerBody(page)).toContainText(content.trim());
    });

    test("renders an image file as an <img>", async ({ page }) => {
        await openFilesTab(page);
        const filePath = testFixturePath(test.info().outputDir, "view-me.png", MINIMAL_PNG);
        await localUploadInput(page).setInputFiles(filePath);

        const row = page.locator(".file-system-tree-file", { hasText: "view-me.png" });
        await clickView(row);

        // A real <img> whose src is an object URL built from the fetched bytes (see
        // FileSystemPane.vue's onView()), not just the dialog showing some generic message:
        const img = viewerBody(page).locator("img");
        await expect(img).toBeVisible();
        await expect(img).toHaveAttribute("src", /^blob:/);
    });

    test("caps an oversized image to fit the dialog, without upscaling a small one", async ({ page }) => {
        await openFilesTab(page);
        // A real bundled asset that's genuinely larger than the cap (800x617 -- see
        // FileViewerDlg.vue's .file-viewer-dlg-image max-height):
        const bigContent = readFileSync(path.join(__dirname, "..", "..", "..", "src", "assetsFilesystem", "images", "backgrounds", "space.jpg"));
        const bigPath = testFixturePath(test.info().outputDir, "view-me-big.jpg", bigContent);
        await localUploadInput(page).setInputFiles(bigPath);

        const smallPath = testFixturePath(test.info().outputDir, "view-me-small.png", MINIMAL_PNG);
        await localUploadInput(page).setInputFiles(smallPath);

        const bigRow = page.locator(".file-system-tree-file", { hasText: "view-me-big.jpg" });
        await clickView(bigRow);
        const bigImg = viewerBody(page).locator("img");
        await expect(bigImg).toBeVisible();
        const bigBox = await bigImg.boundingBox();
        expect(bigBox).not.toBeNull();
        const bigNatural = await bigImg.evaluate((el: HTMLImageElement) => ({ w: el.naturalWidth, h: el.naturalHeight }));
        expect(bigNatural.h).toBeGreaterThan(400);
        expect(bigBox?.height).toBeLessThanOrEqual(400);
        // Aspect ratio preserved, not squashed to a fixed box:
        const bigBoxChecked = bigBox as { width: number, height: number };
        expect(Math.abs((bigBoxChecked.width / bigBoxChecked.height) - (bigNatural.w / bigNatural.h))).toBeLessThan(0.05);
        await page.getByRole("button", { name: en.buttonLabel.close }).click();

        const smallRow = page.locator(".file-system-tree-file", { hasText: "view-me-small.png" });
        await clickView(smallRow);
        const smallImg = viewerBody(page).locator("img");
        await expect(smallImg).toBeVisible();
        const smallBox = await smallImg.boundingBox();
        const smallNatural = await smallImg.evaluate((el: HTMLImageElement) => ({ w: el.naturalWidth, h: el.naturalHeight }));
        // Never upscaled -- a 1x1 image stays 1x1, it doesn't get stretched up to fill the dialog:
        expect(smallBox?.width).toBeLessThanOrEqual(smallNatural.w + 1);
        expect(smallBox?.height).toBeLessThanOrEqual(smallNatural.h + 1);
    });

    test("renders a sound file as a waveform with a working Play/Stop toggle", async ({ page }) => {
        // Reuses the same waveform preview as the code editor's own sound literal preview/edit
        // dialogs (drawSoundOnCanvas, media.ts -- see MediaPreviewPopup.vue/EditSoundDlg.vue),
        // rather than a plain native <audio> control:
        await openFilesTab(page);
        const filePath = testFixturePath(test.info().outputDir, "view-me.wav", makeMinimalWav(1.0));
        await localUploadInput(page).setInputFiles(filePath);

        const row = page.locator(".file-system-tree-file", { hasText: "view-me.wav" });
        await clickView(row);

        const body = viewerBody(page);
        await expect(body).toContainText("1.00");
        const waveform = body.locator(".file-viewer-dlg-sound-image-container img");
        await expect(waveform).toBeVisible();
        await expect(waveform).toHaveAttribute("src", /^data:image\/png;base64,/);

        const playButton = body.getByRole("button", { name: en.media.soundPlay });
        await expect(playButton).toBeVisible();

        // Centred *beneath* the waveform (own line, horizontally aligned), not squeezed onto the
        // same line beside it -- regression check for the inline-block layout that used to let it
        // sit to the right of the waveform whenever the dialog was wide enough for both:
        const waveformBox = await waveform.boundingBox();
        const playBox = await playButton.boundingBox();
        expect(waveformBox).not.toBeNull();
        expect(playBox).not.toBeNull();
        const waveformBoxChecked = waveformBox as { x: number, y: number, width: number, height: number };
        const playBoxChecked = playBox as { x: number, y: number, width: number, height: number };
        expect(playBoxChecked.y).toBeGreaterThanOrEqual(waveformBoxChecked.y + waveformBoxChecked.height);
        const waveformCentreX = waveformBoxChecked.x + waveformBoxChecked.width / 2;
        const playCentreX = playBoxChecked.x + playBoxChecked.width / 2;
        expect(Math.abs(waveformCentreX - playCentreX)).toBeLessThan(2);

        await playButton.click();
        await expect(body.getByRole("button", { name: en.media.soundStop })).toBeVisible();
        await body.getByRole("button", { name: en.media.soundStop }).click();
        await expect(playButton).toBeVisible();
    });

    test("shows \"unsupported\" with a working Download option for an unrecognised binary file", async ({ page }) => {
        await openFilesTab(page);
        // Invalid UTF-8 (so the content-sniff fails) with an extension that isn't a recognised
        // image/sound type either -- see filePreview.ts's previewKindForExtension():
        const content = Buffer.from([0xff, 0xfe, 0x00, 0x01, 0xc0, 0xaf]);
        const filePath = testFixturePath(test.info().outputDir, "view-me.bin", content);
        await localUploadInput(page).setInputFiles(filePath);

        const row = page.locator(".file-system-tree-file", { hasText: "view-me.bin" });
        await clickView(row);

        await expect(viewerBody(page)).toContainText(en.fileSystemTab.viewUnsupported);
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            page.getByRole("button", { name: en.fileSystemTab.download }).click(),
        ]);
        const downloadedPath = await download.path();
        expect(downloadedPath).not.toBeNull();
        expect(readFileSync(downloadedPath as string)).toEqual(content);
    });

    test("shows \"too large to preview\" for a file over the size cap, without a Download-content mismatch", async ({ page }) => {
        await openFilesTab(page);
        // One byte over MAX_PREVIEWABLE_FILE_SIZE (filePreview.ts) -- content doesn't matter, only
        // the size does, since this path skips fetching bytes entirely (FileSystemPane.vue's onView()):
        const content = Buffer.alloc(10 * 1024 * 1024 + 1, "a");
        const filePath = testFixturePath(test.info().outputDir, "view-me-toobig.txt", content);
        await localUploadInput(page).setInputFiles(filePath);

        const row = page.locator(".file-system-tree-file", { hasText: "view-me-toobig.txt" });
        await clickView(row);

        await expect(viewerBody(page)).toContainText(en.fileSystemTab.viewTooLarge);
    });

    test("also offers a view button on read-only built-in assets", async ({ page }) => {
        await openFilesTab(page);
        const dataSection = await openBuiltInSection(page, "/data/");
        const row = dataSection.locator(".file-system-tree-file", { hasText: "word_counts.txt" });
        await clickView(row);

        // Unlike /local (a plain in-memory read), fetching an asset root's file goes via the real
        // Pyodide worker (readFsFileBytes, fileSystemTabIO.ts) -- occasionally slow to settle under
        // load (seen taking >15s on a contended run), so give this generous headroom rather than
        // the default 5s:
        await expect(viewerBody(page)).toContainText("sandbox", {timeout: 30000});
    });
});

// Upload validation (see src/helpers/fileSystemTabIO.ts's reject list): executables, OS scripts and
// JavaScript files are refused with a message, and nothing is written -- by extension, and for a
// direct upload also by the MIME type the browser reports. HTML/XHTML files remain allowed. Most tests use Playwright's in-memory {name, mimeType, buffer} payloads rather than
// files on disk, since several of the names below (trailing dot, "<", ">") can't exist as real
// files on every OS the suite runs on.
test.describe("File system tab -- refused file types", () => {
    function payload(name: string, mimeType = "application/octet-stream") {
        return { name, mimeType, buffer: Buffer.from("x\n") };
    }

    // The app's shared message dialog (SimpleMsgModalDlg.vue, mounted once in App.vue) -- see
    // FileSystemPane.vue's showUploadRefused():
    const refusalBody = (page: Page) => page.locator("#appSimpleMsgModalDlg-body");

    async function dismissRefusal(page: Page): Promise<void> {
        await page.locator("#appSimpleMsgModalDlg").getByRole("button", { name: en.buttonLabel.ok, exact: true }).click();
        await expect(refusalBody(page)).toBeHidden();
    }

    test("refuses executables, scripts and JavaScript files, naming each one, and stores nothing", async ({ page }) => {
        await openFilesTab(page);
        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        const refusedNames = [
            "tool.exe", "setup.msi", "helper.dll", "run.bat", "run.cmd", "script.ps1", "install.sh",
            "app.jar", "code.js", "module.mjs",
            // Case-insensitive, judged on the *last* extension only, and ignoring the trailing
            // dots/spaces Windows would strip when saving the file:
            "SHOUTY.EXE", "photo.jpg.exe", "sneaky.exe.", "sneaky.bat ",
        ];
        for (const name of refusedNames) {
            await localUploadInput(page).setInputFiles(payload(name));
            await expect(refusalBody(page)).toContainText(`"${name.trimEnd()}`);
            await dismissRefusal(page);
        }
        // None of them were written, and the overwrite/archive dialogs never came into it:
        await expect(localSection).toContainText(en.fileSystemTab.emptyFolder);
        await expect(page.locator(".file-system-tree-file")).toHaveCount(0);
    });

    test("still accepts look-alike names whose real (last) extension is allowed", async ({ page }) => {
        await openFilesTab(page);
        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        const acceptedNames = ["my_program.py", "notes.exe.txt", "data.json", "raw-data.bin", "readme.md", "Makefile", "javascript-notes.txt"];
        for (const name of acceptedNames) {
            await localUploadInput(page).setInputFiles(payload(name));
            await expect(localSection.locator(".file-system-tree-file", { hasText: name })).toBeVisible();
        }
        await expect(refusalBody(page)).toBeHidden();
    });

    test("accepts web pages (HTML/XHTML), which Python programs can legitimately read and write", async ({ page }) => {
        await openFilesTab(page);
        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        // Deliberately distinct stems -- the row locator below matches on a substring, so e.g.
        // "page.htm" would also match a "page.html" row:
        const webPages: [string, string][] = [["index.html", "text/html"], ["old-page.htm", "text/html"], ["doc.xhtml", "application/xhtml+xml"]];
        for (const [name, mimeType] of webPages) {
            await localUploadInput(page).setInputFiles(payload(name, mimeType));
            await expect(localSection.locator(".file-system-tree-file", { hasText: name })).toBeVisible();
        }
        await expect(refusalBody(page)).toBeHidden();
    });

    test("refuses a file the browser reports as an executable/script MIME type, even under an innocent-looking name", async ({ page }) => {
        await openFilesTab(page);
        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        // MIME parameters (e.g. charset) and case don't matter:
        const disguised: [string, string][] = [
            ["innocent.dat", "application/x-msdownload"],
            ["innocent2.dat", "application/x-sh"],
            ["innocent3.dat", "Text/JavaScript; charset=utf-8"],
            ["innocent4.dat", "application/java-archive"],
        ];
        for (const [name, mimeType] of disguised) {
            await localUploadInput(page).setInputFiles(payload(name, mimeType));
            await expect(refusalBody(page)).toContainText(`"${name}"`);
            await dismissRefusal(page);
        }
        await expect(localSection).toContainText(en.fileSystemTab.emptyFolder);
    });

    test("refuses a zip containing a disallowed file -- before offering keep/unzip -- naming the offending entries", async ({ page }) => {
        await openFilesTab(page);
        const zipPath = await testZipFixturePath(test.info().outputDir, "mixed.zip", {
            "readme.txt": "fine\n",
            "sub/payload.js": "alert(1);\n",
            "bin/tool.exe": "MZ",
        });
        await localUploadInput(page).setInputFiles(zipPath);

        await expect(refusalBody(page)).toContainText("mixed.zip");
        await expect(refusalBody(page)).toContainText("sub/payload.js");
        await expect(refusalBody(page)).toContainText("bin/tool.exe");
        await expect(refusalBody(page)).not.toContainText("readme.txt");
        // The keep-as-zip/unzip choice is never offered -- keeping the zip would only defer the
        // problem to whoever downloads and extracts it:
        await expect(page.getByRole("heading", { name: en.fileSystemTab.archiveDialogTitle })).toBeHidden();
        await dismissRefusal(page);

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await expect(localSection).toContainText(en.fileSystemTab.emptyFolder);
    });

    test("judges zip entries on their file name, not on a folder name that looks like a refused type", async ({ page }) => {
        await openFilesTab(page);
        const zipPath = await testZipFixturePath(test.info().outputDir, "folder-names.zip", {
            "lib.js/readme.txt": "just text\n",
        });
        await localUploadInput(page).setInputFiles(zipPath);
        await page.getByRole("button", { name: en.fileSystemTab.unzipContents }).click();

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await expect(localSection).toContainText("lib.js");
        await expect(refusalBody(page)).toBeHidden();
    });

    test("shows a refused file's name as plain text, never as HTML", async ({ page }) => {
        await openFilesTab(page);
        // The message dialog renders HTML (v-html), and a file -- or a zip entry, chosen by whoever
        // built the archive -- can be named like markup, so its name must be escaped:
        const name = "<img src=x id=injected-by-filename>.exe";
        await localUploadInput(page).setInputFiles(payload(name));

        await expect(refusalBody(page)).toContainText(name);
        await expect(page.locator("#injected-by-filename")).toHaveCount(0);
        await dismissRefusal(page);
    });

    test("a project file can't smuggle in a refused type as a pinned file", async ({ page }) => {
        await openFilesTab(page);
        // Pin two ordinary files and save, then edit the saved project so one of them claims a
        // refused name -- standing in for a hand-crafted .spy file shared by someone else:
        for (const name of ["kept-pin.txt", "renamed-pin.txt"]) {
            await localUploadInput(page).setInputFiles(testFixturePath(test.info().outputDir, name, name + "\n"));
            const row = page.locator(".file-system-tree-file", { hasText: name });
            await row.hover();
            await row.locator(".file-system-tree-pin-btn").click();
            await expect(row.locator(".file-system-tree-pin-btn")).toHaveClass(/file-system-tree-pin-btn-pinned/);
        }
        const savedPath = await save(page, true, "pinned-refused-type");
        const saved = readFileSync(savedPath, "utf8");
        expect(saved).toContain("renamed-pin.txt:");
        writeFileSync(savedPath + ".spy", saved.replace("renamed-pin.txt:", "renamed-pin.js:"));

        await newProject(page);
        await load(page, savedPath + ".spy");
        await openFilesTab(page);

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        // The rest of the project (including the other pinned file) still loads normally:
        await expect(localSection).toContainText("kept-pin.txt");
        await expect(localSection).not.toContainText("renamed-pin");
    });
});

test.describe("File system tab -- uploading an archive to /local", () => {
    test("shows the keep-as-zip/unzip dialog, naming the uploaded file", async ({ page }) => {
        await openFilesTab(page);
        const zipPath = await testZipFixturePath(test.info().outputDir, "archive-test.zip", {
            "root.txt": "root content\n",
        });
        await localUploadInput(page).setInputFiles(zipPath);

        await expect(page.getByRole("heading", { name: en.fileSystemTab.archiveDialogTitle })).toBeVisible();
        // ModalDlg.vue (see its own template) ids the body "<dlgId>-body" -- every other modal in
        // the app is also permanently mounted (just hidden) alongside this one, so a plain
        // ".modal-body" locator matches all of them; scope to this dialog specifically:
        await expect(page.locator("#fileSystemArchiveImportDlg-body")).toContainText("archive-test.zip");
    });

    test("Cancel uploads nothing", async ({ page }) => {
        await openFilesTab(page);
        const zipPath = await testZipFixturePath(test.info().outputDir, "cancelled.zip", {
            "root.txt": "root content\n",
        });
        await localUploadInput(page).setInputFiles(zipPath);
        await page.getByRole("button", { name: en.buttonLabel.cancel, exact: true }).click();

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await expect(localSection).toContainText(en.fileSystemTab.emptyFolder);
        await expect(localSection).not.toContainText("cancelled.zip");
    });

    test("\"Keep as zip\" stores the archive itself, byte-identical", async ({ page }) => {
        await openFilesTab(page);
        const zipPath = await testZipFixturePath(test.info().outputDir, "keep-me.zip", {
            "root.txt": "root content\n",
        });
        await localUploadInput(page).setInputFiles(zipPath);
        await page.getByRole("button", { name: en.fileSystemTab.keepAsZip }).click();

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await expect(localSection).toContainText("keep-me.zip");
        // The unzipped entry must NOT also appear -- this upload chose to keep the archive as-is:
        await expect(localSection).not.toContainText("root.txt");

        const row = page.locator(".file-system-tree-file", { hasText: "keep-me.zip" });
        await row.hover();
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            row.locator(".file-system-tree-download-btn").click(),
        ]);
        const downloadedPath = await download.path();
        expect(downloadedPath).not.toBeNull();
        expect(readFileSync(downloadedPath as string)).toEqual(readFileSync(zipPath));
    });

    test("\"Unzip contents\" extracts every entry, preserving subfolder structure", async ({ page }) => {
        await openFilesTab(page);
        const zipPath = await testZipFixturePath(test.info().outputDir, "unzip-me.zip", {
            "root.txt": "root content\n",
            "sub/nested.txt": "nested content\n",
        });
        await localUploadInput(page).setInputFiles(zipPath);
        await page.getByRole("button", { name: en.fileSystemTab.unzipContents }).click();

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        // The archive itself must NOT appear -- this upload chose to unzip, not keep it:
        await expect(localSection).not.toContainText("unzip-me.zip");
        await expect(localSection).toContainText("root.txt");
        await expect(localSection).toContainText("sub");
        // "sub" is a nested directory, collapsed by default -- expand it (via its chevron; clicking
        // the label itself copies its path instead -- see the clipboard tests) to reveal nested.txt:
        await localSection.locator(".file-system-tree-dir", { hasText: "sub" }).locator(".file-system-tree-chevron").click();
        await expect(localSection).toContainText("nested.txt");

        const rootRow = page.locator(".file-system-tree-file", { hasText: "root.txt" });
        await rootRow.hover();
        const [rootDownload] = await Promise.all([
            page.waitForEvent("download"),
            rootRow.locator(".file-system-tree-download-btn").click(),
        ]);
        expect(readFileSync((await rootDownload.path()) as string, "utf8")).toEqual("root content\n");

        const nestedRow = page.locator(".file-system-tree-file", { hasText: "nested.txt" });
        await nestedRow.hover();
        const [nestedDownload] = await Promise.all([
            page.waitForEvent("download"),
            nestedRow.locator(".file-system-tree-download-btn").click(),
        ]);
        expect(readFileSync((await nestedDownload.path()) as string, "utf8")).toEqual("nested content\n");
    });

    test("downloading a directory produces a zip of its contents", async ({ page }) => {
        await openFilesTab(page);
        const zipPath = await testZipFixturePath(test.info().outputDir, "zip-dir-test.zip", {
            "sub/a.txt": "content a\n",
            "sub/nested/b.txt": "content b\n",
        });
        await localUploadInput(page).setInputFiles(zipPath);
        await page.getByRole("button", { name: en.fileSystemTab.unzipContents }).click();

        const localSection = page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.local });
        await expect(localSection).toContainText("sub");

        // Downloading a directory works straight off the already-loaded tree data, with no need to
        // have expanded it in the UI first:
        const subDir = localSection.locator(".file-system-tree-dir", { hasText: "sub" });
        await subDir.hover();
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            subDir.locator(".file-system-tree-download-btn").click(),
        ]);
        expect(download.suggestedFilename()).toEqual("sub.zip");
        const downloadedPath = await download.path();
        expect(downloadedPath).not.toBeNull();

        const zip = await JSZip.loadAsync(readFileSync(downloadedPath as string));
        // JSZip adds an implicit "nested/" directory entry on read even though only the two actual
        // files were ever added to the zip (see downloadFsDirectoryAsZip, fileSystemTabIO.ts):
        expect(Object.keys(zip.files).sort()).toEqual(["a.txt", "nested/", "nested/b.txt"]);
        expect(await zip.file("a.txt")?.async("string")).toEqual("content a\n");
        expect(await zip.file("nested/b.txt")?.async("string")).toEqual("content b\n");
    });
});

test.describe("File system tab -- /cloud", () => {
    // Uploading/downloading through a real connected Google Drive/OneDrive needs live OAuth, which
    // isn't available in this test environment (no existing suite mocks cloudDriveHandlerComponentAPI
    // either -- see cloudFileIO.ts) -- so this only covers the part that's genuinely testable without
    // one: a fresh, unsaved project has no cloud drive connected, and the section must not appear at
    // all in that state (see FileSystemPane.vue's isCloudMounted() check).
    test("is not shown when the project isn't saved to a cloud drive", async ({ page }) => {
        await openFilesTab(page);
        await expect(page.locator(".file-system-pane-root", { hasText: en.fileSystemTab.cloud })).toHaveCount(0);
    });
});

// Writes fixture content to a fresh file under outputDir and returns its path, for use with
// locator.setInputFiles() (which needs a real file on disk). Content can be a Buffer for binary
// fixtures (see the view-file tests' image/sound/size-cap fixtures below).
function testFixturePath(outputDir: string, fileName: string, content: string | Buffer): string {
    mkdirSync(outputDir, { recursive: true });
    const filePath = path.join(outputDir, fileName);
    writeFileSync(filePath, content);
    return filePath;
}

// A valid, minimal 1x1 pixel PNG (real bytes, not just a plausible-looking extension), so an
// uploaded ".png" file genuinely renders as an <img> rather than failing to decode.
const MINIMAL_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
);

// A valid, minimal WAV file (a real header plus a short burst of silent 16-bit PCM samples), so
// an uploaded ".wav" file genuinely plays as an <audio> element rather than failing to decode.
function makeMinimalWav(durationSeconds = 0.1, sampleRate = 8000): Buffer {
    const numSamples = Math.floor(durationSeconds * sampleRate);
    const dataSize = numSamples * 2; // 16-bit mono
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataSize, 40);
    return buffer;
}

// Builds a real .zip fixture (using the same "jszip" package the app itself uses -- see
// archive.ts) from a {entryPath: content} map, writes it under outputDir, and returns its path.
async function testZipFixturePath(outputDir: string, fileName: string, entries: Record<string, string>): Promise<string> {
    const zip = new JSZip();
    for (const [entryPath, content] of Object.entries(entries)) {
        zip.file(entryPath, content);
    }
    const data = await zip.generateAsync({ type: "nodebuffer" });
    mkdirSync(outputDir, { recursive: true });
    const filePath = path.join(outputDir, fileName);
    writeFileSync(filePath, data);
    return filePath;
}

test.describe("File system tab -- scrolling", () => {
    test("wheel-scrolling over the files pane doesn't also scroll the main code area", async ({ page }) => {
        await openFilesTab(page);
        // Make sure the main code area has something to scroll, whatever the window size:
        const codeDiv = page.locator(".editor-code-div");
        await codeDiv.evaluate((el) => {
            const spacer = document.createElement("div");
            spacer.style.height = "5000px";
            el.appendChild(spacer);
        });
        expect(await codeDiv.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
        // Expand every root so the pane has plenty of content, then scroll it to its end -- that's
        // where an unconstrained scroll would chain through to the code area:
        const chevrons = page.locator(".file-system-pane .file-system-tree-chevron");
        for (let i = 0; i < await chevrons.count(); i++) {
            await chevrons.nth(i).click();
        }
        const pane = page.locator(".file-system-pane");
        await pane.evaluate((el) => {
            el.scrollTop = el.scrollHeight;
        });
        const box = await pane.boundingBox();
        if (box == null) {
            throw new Error("Files pane has no bounding box");
        }
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        for (let i = 0; i < 5; i++) {
            await page.mouse.wheel(0, 300);
        }
        // Give any (unwanted) scroll chaining time to show up, then check the code area stayed put:
        await page.waitForTimeout(500);
        expect(await codeDiv.evaluate((el) => el.scrollTop)).toBe(0);
    });
});
