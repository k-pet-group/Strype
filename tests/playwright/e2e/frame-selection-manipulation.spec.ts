import {Page, test, expect} from "@playwright/test";
import { loadContent, save } from "../support/loading-saving";
import { readFileSync } from "node:fs";
import { skipPyodideLoading } from "../support/general";
import {addFakeClipboard} from "../support/clipboard";
import { checkFrameXorTextCursor, doPagePaste } from "../support/editor";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    if (browserName === "webkit" && (process.platform === "win32" || process.platform === "linux")) {
        // On Windows+Webkit it just can't seem to load the page for some reason,
        // and on Ubuntu+Webkit the paste doesn't seem to work (while it's fine on MacOS):
        testInfo.skip(true, "Skipping on Windows/Ubuntu + WebKit due to various problems");
    }

    // These tests can take longer than the default 30 seconds:
    testInfo.setTimeout(90000); // 90 seconds

    // Make browser's console.log output visible in our logs (useful for debugging):
    page.on("console", (msg) => {
        console.log("Browser log:", msg.text());
    });
    await skipPyodideLoading(page);
    await addFakeClipboard(page);
    await page.goto("./", {waitUntil: "load"});
    await page.waitForSelector("body");
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });
});

async function testBeforeAfterPaste(page: Page, before :string, selectionKeys: string[], operation: "cut" | "copy" | "delete" | "duplicate" | "duplicate2", moveToDestKeys: string[], afterPaste :string) {
    // Load:
    await loadContent(page, before);
    for (const k of selectionKeys) {
        await page.keyboard.press(process.platform == "darwin" ? k.replaceAll("Control", "Meta") : k);
    }
    await page.waitForTimeout(500);
    // Now cut/copy:
    if (operation.startsWith("duplicate")) {
        await page.keyboard.press("ControlOrMeta+d");
        if (operation === "duplicate2") {
            // Do it again:
            await page.keyboard.press("ControlOrMeta+d");
        }
    }
    else if (operation === "cut") {
        await page.keyboard.press("ControlOrMeta+x");
    }
    else {
        await page.keyboard.press("ControlOrMeta+c");
    }
    await page.waitForTimeout(500);
    // Then move:
    for (const k of moveToDestKeys) {
        await page.keyboard.press(process.platform == "darwin" ? k.replaceAll("Control", "Meta") : k);
    }
    await page.waitForTimeout(500);
    // Paste and check:
    if (operation == "delete") {
        await page.keyboard.press("Backspace");
    }
    else if (!operation.startsWith("duplicate")) {
        await doPagePaste(page, await page.evaluate(() => window.navigator.clipboard.readText()));
    }
    await page.waitForTimeout(500);
    expect(readFileSync(await save(page, false), "utf-8")).toEqual(afterPaste);
}

async function testPaste(page: Page, before :string, moveToDestKeys: string[], pasteText: string, afterPaste :string) {
    // Load:
    await loadContent(page, before);
    await page.waitForTimeout(500);
    // Then move:
    for (const k of moveToDestKeys) {
        await page.keyboard.press(process.platform == "darwin" ? k.replaceAll("Control", "Meta") : k);
    }
    await page.waitForTimeout(500);
    await doPagePaste(page, pasteText);    
    await page.waitForTimeout(500);
    // We had some issues with frame cursor disappearing after paste (esp. invalid paste);
    await checkFrameXorTextCursor(page, true, "Frame cursor after paste");
    
    expect(readFileSync(await save(page, false), "utf-8")).toEqual(afterPaste);
}


function makeStrypeFile(sections: string[]): string {
    const [imports, definitions, main] = sections;
    return `#(=> Strype:1:std
#(=> Section:Imports
${imports}#(=> Section:Definitions
${definitions}#(=> Section:Main
${main}#(=> Section:End
`;
}

