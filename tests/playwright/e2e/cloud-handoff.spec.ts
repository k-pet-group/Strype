// Tests of the hand-over of a Cloud Drive connection to a new Strype tab opened by Strype (see src/helpers/cloudHandoff.ts).
// The hand-over can't be tested up to the opening of a real Cloud Drive file (that needs a real connection), so these test
// the parts that don't need one:
// - in the browser: the protocol between the two tabs (including the checks that keep the credentials from any other window),
//   and what the new tab does with what it gets (or doesn't get). The tab opening the new one is never connected to a Cloud
//   Drive here, so it only gives the file to open, without credentials: the new tab then asks the user to connect;
// - in Node (like git-provider-helpers.spec.ts): what the Git providers give and accept as credentials.

import { BrowserContext, Page, expect, test } from "@playwright/test";
import en from "../../../src/localisation/en/en_main.json";
import { DEFAULT_STARTING_FRAME_COUNT } from "../support/general";
import { BASE_URL } from "../../../playwright.config";
import { WINDOW_STRYPE_CLOUDHANDOFF_PROPNAME } from "@/helpers/sharedIdCssWithTests";
import { fromGitHubHandoffAuth, fromGitLabHandoffAuth, toGitHubHandoffAuth, toGitLabHandoffAuth } from "@/helpers/gitHandoffAuth";

const STRYPE_ORIGIN = new URL(BASE_URL).origin;

// These mirror values of the app (src/helpers/cloudHandoff.ts, src/helpers/editor.ts and App.vue), duplicated here
// because those modules pull in Vue and the rest of the app, which can't be loaded from Playwright's Node-side test runner.
const TAB_ID_SESSION_KEY = "StrypeEditorTabId";
const HANDOFF_QUERY_KEY = "cloud_handoff";
const READY_MESSAGE_TYPE = "strype-cloud-handoff-ready";
const HANDOFF_MESSAGE_TYPE = "strype-cloud-handoff";
const SIMPLE_MSG_DLG_ID = "appSimpleMsgModalDlg";
const SIGN_IN_DLG_ID = "cloudHandoffSignInModalDlg";
const GOOGLE_DRIVE_TARGET = 2; // StrypeSyncTarget.gd
// The new tab waits that long for its opener's answer (HANDOFF_REPLY_TIMEOUT_MS) before telling the user it got nothing
const HANDOFF_REPLY_TIMEOUT_MS = 20_000;
// How long we let Strype load in a tab: it can be long with several test workers (notably in Firefox, for a new tab)
const STRYPE_LOAD_TIMEOUT_MS = 45_000;

interface HandoffFile {target: number, fileId: string, fileName: string, folderId: string}

