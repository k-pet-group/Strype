// These tests test what happens when you open, close and refresh Strype tabs,
// specifically around storing and restoring the state from browser storage.

import { BrowserContext, Page, expect, test } from "@playwright/test";
import { DEFAULT_STARTING_FRAME_COUNT, skipPyodideLoading } from "../support/general";
import { save } from "../support/loading-saving";
import {strypeElIds} from "../support/proxy";
import { BASE_URL } from "../../../playwright.config";

// storageState() reports storage per-origin, and closePage() below navigates non-Chromium pages
// to a different origin (our test asset server) as its "unload" trick, so we always need to pick
// out the right origin rather than assuming there's only one:
const STRYPE_ORIGIN = new URL(BASE_URL).origin;

// These mirror the AutoSaveKeyNames enum and autoSaveFreqMins constant in src/helpers/editor.ts.
// They're duplicated here (not imported) because that module pulls in i18n/Vue and the rest of
// the app's dependency graph, which isn't loadable from Playwright's Node-side test runner.
const TAB_ID_SESSION_KEY = "StrypeEditorTabId";
const DB_NAME = "StrypeStateDatabase";
const DB_STORE = "StrypeStorePython"; // the Python-platform object store; these tests run in Python mode
const EMERGENCY_KEY_PREFIX = "PythonStrypeSavedState:";
const AUTO_SAVE_FREQ_MINS = 2;

type StoredSessionRecord = {
    tabId: string;
    data: string;
    projectName: string;
    lastModifiedAt: number;
    lastAliveAt: number;
    stillAlive: string;
    modifiedSinceExternalSave: string;
    userDecidedOnReloading: string;
};

// Reads the tabId that identifies a page's own saved session (see getEditorTabId() in store.ts).
async function getTabId(page: Page): Promise<string> {
    const tabId = await page.evaluate((key) => sessionStorage.getItem(key), TAB_ID_SESSION_KEY);
    if (!tabId) {
        throw new Error("Page has no tabId yet");
    }
    return tabId;
}

// Reads the raw IndexedDB rows for our object store, straight from the browser's storage layer
// (via CDP, same as the storageState() call already used in afterEach below) -- this deliberately
// does not need any page to be open/alive, which is exactly what we need when polling right after
// a tab has been closed.
async function getStoredSessionRecords(context: BrowserContext): Promise<StoredSessionRecord[]> {
    const state = await context.storageState({indexedDB: true}) as unknown as {
        origins: {origin: string, indexedDB?: {name: string, stores: {name: string, records: {value: StoredSessionRecord}[]}[]}[]}[]
    };
    const origin = state.origins.find((o) => o.origin === STRYPE_ORIGIN);
    const db = origin?.indexedDB?.find((d) => d.name === DB_NAME);
    const store = db?.stores.find((s) => s.name === DB_STORE);
    return (store?.records ?? []).map((r) => r.value);
}

// Reads the "emergency save" localStorage keys written synchronously on pagehide (see
// emergencySaveSessionState() in store-db-storage.ts), before they've been migrated into
// IndexedDB by whatever tab loads next.
async function getEmergencySaveTabIds(context: BrowserContext): Promise<string[]> {
    const state = await context.storageState();
    const origin = state.origins.find((o) => o.origin === STRYPE_ORIGIN);
    return (origin?.localStorage ?? [])
        .map((item) => item.name)
        .filter((name) => name.startsWith(EMERGENCY_KEY_PREFIX))
        .map((name) => name.slice(EMERGENCY_KEY_PREFIX.length));
}

// Waits until the given (just-closed) tab's state has actually landed in browser storage --
// either still as the raw "emergency save" in localStorage, or (if some other page has already
// run its startup migration) as a proper IndexedDB row -- instead of guessing a fixed delay.
// Playwright's page.close({runBeforeUnload: true}) explicitly does not wait for unload handlers
// to finish (confirmed against the Playwright docs, not just a guess), and we can't page.evaluate()
// on a page once it's closed, so polling browser-level storage state is the only reliable signal.
async function waitForTabStateSaved(context: BrowserContext, tabId: string, timeout = 15000): Promise<void> {
    await expect.poll(async () => {
        const emergencyTabIds = await getEmergencySaveTabIds(context);
        if (emergencyTabIds.includes(tabId)) {
            return true;
        }
        const records = await getStoredSessionRecords(context);
        return records.some((r) => r.tabId === tabId);
    }, {timeout, message: `Waiting for tab ${tabId}'s state to be saved (emergency localStorage or IndexedDB)`}).toBe(true);
}

// Directly writes a row into the IndexedDB store using the real IndexedDB API from within the
// page, bypassing the app's own save path entirely. This lets us set up a precise, controlled
// precondition (e.g. a specific lastAliveAt) for testing checkForRecentSaveStates()'s read-side
// logic, without needing to wait for real time to pass or coax the app's save machinery into an
// awkward sequence to get there.
async function seedStoredSessionRecord(page: Page, record: StoredSessionRecord): Promise<void> {
    await page.evaluate(({dbName, storeName, record}) => {
        return new Promise<void>((resolve, reject) => {
            const req = indexedDB.open(dbName);
            req.onsuccess = () => {
                const db = req.result;
                const tx = db.transaction(storeName, "readwrite");
                tx.objectStore(storeName).put(record);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            };
            req.onerror = () => reject(req.error);
        });
    }, {dbName: DB_NAME, storeName: DB_STORE, record});
}

// Note we don't visit a page in the beforeEach; that is left to individual tests.
// It's also important to not even have it as a parameter; Playwright creates it based on whether it appears as a param.
test.beforeEach(async ({ browserName }, testInfo) => {
    if (browserName === "webkit" && process.platform === "win32") {
        // On Windows+Webkit it just can't seem to load the page for some reason:
        testInfo.skip(true, "Skipping on Windows + WebKit due to unknown problems");
    }

    // These tests can take longer than the default 30 seconds. 180s turned out not to be enough
    // headroom: CI run 29351662646 showed the heaviest (six-page-load) case consistently landing
    // at 182-186s on Firefox under contention, failing all 4 attempts. 240s matched the margin
    // scroll-into-view.spec.ts uses for its own heaviest multi-step tests, but CI run 29398924054
    // showed "(2nd: false)" still hitting the 240s wall on all 4 attempts, even on the macOS+WebKit
    // job that runs this file single-worker/isolated specifically to rule out CPU contention --
    // the resource-monitor log for that job showed load average around 3-5 on a 3-vCPU runner
    // during the failures (not the 15-30 seen during job setup), so this isn't primarily
    // contention. Bumped to 360s pending further investigation into why the "false" (autosave-
    // recovery) branch is consistently slower than "true" (explicit save) -- see PROGRESS notes.
    testInfo.setTimeout(360000); // 360 seconds
});

test.afterEach(async ({ context }, testInfo) => {
    const state = await context.storageState({
        indexedDB: true,
    });

    await testInfo.attach("storage-state.json", {
        body: JSON.stringify(state, null, 2),
        contentType: "application/json",
    });
});

async function assertStartingProject(page: Page)  {
    // Checks the starting project is showing:
    await expect(page.locator(".frame-div")).toHaveCount(DEFAULT_STARTING_FRAME_COUNT);
    await expect(page.locator("span", {hasText: "Hello from Strype"})).toHaveCount(1);
    await expect(page.locator("span", {hasText: "This is the default Strype starter project"})).toHaveCount(1);
}

// expectedFrameCount defaults to the current default project's frame count plus one, but tests
// that load an old, frozen localStorage snapshot (captured before the default project's shape
// last changed) need to pass the frame count that snapshot actually contains, not today's count:
async function assertStartingPlus(page: Page, paramContent: string, expectedFrameCount = DEFAULT_STARTING_FRAME_COUNT + 1) {
    try {
        await expect(page.locator(".frame-div")).toHaveCount(expectedFrameCount);
        await expect(page.locator("span", {hasText: "Hello from Strype"})).toHaveCount(1);
        await expect(page.locator("span", {hasText: "This is the default Strype starter project"})).toHaveCount(1);
        await expect(page.locator("span", {hasText: paramContent})).toHaveCount(1);
    }
    catch (err) {
        await logEditorStateForDiagnosis(page, `assertStartingPlus(expected ${expectedFrameCount} frames, content "${paramContent}") failed`);
        throw err;
    }
}