async function testDuplicateViaMenu(page: Page, before: string, targetText: string, after: string) {
    // Load:
    await loadContent(page, before);
    await page.waitForTimeout(500);
    // Find the innermost frame containing that text:
    const frameDiv = page
        .getByText(targetText, { exact: true })
        .locator("xpath=ancestor::*[contains(@class, \"frame-div\")][1]");

    await frameDiv.click({ button: "right" , position: {x: 5, y: 5}});
    await page.getByText("Duplicate").hover();
    await page.waitForTimeout(500);
    await page.getByText("Duplicate").click();
    
    await page.waitForTimeout(500);
    
    expect(readFileSync(await save(page, false), "utf-8")).toEqual(after);
}

test.describe("Test duplicating via menu", () => {
    test("Duplicate function call", async ({page}) => {
        await testDuplicateViaMenu(page, "print('A')\nlen(None)\n", "print", makeStrypeFile(["", "", `print('A') 
print('A') 
len(None) 
`]));
    });

    test("Duplicate if with else", async ({page}) => {
        await testDuplicateViaMenu(page, `if x > 0:
    return x
else:
    return y
`, "if", makeStrypeFile(["", "", `if x>0  :
    return x 
else :
    return y 
if x>0  :
    return x 
else :
    return y 
`]));
    });

    test("Duplicate elif without else", async ({page}) => {
        await testDuplicateViaMenu(page, `if x > 0:
    return x
elif y > 0:
    return y
`, "elif", makeStrypeFile(["", "", `if x>0  :
    return x 
elif y>0  :
    return y 
elif y>0  :
    return y 
`]));
        // Had a bug at one point where it was internally duplicating but not showing on screen, so check we see two elif:
        await expect(page.locator("div.frame-header-label", {hasText: "elif"})).toHaveCount(2);
    });
    test("Duplicate elif with else", async ({page}) => {
        await testDuplicateViaMenu(page, `if x > 0:
    return x
elif y > 0:
    return y
else:
    return z
`, "elif", makeStrypeFile(["", "", `if x>0  :
    return x 
elif y>0  :
    return y 
elif y>0  :
    return y 
else :
    return z 
`]));
        // Had a bug at one point where it was internally duplicating but not showing on screen, so check we see two elif:
        await expect(page.locator("div.frame-header-label", {hasText: "elif"})).toHaveCount(2);
    });
    
});

test.describe("Simple cut/paste and duplication", () => {
    test("Cut and paste a simple frame", async ({page}) => {
        await testBeforeAfterPaste(page, "print('A')\nprint('B')\n", ["End", "Shift+ArrowUp"], "cut", ["End", "ArrowUp"], makeStrypeFile(["", "", `print('B') 
print('A') 
`]));
    });

    test("Duplicate a simple frame using selection", async ({page}) => {
        await testBeforeAfterPaste(page, "print('A')\nprint('B')\n", ["End", "Shift+ArrowUp"], "duplicate", [], makeStrypeFile(["", "", `print('A') 
print('B') 
print('B') 
`]));
    });

    test("Duplicate two simple frames", async ({page}) => {
        await testBeforeAfterPaste(page, "print('A')\nprint('B')\n", ["End", "Shift+ArrowUp", "Shift+ArrowUp"], "duplicate", [], makeStrypeFile(["", "", `print('A') 
print('B') 
print('A') 
print('B') 
`]));
    });

    test("Duplicate two simple frames, twice", async ({page}) => {
        await testBeforeAfterPaste(page, "print('A')\nprint('B')\n", ["End", "Shift+ArrowUp", "Shift+ArrowUp"], "duplicate2", [], makeStrypeFile(["", "", `print('A') 
print('B') 
print('A') 
print('B') 
print('A') 
print('B') 
`]));
    });
});

