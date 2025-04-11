import {Page, test, expect} from "@playwright/test";

let scssVars: {[varName: string]: string};
//let strypeElIds: {[varName: string]: (...args: any[]) => string};
test.beforeEach(async ({ page }) => {
    // We must use a fake clipboard object to avoid issues with browser clipboard permissions:
    await page.addInitScript(() => {
        let mockContent = "<empty>";
        const mockClipboard = {
            content: "<empty>",
            writeText: async (text: string) => {
                mockContent = text;
            },
            readText: async () => mockContent,
        };

        // override the native clipboard API
        Object.defineProperty(window.navigator, "clipboard", {
            value: mockClipboard,
            writable: true,
            enumerable: true,
            configurable: true,
        });
    });
    
    // The domcontentloaded does not wait for async/defer, which is our Google scripts, but we
    // don't need them for this test.  In fact, save time by blocking that domain:
    await page.route("**/*", (route) => {
        const url = route.request().url();
        if (url.includes("google.com")) {
            route.abort(); // prevent loading
        }
        else {
            route.continue(); // allow others
        }
    });
    await page.goto("./", {waitUntil: "domcontentloaded"});
    await page.waitForSelector("body");
    scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
    //strypeElIds = await page.evaluate(() => (window as any)["StrypeHTMLELementsIDsGlobals"]);
    // Make browser's console.log output visible in our logs (useful for debugging):
    page.on("console", (msg) => {
        console.log("Browser log:", msg.text());
    });
});

async function typeIndividually(page: Page, content: string) {
    for (let i = 0; i < content.length; i++) {
        await page.keyboard.type(content[i]);
        await page.waitForTimeout(75);
    }
}

async function getSelection(page: Page) : Promise<{ id: string, cursorPos : number }> {
    // We need a delay to make sure last DOM update has occurred:
    await page.waitForSelector("#editor");
    return page.locator("#editor").evaluate((ed) => {
        return {id : ed.getAttribute("data-slot-focus-id") || "", cursorPos : parseInt(ed.getAttribute("data-slot-cursor") || "-2")};
    });
}

async function assertState(page: Page, expectedState : string) : Promise<void> {
    const info = await getSelection(page);
    const s = await page.locator("#frameContainer_-3" + " ." + scssVars.frameHeaderClassName).first().locator("." + scssVars.labelSlotInputClassName + ", ." + scssVars.frameColouredLabelClassName).evaluateAll((parts, info: { id: string, cursorPos : number }) => {
        let s = "";
        if (!parts) {
            // Try to debug an occasional seemingly impossible failure:
            console.log("Parts is null which I'm sure shouldn't happen");
        }
        // Since we're in an if frame, we ignore the first and last part:
        for (let i = 1; i < parts.length - 1; i++) {
            const p: any = parts[i];

            let text = (p.value || p.textContent || "").replace("\u200B", "");

            // If we're the focused slot, put a dollar sign in to indicate the current cursor position:
            if (info.id === p.getAttribute("id") && info.cursorPos >= 0) {
                text = text.substring(0, info.cursorPos) + "$" + text.substring(info.cursorPos);
            }
            // Don't put curly brackets around strings, operators or brackets:
            if (!p.classList.contains((window as any)["StrypeSCSSVarsGlobals"].frameStringSlotClassName) && !p.classList.contains((window as any)["StrypeSCSSVarsGlobals"].frameOperatorSlotClassName) && !/[([)\]$]/.exec(p.textContent)) {
                text = "{" + text + "}";
            }
            s += text;
        }
        return s;
    }, info);
    // There is no correspondence for _ (indicating a null operator) in the Strype interface so just ignore that:
    expect(s).toEqual(expectedState.replaceAll("_", ""));
}