// Logs what the editor actually looks like, for diagnosing intermittent failures where the frame
// count or content isn't what appendContent()/assertStartingPlus() expect (seen on WebKit and
// Chromium in CI: e.g. 6 frames where 5 were expected right after typing the new content, as if an
// extra frame had been created). Prints each frame's id and text, where the editor thought focus
// and the cursor were, and whether a recent-state banner was showing -- enough to tell whether keys
// landed in the wrong place, were repeated, or the page had not finished (re)loading:
async function logEditorStateForDiagnosis(page: Page, reason: string) {
    const state = await page.evaluate(() => {
        const editor = document.querySelector("#editor");
        return {
            url: location.href,
            readyState: document.readyState,
            hasFocus: document.hasFocus(),
            focusedElement: document.activeElement ? (document.activeElement.tagName + "#" + document.activeElement.id + "." + document.activeElement.className) : null,
            slotFocusId: editor?.getAttribute("data-slot-focus-id"),
            slotCursor: editor?.getAttribute("data-slot-cursor"),
            pendingSlotConversion: editor?.getAttribute("data-pending-slot-conversion"),
            frames: [...document.querySelectorAll(".frame-div")].map((f) => (f.id || "?") + ": " + (f.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80)),
            banner: [...document.querySelectorAll("[class*='message-banner']")].map((b) => (b.textContent ?? "").trim().slice(0, 120)),
        };
    }).catch((e) => "could not read editor state: " + e);
    console.log(`[Editor state] ${reason}: ` + JSON.stringify(state, null, 1));
}

// Helper function for changing the page content with a custom string
async function appendContent(page: Page, paramContent: string) {
    await page.keyboard.press("End");
    await page.keyboard.type("p\"" + paramContent);
    await page.keyboard.press("Enter");
    // Sanity check it actually appeared (assertStartingPlus's own assertions already retry):
    await assertStartingPlus(page, paramContent);
}

async function loadAndWaitForEditor(page: Page) {
    await skipPyodideLoading(page);
    await page.goto("./", {waitUntil: "load"});
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.waitForSelector(".frame-container");
    // Necessary to make sure save doesn't try to show the file dialog:
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });
}

// "New Project" (see resetProject()/onHideModalDlg() in App.vue) performs a real browser
// navigation -- window.location.href = "...?new_project" -- not an SPA transition, so the whole
// app (Vue, the service worker, etc.) has to boot up again from scratch, same as a fresh
// page.goto(). Callers used to just call assertStartingProject() straight after clicking through
// the confirmation dialog, relying on its own expect() calls' default 5000ms timeout to also cover
// this reload+reboot -- CI logs (e.g. run 30398078084) showed that isn't always enough on a
// contended Firefox runner ("frame-div" still resolving to 0 elements after 5s), even though the
// overall per-test timeout (360s, see beforeEach above) has plenty of headroom. Wait for the same
// real conditions loadAndWaitForEditor() waits for on first load, so the eventual
// assertStartingProject() call only has to wait for reactive rendering, not the reload itself:
async function waitForNewProjectReload(page: Page): Promise<void> {
    await page.waitForURL(/[?&]new_project(&|$)/);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.waitForSelector(".frame-container");
}

test.describe("Test basic operation", () => {
    test("Test initial fresh load", async ({page}) => {
        await loadAndWaitForEditor(page);
        await assertStartingProject(page);
        const scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
        // Check no error showing:
        await expect(page.locator("." + scssVars.messageBannerContainerClassName)).not.toBeVisible();
    });

    test("Test reload on fresh page", async ({page}) => {
        await loadAndWaitForEditor(page);
        await assertStartingProject(page);
        await page.reload();
        await page.waitForSelector(".frame-container");
        await assertStartingProject(page);
    });

    // Under the new model, a reload should automatically re-use the latest content
    // without asking.
    test("Test reload preserves content", async ({page}) => {
        await loadAndWaitForEditor(page);
        await assertStartingProject(page);
        const str = "Going to do a reload #1";
        await appendContent(page, str);
        await assertStartingPlus(page, str);
        await page.reload();
        await page.waitForSelector(".frame-container");
        await assertStartingPlus(page, str);
    });

    test("Test multiple reload preserves content", async ({page}) => {
        await loadAndWaitForEditor(page);
        await assertStartingProject(page);
        const str = "Going to do a reload #1";
        await appendContent(page, str);
        await assertStartingPlus(page, str);
        for (let i = 0; i < 3; i++) {
            await page.reload();
            await page.waitForSelector(".frame-container");
            await assertStartingPlus(page, str);
        }
    });
});

// Note: it's important in all these tests to use a shared context.  If you call
// browser.newPage() they each get their own context which means they each get
// their own local storage, and the test is no longer valid for testing the scenario
// of opening multiple tabs/windows in the same browser.
test.describe("Test multi-page operation", () => {
    // The issue with this test is that the first project might not have been auto-saved,
    // but still worth testing:
    test("Second tab shows empty project", async ({browser}) => {
        const context = await browser.newContext();
        const page1 = await context.newPage();
        page1.on("console", (msg) => console.log("Browser log page 1:", msg.text()));
        await loadAndWaitForEditor(page1);
        await assertStartingProject(page1);
        const str = "Going to open a second page #1";
        await appendContent(page1, str);
        await assertStartingPlus(page1, str);
        // Now open the second page, which should be the starting project still:
        const page2 = await context.newPage();
        page2.on("console", (msg) => console.log("Browser log page 2:", msg.text()));
        await loadAndWaitForEditor(page2);
        await assertStartingProject(page2);
    });
    // To force an autosave, we refresh first tab before opening second:
    test("Second tab shows empty project after refreshing first", async ({browser}) => {
        const context = await browser.newContext();
        const page1 = await context.newPage();
        page1.on("console", (msg) => console.log("Browser log page 1:", msg.text()));
        await loadAndWaitForEditor(page1);
        await assertStartingProject(page1);
        const str = "Going to open a second page #2";
        await appendContent(page1, str);
        await assertStartingPlus(page1, str);
        await page1.reload();
        await page1.waitForSelector(".frame-container");
        await assertStartingPlus(page1, str);
        // Now open the second page, which should be the starting project still:
        const page2 = await context.newPage();
        page2.on("console", (msg) => console.log("Browser log page 2:", msg.text()));
        await loadAndWaitForEditor(page2);
        await assertStartingProject(page2);
    });
});