test.describe("Ctrl-A behaviour", () => {
    
    test("Test Ctrl-A in main code", async ({page}) => {
        await testBeforeAfterPaste(page,`def foo():
   pass
print('A')
print('B')
`, ["End", "Control+a"], "cut", ["Home", "ArrowUp", "ArrowUp"],makeStrypeFile(["", `def foo ( ) :
    print('A') 
    print('B') 
`, ""]));
    });

    test("Test Ctrl-A once in a function selects whole function content", async ({page}) => {
        // Transfers content from src to dest: 
        await testBeforeAfterPaste(page,`def dest():
   pass
def src():
    print('A')
    if x > 0:
        print('B')
    print('C')
`, /* We get below print('B'): */ ["End", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "Control+a"], "cut", ["Home", "ArrowDown"],makeStrypeFile(["", `def dest ( ) :
    print('A') 
    if x>0  :
        print('B') 
    print('C') 
def src ( ) :
    pass
`, ""]));
    });

    test("Test Ctrl-A twice in a function selects function including header", async ({page}) => {
        // Moves second above first: 
        await testBeforeAfterPaste(page,`def first():
   pass
def second():
    print('A')
    if x > 0:
        print('B')
    print('C')
`, /* We get below print('B'): */ ["End", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "Control+a", "Control+a"], "cut", ["Home"],makeStrypeFile(["", `def second ( ) :
    print('A') 
    if x>0  :
        print('B') 
    print('C') 
def first ( ) :
    pass
`, ""]));
    });

    test("Test Ctrl-A three times in a function selects all functions", async ({page}) => {
        // So the paste will end up cutting all functions and pasting them back, so it looks like no change:
        await testBeforeAfterPaste(page,`def first():
   print('0') 
def second():
    print('A')
    if x > 0:
        print('B')
    print('C')
`, /* We get below print('B'): */ ["End", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "Control+a", "Control+a", "Control+a"], "cut", ["Home"],makeStrypeFile(["", `def first ( ) :
    print('0') 
def second ( ) :
    print('A') 
    if x>0  :
        print('B') 
    print('C') 
`, ""]));
    });
    
    const rep = <T>(n: number, x: T) => Array(n).fill(x);

    const classTestInput = `class Dest:
    dest_member = 0
    def dest(self):
        print('0')
class Src: 
    src_member_1 = 0
    def src(self):
        print('A')
        if x > 0:
            print('B')
        print('C')
    def src2():
        print('D')
`;
    test("Test Ctrl-A once in a class function selects whole function content", async ({page}) => {
        // Transfers content from src to dest functions: 
        await testBeforeAfterPaste(page,classTestInput, /* We get below print('B'): */ ["End", ...rep(8, "ArrowUp"), ...rep(1, "Control+a")], "cut", ["Home", "ArrowDown", "ArrowDown", "ArrowDown"],makeStrypeFile(["", `class Dest  :
    dest_member  = 0 
    def dest (self, ) :
        print('A') 
        if x>0  :
            print('B') 
        print('C') 
        print('0') 
class Src  :
    src_member_1  = 0 
    def src (self, ) :
        pass
    def src2 (self, ) :
        print('D') 
`, ""]));
    });

    test("Test Ctrl-A twice in a class function selects whole function", async ({page}) => {
        // Transfers src function to Dest class: 
        await testBeforeAfterPaste(page, classTestInput, /* We get below print('B'): */ ["End", ...rep(8, "ArrowUp"), ...rep(2, "Control+a")], "cut", ["Home", "ArrowDown", "ArrowDown"],makeStrypeFile(["", `class Dest  :
    dest_member  = 0 
    def src (self, ) :
        print('A') 
        if x>0  :
            print('B') 
        print('C') 
    def dest (self, ) :
        print('0') 
class Src  :
    src_member_1  = 0 
    def src2 (self, ) :
        print('D') 
`, ""]));
    });

    test("Test Ctrl-A three times in a class function selects whole class content", async ({page}) => {
        // Transfers all class content from Src to Dest: 
        await testBeforeAfterPaste(page, classTestInput, /* We get below print('B'): */ ["End", ...rep(8, "ArrowUp"), ...rep(3, "Control+a")], "cut", ["Home", "ArrowDown", "ArrowDown"],makeStrypeFile(["", `class Dest  :
    dest_member  = 0 
    src_member_1  = 0 
    def src (self, ) :
        print('A') 
        if x>0  :
            print('B') 
        print('C') 
    def src2 (self, ) :
        print('D') 
    def dest (self, ) :
        print('0') 
class Src  :
    pass
`, ""]));
    });

    test("Test Ctrl-A four times in a class function selects whole class", async ({page}) => {
        // Moves Src class above dest: 
        await testBeforeAfterPaste(page, classTestInput, /* We get below print('B'): */ ["End", ...rep(8, "ArrowUp"), ...rep(4, "Control+a")], "cut", ["Home"],makeStrypeFile(["", `class Src  :
    src_member_1  = 0 
    def src (self, ) :
        print('A') 
        if x>0  :
            print('B') 
        print('C') 
    def src2 (self, ) :
        print('D') 
class Dest  :
    dest_member  = 0 
    def dest (self, ) :
        print('0') 
`, ""]));
    });

    test("Test Ctrl-A five times in a class function selects all definitions", async ({page}) => {
        // Basically does nothing because everything ends where it began: 
        await testBeforeAfterPaste(page, classTestInput, /* We get below print('B'): */ ["End", ...rep(8, "ArrowUp"), ...rep(5, "Control+a")], "cut", ["Home"],makeStrypeFile(["", `class Dest  :
    dest_member  = 0 
    def dest (self, ) :
        print('0') 
class Src  :
    src_member_1  = 0 
    def src (self, ) :
        print('A') 
        if x>0  :
            print('B') 
        print('C') 
    def src2 (self, ) :
        print('D') 
`, ""]));
    });
    
    const classTestInput2 = `class OneFunc:
    def theOneFunc():
        return 42
class OneVar:
    theOneVar = 43
`;

    test("Test Ctrl-A twice below solitary function in class selects whole class", async ({page}) => {
        // Should move whole class: 
        await testBeforeAfterPaste(page, classTestInput2, /* We get into the class: */ ["End", ...rep(5, "ArrowUp"), ...rep(2, "Control+a")], "cut", ["End"],makeStrypeFile(["", `class OneVar  :
    theOneVar  = 43 
class OneFunc  :
    def theOneFunc (self, ) :
        return 42 
`, ""]));
    });
    test("Test Ctrl-A twice below solitary var in class selects whole class", async ({page}) => {
        // Should move whole class: 
        await testBeforeAfterPaste(page, classTestInput2, /* We get into the class: */ ["End", ...rep(2, "ArrowUp"), ...rep(2, "Control+a")], "cut", ["Home"],makeStrypeFile(["", `class OneVar  :
    theOneVar  = 43 
class OneFunc  :
    def theOneFunc (self, ) :
        return 42 
`, ""]));
    });

    test("Test Ctrl-A below var in definitions selects whole section", async ({page}) => {
        // Should move whole class: 
        await testBeforeAfterPaste(page, makeStrypeFile(["", `def foo():
    return 42
x = 43
`, ""]), /* We get into defs: */ ["End", ...rep(1, "ArrowUp"), ...rep(1, "Control+a")], "delete", [],makeStrypeFile(["", "", ""]));
    });

    test("Test Ctrl-A below solitary var in definitions selects whole section", async ({page}) => {
        // Should move whole class: 
        await testBeforeAfterPaste(page, makeStrypeFile(["", `x = 43
`, ""]), /* We get into defs: */ ["End", ...rep(1, "ArrowUp"), ...rep(1, "Control+a")], "cut", ["ArrowDown"],makeStrypeFile(["", "", `x  = 43 
`]));
    });
});