test.describe("Opening a Cloud Drive file in a new tab", () => {
    test.beforeEach(async ({context, browserName}, testInfo) => {
        if (browserName === "webkit" && process.platform === "win32") {
            testInfo.skip(true, "Skipping on Windows + WebKit due to unknown problems");
        }
        // The tests load Strype in two tabs, and several wait for the new tab to give up waiting for its opener's answer
        testInfo.setTimeout(2 * STRYPE_LOAD_TIMEOUT_MS + HANDOFF_REPLY_TIMEOUT_MS + 30_000);
        // On the context (not a page), so it also applies to the tabs Strype opens. This is what setupStrypeTest() does for
        // a page, except that the flag skipping Pyodide must survive the new tab clearing the session storage it got from its
        // opener (see takeCloudHandoffRequestFromURL()): Pyodide isn't needed here, and loading it in each tab is slow.
        await context.addInitScript(() => {
            (window as any).Playwright = true;
            sessionStorage.setItem("TestingNoPyodide", "true");
            const originalClear = Storage.prototype.clear;
            Storage.prototype.clear = function (this: Storage) {
                const noPyodide = this.getItem("TestingNoPyodide");
                originalClear.call(this);
                if (noPyodide != null) {
                    this.setItem("TestingNoPyodide", noPyodide);
                }
            };
        });
        context.on("console", (msg) => console.log("Browser log:", msg.text()));
    });

    test("A tab opened with a nonce its opener doesn't know gets its own tab ID, and a new project", async ({context}) => {
        const opener = await openStrype(context);
        const [newTab] = await Promise.all([
            context.waitForEvent("page"),
            opener.evaluate((key) => {
                window.open(`${location.pathname}?${key}=nonceNobodyGaveOut`, "_blank");
            }, HANDOFF_QUERY_KEY),
        ]);
        // (a background tab may load much more slowly)
        await newTab.bringToFront();

        // (the opener doesn't answer: the new tab tells the user when it stops waiting)
        await expect(newTab.locator(`#${SIMPLE_MSG_DLG_ID}-body`)).toContainText(en.errorMessage.cloudHandoffFailed, {timeout: STRYPE_LOAD_TIMEOUT_MS + HANDOFF_REPLY_TIMEOUT_MS});
        expect(new URL(newTab.url()).search, "the nonce is removed from the URL").toBe("");
        // The browser copies the opener's session storage to the new tab: it must not keep the opener's tab ID (it would share its autosave)
        const newTabId = await getTabId(newTab);
        expect(newTabId).not.toBe(await getTabId(opener));

        await newTab.locator(`#${SIMPLE_MSG_DLG_ID}`).getByRole("button", {name: en.buttonLabel.ok, exact: true}).click();
        await waitForStarterProject(newTab);
        expect(await getTabId(newTab), "the new project is in the new tab's own autosave").toBe(newTabId);
    });

    test("A URL with a nonce in a tab Strype didn't open starts Strype as usual", async ({context}) => {
        const page = await context.newPage();
        await page.goto(`./?${HANDOFF_QUERY_KEY}=pastedNonce`);
        await waitForStarterProject(page);
        expect(new URL(page.url()).search, "the nonce is removed from the URL").toBe("");
        await expect(page.locator(`#${SIMPLE_MSG_DLG_ID}`)).toBeHidden();
        await expect(page.locator(`#${SIGN_IN_DLG_ID}`)).toBeHidden();
    });

    test("The new tab gets the file to open, and asks to connect when it gets no credentials", async ({context}) => {
        const opener = await openStrype(context);
        const {newTab, nonce} = await startHeldHandoff(context, opener, {target: GOOGLE_DRIVE_TARGET, fileId: "someFileId", fileName: "<b>not bold</b>.spy", folderId: "someFolderId"});
        // Messages with a wrong nonce are ignored (they don't use up the right one):
        const otherWindow = await openOtherWindow(context, opener);
        await sendReadyMessage(otherWindow, nonce + "x");
        await expect.poll(() => countReadyMessages(opener)).toBe(1);
        await releaseHeldHandoff(opener, newTab);

        const signInDlg = newTab.locator(`#${SIGN_IN_DLG_ID}`);
        await expect(signInDlg).toBeVisible({timeout: STRYPE_LOAD_TIMEOUT_MS});
        // The file name is shown as text, not HTML
        await expect(signInDlg).toContainText("To open <b>not bold</b>.spy, Strype needs to connect to Google Drive in this tab.");
        await expect(signInDlg.locator("b", {hasText: "not bold"})).toHaveCount(0);
        expect(await newTab.evaluate(() => window.opener === null), "the new tab cuts its link to its opener").toBe(true);
        expect(await getTabId(newTab)).not.toBe(await getTabId(opener));
        expect(await getReceivedHandoffMessages(otherWindow), "the other window got nothing").toBe(0);

        await signInDlg.getByRole("button", {name: en.buttonLabel.noContinueWithout, exact: true}).click();
        await waitForStarterProject(newTab);
    });

    test("A nonce used by another window than the one it was given to is refused, and can't be used anymore", async ({context}) => {
        const opener = await openStrype(context);
        const {newTab, nonce} = await startHeldHandoff(context, opener, {target: GOOGLE_DRIVE_TARGET, fileId: "someFileId", fileName: "project.spy", folderId: "someFolderId"});
        // Another window of Strype's origin, opened by the same tab, uses the nonce first:
        const otherWindow = await openOtherWindow(context, opener);
        await sendReadyMessage(otherWindow, nonce);
        // (it did reach the opener, from Strype's origin: if it's refused, it's because of the window it came from)
        await expect.poll(() => countReadyMessages(opener)).toBe(1);
        await releaseHeldHandoff(opener, newTab);

        // The nonce is used up: the tab it was given to gets nothing either
        await expect(newTab.locator(`#${SIMPLE_MSG_DLG_ID}-body`)).toContainText(en.errorMessage.cloudHandoffFailed, {timeout: STRYPE_LOAD_TIMEOUT_MS + HANDOFF_REPLY_TIMEOUT_MS});
        await expect(newTab.locator(`#${SIGN_IN_DLG_ID}`)).toBeHidden();
        expect(await getReceivedHandoffMessages(otherWindow), "the other window got nothing").toBe(0);
    });
});