test.describe("Test migration from old system", () => {
    test("Test that opening with old state in place does load it", async ({browser}) => {
        const context = await browser.newContext({
            storageState: {
                cookies: [],
                origins: [
                    {
                        origin: "http://localhost:8081/editor/",
                        localStorage: [
                            // Unicode escaped in case of weird characters:
                            { name: "PythonStrypeSavedState", value: "\u3782\u2026\u0a60\u460a\ue0e6\u7025\u80ec\ue201\u700c\uc086\u01b0\u3384\u00d0\u8f80\u1603\ud80e\ue034\u8402\u7be0\u0b80\u4e14\u0d61\u0638\u1c48\u98b6\uc016\uc200\u7928\u00ac\u2006\u326f\u8328\u000c\u0a42\u2301\u9149\u01c2\u2001\u57a0\u01cb\uba10\u6c29\u3102\u513e\u0022\ud7b1\u45c1\u1d56\u3c84\uafe0\u0ca1\u09ec\ue7dc\udcf9\uac00\ud5ad\u111d\u8d58\u60f8\u0db0\u5821\u9098\u0124\u5d34\u41a4\uc911\u70c1\ue390\u53e5\ud001\ub401\u6801\u1934\uca89\u8a00\u98aa\u0198\u0174\u4824\u2850\u9800\u14e2\u1393\u539b\u5b12\u00c5\u0445\uf231\u0a9a\u4170\u1c7d\u3d71\ucd6d\u1164\u1401\u7c49\ua4ba\u9943\uf1c2\ub310\u99e8\u3041\u9029\u90b9\u5641\u4a55\ub445\uf48d\u0e00\udce3\ub1f1\ub6e1\u912d\u545d\u4a3c\uedf0\u1c9c\u5c3c\u772a\u8bc3\ue191\u31fc\uae5e\u078b\u6e12\u7060\ua231\u2ea2\u4521\u8629\ud4d6\u996c\uae54\u6450\u98b4\uda9d\u5c8f\u4347\ud369\u0c74\ub8f1\u890a\u6501\u99cc\ue476\u25ba\u0942\ua7c0\u333c\u5159\u0c1e\u2055\u0050\u8c82\u2605\u0580\u56a7\uf110\u3e30\u18b4\u0d20\ua241\u0e42\u7a27\u2582\u8343\u2c1a\ucb73\ua5c5\u9a40\ue572\u983c\u881f\u2400\u2881\u0a45\u32f4\ubcb8\uc201\u02ad\u6536\uc3bd\ua269\u8497\u64ad\u7285\u499e\ud444\u777a\u4000\u091f\u1cc0\u0040\u20a1\u0943\u2ac3\u1704\u8004\u7183\u996d\u001d\u3b43\ubad0\u1975\u6bce\ueb78\ua6cc\u2505\udbed\u0ec7\u53af\ua40d\u52bb\u0cf4\ub1c3\ua606\u0c86\u93ad\u70b8\u0f9a\u830b\u5106\ufdfe\u90a0\u5054\u1be0\u8603\u0230\uc2fc\u3d08\u8922\uc589\ua8f4\u3a33\u1591\uc824\ua9f8\ufe87\u5912\u4f41\ua409\u831a\ueae6\u9d35\uc2cd\ue64c\u8b2e\ub94b\uaf67\u9855\u306e\u6f25\u4668\ub68a\uc6fe\udb6f\uadfc\ue8d5\u69dd\ud2d7\ue676\ud031\u5544\u83f5\u348c\u640d\u5000\u8504\u6913\u84d8\uf068\u90e0\u0028\u3e37\u4a54\uf49d\u1309\u5154\ud517\u4482\u7db0\u6145\uf3c4\u332f\u5df0\ud473\u3583\u6584\u8b5c\u0f60\u384c\u32cc\ue120\uea6a\uc745\ub96d\u06c9\ub16c\udb2b\u05c0\uc5bb\u7b02\u211d\ua110\u5bc2\u1cfb\u51c4\u11a2\u2729\uc401\u9dba\u39c1\u7748\ub165\ucf23\ufcf1\u3251\u2225\u14de\u8405\udc98\u0a44\u60d3\uc53c\uc200\u2db6\u5a3e\u8c38\ucca6\u1209\uf1a8\u0f96\u97a5\u4f45\u9cf5\u64af\u4a0a\u8779\u2716\u1a21\u21af\u2616\uf7bd\u8d2b\u97f0\uc203\u202d\ua542\u2869\u0604\u2044\uc203\u3342\u3d7f\ucc8e\u74b4\u58be\u2c93\u7852\u3309\u013c\u6c1e\ue671\u4366\u1088\u81c3\u360a\u3202\u207b\u9100\ua1e2\ud2a8\u8ec0\ue00a\ua841\ub578\u9011\u364d\u0e34\uc62b\u8a12\u8097\u2bf4\u008c\ubf82\ucb06\ua849\u2898\u08a2\u222f\u2246\uf4a7\ud6fc\uc084\u8a09\u82e0\ue081\u0db4\u50bc\uab34\uca06\u9cba\u6fc3\u0542\u32d3\u4bf2\ud029\u6f4d\u352d\u4483\uf390\u5d11\u0110\u0051\u160d\u8160\ubf12\u0ca4\ubd40\u0ede\u7728\ub41a\uc38c\u3880\u8a0a\u4590\u6c2c\ua444\u4908\ufabd\ue1f8\u8480\u486e\u05ac\u713c\u123a\u0719\u3223\uf291\u59cf\u48c8\u971c\u44cb\u5d09\u4dce\u71dd\ud723\u2200\u3d26\u23c4\uf464\udc95\u17eb\ud46f\u0348\ud134\u5293\u33f1\u3174\u4c9f\u050d\uac50\uc983\u202a\uc807\u0181\u7026\u1a35\u6163\u26ae\u2084\u5850\ucc18\u862c\u15b6\u6f3a\u48bb\ubd26\ua30b\u62c1\u8a38\u4e66\u2403\u2854\u7fb2\ua7e1\u81ba\uc4c6\u7a0c\u114e\u4001\u844e\u261b\u0141\ucd76\uc163\uf984\u9460\u7746\ufc44\uab1f\u1c71\uff3e\u4f26\u09d5\u389b\u1549\ued2c\u3d25\uf4aa\u7f71\u270f\u3a58\uf064\u1666\u5805\ucd75\ucb3f\u5d2c\u8d8a\uc6a3\u365c\u1a88\u1f63\uadf0\u0204\uc1f0\u2776\u1b77\u3ec4\u6bde\u46a6\udf6c\u17f6\u7db1\ud2cd\u9371\ue9d6\u3edd\u176c\u4572\u4fe3\ub27f\u1b8e\u0cea\u769e\u7353\ud723\u3acf\uf31a\u373c\u63f3\uf39d\u122e\ud101\u3ae5\uacee\u2c35\ude40\u6b97\u6eb8\uf67b\u6f79\ub8f0\ufde1\uddbe\u9283\u845b\ubd0f\u47be\ue54a\u2707\ub15b\ue5a9\u1a2d\u2377\ubf29\uf251\u3a8f\u9397\u319a\ucf2a\u2f3c\uf59d\u112c\u4bdc\ub36b\u5380\u003c\u9800\u0414\u7859\u17b1\uce00\u02c5\u6084\u1db1\u604c\u1f7a\uef73\u44a5\ube05\u72ae\u382e\ub929\u2ec7\u15de\ub746\ua66b\udd00\u095b\u2ed0\u2836\uc260\uf0c6\uc86c\u7b27\u30a8\u0562\u98cc\u01da\uaa26\u12d8\ue06c\u8786\uf431\u87c3\u5c2b\ua8b8\u760d\ue18b\u0f00\u3b0d\u8c22\uf633\u0dd4\uff56\u85c8\u8610\ua24e\u0b0f\ucc6c\u31cb\u9c09\u13c2\u144b\u6066\u0ec7\u93e0\u1144\u9190\u2600\u616c\u8193\u98cb\u19cd\u1386\u0012\u53c1\u9be0\u7319\u01a0\u5c74\u0a73\u82e1\u104b\u8014\u1908\u3740\ua517\u3098\u914c\u231c\u4004\ue6d6\u1232\u0ae0\u1e4f\u10c0\u04f7\ue287\u9981\uc0b0\u0901\u126f\uf471\u3f10\u4020\u3545\u434f\uba47\u898a\u420b\u609b\u45b4\ue26d\ua42a\uc54c\u03cb\u0849\u5523\u32b7\u8875\u41a8\u0b66\u0228\u5a9b\u50ea\u1f0e\u5108\u210d\u8190\u34a5\ud00e\u0dc4\u400f\u10fd\uac0b\ud300\u0a35\u025f\u030f\u4045\u89c1\u7ad0\u2640\u0025\u46c1\u0550\u2727\u2a71\ud101\ubc11\u4100\ue83d\u017a\uc544\u0a14\ubd9c\u71e2\u00c0\u9aab\u2202\u2663\u4e79\ufb15\u87d9\uf116\u24f2\u2997\ub17b\u0334\ube17\u20e7\u6c88\u4d52\ud500\u8a61\u271f\u035c\u9600\u0155\u0645\u05b9\u6002\u825f\u3c0e\uc3f0\u11c9\u39dd\u0f99\ub078\u0641\ucc40\u0197\ua6fa\u8fc8\u854b\ue501\u0c33\uc7c0\u1f25\ud844\u0666\uf258\u1bd0\ufa0e\ud45a\uc11f\u9839\uc11a\ua000\ub292\uc984\ub8cb\ueed5\u982d\uce90\udd1c\ufb38\u5d06\u33cf\u1da3\u58c5\u3122\ub2e3\u47f1\u5a8a\u87d8\udbd0\udb96\u1202\u205e\u274b\u1ab0\u0983\u0a64\u07fd\u4388\ub2fa\u4522\u864a\ue959\ud229\ub4e7\u884e\uc305\u6408\u0b4b\u35b8\ua734\u74a1\ua99c\ub48d\u3330\u2605\ud014\u1da3\u34fa\uaf15\ufe44\u0276\u8d91\u5860\u1410\u425d\u5ba8\ua000\u0e44\u56fa\uff58\u91dd\u83f3\u9406\u1252\u64ca\u4c5d\uca1a\u404d\u49bc\ufbc3\u2493\uaa33\u7386\ua67c\u9ce1\udb08\u4891\u101e\u01b0\u6082\u10e6\ub181\u318b\u7743\u2db8\u02b5\u3808\u4491\uf028\u8180\u81bc\ue7e0\u000e\ua820\u0c22\u6d40\u0529\ue690\u1761\u09ec\ua58f\u3564\u0066\ub542\ud6b1\u9d88\uaa95\uc806\u0278\u2f2e\ua4c6\ub587\ude0b\ua120\uc023\u9500\u281c\u4300\u2bbe\ud9c5\u2601\u0b26\ub0e9\u56e0\u9c34\ue843\u8acb\ue813\u4f06\ue083\udb92\u9149\ubb25\u7ca4\u4068\u45c1\uc97c\u0f40\u9b30\uc960\uad5c\uf1a4\u6602\uc163\u27ac\u7db2\u1b16\uc538\u6270\ue05d\u1678\u6354\u0f81\ub60a\uada0\ufac1\u05c8\u13a1\uea9f\u41e0\u20ea\ub285\u7f06\ua4df\u10e9\u7aa0\uf3c2\u0a45\u4200\ud81d\u900c\u02ab\u761c\u05a6\ub490\u261a\ud458\u3b40\u5994\u1902\ue2d9\u9260\u1207\ub381\ufdb1\u74c0\u510e\u0531\u8785\u65f2\u9cb6\ue038\u047b\ubca5\uf721\uc492\u4d80\u6937\u01bc\u47c6\ud818\u29c3\u29d5\u3acb\uf01a\u05c3\u200e\u0062\u830e\uea10\u3698\u80ed\u4c0c\uac12\u09c1\ue832\u9cfd\u9285\u82fa\u934b\u2058\u1b64\u2922\u05da\u5f72\u09fb\u1e54\u93c0\ufe78\u6880\u1b07\u03da\u2f6e\uc0fd\uae36\u6733\u5b55\ubd6d\u830b\u116a\u2e7d\u164e\u718a\ua8a4\u5120\u0003\ub07c\u0305\u3098\u04ea\u1087\u1983\ua865\u8400" },
                        ],
                    },
                ],
            },
        });
        const page = await context.newPage();
        await loadAndWaitForEditor(page);
        // This is the content I used to make the above Unicode escaped version:
        // The snapshot predates the current default project's imports, so it has one fewer frame
        // than DEFAULT_STARTING_FRAME_COUNT + 1 would now assume:
        await assertStartingPlus(page, "Saved state from previous storage model", 3);
        // Check the key has gone:
        const keys = await page.evaluate(() => {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                keys.push(localStorage.key(i));
            }
            return keys;
        });
        expect(keys).not.toContainEqual("PythonStrypeSavedState");
    });

    test("Test that opening with old state in place does load it, but loading another new tab does not", async ({browser}) => {
        const context = await browser.newContext({
            storageState: {
                cookies: [],
                origins: [
                    {
                        origin: "http://localhost:8081/editor/",
                        localStorage: [
                            // Unicode escaped in case of weird characters:
                            { name: "PythonStrypeSavedState", value: "\u3782\u2026\u0a60\u460a\ue0e6\u7025\u80ec\ue201\u700c\uc086\u01b0\u3384\u00d0\u8f80\u1603\ud80e\ue034\u8402\u7be0\u0b80\u4e14\u0d61\u0638\u1c48\u98b6\uc016\uc200\u7928\u00ac\u2006\u326f\u8328\u000c\u0a42\u2301\u9149\u01c2\u2001\u57a0\u01cb\uba10\u6c29\u3102\u513e\u0022\ud7b1\u45c1\u1d56\u3c84\uafe0\u0ca1\u09ec\ue7dc\udcf9\uac00\ud5ad\u111d\u8d58\u60f8\u0db0\u5821\u9098\u0124\u5d34\u41a4\uc911\u70c1\ue390\u53e5\ud001\ub401\u6801\u1934\uca89\u8a00\u98aa\u0198\u0174\u4824\u2850\u9800\u14e2\u1393\u539b\u5b12\u00c5\u0445\uf231\u0a9a\u4170\u1c7d\u3d71\ucd6d\u1164\u1401\u7c49\ua4ba\u9943\uf1c2\ub310\u99e8\u3041\u9029\u90b9\u5641\u4a55\ub445\uf48d\u0e00\udce3\ub1f1\ub6e1\u912d\u545d\u4a3c\uedf0\u1c9c\u5c3c\u772a\u8bc3\ue191\u31fc\uae5e\u078b\u6e12\u7060\ua231\u2ea2\u4521\u8629\ud4d6\u996c\uae54\u6450\u98b4\uda9d\u5c8f\u4347\ud369\u0c74\ub8f1\u890a\u6501\u99cc\ue476\u25ba\u0942\ua7c0\u333c\u5159\u0c1e\u2055\u0050\u8c82\u2605\u0580\u56a7\uf110\u3e30\u18b4\u0d20\ua241\u0e42\u7a27\u2582\u8343\u2c1a\ucb73\ua5c5\u9a40\ue572\u983c\u881f\u2400\u2881\u0a45\u32f4\ubcb8\uc201\u02ad\u6536\uc3bd\ua269\u8497\u64ad\u7285\u499e\ud444\u777a\u4000\u091f\u1cc0\u0040\u20a1\u0943\u2ac3\u1704\u8004\u7183\u996d\u001d\u3b43\ubad0\u1975\u6bce\ueb78\ua6cc\u2505\udbed\u0ec7\u53af\ua40d\u52bb\u0cf4\ub1c3\ua606\u0c86\u93ad\u70b8\u0f9a\u830b\u5106\ufdfe\u90a0\u5054\u1be0\u8603\u0230\uc2fc\u3d08\u8922\uc589\ua8f4\u3a33\u1591\uc824\ua9f8\ufe87\u5912\u4f41\ua409\u831a\ueae6\u9d35\uc2cd\ue64c\u8b2e\ub94b\uaf67\u9855\u306e\u6f25\u4668\ub68a\uc6fe\udb6f\uadfc\ue8d5\u69dd\ud2d7\ue676\ud031\u5544\u83f5\u348c\u640d\u5000\u8504\u6913\u84d8\uf068\u90e0\u0028\u3e37\u4a54\uf49d\u1309\u5154\ud517\u4482\u7db0\u6145\uf3c4\u332f\u5df0\ud473\u3583\u6584\u8b5c\u0f60\u384c\u32cc\ue120\uea6a\uc745\ub96d\u06c9\ub16c\udb2b\u05c0\uc5bb\u7b02\u211d\ua110\u5bc2\u1cfb\u51c4\u11a2\u2729\uc401\u9dba\u39c1\u7748\ub165\ucf23\ufcf1\u3251\u2225\u14de\u8405\udc98\u0a44\u60d3\uc53c\uc200\u2db6\u5a3e\u8c38\ucca6\u1209\uf1a8\u0f96\u97a5\u4f45\u9cf5\u64af\u4a0a\u8779\u2716\u1a21\u21af\u2616\uf7bd\u8d2b\u97f0\uc203\u202d\ua542\u2869\u0604\u2044\uc203\u3342\u3d7f\ucc8e\u74b4\u58be\u2c93\u7852\u3309\u013c\u6c1e\ue671\u4366\u1088\u81c3\u360a\u3202\u207b\u9100\ua1e2\ud2a8\u8ec0\ue00a\ua841\ub578\u9011\u364d\u0e34\uc62b\u8a12\u8097\u2bf4\u008c\ubf82\ucb06\ua849\u2898\u08a2\u222f\u2246\uf4a7\ud6fc\uc084\u8a09\u82e0\ue081\u0db4\u50bc\uab34\uca06\u9cba\u6fc3\u0542\u32d3\u4bf2\ud029\u6f4d\u352d\u4483\uf390\u5d11\u0110\u0051\u160d\u8160\ubf12\u0ca4\ubd40\u0ede\u7728\ub41a\uc38c\u3880\u8a0a\u4590\u6c2c\ua444\u4908\ufabd\ue1f8\u8480\u486e\u05ac\u713c\u123a\u0719\u3223\uf291\u59cf\u48c8\u971c\u44cb\u5d09\u4dce\u71dd\ud723\u2200\u3d26\u23c4\uf464\udc95\u17eb\ud46f\u0348\ud134\u5293\u33f1\u3174\u4c9f\u050d\uac50\uc983\u202a\uc807\u0181\u7026\u1a35\u6163\u26ae\u2084\u5850\ucc18\u862c\u15b6\u6f3a\u48bb\ubd26\ua30b\u62c1\u8a38\u4e66\u2403\u2854\u7fb2\ua7e1\u81ba\uc4c6\u7a0c\u114e\u4001\u844e\u261b\u0141\ucd76\uc163\uf984\u9460\u7746\ufc44\uab1f\u1c71\uff3e\u4f26\u09d5\u389b\u1549\ued2c\u3d25\uf4aa\u7f71\u270f\u3a58\uf064\u1666\u5805\ucd75\ucb3f\u5d2c\u8d8a\uc6a3\u365c\u1a88\u1f63\uadf0\u0204\uc1f0\u2776\u1b77\u3ec4\u6bde\u46a6\udf6c\u17f6\u7db1\ud2cd\u9371\ue9d6\u3edd\u176c\u4572\u4fe3\ub27f\u1b8e\u0cea\u769e\u7353\ud723\u3acf\uf31a\u373c\u63f3\uf39d\u122e\ud101\u3ae5\uacee\u2c35\ude40\u6b97\u6eb8\uf67b\u6f79\ub8f0\ufde1\uddbe\u9283\u845b\ubd0f\u47be\ue54a\u2707\ub15b\ue5a9\u1a2d\u2377\ubf29\uf251\u3a8f\u9397\u319a\ucf2a\u2f3c\uf59d\u112c\u4bdc\ub36b\u5380\u003c\u9800\u0414\u7859\u17b1\uce00\u02c5\u6084\u1db1\u604c\u1f7a\uef73\u44a5\ube05\u72ae\u382e\ub929\u2ec7\u15de\ub746\ua66b\udd00\u095b\u2ed0\u2836\uc260\uf0c6\uc86c\u7b27\u30a8\u0562\u98cc\u01da\uaa26\u12d8\ue06c\u8786\uf431\u87c3\u5c2b\ua8b8\u760d\ue18b\u0f00\u3b0d\u8c22\uf633\u0dd4\uff56\u85c8\u8610\ua24e\u0b0f\ucc6c\u31cb\u9c09\u13c2\u144b\u6066\u0ec7\u93e0\u1144\u9190\u2600\u616c\u8193\u98cb\u19cd\u1386\u0012\u53c1\u9be0\u7319\u01a0\u5c74\u0a73\u82e1\u104b\u8014\u1908\u3740\ua517\u3098\u914c\u231c\u4004\ue6d6\u1232\u0ae0\u1e4f\u10c0\u04f7\ue287\u9981\uc0b0\u0901\u126f\uf471\u3f10\u4020\u3545\u434f\uba47\u898a\u420b\u609b\u45b4\ue26d\ua42a\uc54c\u03cb\u0849\u5523\u32b7\u8875\u41a8\u0b66\u0228\u5a9b\u50ea\u1f0e\u5108\u210d\u8190\u34a5\ud00e\u0dc4\u400f\u10fd\uac0b\ud300\u0a35\u025f\u030f\u4045\u89c1\u7ad0\u2640\u0025\u46c1\u0550\u2727\u2a71\ud101\ubc11\u4100\ue83d\u017a\uc544\u0a14\ubd9c\u71e2\u00c0\u9aab\u2202\u2663\u4e79\ufb15\u87d9\uf116\u24f2\u2997\ub17b\u0334\ube17\u20e7\u6c88\u4d52\ud500\u8a61\u271f\u035c\u9600\u0155\u0645\u05b9\u6002\u825f\u3c0e\uc3f0\u11c9\u39dd\u0f99\ub078\u0641\ucc40\u0197\ua6fa\u8fc8\u854b\ue501\u0c33\uc7c0\u1f25\ud844\u0666\uf258\u1bd0\ufa0e\ud45a\uc11f\u9839\uc11a\ua000\ub292\uc984\ub8cb\ueed5\u982d\uce90\udd1c\ufb38\u5d06\u33cf\u1da3\u58c5\u3122\ub2e3\u47f1\u5a8a\u87d8\udbd0\udb96\u1202\u205e\u274b\u1ab0\u0983\u0a64\u07fd\u4388\ub2fa\u4522\u864a\ue959\ud229\ub4e7\u884e\uc305\u6408\u0b4b\u35b8\ua734\u74a1\ua99c\ub48d\u3330\u2605\ud014\u1da3\u34fa\uaf15\ufe44\u0276\u8d91\u5860\u1410\u425d\u5ba8\ua000\u0e44\u56fa\uff58\u91dd\u83f3\u9406\u1252\u64ca\u4c5d\uca1a\u404d\u49bc\ufbc3\u2493\uaa33\u7386\ua67c\u9ce1\udb08\u4891\u101e\u01b0\u6082\u10e6\ub181\u318b\u7743\u2db8\u02b5\u3808\u4491\uf028\u8180\u81bc\ue7e0\u000e\ua820\u0c22\u6d40\u0529\ue690\u1761\u09ec\ua58f\u3564\u0066\ub542\ud6b1\u9d88\uaa95\uc806\u0278\u2f2e\ua4c6\ub587\ude0b\ua120\uc023\u9500\u281c\u4300\u2bbe\ud9c5\u2601\u0b26\ub0e9\u56e0\u9c34\ue843\u8acb\ue813\u4f06\ue083\udb92\u9149\ubb25\u7ca4\u4068\u45c1\uc97c\u0f40\u9b30\uc960\uad5c\uf1a4\u6602\uc163\u27ac\u7db2\u1b16\uc538\u6270\ue05d\u1678\u6354\u0f81\ub60a\uada0\ufac1\u05c8\u13a1\uea9f\u41e0\u20ea\ub285\u7f06\ua4df\u10e9\u7aa0\uf3c2\u0a45\u4200\ud81d\u900c\u02ab\u761c\u05a6\ub490\u261a\ud458\u3b40\u5994\u1902\ue2d9\u9260\u1207\ub381\ufdb1\u74c0\u510e\u0531\u8785\u65f2\u9cb6\ue038\u047b\ubca5\uf721\uc492\u4d80\u6937\u01bc\u47c6\ud818\u29c3\u29d5\u3acb\uf01a\u05c3\u200e\u0062\u830e\uea10\u3698\u80ed\u4c0c\uac12\u09c1\ue832\u9cfd\u9285\u82fa\u934b\u2058\u1b64\u2922\u05da\u5f72\u09fb\u1e54\u93c0\ufe78\u6880\u1b07\u03da\u2f6e\uc0fd\uae36\u6733\u5b55\ubd6d\u830b\u116a\u2e7d\u164e\u718a\ua8a4\u5120\u0003\ub07c\u0305\u3098\u04ea\u1087\u1983\ua865\u8400" },
                        ],
                    },
                ],
            },
        });
        const page1 = await context.newPage();
        await loadAndWaitForEditor(page1);
        // This is the content I used to make the above Unicode escaped version:
        // The snapshot predates the current default project's imports, so it has one fewer frame
        // than DEFAULT_STARTING_FRAME_COUNT + 1 would now assume:
        await assertStartingPlus(page1, "Saved state from previous storage model", 3);

        const page2 = await context.newPage();
        await loadAndWaitForEditor(page2);
        await assertStartingProject(page2);
    });
});