test.describe("Invalid pastes", () => {
    test("Test pasting joint frame inside a non-joint", async ({page}) => {
        // Most Python frames allow joint children!  But with doesn't
        await testPaste(page, "with foo as bar:\n  print('Hi')", ["ArrowUp"], "else:\n print('Bye')", makeStrypeFile(["", "", `with foo  as bar  :
    print('Hi') 
`]));
    });

    test("Test pasting joint frame at top-level", async ({page}) => {
        // Most Python frames allow joint children!  But with doesn't
        await testPaste(page, "with foo as bar:\n  print('Hi')", [], "else:\n print('Bye')", makeStrypeFile(["", "", `with foo  as bar  :
    print('Hi') 
`]));
    });

    test("Test pasting joint frame inside a joint that doesn't accept it", async ({page}) => {
        await testPaste(page, "while foo:\n  print('Hi')", ["ArrowUp"], "elif True:\n print('Bye')", makeStrypeFile(["", "", `while foo  :
    print('Hi') 
`]));
    });

    test("Test pasting joint frame inside a joint that accepts it", async ({page}) => {
        await testPaste(page, "while foo:\n  print('Hi')", ["ArrowUp"], "else:\n print('Bye')", makeStrypeFile(["", "", `while foo  :
    print('Hi') 
else :
    print('Bye') 
`]));
    });

    test("Test pasting joint frames inside a joint that accepts only some of it", async ({page}) => {
        await testPaste(page, "while foo:\n  print('Hi')", ["ArrowUp"], "elif True:\n print('Bye')\nelse:\n print('Bye')", makeStrypeFile(["", "", `while foo  :
    print('Hi') 
`]));
    });

    test("Test pasting joint frames inside a joint that accepts all of it", async ({page}) => {
        await testPaste(page, "if foo:\n  print('Hi')", ["ArrowUp"], "elif True:\n print('Bye')\nelse:\n print('Bye bye')", makeStrypeFile(["", "", `if foo  :
    print('Hi') 
elif True  :
    print('Bye') 
else :
    print('Bye bye') 
`]));
    });

    test("Test pasting else inside if", async ({page}) => {
        await testPaste(page, "if foo:\n  print('Hi')", ["ArrowUp"], "else:\n print('Bye bye')", makeStrypeFile(["", "", `if foo  :
    print('Hi') 
else :
    print('Bye bye') 
`]));
    });

    test("Test pasting else inside empty if", async ({page}) => {
        await testPaste(page, "if foo:\n  pass", ["ArrowUp"], "else:\n print('Bye bye')", makeStrypeFile(["", "", `if foo  :
    pass
else :
    print('Bye bye') 
`]));
    });

    test("Test (invalidly) pasting else at empty top-level", async ({page}) => {
        await testPaste(page, "", [], "else:\n print('Bye bye')", makeStrypeFile(["", "", ""]));
    });

    test("Test pasting else inside if+elif", async ({page}) => {
        await testPaste(page, "if foo:\n  print('Hi')\nelif True:\n print('Bye')", ["ArrowUp"], "else:\n print('Bye bye')", makeStrypeFile(["", "", `if foo  :
    print('Hi') 
elif True  :
    print('Bye') 
else :
    print('Bye bye') 
`]));
    });

    test("Test pasting else inside if+empty elif", async ({page}) => {
        await testPaste(page, "if foo:\n  print('Hi')\nelif True:\n pass", ["ArrowUp"], "else:\n print('Bye bye')", makeStrypeFile(["", "", `if foo  :
    print('Hi') 
elif True  :
    pass
else :
    print('Bye bye') 
`]));
    });

    test("Test pasting elif inside if+else", async ({page}) => {
        await testPaste(page, "if foo:\n  print('Hi')\nelse:\n print('Bye bye')", ["ArrowUp"], "elif True:\n print('Bye')", makeStrypeFile(["", "", `if foo  :
    print('Hi') 
else :
    print('Bye bye') 
`]));
    });

    test("Test pasting else inside if+else", async ({page}) => {
        await testPaste(page, "if foo:\n  print('Hi')\nelse:\n print('Bye bye')", ["ArrowUp"], "else:\n print('Z')", makeStrypeFile(["", "", `if foo  :
    print('Hi') 
else :
    print('Bye bye') 
`]));
    });
});