function testSelection(code : string, startIndex: number, endIndex: number, secondEntry : string | ((page: Page) => Promise<void>), expectedAfter : string) : void {
    test("Tests selecting in " + code + " from " + startIndex + " to " + endIndex + " then " + secondEntry, async ({page}) => {
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await page.waitForTimeout(100);
        await assertState(page, "{$}");
        await typeIndividually(page, code);
        await page.keyboard.press("Home");
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

enum CUT_COPY_TEST { CUT_ONLY, COPY_ONLY, CUT_REPASTE }

function testCutCopy(code : string, stepsToBegin: number, stepsWhileSelecting: number, expectedClipboard : string, expectedAfter : string, kind: CUT_COPY_TEST) : void {
    test(`Tests selecting then ${CUT_COPY_TEST[kind]} in ${code} from ${stepsToBegin} + ${stepsWhileSelecting}`, async ({page, context}) => {        
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await page.keyboard.type("i");
        await page.waitForTimeout(100);
        await assertState(page, "{$}");
        await typeIndividually(page, code);
        await page.keyboard.press("Home");
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
            await page.evaluate((pasteContent : string) => {
                const pasteEvent = new ClipboardEvent("paste", {
                    bubbles: true,
                    cancelable: true,
                    clipboardData: new DataTransfer(),
                });

                // Set custom clipboard data for the paste event
                pasteEvent.clipboardData?.setData("text", pasteContent);

                // Dispatch the paste event to the whole document
                document.activeElement?.dispatchEvent(pasteEvent);
            }, clipboardContent);
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

function pressN(key: string, n : number) : ((page: Page) => Promise<void>) {
    return async (page) => {
        for (let i = 0; i < n; i++) {
            await page.keyboard.press(key); 
        }
    };
}

test.describe("Home goes to start of current level", () => {
    testNavigation("123", pressN("Home", 1), "{$123}");
    // Extra presses shouldn't matter:
    testNavigation("456", pressN("Home", 2), "{$456}");
    testNavigation("123.456", pressN("Home", 1), "{$123.456}");
    // Check we end up where we expect to without home:
    testNavigation("foo(bar)", async () => {}, "{foo}_({bar})_{$}");
    testNavigation("foo(bar", async () => {}, "{foo}_({bar$})_{}");
    // Then test home:
    testNavigation("fax(neighbour1)", pressN("Home", 1), "{$fax}_({neighbour1})_{}");
    testNavigation("fax(neighbour2", pressN("Home", 1), "{fax}_({$neighbour2})_{}");
    // Multiple presses ignored:
    testNavigation("fax(neighbour2b", pressN("Home", 2), "{fax}_({$neighbour2b})_{}");
    testNavigation("fax(neighbour3", async (page) => {
        await pressN("Home", 1)(page);
        await pressN("ArrowLeft", 1)(page);
        await pressN("Home", 1)(page);
    }, "{$fax}_({neighbour3})_{}");
});

test.describe("Shift-Home selects to the beginning", () => {
    // Note: testSelectionThenDelete needs unique code to make a unique test name
    testSelectionThenDelete("a+b",async (page) => {
        await page.keyboard.press("End");
        await page.keyboard.press("Shift+Home");
    }, "{$}");
    testSelectionThenDelete("a+c",async (page) => {
        await page.keyboard.press("End");
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("Shift+Home");
    }, "{$c}");

    testSelectionThenDelete("a+math.sin(b)",async (page) => {
        await page.keyboard.press("End");
        await page.keyboard.press("Shift+Home");
    }, "{$}");
    testSelectionThenDelete("a+max(b,c)",async (page) => {
        await page.keyboard.press("End");
        await page.keyboard.press("Shift+Home");
    }, "{$}");
});

test.describe("Shift-End selects to the end", () => {
    // Note: testSelectionThenDelete needs unique code to make a unique test name
    testSelectionThenDelete("a+b",async (page) => {
        await page.keyboard.press("Home");
        await page.keyboard.press("Shift+End");
    }, "{$}");
    testSelectionThenDelete("a+c",async (page) => {
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Shift+End");
    }, "{a$}");

    testSelectionThenDelete("abcdef",async (page) => {
        await page.keyboard.press("Home");
        await page.keyboard.press("Shift+ArrowRight");
        await page.keyboard.press("Shift+ArrowRight");
    }, "{$cdef}");

    testSelectionThenDelete("a+abs(b)",async (page) => {
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Shift+End");
    }, "{a$}");
    testSelectionThenDelete("a+math.sin(b)",async (page) => {
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Shift+End");
    }, "{a$}");
    testSelectionThenDelete("a+max(b,c)",async (page) => {
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Shift+End");
    }, "{a$}");
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
});

test.describe("Selecting then cutting/copying", () => {
     
    testCutCopyBothWays("123456", 2, 4, 2, "34", "{12$56}", "{12|34$56}");
    testCutCopyBothWays("123+456", 2, 5, 3, "3+4", "{12$56}", "{12|3}+{4$56}");

    // Note that to select the bracket is one, so to go from before 3 to before 0 is actually 4 steps
    testCutCopyBothWays("123+(456*789)-0", 2, 14, 4, "3+(456*789)-", "{12$0}", "{12|3}+{}_({456}*{789})_{}-{$0}");
    
    // Check we don't see zero-width spaces:
    testCutCopyBothWays("fax()", 2, 5, 2, "x()", "{fa$}", "{fa|x}_({})_{$}");
});

