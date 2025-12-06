import {Page, test} from "@playwright/test";
import {typeIndividually, doTextHomeEndKeyPress, pressN, assertStateOfIfFrame} from "../support/editor";
import {addFakeClipboard} from "../support/clipboard";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    if (process.platform === "win32" && browserName === "webkit") {
        testInfo.skip(true, "Skipping on WebKit + Windows due to clipboard permission issues.");
    }
    await addFakeClipboard(page);
    await page.goto("./", {waitUntil: "domcontentloaded"});
    await page.waitForSelector("body");
    //strypeElIds = await page.evaluate(() => (window as any)["StrypeHTMLELementsIDsGlobals"]);
    // Make browser's console.log output visible in our logs (useful for debugging):
    page.on("console", (msg) => {
        console.log("Browser log:", msg.text());
    });
});

function testSelection(code : string, startIndex: number, endIndex: number, secondEntry : string | ((page: Page) => Promise<void>), expectedAfter : string, extraTitle?: string) : void {
    test("Tests selecting in " + code + " from " + startIndex + " to " + endIndex + " then " + secondEntry + " " + extraTitle, async ({page}) => {
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await page.waitForTimeout(100);
        await assertStateOfIfFrame(page, "{$}");
        await typeIndividually(page, code);
        await doTextHomeEndKeyPress(page, false, false); // To handle the issue with macOS, see the method details (equivalent to "home").
        for (let i = 0; i < startIndex; i++) {
            await page.keyboard.press("ArrowRight");
            await page.waitForTimeout(75);
        }
        while (startIndex < endIndex) {
            await page.keyboard.press("Shift+ArrowRight");
            await page.waitForTimeout(75);
            startIndex += 1;
        }
        while (endIndex < startIndex) {
            await page.keyboard.press("Shift+ArrowLeft");
            await page.waitForTimeout(75);
            startIndex -= 1;
        }
        await page.waitForTimeout(100);
        if (typeof secondEntry == "string") {
            await typeIndividually(page, secondEntry);
        }
        else {
            await secondEntry(page);
        }
        await page.waitForTimeout(500);
        await assertStateOfIfFrame(page, expectedAfter);
    });
}

function testSelectionThenDelete(code : string, doSelectKeys: (page: Page) => Promise<void>, expectedAfterDeletion : string) : void {
    test("Tests selecting and deleting in " + code, async ({page}) => {
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await page.waitForTimeout(100);
        await assertStateOfIfFrame(page, "{$}");
        await typeIndividually(page, code);
        await doSelectKeys(page);
        await page.waitForTimeout(200);
        await page.keyboard.press("Delete");
        await assertStateOfIfFrame(page, expectedAfterDeletion);
    });
}

function testSelectionBoth(code: string, startIndex: number, endIndex: number, thenType: string | ((page: Page) => Promise<void>), expectedAfter : string) : void {
    // Test selecting from start to end:
    testSelection(code, startIndex, endIndex, thenType, expectedAfter);
    // Then end to start (if it's not exactly the same):
    if (startIndex != endIndex) {
        testSelection(code, endIndex, startIndex, thenType, expectedAfter);
    }
}

function testNavigation(code: string, navigate: (page: Page) => Promise<void>, expectedAfter: string) : void {
    test(code, async ({page}) => {
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await page.waitForTimeout(100);
        await assertStateOfIfFrame(page, "{$}");
        await typeIndividually(page, code);
        await navigate(page);
        await page.waitForTimeout(100);
        await assertStateOfIfFrame(page, expectedAfter);
    });
}

test.describe("Home goes to start of whole label slots structure", () => {
    testNavigation("123", pressN("Home", 1), "{$123}");
    // Extra presses shouldn't matter:
    testNavigation("456", pressN("Home", 2), "{$456}");
    testNavigation("123.456", pressN("Home", 1), "{$123.456}");
    // Check we end up where we expect to without home:
    testNavigation("foo(bar)", async () => {}, "{foo}_({bar})_{$}");
    testNavigation("foo(bar", async () => {}, "{foo}_({bar$})_{}");
    // Then test home:
    testNavigation("fax(neighbour1)", pressN("Home", 1), "{$fax}_({neighbour1})_{}");
    testNavigation("fax(neighbour2", pressN("Home", 1), "{$fax}_({neighbour2})_{}");
    // Multiple presses ignored:
    testNavigation("fax(neighbour2b", pressN("Home", 2), "{$fax}_({neighbour2b})_{}");
    testNavigation("fax(neighbour3", pressN("Home", 2), "{$fax}_({neighbour3})_{}");
});