test.describe("Pasting assignments at section boundaries", () => {
    const destinations: { name: string, keys: string[] }[] = [
        { name: "main", keys: [] },
        { name: "definitions", keys: ["ArrowUp"] },
        { name: "imports", keys: ["ArrowUp", "ArrowUp"] },
    ];

    const assignmentTexts = ["x  = 0 \n", "x  = 0 \ny  = 0 \n" ];

    for (const assignmentText of assignmentTexts) {
        test(`Pasting "${assignmentText}" in imports puts it in definitions`, async ({page}) => {
            await testPaste(page, "", ["ArrowUp", "ArrowUp"], assignmentText, makeStrypeFile(["", assignmentText, ""]));
        });

        test(`Pasting "${assignmentText}" in definitions remains there`, async ({page}) => {
            await testPaste(page, "", ["ArrowUp"], assignmentText, makeStrypeFile(["", assignmentText, ""]));
        });

        test(`Pasting "${assignmentText}" in main puts it there`, async ({page}) => {
            await testPaste(page, "", [], assignmentText, makeStrypeFile(["", "", assignmentText]));
        });
    }

    const assignmentFormatted = "x  = 0 \n";
    const printFormatted = "print('A') \n";

    for (const { name, keys } of destinations) {
        test(`Pasting assignment then print in ${name} puts assignment as described above but print in main`, async ({page}) => {
            const expected = name === "main"
                ? makeStrypeFile(["", "", assignmentFormatted + printFormatted])
                : makeStrypeFile(["", assignmentFormatted, printFormatted]);
            await testPaste(page, "", keys, assignmentFormatted + printFormatted, expected);
        });

        test(`Pasting print then assignment in ${name} always puts both in main`, async ({page}) => {
            await testPaste(page, "", keys, printFormatted + assignmentFormatted, makeStrypeFile(["", "", printFormatted + assignmentFormatted]));
        });
    }
});