test.describe("Test IndexedDB failure", () => {
    test("Failure message when IndexedDB won't open", async ({page, browserName}) => {
        if (browserName === "webkit") {
            // Webkit doesn't allow stubbing out the indexedDB.open call, so can't test on that:
            return;
        }
        await page.addInitScript(() => {
            indexedDB.open = () => {
                throw new DOMException(
                    "Simulated failure",
                    "InvalidStateError"
                );
            };
        });
        await loadAndWaitForEditor(page);
        // Now should show error:
        const scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
        await expect(page.locator("." + scssVars.messageBannerContainerClassName)).toBeVisible();
        await expect(page.locator("." + scssVars.messageBannerContainerClassName)).toContainText("Simulated failure");
    });
});

function closePage(page: Page, browserName: string) : Promise<any> {
    if (browserName === "webkit" || browserName === "firefox") {
        // Webkit doesn't seem to obey .close() properly but we get the same behaviour
        // of unloading the page if we just navigate elsewhere, so do that:
        // (8089 is our test assets server, so we know it exists and isn't the editor...)
        return page.goto("http://localhost:8089/");
    }
    else {
        return page.close({runBeforeUnload: true});
    }
}

async function assertRecentStatesShowing(page: Page, expectedProjectNames: RegExp[]) {
    const scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
    await expect(page.locator("." + scssVars.projectRecentStateLabel)).toHaveText(expectedProjectNames);
}