test.describe("Shift-Home selects to the beginning of current level", () => {
    // Note: testSelectionThenDelete needs unique code to make a unique test name
    testSelectionThenDelete("a+b",async (page) => {
        await doTextHomeEndKeyPress(page, true, false); // equivalent to End
        await doTextHomeEndKeyPress(page, false, true); // equivalent to Shift+Home
    }, "{$}");
    testSelectionThenDelete("a+c",async (page) => {
        await doTextHomeEndKeyPress(page, true, false); // equivalent to End
        await page.keyboard.press("ArrowLeft");
        await doTextHomeEndKeyPress(page, false, true); // equivalent to Shift+Home
    }, "{$c}");

    testSelectionThenDelete("a+math.sin(b)",async (page) => {
        await doTextHomeEndKeyPress(page, true, false); // equivalent to End
        await doTextHomeEndKeyPress(page, false, true); // equivalent to Shift+Home
    }, "{$}");
    testSelectionThenDelete("a+max(b,c)",async (page) => {
        await doTextHomeEndKeyPress(page, true, false); // equivalent to End
        await doTextHomeEndKeyPress(page, false, true); // equivalent to Shift+Home
    }, "{$}");
    testSelectionThenDelete("a+min(b,c)",async (page) => {
        await doTextHomeEndKeyPress(page, true, false); // equivalent to End
        await page.keyboard.press("ArrowLeft");
        await doTextHomeEndKeyPress(page, false, true); // equivalent to Shift+Home
    }, "{a}+{min}_({$})_{}");
});

test.describe("Shift-End selects to the end of current level", () => {
    // Note: testSelectionThenDelete needs unique code to make a unique test name
    // To handle the issue with macOS for home/end, we use doTextHomeEndKeyPress(), see the method details
    testSelectionThenDelete("a+b",async (page) => {
        await doTextHomeEndKeyPress(page, false, false); // equivalent to Home
        await doTextHomeEndKeyPress(page, true, true); // equivalent to Shift+End
    }, "{$}");
    testSelectionThenDelete("a+c",async (page) => {
        await doTextHomeEndKeyPress(page, false, false); // equivalent to Home
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(200);
        await doTextHomeEndKeyPress(page, true, true); // equivalent to Shift+End
    }, "{a$}");

    testSelectionThenDelete("abcdef",async (page) => {
        await doTextHomeEndKeyPress(page, false, false); // equivalent to Home
        await page.keyboard.press("Shift+ArrowRight");
        await page.waitForTimeout(200);
        await page.keyboard.press("Shift+ArrowRight");
        await page.waitForTimeout(200);
    }, "{$cdef}");

    testSelectionThenDelete("a+abs(b)",async (page) => {
        await doTextHomeEndKeyPress(page, false, false); // equivalent to Home
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(200);
        await doTextHomeEndKeyPress(page, true, true); // equivalent to Shift+End
    }, "{a$}");
    testSelectionThenDelete("a+math.sin(b)",async (page) => {
        await doTextHomeEndKeyPress(page, false, false); // equivalent to Home
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(200);
        await doTextHomeEndKeyPress(page, true, true); // equivalent to Shift+End
    }, "{a$}");
    testSelectionThenDelete("a+max(b,c)",async (page) => {
        await doTextHomeEndKeyPress(page, false, false); // equivalent to Home
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(200);
        await doTextHomeEndKeyPress(page, true, true); // equivalent to Shift+End
    }, "{a$}");
    testSelectionThenDelete("a+min(b,c)",async (page) => {
        await doTextHomeEndKeyPress(page, false, false); // equivalent to Home
        await pressN("ArrowRight", 6, true)(page);
        await doTextHomeEndKeyPress(page, true, true); // equivalent to Shift+End
    }, "{a}+{min}_({$})_{}");
});