test.describe("Credentials of the Git providers for a new tab", () => {
    // (these don't need a page: they test pure helpers, see git-provider-helpers.spec.ts)
    const gitLabCom = {url: "https://gitlab.com", clientId: "someClientId"};

    test("don't include the refresh tokens", () => {
        expect(toGitHubHandoffAuth({accessToken: "ghu_access", expiresAt: 1234, refreshToken: "ghr_refresh", refreshTokenExpiresAt: 5678}))
            .toEqual({accessToken: "ghu_access", expiresAt: 1234});
        expect(toGitLabHandoffAuth({instance: gitLabCom, accessToken: "glpat_access", expiresAt: 1234, refreshToken: "gl_refresh"}))
            .toEqual({instance: gitLabCom, accessToken: "glpat_access", expiresAt: 1234});
    });

    test("are accepted back as they were given", () => {
        const gitHubAuth = toGitHubHandoffAuth({accessToken: "ghu_access", expiresAt: 1234, refreshToken: "ghr_refresh"});
        expect(fromGitHubHandoffAuth(gitHubAuth)).toEqual(gitHubAuth);
        // (GitHub tokens may not expire, depending on the GitHub App's settings)
        expect(fromGitHubHandoffAuth({accessToken: "ghu_access"})).toEqual({accessToken: "ghu_access", expiresAt: undefined});
        const gitLabAuth = toGitLabHandoffAuth({instance: gitLabCom, accessToken: "glpat_access", expiresAt: 1234, refreshToken: "gl_refresh"});
        expect(fromGitLabHandoffAuth(gitLabAuth)).toEqual(gitLabAuth);
        // A local GitLab server may be on plain HTTP, as when the user types it
        expect(fromGitLabHandoffAuth({instance: {url: "http://localhost:8929", clientId: "id"}, accessToken: "a"})?.instance.url).toBe("http://localhost:8929");
    });

    test("are refused when they aren't valid", () => {
        for (const invalid of [null, undefined, "ghu_access", {}, {accessToken: ""}, {accessToken: 12}, {accessToken: "a", expiresAt: "soon"}]) {
            expect(fromGitHubHandoffAuth(invalid), JSON.stringify(invalid)).toBeNull();
        }
        for (const invalid of [
            null,
            {accessToken: "a"},
            {instance: gitLabCom, accessToken: ""},
            {instance: gitLabCom, accessToken: "a", expiresAt: "soon"},
            {instance: {url: "https://gitlab.com"}, accessToken: "a"},
            {instance: {url: "https://gitlab.com", clientId: " "}, accessToken: "a"},
            // The token is sent to the instance: it must be on HTTPS (except a local server), as when the user types it
            {instance: {url: "http://gitlab.example.org", clientId: "id"}, accessToken: "a"},
            {instance: {url: "javascript:alert(1)", clientId: "id"}, accessToken: "a"},
            {instance: {url: "https://user:password@gitlab.example.org", clientId: "id"}, accessToken: "a"},
        ]) {
            expect(fromGitLabHandoffAuth(invalid), JSON.stringify(invalid)).toBeNull();
        }
    });
});