test.describe("Pasting a function with a leading self param removes it", () => {
    // Strype adds "self" automatically to methods inside a class.  If pasted Python text for a function
    // already has "self" as its first parameter (typically because it was copied from a method elsewhere),
    // we end up with a duplicate "self, self" unless we strip the leading "self" from the pasted params.
    // We do this whether the function is pasted into a class (where Strype re-adds self automatically) or
    // as a top-level function (where a leading "self" doesn't belong either way).
    const classDest = `class Dest:
    def existing():
        pass
`;

    test("Pasting a function with only a self param into a class removes self", async ({page}) => {
        await testPaste(page, classDest, ["End", "ArrowUp", "ArrowUp"], "def foo(self):\n    return 6\n", makeStrypeFile(["", `class Dest  :
    def existing (self, ) :
        pass
    def foo (self, ) :
        return 6 
`, ""]));
    });

    test("Pasting a function with a self param plus more params into a class removes self", async ({page}) => {
        await testPaste(page, classDest, ["End", "ArrowUp", "ArrowUp"], "def foo(self, x, y):\n    return x+y\n", makeStrypeFile(["", `class Dest  :
    def existing (self, ) :
        pass
    def foo (self,x,y ) :
        return x+y 
`, ""]));
    });

    test("Pasting a function with only a self param into top-level functions removes self", async ({page}) => {
        await testPaste(page, "", ["ArrowUp"], "def foo(self):\n    return 6\n", makeStrypeFile(["", `def foo ( ) :
    return 6 
`, ""]));
    });

    test("Pasting a function with a self param plus more params into top-level functions removes self", async ({page}) => {
        await testPaste(page, "", ["ArrowUp"], "def foo(self, x, y):\n    return x+y\n", makeStrypeFile(["", `def foo (x,y ) :
    return x+y 
`, ""]));
    });

    // These last two tests copy an actual Strype method frame (rather than pasting a string literal) and paste
    // it elsewhere, to check the same fix applies when the "self, self" duplication would arise from a genuine
    // Strype copy/paste rather than from pasting in external text.
    const twoClasses = `class Src:
    def bar(self, x):
        return x*2
class Dest:
    def existing():
        pass
`;
    // Selects the whole "def bar(self, x): return x*2" method (header and body) inside Src:
    const selectBarMethod = ["End", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "Control+a"];

    test("Copying a method and pasting it into another class removes self", async ({page}) => {
        await testBeforeAfterPaste(page, twoClasses, selectBarMethod, "copy", ["ArrowDown", "ArrowDown"], makeStrypeFile(["", `class Src  :
    def bar (self,x ) :
        return x*2 
class Dest  :
    def bar (self,x ) :
        return x*2 
    def existing (self, ) :
        pass
`, ""]));
    });

    test("Copying a method and pasting it as a top-level function removes self", async ({page}) => {
        await testBeforeAfterPaste(page, twoClasses, selectBarMethod, "copy", ["End"], makeStrypeFile(["", `class Src  :
    def bar (self,x ) :
        return x*2 
class Dest  :
    def existing (self, ) :
        pass
def bar (x ) :
    return x*2 
`, ""]));
    });
});
