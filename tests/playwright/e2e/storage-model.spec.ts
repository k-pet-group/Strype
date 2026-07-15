// These tests test what happens when you open, close and refresh Strype tabs,
// specifically around storing and restoring the state from browser storage.

import { Page, expect, test } from "@playwright/test";
import { skipPyodideLoading } from "../support/general";
import { save } from "../support/loading-saving";
import {strypeElIds} from "../support/proxy";

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
    await expect(page.locator(".frame-div")).toHaveCount(2);
    await expect(page.locator("span", {hasText: "Hello from Strype"})).toHaveCount(1);
    await expect(page.locator("span", {hasText: "This is the default Strype starter project"})).toHaveCount(1);
}

async function assertStartingPlus(page: Page, paramContent: string) {
    await expect(page.locator(".frame-div")).toHaveCount(3);
    await expect(page.locator("span", {hasText: "Hello from Strype"})).toHaveCount(1);
    await expect(page.locator("span", {hasText: "This is the default Strype starter project"})).toHaveCount(1);
    await expect(page.locator("span", {hasText: paramContent})).toHaveCount(1);
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
        await assertStartingPlus(page, "Saved state from previous storage model");
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
        await assertStartingPlus(page1, "Saved state from previous storage model");

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

async function assertOpenRecentMenu(page: Page, expectedProjectNames: RegExp[]) : Promise<void> {
    await page.click("#" + await strypeElIds(page).getEditorMenuUID());
    await page.click("#" + await strypeElIds(page).getLoadProjectLinkId());
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
            await closePage(page1, browserName);
            // Playwright seems to say it won't actually wait for the saving to be finished, so let's wait an extra couple of seconds:
            // Can't use page1.waitForTimeout as it's closed...
            await new Promise((resolve) => setTimeout(resolve, 2000));

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
            await closePage(page1, browserName);
            // Playwright seems to say it won't actually wait for the saving to be finished, so let's wait an extra couple of seconds:
            // Can't use page1.waitForTimeout as it's closed...
            await new Promise((resolve) => setTimeout(resolve, 2000));

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
                // save() only waits for the download event; the autosave write to
                // IndexedDB/localStorage that this test actually cares about here is a separate
                // async operation with no exposed completion signal, so this is a deliberate
                // real-time wait to give it a moment to land before we close the page:
                await page2.waitForTimeout(1000);
            }
            await closePage(page2, browserName);
            // Playwright seems to say it won't actually wait for the saving to be finished, so let's wait an extra couple of seconds:
            // Can't use page2.waitForTimeout as it's closed...
            await new Promise((resolve) => setTimeout(resolve, 2000));

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
            await closePage(page1, browserName);
            // Playwright seems to say it won't actually wait for the saving to be finished, so let's wait an extra couple of seconds:
            // Can't use page1.waitForTimeout as it's closed...
            await new Promise((resolve) => setTimeout(resolve, 2000));

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
                // save() only waits for the download event; the autosave write to
                // IndexedDB/localStorage that this test actually cares about here is a separate
                // async operation with no exposed completion signal, so this is a deliberate
                // real-time wait to give it a moment to land before we open the menu below:
                await page2.waitForTimeout(1000);
            }

            // We don't close the page, we use the new project from the menu
            await page2.locator("#" + await strypeElIds(page2).getEditorMenuUID()).click();
            await page2.locator("#" + await strypeElIds(page2).getNewProjectLinkId()).click();
            if (!state2Saved) {
                // Need to click the confirmation dialog to go despite unsaved changes:
                await page2.locator("*[id='confirmNewProjectModalDlg'] button", {hasText: "Continue"}).click();
            }

            // Deliberately a real-time wait, not a settle-based one: the check below is a negative
            // assertion (banner should NOT be visible), so relying on its own retry wouldn't
            // actually prove anything -- it would pass trivially before the banner had a chance to
            // (wrongly) appear. Give it a moment to load first:
            await page2.waitForTimeout(3000);

            // Now we check there's no banner:
            await expect(page2.locator("." + scssVars.messageBannerContainerClassName)).not.toBeVisible();
        });
    }
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