test.describe("Selecting then typing in one slot", () => {
    // Words mainly chosen to avoid having duplicate characters, to help
    // see more easily if something went wrong, and what:
    testSelectionBoth("neighbour", 2, 5, "fax", "{nefax$bour}");
    testSelectionBoth("neighbour", 2, 5, " ", "{ne $bour}");
    // Invalid entry but should still delete the selection, and replace with nothing:
    testSelectionBoth("neighbour", 2, 5, ")", "{ne$bour}");

    // Replace with operator:
    testSelectionBoth("neighbour", 2, 5, "+", "{ne}+{$bour}");
    testSelectionBoth("neighbour", 2, 5, ".", "{ne}.{$bour}");

    // Surround with brackets:
    testSelectionBoth("neighbour", 5, 9, "(", "{neigh}_({$bour})_{}");
    testSelectionBoth("neighbour(xyz)", 5, 9, "(", "{neigh}_({$bour})_{}_({xyz})_{}");
    
    // Multidim brackets by closing with selection should replace the content but otherwise do nothing:
    testSelectionBoth("fax(neighbour)", 6, 9, ")", "{fax}_({ne$bour})_{}");
    testSelectionBoth("fax(neighbour)", 1, 3, ")", "{f$}_({neighbour})_{}");
    // Not a selection but may as well test while we're here, that closing brackets do as we intended:
    testSelectionBoth("fax(neighbour)", 9, 9, ")", "{fax}_({neigh})_{}_({$bour})_{}");
    testSelectionBoth("fax(neighbour)", 3, 3, ")", "{fax}_({$})_{}_({neighbour})_{}");

    // Numbers:
    testSelectionBoth("123456", 2, 4, "+", "{12}+{$56}");
    testSelectionBoth("123456", 2, 4, "-", "{12}-{$56}");
    testSelectionBoth("123456", 2, 4, "e", "{12e$56}");
    testSelectionBoth("123456", 2, 4, ".", "{12.$56}");
    testSelectionBoth("123456", 0, 6, "(", "{}_({$123456})_{}");

    // Turn into a number slot by replacement:
    testSelectionBoth("abc123", 0, 3, "+", "{+$123}");
    testSelectionBoth("abc123", 0, 3, "-", "{-$123}");
    testSelectionBoth("abc123", 0, 3, "*", "{}*{$123}");

    testSelectionBoth("abc123", 2, 4, "\"", "{ab}_“$c1”_{23}");
    testSelectionBoth("abc123", 2, 4, "'", "{ab}_‘$c1’_{23}");
});

test.describe("Selecting then typing in multiple slots", () => {
    testSelectionBoth("123+456", 2,5, "0", "{120$56}");
    testSelectionBoth("123+456", 2,5, ".", "{12.$56}");
    testSelectionBoth("123+456", 2,5, "*", "{12}*{$56}");
    
    testSelectionBoth("123+456", 2,5, "(", "{12}_({$3}+{4})_{56}");

    testSelectionBoth("123+456", 2, 5, "\"", "{12}_“$3+4”_{56}");
    
    // Select just an operator and overtype:
    testSelectionBoth("+", 0, 1, "a", "{a$}");
    testSelectionBoth("+", 0, 1, "(", "{}_({$}+{})_{}");

    // Select string or bracket and overtype:
    testSelectionBoth("\"abc\"", 0, 5, "z", "{z$}");
    testSelectionBoth("(abc)", 0, 5, "z", "{z$}");
    
    // Select a string and attempt to wrap in a bracket:
    testSelectionBoth("\"abc\"", 0, 5, "(", "{}_({$}_“abc”_{})_{}");
    // Select a bracket and attempt to wrap in another bracket:
    testSelectionBoth("(123)", 0, 5, "(", "{}_({$}_({123})_{})_{}");

    // Select multiple strings:
    testSelectionBoth("print(\"Hello\"+\"Goodbye\")", 6, 23, "(", "{print}_({}_({$}_“Hello”_{}+{}_“Goodbye”_{})_{})_{}");
    // Select inside brackets:
    testSelectionBoth("sum([(1+2),3-4])", 11, 14, "(", "{sum}_({}_[{}_({1}+{2})_{},{}_({$3}-{4})_{}]_{})_{}");
    // String quote brackets:
    testSelectionBoth("print((1+2))", 6, 11, "\"", "{print}({}_“$(1+2)”_{})_{}");
});

test.describe("Selecting then deleting in multiple slots", () => {
    testSelectionBoth("123+456", 2,5, (page) => page.keyboard.press("Delete"), "{12$56}");
    testSelectionBoth("123+456", 2,5, (page) => page.keyboard.press("Backspace"), "{12$56}");
    
    // Prevent invalid selections (trying to select from outside brackets to within):
    testSelection("123+(456)*789", 6, 12, (page) => page.keyboard.press("Backspace"), "{123}+{}_({4$})_{}*{789}");
    testSelection("123+(456)*789", 6, 2, (page) => page.keyboard.press("Backspace"), "{123}+{}_({$56})_{}*{789}");

    testSelectionBoth("''", 0,2, (page) => page.keyboard.press("Backspace"), "{$}");
    testSelectionBoth("''", 0,2, (page) => page.keyboard.press("Delete"), "{$}");
    testSelectionBoth("\"\"", 2,0, (page) => page.keyboard.press("Backspace"), "{$}");
    testSelectionBoth("\"\"", 2,0, (page) => page.keyboard.press("Delete"), "{$}");
});