// The "recent unsaved projects" pane is hidden by default in the load dialog; Ctrl+U reveals it.
// The shortcut is only armed once the dialog has fully finished its "shown" transition (a Bootstrap
// event that fires a little after the dialog becomes visible to Playwright), so a single press right
// after opening the dialog can race that transition. Presses before the dialog is armed are harmless
// no-ops, so we just retry the press until the pane shows up:
async function revealRecentUnsavedPane(page: Page) : Promise<void> {
    const scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
    await expect(async () => {
        await page.keyboard.press("ControlOrMeta+u");
        await expect(page.locator("." + scssVars.projectRecentStateLabel).first()).toBeVisible({timeout: 300});
    }).toPass({timeout: 5000});
}

async function assertOpenRecentMenu(page: Page, expectedProjectNames: RegExp[]) : Promise<void> {
    await page.click("#" + await strypeElIds(page).getEditorMenuUID());
    await page.click("#" + await strypeElIds(page).getLoadProjectLinkId());
    if (expectedProjectNames.length > 0) {
        await revealRecentUnsavedPane(page);
    }
    await assertRecentStatesShowing(page, expectedProjectNames);
}

// A banner should show to offer to load unsaved backups if the backups are recent and modified after external save:
test.describe("Offer to reload unsaved backups", () => {
    // Two tests here; one clicks load, one clicks cancel:
    for (let clickButton of ["Load", "Cancel"]) {
        test(`Offer to load recent never-saved project from another page object and clicks ${clickButton}`, async ({browser, browserName}) => {
            const context = await browser.newContext({recordVideo: {dir: "tests/playwright/test-results/videos/"}});
            const page1 = await context.newPage();
            console.log("Page1 video: " + await page1.video()?.path());            
            page1.on("console", (msg) => console.log("Browser log page 1:", msg.text()));
            
            await loadAndWaitForEditor(page1);
            // Modify it and close it:
            const str = "Modifying fresh project ahead of closing #1";
            await appendContent(page1, str);
            const page1TabId = await getTabId(page1);
            await closePage(page1, browserName);
            // Wait for page1's close-time save to actually land in storage, rather than guessing
            // a fixed delay:
            await waitForTabStateSaved(context, page1TabId);

            // Load a new page in the same context (so it shares the storage):
            const page2 = await context.newPage();
            console.log("Page2 video: " + await page2.video()?.path());
            page2.on("console", (msg) => console.log("Browser log page 2:", msg.text()));
            await loadAndWaitForEditor(page2);
            // At this point, it should have the fresh state, but be showing the banner about loading old state:
            await assertStartingProject(page2);
            const scssVars = await page2.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
            await expect(page2.locator("." + scssVars.messageBannerContainerClassName)).toBeVisible();
            await expect(page2.locator("." + scssVars.messageBannerContainerClassName)).toContainText("load it?");
            
            // Click the button:
            await page2.locator("button", {hasText: clickButton}).filter({ visible: true }).click();
            // Banner should be gone either way:
            await expect(page2.locator("." + scssVars.messageBannerContainerClassName)).not.toBeVisible();
            // Check state:
            if (clickButton === "Cancel") {
                await assertStartingProject(page2);
            }
            else {
                await assertStartingPlus(page2, str);
            }
        });
    }

    // Reported from memory as possibly broken: modify a never-saved project, close the tab
    // without saving, open a new tab, and go straight to Open Recent (ignoring the auto-shown
    // banner entirely) -- does the closed project show up? There's no code-level time limit on
    // Open Recent that would exclude a just-closed session (unlike the banner, which does have a
    // 2-minute-in-production freshness window -- see checkForRecentSaveStates()'s recentAliveMinutes),
    // so this should pass; this test exists to catch it if that's wrong, or if it's actually a
    // migration-timing race (the closed tab's state only gets copied from its emergency
    // localStorage save into IndexedDB -- which is what Open Recent reads -- during the *next*
    // tab's own startup):
    test("A closed, modified-but-unsaved project appears in Open Recent from the very next new tab", async ({browser, browserName}) => {
        const context = await browser.newContext();
        const page1 = await context.newPage();
        await loadAndWaitForEditor(page1);
        const str = "Modifying a project ahead of closing without saving, no explicit save at all";
        await appendContent(page1, str);
        const page1TabId = await getTabId(page1);
        await closePage(page1, browserName);
        await waitForTabStateSaved(context, page1TabId);

        const page2 = await context.newPage();
        await loadAndWaitForEditor(page2);
        // Deliberately don't touch the auto-shown banner -- go straight to Open Recent:
        await assertOpenRecentMenu(page2, [/^My project \(/]);
    });

    // Regression test: "New Project" used to force isEditorContentModified false purely to
    // suppress the native "Leave page?" dialog, but that same flag also fed
    // modifiedSinceExternalSave in the close-time save, wrongly marking the abandoned project as
    // "already saved externally" and permanently hiding it from Open Recent (see App.vue's
    // onHideModalDlg -- the comment right above that line already said "the old state is actually
    // retained if they want to get back to it", which this bug quietly defeated):
    test("Starting a New Project (discarding changes) keeps the abandoned project recoverable in Open Recent", async ({page}) => {
        await loadAndWaitForEditor(page);
        const str = "Modifying before starting a new project";
        await appendContent(page, str);

        await page.click("#" + await strypeElIds(page).getEditorMenuUID());
        await page.click("#" + await strypeElIds(page).getNewProjectLinkId());
        // Confirm discarding unsaved changes:
        await page.locator("*[id='confirmNewProjectModalDlg'] button", {hasText: "Continue"}).click();

        // Should now be back to the fresh default project:
        await waitForNewProjectReload(page);
        await assertStartingProject(page);

        // The abandoned, unsaved project should still be recoverable:
        await assertOpenRecentMenu(page, [/^My project \(/]);
    });

    // Regression test for the Ctrl+U secret-shortcut behaviour: the recent-unsaved-projects pane
    // (and its divider) must be hidden by default, only appear once Ctrl+U is pressed, toggle off
    // again on a second press, and reset back to hidden the next time the dialog is opened:
    test("The recent unsaved projects pane is hidden until Ctrl+U is pressed", async ({page}) => {
        await loadAndWaitForEditor(page);
        const str = "Modifying before starting a new project";
        await appendContent(page, str);

        await page.click("#" + await strypeElIds(page).getEditorMenuUID());
        await page.click("#" + await strypeElIds(page).getNewProjectLinkId());
        await page.locator("*[id='confirmNewProjectModalDlg'] button", {hasText: "Continue"}).click();
        await waitForNewProjectReload(page);
        await assertStartingProject(page);

        // Open the load dialog directly (not via assertOpenRecentMenu, which presses Ctrl+U itself):
        await page.click("#" + await strypeElIds(page).getEditorMenuUID());
        await page.click("#" + await strypeElIds(page).getLoadProjectLinkId());
        await page.locator("#load-strype-project-modal-dlg").waitFor({state: "visible"});
        const scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
        const recentPane = page.locator("." + scssVars.projectRecentStateLabel);

        // Hidden by default, even though there is a recent unsaved project to show:
        await expect(recentPane).not.toBeVisible();

        // Ctrl+U reveals it:
        await revealRecentUnsavedPane(page);
        await assertRecentStatesShowing(page, [/^My project \(/]);

        // Pressing it again hides it:
        await page.keyboard.press("ControlOrMeta+u");
        await expect(recentPane).not.toBeVisible();

        // Reveal it once more, then close and reopen the dialog -- it should reset to hidden:
        await page.keyboard.press("ControlOrMeta+u");
        await assertRecentStatesShowing(page, [/^My project \(/]);
        await page.locator("#load-strype-project-modal-dlg .btn-close").click();
        await page.click("#" + await strypeElIds(page).getEditorMenuUID());
        await page.click("#" + await strypeElIds(page).getLoadProjectLinkId());
        await expect(recentPane).not.toBeVisible();
    });

    // Regression test: discarding changes via the "save changes before loading?" dialog (shown
    // when opening a different project, a demo, or a book chapter while the current one is
    // modified) used to never back up the outgoing project at all -- unlike the "Save changes"
    // path, the "Discard changes" path went straight to loading the new content with no call to
    // persist so much as the internal webstorage recovery copy, so unless a periodic autosave had
    // happened to land beforehand by chance, the discarded project was simply gone with no way
    // back (see backupEditorProjectBeforeDiscard in App.vue/Menu.vue):
    test("Discarding changes via the Open dialog keeps the previous project recoverable in Open Recent", async ({page}) => {
        await loadAndWaitForEditor(page);
        const str = "Modifying before discarding via the Open dialog";
        await appendContent(page, str);

        // Open "Load Project" while content is modified -- triggers the save-or-discard dialog:
        await page.click("#" + await strypeElIds(page).getEditorMenuUID());
        await page.click("#" + await strypeElIds(page).getLoadProjectLinkId());
        await page.locator("button", {hasText: "Discard changes"}).filter({visible: true}).click();

        // This re-shows the actual "choose where to load from" dialog; we've already confirmed the
        // discard itself, so back out of it without picking anything. We use the dialog's own
        // close button rather than Escape: Escape only works once bootstrap-vue-next's document-level
        // keydown listener for this dialog instance has attached, which isn't guaranteed to have
        // happened yet at this point (the dialog was just re-shown synchronously off the back of the
        // previous one's "hidden" event) -- this was intermittently leaving the dialog stuck open and
        // blocking every subsequent click, hanging the test on CI. A real click on the close button
        // has no such race: Playwright's click already waits for the button to be actionable.
        await page.locator("#load-strype-project-modal-dlg .btn-close").click();

        // We backed out without loading anything, so our own project is still exactly as modified
        // as it was before -- openLoadProjectModal() checks isEditorContentModified on every call,
        // so clicking "Load Project" again shows the save-or-discard dialog once more, not the
        // target-picker dialog directly (unlike assertOpenRecentMenu's usual case of a fresh,
        // unmodified page). Discarding again is harmless: it just re-backs-up the same content
        // under the same tabId:
        await page.click("#" + await strypeElIds(page).getEditorMenuUID());
        await page.click("#" + await strypeElIds(page).getLoadProjectLinkId());
        await page.locator("button", {hasText: "Discard changes"}).filter({visible: true}).click();

        // The discarded project should still be recoverable. This dialog was opened directly rather
        // than via assertOpenRecentMenu(), so we need to reveal the recent-unsaved-projects pane ourselves:
        await revealRecentUnsavedPane(page);
        await assertRecentStatesShowing(page, [/^My project \(/]);
    });

    // Regression test for the bug where declining the banner (via Cancel or the cross icon)
    // never marked the state as "decided", so a further new tab opened shortly after would be
    // offered the exact same state again (see markUserDecisionOnReloading() in MessageBanner.vue):
    test("Cancelling the banner does not offer the same state again to a subsequently opened tab", async ({browser, browserName}) => {
        const context = await browser.newContext({recordVideo: {dir: "tests/playwright/test-results/videos/"}});
        const page1 = await context.newPage();
        page1.on("console", (msg) => console.log("Browser log page 1:", msg.text()));

        await loadAndWaitForEditor(page1);
        const str = "Modifying fresh project ahead of closing #2";
        await appendContent(page1, str);
        const page1TabId = await getTabId(page1);
        await closePage(page1, browserName);
        await waitForTabStateSaved(context, page1TabId);

        const page2 = await context.newPage();
        page2.on("console", (msg) => console.log("Browser log page 2:", msg.text()));
        await loadAndWaitForEditor(page2);
        await assertStartingProject(page2);
        const scssVars = await page2.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
        await expect(page2.locator("." + scssVars.messageBannerContainerClassName)).toBeVisible();
        // Decline the offer:
        await page2.locator("button", {hasText: "Cancel"}).filter({ visible: true }).click();
        await expect(page2.locator("." + scssVars.messageBannerContainerClassName)).not.toBeVisible();

        // A further new tab, opened shortly after, should NOT be offered the same state again:
        const page3 = await context.newPage();
        page3.on("console", (msg) => console.log("Browser log page 3:", msg.text()));
        await loadAndWaitForEditor(page3);
        await assertStartingProject(page3);
        await expect(page3.locator("." + scssVars.messageBannerContainerClassName)).not.toBeVisible();
    });

    // We load four pages in a row:
    // - State 1: modified, not saved, closed
    // - State 2: modified, saved or not depending on a flag, closed (should be offered 1 on initial load)
    // - State 3: modified, still open (should also be offered 1 or 2 on initial load)
    // - State 4: check for loading; we should be offered state 1 or 2 depending on whether 2 was saved
    // - State 5: should not be offered anything
    for (let state2Saved of [true, false]) {
        test(`Load several states, save some (2nd: ${state2Saved}), then load new one`, async ({browser, browserName}) => {
            const context = await browser.newContext({recordVideo: {dir: "tests/playwright/test-results/videos/"}});
            const page1 = await context.newPage();
            console.log("Page1 video: " + await page1.video()?.path());
            page1.on("console", (msg) => console.log("Browser log page 1:", msg.text()));

            await loadAndWaitForEditor(page1);
            await save(page1, true, "Project 1");
            const scssVars = await page1.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
            // Modify it and close it:
            const str1 = "Modifying state #1 ahead of closing";
            await appendContent(page1, str1);
            const page1TabId = await getTabId(page1);
            await closePage(page1, browserName);
            // Wait for page1's close-time save to actually land in storage, rather than guessing
            // a fixed delay:
            await waitForTabStateSaved(context, page1TabId);

            // Load a new page in the same context (so it shares the storage):
            const page2 = await context.newPage();
            console.log("Page2 video: " + await page2.video()?.path());
            page2.on("console", (msg) => console.log("Browser log page 2:", msg.text()));
            await loadAndWaitForEditor(page2);
            // At this point, it should have the fresh state, but be showing the banner about loading old state:
            await assertStartingProject(page2);
            await expect(page2.locator("." + scssVars.messageBannerContainerClassName)).toBeVisible();
            await expect(page2.locator("." + scssVars.messageBannerContainerClassName)).toContainText("load it?");
            await save(page2, true, "Project 2");

            // Now we modify, optionally save, and close:
            const str2 = "Modifying state #2 ahead of closing";
            await appendContent(page2, str2);
            if (state2Saved) {
                await save(page2, false);
            }
            const page2TabId = await getTabId(page2);
            await closePage(page2, browserName);
            // Wait for page2's close-time save to actually land in storage, rather than guessing
            // a fixed delay:
            await waitForTabStateSaved(context, page2TabId);

            // Load a new page in the same context (so it shares the storage):
            const page3 = await context.newPage();
            console.log("Page3 video: " + await page3.video()?.path());
            page3.on("console", (msg) => console.log("Browser log page 3:", msg.text()));
            await loadAndWaitForEditor(page3);
            // At this point, it should have the fresh state, but be showing the banner about loading old state:
            await assertStartingProject(page3);
            await expect(page3.locator("." + scssVars.messageBannerContainerClassName)).toBeVisible();
            await expect(page3.locator("." + scssVars.messageBannerContainerClassName)).toContainText("load it?");
            await save(page3, true, "Project 3");

            // Now we modify, but don't close:
            const str3 = "Modifying state #3 but will keep open";
            await appendContent(page3, str3);
            
            // Now page 4:

            // Load a new page in the same context (so it shares the storage):
            const page4 = await context.newPage();
            console.log("Page4 video: " + await page4.video()?.path());
            page4.on("console", (msg) => console.log("Browser log page 4:", msg.text()));
            await loadAndWaitForEditor(page4);
            // At this point, it should have the fresh state, but be showing the banner about loading old state:
            await assertStartingProject(page4);
            await expect(page4.locator("." + scssVars.messageBannerContainerClassName)).toBeVisible();
            await expect(page4.locator("." + scssVars.messageBannerContainerClassName)).toContainText("load it?");
          
            // Click the button:
            await page4.locator("button", {hasText: "Load"}).filter({ visible: true }).click();
            // Banner should be gone either way:
            await expect(page4.locator("." + scssVars.messageBannerContainerClassName)).not.toBeVisible();
            // Check state -- session 2 if we *didn't* save it, otherwise session 1:
            await assertStartingPlus(page4, !state2Saved ? str2 : str1);

            const page5 = await context.newPage();
            console.log("Page5 video: " + await page5.video()?.path());
            page5.on("console", (msg) => console.log("Browser log page 5:", msg.text()));
            await loadAndWaitForEditor(page5);
            // At this point, it should have the fresh state, and not be showing the banner about loading old state:
            await assertStartingProject(page5);
            await expect(page5.locator("." + scssVars.messageBannerContainerClassName)).not.toBeVisible();
            // Check which projects are showing -- should not show 3 as still open, so only 1 and 2 depending on save status:
            await assertOpenRecentMenu(page5, state2Saved ? [/^Project 1 /] : [/^Project 2 /, /^Project 1 /]);
            
            // Clear all the states:
            await page5.locator("span", {hasText: "Clear all"}).click();
            // Check this dialog is now empty (assertRecentStatesShowing's own assertion retries):
            await assertRecentStatesShowing(page5, []);
            
            // Also check on a new page:
            const page6 = await context.newPage();
            await loadAndWaitForEditor(page6);
            await assertOpenRecentMenu(page6, []);
        });
        
        test(`Load two states, optionally save 2nd (${state2Saved}) then use new project, should be no banner`, async ({browser, browserName}) => {
            const context = await browser.newContext({recordVideo: {dir: "tests/playwright/test-results/videos/"}});
            const page1 = await context.newPage();
            console.log("Page1 video: " + await page1.video()?.path());
            page1.on("console", (msg) => console.log("Browser log page 1:", msg.text()));

            await loadAndWaitForEditor(page1);
            await save(page1, true, "Project 1");
            const scssVars = await page1.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
            // Modify it and close it:
            const str1 = "Modifying state #1 ahead of closing";
            await appendContent(page1, str1);
            const page1TabId = await getTabId(page1);
            await closePage(page1, browserName);
            // Wait for page1's close-time save to actually land in storage, rather than guessing
            // a fixed delay:
            await waitForTabStateSaved(context, page1TabId);

            // Load a new page in the same context (so it shares the storage):
            const page2 = await context.newPage();
            console.log("Page2 video: " + await page2.video()?.path());
            page2.on("console", (msg) => console.log("Browser log page 2:", msg.text()));
            await loadAndWaitForEditor(page2);
            // At this point, it should have the fresh state, but be showing the banner about loading old state:
            await assertStartingProject(page2);
            await expect(page2.locator("." + scssVars.messageBannerContainerClassName)).toBeVisible();
            await expect(page2.locator("." + scssVars.messageBannerContainerClassName)).toContainText("load it?");
            await save(page2, true, "Project 2");

            // Now we modify, and optionally save:
            const str2 = "Modifying state #2 ahead of closing";
            await appendContent(page2, str2);
            if (state2Saved) {
                await save(page2, false);
            }

            // We don't close the page, we use the new project from the menu
            await page2.locator("#" + await strypeElIds(page2).getEditorMenuUID()).click();
            await page2.locator("#" + await strypeElIds(page2).getNewProjectLinkId()).click();
            if (!state2Saved) {
                // Need to click the confirmation dialog to go despite unsaved changes:
                await page2.locator("*[id='confirmNewProjectModalDlg'] button", {hasText: "Continue"}).click();
            }

            // "New project" reloads the browser with a forceNewProject flag, which makes
            // loadLocalStorageProjectOnStart() skip the recent-state banner check entirely (see
            // App.vue) -- so once the fresh default project has actually finished loading, the
            // absence of a banner is structurally guaranteed, not just "probably settled by now".
            // Waiting for the default project confirms the reload/restart has completed.
            await waitForNewProjectReload(page2);
            await assertStartingProject(page2);

            // Now we check there's no banner:
            await expect(page2.locator("." + scssVars.messageBannerContainerClassName)).not.toBeVisible();
        });
    }
});

// This targets a branch of checkForRecentSaveStates() that the tests above never exercise: for
// the "load_menu" reason, a tab counts as stale (and so gets offered) once its lastAliveAt is
// older than autoSaveFreqMins * 2, even if it's never been marked closed (stillAlive == "maybe").
// Waiting 4 real minutes for that would be impractical, so instead we seed IndexedDB rows
// directly with a controlled lastAliveAt, to test the read-side logic deterministically and fast.
test.describe("Open Recent menu treats a long-idle-but-still-open tab as stale", () => {
    test("Recent menu offers a tab whose lastAliveAt is older than 2x the autosave interval, even though it was never marked closed", async ({page}) => {
        await loadAndWaitForEditor(page);

        const now = Date.now();
        const staleAgeMs = (AUTO_SAVE_FREQ_MINS * 2 + 1) * 60 * 1000; // just past the load_menu staleness threshold
        const freshAgeMs = 30 * 1000; // well within the threshold

        // Neither row is marked closed ("maybe" alive) -- only their lastAliveAt differs:
        await seedStoredSessionRecord(page, {
            tabId: "test-stale-tab",
            data: "seed-data-stale",
            projectName: "StaleIdleProject",
            lastModifiedAt: now - staleAgeMs,
            lastAliveAt: now - staleAgeMs,
            stillAlive: "maybe",
            modifiedSinceExternalSave: "true",
            userDecidedOnReloading: "false",
        });
        await seedStoredSessionRecord(page, {
            tabId: "test-fresh-tab",
            data: "seed-data-fresh",
            projectName: "FreshIdleProject",
            lastModifiedAt: now - freshAgeMs,
            lastAliveAt: now - freshAgeMs,
            stillAlive: "maybe",
            modifiedSinceExternalSave: "true",
            userDecidedOnReloading: "false",
        });

        // Only the stale one should be offered; the fresh one (still within the threshold) should not:
        await assertOpenRecentMenu(page, [/^StaleIdleProject /]);
    });
});

async function assertNoDialog(page: Page, browserName: string) {
    let dialogShown = false;

    page.on("dialog", () => {
        dialogShown = true;
    });

    await closePage(page, browserName);

    expect(dialogShown).toBe(false);
}

async function assertDialog(page: Page, browserName: string) {
    const dialogPromise = page.waitForEvent("dialog");

    const navPromise = closePage(page, browserName);

    const dialog = await dialogPromise;
    expect(dialog.type()).toBe("beforeunload");

    await dialog.accept();
    
    await navPromise;
}

test.describe("Check the beforeunload dialog", () => {
    test("Check dialog doesn't show on fresh project", async ({page, browserName}) => {
        await loadAndWaitForEditor(page);
        await assertNoDialog(page, browserName);
    });
    test("Check dialog does show on modified project", async ({page, browserName}) => {
        await loadAndWaitForEditor(page);
        await appendContent(page, "Checking dialog after modification");
        await assertDialog(page, browserName);
    });
});