async function openStrype(context: BrowserContext): Promise<Page> {
    const page = await context.newPage();
    await page.goto("./");
    await waitForStarterProject(page);
    return page;
}

async function waitForStarterProject(page: Page): Promise<void> {
    await expect.poll(() => page.locator(".frame-div").count(), {timeout: STRYPE_LOAD_TIMEOUT_MS}).toBeGreaterThanOrEqual(DEFAULT_STARTING_FRAME_COUNT);
}

async function getTabId(page: Page): Promise<string | null> {
    return page.evaluate((key) => sessionStorage.getItem(key), TAB_ID_SESSION_KEY);
}

// Opens a file in a new tab from the opener, as the Files tab does, except that the new tab is held on about:blank
// (until releaseHeldHandoff()), so that other windows can use the nonce before it. The opener's window.open() is
// replaced for that, just for the call: the hand-over still keeps the very window object it returns, which stays the
// same when the held tab goes to the real URL. Also counts, in the opener, the requests for a hand-over it gets.
async function startHeldHandoff(context: BrowserContext, opener: Page, file: HandoffFile): Promise<{newTab: Page, nonce: string}> {
    const [newTab, nonce] = await Promise.all([
        context.waitForEvent("page"),
        opener.evaluate(({file, propName, queryKey, readyType}) => {
            const testWindow = window as any;
            const realOpen = window.open;
            window.open = (url?: string | URL, target?: string) => {
                const heldTab = realOpen.call(window, "about:blank", target);
                testWindow.heldHandoff = {tab: heldTab, url: String(url)};
                return heldTab;
            };
            try {
                if (!testWindow[propName].openCloudFileInNewTab(file)) {
                    throw new Error("The new tab wasn't opened");
                }
            }
            finally {
                window.open = realOpen;
            }
            testWindow.readyMessagesCount = 0;
            window.addEventListener("message", (event) => {
                if (event.origin === location.origin && event.data?.type === readyType) {
                    testWindow.readyMessagesCount++;
                }
            });
            return new URL(testWindow.heldHandoff.url, location.href).searchParams.get(queryKey) as string;
        }, {file, propName: WINDOW_STRYPE_CLOUDHANDOFF_PROPNAME, queryKey: HANDOFF_QUERY_KEY, readyType: READY_MESSAGE_TYPE}),
    ]);
    expect(nonce.length).toBeGreaterThan(20);
    return {newTab, nonce};
}

async function releaseHeldHandoff(opener: Page, newTab: Page): Promise<void> {
    await opener.evaluate(() => {
        const {tab, url} = (window as any).heldHandoff;
        tab.location.href = url;
    });
    // (a background tab may load much more slowly)
    await newTab.bringToFront();
}

function countReadyMessages(opener: Page): Promise<number> {
    return opener.evaluate(() => (window as any).readyMessagesCount);
}

// Another window opened by the opener (an empty page of Strype's origin), which counts the hand-over answers it gets
async function openOtherWindow(context: BrowserContext, opener: Page): Promise<Page> {
    const [otherWindow] = await Promise.all([
        context.waitForEvent("page"),
        opener.evaluate(() => {
            window.open("", "_blank");
        }),
    ]);
    await otherWindow.evaluate((handoffType) => {
        (window as any).handoffMessagesCount = 0;
        window.addEventListener("message", (event) => {
            if (event.data?.type === handoffType) {
                (window as any).handoffMessagesCount++;
            }
        });
    }, HANDOFF_MESSAGE_TYPE);
    return otherWindow;
}

// Sends a request for the hand-over to the opener, from the given window (as the new tab does)
async function sendReadyMessage(fromWindow: Page, nonce: string): Promise<void> {
    await fromWindow.evaluate(({nonce, readyType, origin}) => {
        window.opener.postMessage({type: readyType, nonce}, origin);
    }, {nonce, readyType: READY_MESSAGE_TYPE, origin: STRYPE_ORIGIN});
}

function getReceivedHandoffMessages(fromWindow: Page): Promise<number> {
    return fromWindow.evaluate(() => (window as any).handoffMessagesCount);
}
