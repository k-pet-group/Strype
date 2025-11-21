import {Page, test, expect} from "@playwright/test";
import {typeIndividually, doPagePaste, doTextHomeEndKeyPress, pressN, assertState} from "../support/editor";
import fs from "fs";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    if (process.platform === "win32" && browserName === "webkit") {
        testInfo.skip(true, "Skipping on WebKit + Windows due to clipboard permission issues.");
    }
    
    // We must use a fake clipboard object to avoid issues with browser clipboard permissions:
    await page.addInitScript(() => {
        let mockTextContent = "<empty>";
        let mockItems : ClipboardItem[] = [];
        const mockClipboard = {
            write: async (items: ClipboardItem[]) => {
                mockItems = items;
                for (const item of items) {
                    try {
                        const b = await item.getType("text/plain");
                        mockTextContent = await b.text();
                    }
                    catch (e) {
                        // Ignore
                    }
                }
            },
            read: async () => {
                return mockItems;
            },
            writeText: async (text: string) => {
                mockTextContent = text;
                mockItems = [{types: ["text/plain"], getType: (type) => {
                    // We use readText so we don't need to return the real content:
                    return Promise.reject("");
                }}];
            },
            readText: async () => mockTextContent,
        };

        // override the native clipboard API
        Object.defineProperty(window.navigator, "clipboard", {
            value: mockClipboard,
            writable: true,
            enumerable: true,
            configurable: true,
        });
    });
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
        await assertState(page, "{$}");
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
        await assertState(page, expectedAfter);
    });
}

function testSelectionThenDelete(code : string, doSelectKeys: (page: Page) => Promise<void>, expectedAfterDeletion : string) : void {
    test("Tests selecting and deleting in " + code, async ({page}) => {
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await page.waitForTimeout(100);
        await assertState(page, "{$}");
        await typeIndividually(page, code);
        await doSelectKeys(page);
        await page.keyboard.press("Delete");
        await assertState(page, expectedAfterDeletion);
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

function testPasteOverBoth(code: string, startIndex: number, endIndex: number, thenPaste: string, expectedAfter : string) : void {
    // Test selecting from start to end:
    testSelection(code, startIndex, endIndex, (page) => doPagePaste(page, thenPaste), expectedAfter, "paste " + thenPaste);
    // Then end to start (if it's not exactly the same):
    if (startIndex != endIndex) {
        testSelection(code, endIndex, startIndex, (page) => doPagePaste(page, thenPaste), expectedAfter, "paste " + thenPaste);
    }
}

enum CUT_COPY_TEST { CUT_ONLY, COPY_ONLY, CUT_REPASTE }

function testCutCopy(code : string, stepsToBegin: number, stepsWhileSelecting: number, expectedClipboard : string, expectedAfter : string, kind: CUT_COPY_TEST) : void {
    test(`Tests selecting then ${CUT_COPY_TEST[kind]} in ${code} from ${stepsToBegin} + ${stepsWhileSelecting}`, async ({page, context}) => {        
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await page.waitForTimeout(100);
        await assertState(page, "{$}");
        await typeIndividually(page, code);
        await doTextHomeEndKeyPress(page, false, false); // To handle the issue with macOS, see the method details.
        for (let i = 0; i < stepsToBegin; i++) {
            await page.keyboard.press("ArrowRight");
            await page.waitForTimeout(75);
        }
        while (stepsWhileSelecting > 0) {
            await page.keyboard.press("Shift+ArrowRight");
            await page.waitForTimeout(75);
            stepsWhileSelecting -= 1;
        }
        while (stepsWhileSelecting < 0) {
            await page.keyboard.press("Shift+ArrowLeft");
            await page.waitForTimeout(75);
            stepsWhileSelecting += 1;
        }
        await page.waitForTimeout(100);
        await page.keyboard.press(kind == CUT_COPY_TEST.COPY_ONLY ? "ControlOrMeta+c" : "ControlOrMeta+x");
        await page.waitForTimeout(100);
        const clipboardContent : string = await page.evaluate("navigator.clipboard.readText()");
        expect(clipboardContent).toEqual(expectedClipboard);
        if (kind == CUT_COPY_TEST.CUT_REPASTE) {
            // Can't use shortcut because it doesn't read from our mock clipboard:
            //await page.keyboard.press("ControlOrMeta+v");
            // So instead we must send our own paste event:
            await doPagePaste(page, clipboardContent);
        }
        await assertState(page, expectedAfter);
    });
}

function testCutCopyBothWays(code: string, stepsToStart: number, stepsToEnd: number, stepsBetweenWithShift: number, expectedClipboard: string, expectedAfterCut : string, expectedAfterCopy: string) : void {
    // Test cutting from start to end then end to start:
    testCutCopy(code, stepsToStart, stepsBetweenWithShift, expectedClipboard, expectedAfterCut, CUT_COPY_TEST.CUT_ONLY);
    testCutCopy(code, stepsToEnd, -stepsBetweenWithShift, expectedClipboard, expectedAfterCut, CUT_COPY_TEST.CUT_ONLY);
    // Copying is similar, but state should be unchanged:
    // Only thing is, because selection remains, cursor pos is different each way,
    // so we label with | and $ and remove/swap accordingly:
    testCutCopy(code, stepsToStart, stepsBetweenWithShift, expectedClipboard, expectedAfterCopy.replace("|", ""), CUT_COPY_TEST.COPY_ONLY);
    testCutCopy(code, stepsToEnd, -stepsBetweenWithShift, expectedClipboard, expectedAfterCopy.replace("$", "").replace("|", "$"), CUT_COPY_TEST.COPY_ONLY);
    
    // Now, test cutting followed by pasting.  Note that state after is the unmodified one,
    // so it's actually expectedAfterCopy even though we are cutting and pasting.
    // But the cursor will always be at the end, never at the beginning:
    testCutCopy(code, stepsToStart, stepsBetweenWithShift, expectedClipboard, expectedAfterCopy.replace("|", ""), CUT_COPY_TEST.CUT_REPASTE);
    testCutCopy(code, stepsToEnd, -stepsBetweenWithShift, expectedClipboard, expectedAfterCopy.replace("|", ""), CUT_COPY_TEST.CUT_REPASTE);
}

function testNavigation(code: string, navigate: (page: Page) => Promise<void>, expectedAfter: string) : void {
    test(code, async ({page}) => {
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await page.waitForTimeout(100);
        await assertState(page, "{$}");
        await typeIndividually(page, code);
        await navigate(page);
        await page.waitForTimeout(100);
        await assertState(page, expectedAfter);
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
        await doTextHomeEndKeyPress(page, true, true); // equivalent to Shift+End
    }, "{a$}");

    testSelectionThenDelete("abcdef",async (page) => {
        await doTextHomeEndKeyPress(page, false, false); // equivalent to Home
        await page.keyboard.press("Shift+ArrowRight");
        await page.keyboard.press("Shift+ArrowRight");
    }, "{$cdef}");

    testSelectionThenDelete("a+abs(b)",async (page) => {
        await doTextHomeEndKeyPress(page, false, false); // equivalent to Home
        await page.keyboard.press("ArrowRight");
        await doTextHomeEndKeyPress(page, true, true); // equivalent to Shift+End
    }, "{a$}");
    testSelectionThenDelete("a+math.sin(b)",async (page) => {
        await doTextHomeEndKeyPress(page, false, false); // equivalent to Home
        await page.keyboard.press("ArrowRight");
        await doTextHomeEndKeyPress(page, true, true); // equivalent to Shift+End
    }, "{a$}");
    testSelectionThenDelete("a+max(b,c)",async (page) => {
        await doTextHomeEndKeyPress(page, false, false); // equivalent to Home
        await page.keyboard.press("ArrowRight");
        await doTextHomeEndKeyPress(page, true, true); // equivalent to Shift+End
    }, "{a$}");
    testSelectionThenDelete("a+min(b,c)",async (page) => {
        await doTextHomeEndKeyPress(page, false, false); // equivalent to Home
        await pressN("ArrowRight", 6)(page);
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

test.describe("Selecting then cutting/copying", () => {
     
    testCutCopyBothWays("123456", 2, 4, 2, "34", "{12$56}", "{12|34$56}");
    testCutCopyBothWays("123+456", 2, 5, 3, "3+4", "{12$56}", "{12|3}+{4$56}");

    // Note that to select the bracket is one, so to go from before 3 to before 0 is actually 4 steps
    testCutCopyBothWays("123+(456*789)-0", 2, 14, 4, "3+(456*789)-", "{12$0}", "{12|3}+{}_({456}*{789})_{}-{$0}");
    
    // Check we don't see zero-width spaces:
    testCutCopyBothWays("fax()", 2, 5, 2, "x()", "{fa$}", "{fa|x}_({})_{$}");
    
    // Check that strings are copied correctly:
    testCutCopyBothWays("\"\"", 0, 2, 1, "\"\"", "{$}", "{|}_“”_{$}");
    testCutCopyBothWays("''", 0, 2, 1, "''", "{$}", "{|}_‘’_{$}");
});

test.describe("Paste over selection", () => {
    testPasteOverBoth("foo", 0, 0, "to", "{to$foo}");
    testPasteOverBoth("man", 1, 2, "oo", "{moo$n}");
    testPasteOverBoth("foo.bar", 3, 4, "z", "{fooz$bar}");

    testPasteOverBoth("\"hi\"", 0, 4, "bye", "{bye$}");
    testPasteOverBoth("474+8", 0, 5, "1/2", "{1}/{2$}");
    testPasteOverBoth("474+8", 0, 5, "\"bye\"", "{}_“bye”_{$}");
    testPasteOverBoth("474+8", 0, 5, "foo", "{foo$}");

    testPasteOverBoth("(474+8)", 0, 7, "1/2", "{1}/{2$}");
    testPasteOverBoth("(474+8)", 0, 7, "\"bye\"", "{}_“bye”_{$}");
    testPasteOverBoth("(474+8)", 0, 7, "foo", "{foo$}");
    
    testPasteOverBoth("(474+8)", 3, 5, "foo", "{}_({47foo$8})_{}");
    testPasteOverBoth("(474+8)", 3, 5, "2.", "{}_({472.$8})_{}");
    testPasteOverBoth("(474+8)", 3, 5, "1/", "{}_({471}/{$8})_{}");

    testPasteOverBoth("11+(22*33)/44", 4, 9, "55", "{11}+{}_({55$})_{}/{44}");
    testPasteOverBoth("11+(22*33)/44", 5, 8, "55", "{11}+{}_({255$3})_{}/{44}");
    testPasteOverBoth("11+(22*33)/44", 4, 9, "55*(66-77)", "{11}+{}_({55}*{}_({66}-{77})_{$})_{}/{44}");
});

test.describe("Media literal copying", () => {
    test("Test copying text with a media literal", async ({page}) => {
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await page.waitForTimeout(100);
        await assertState(page, "{$}");
        await typeIndividually(page, "set_background(");
        const image = fs.readFileSync("public/graphics_images/cat-test.jpg").toString("base64");
        await doPagePaste(page, image, "image/jpeg");
        await typeIndividually(page, ")");
        let startIndex = 0;
        const endIndex = "set_background(X)".length;
        await doTextHomeEndKeyPress(page, false, false); // equivalent to "Home", see method for details
        for (let i = 0; i < startIndex; i++) {
            await page.keyboard.press("ArrowRight");
            await page.waitForTimeout(75);
        }
        while (startIndex < endIndex) {
            await page.keyboard.press("Shift+ArrowRight");
            await page.waitForTimeout(75);
            startIndex += 1;
        }
        await page.waitForTimeout(100);
        await page.keyboard.press("ControlOrMeta+c");
        await page.waitForTimeout(100);
        const clipboardContent : string = await page.evaluate("navigator.clipboard.readText()");
        expect(clipboardContent).toEqual("set_background(load_image(\"data:image/jpeg;base64," + image + "\"))");
        const clipboardItemCount : string = await page.evaluate("navigator.clipboard.read().then((items) => items.length)");
        expect(clipboardItemCount).toEqual(1);
    });
    test("Test copying only image literal puts an image on clipboard", async ({page}, testInfo) => {
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await page.waitForTimeout(100);
        await assertState(page, "{$}");
        await typeIndividually(page, "set_background(");
        const image = fs.readFileSync("public/graphics_images/cat-test.jpg").toString("base64");
        await doPagePaste(page, image, "image/jpeg");
        await typeIndividually(page, ")");
        let startIndex = "set_background(".length;
        const endIndex = startIndex + 1;
        await doTextHomeEndKeyPress(page, false, false); // equivalent to "Home", see method for details
        await page.waitForTimeout(1000);
        for (let i = 0; i < startIndex; i++) {
            await page.keyboard.press("ArrowRight");
            await page.waitForTimeout(1000);
        }
        while (startIndex < endIndex) {
            await page.keyboard.press("Shift+ArrowRight");
            await page.waitForTimeout(75);
            startIndex += 1;
        }
        await page.waitForTimeout(100);
        await page.keyboard.press("ControlOrMeta+c");
        await page.waitForTimeout(100);
        const clipboardContent : string = await page.evaluate("navigator.clipboard.readText()");
        expect(clipboardContent).toEqual("load_image(\"data:image/jpeg;base64," + image + "\")");
        const clipboardItemCount : string = await page.evaluate("navigator.clipboard.read().then((items) => items.length)");
        expect(clipboardItemCount).toEqual(2);
        const clipboardImage : string = await page.evaluate(`
            navigator.clipboard.read().then(async (items) => {
                for (const item of items) {
                      for (const type of item.types) {
                            if (type.startsWith("image/")) {
                              const blob = await item.getType(type);
                    
                              // Convert Blob to base64
                              const base64 = await new Promise((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result);
                                reader.onerror = reject;
                                reader.readAsDataURL(blob); // Data URL includes base64-encoded image
                              });
                    
                              return base64;
                            }
                      }
                }
            });
`);
        expect(clipboardImage).toEqual("data:image/jpeg;base64," + image);
    });
});
