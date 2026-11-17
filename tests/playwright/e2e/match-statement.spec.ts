import {test, expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {save, testPlaywrightRoundTripImportAndDownload} from "../support/loading-saving";
import {setupStrypeTest} from "../support/general";
import {doPagePaste, getDefaultStrypeProjectDocumentationFullLine, getDefaultStrypeProjectImportsFullLine, getDefaultStrypeProjectTestingFullLines, pressFrameShortcut, pressN, waitForEditorSettled} from "../support/editor";
import {checkConsoleContent, runToFinish} from "../support/execution";

const defaultStandardStrypeProjectDocLiteral = getDefaultStrypeProjectDocumentationFullLine();
const defaultStrypeProjectImportsLiteral = getDefaultStrypeProjectImportsFullLine();

const basicMatchLiteral = `
#(=> Strype:1:std
${defaultStandardStrypeProjectDocLiteral}#(=> Section:Imports
${defaultStrypeProjectImportsLiteral}#(=> Section:Definitions
#(=> Section:Main
match ___strype_blank  :
    case _  :
        pass
myString  = "Hello from Strype" 
print(myString) 
${getDefaultStrypeProjectTestingFullLines()}#(=> Section:End
`;

const defaultProjectCodeLiteral = `
#(=> Strype:1:std
${defaultStandardStrypeProjectDocLiteral}#(=> Section:Imports
${defaultStrypeProjectImportsLiteral}#(=> Section:Definitions
#(=> Section:Main
myString  = "Hello from Strype" 
print(myString) 
${getDefaultStrypeProjectTestingFullLines()}#(=> Section:End
`;

const complexMatchCodeLiteral = `
match a  :
    #match comment
    case _  :
        a1() 
    case f  :
        a2() 
        print("2") 
    case "f"  :
        a3() 
        while True  :
            print("3") 
`;

const scrappedMatchWithDefaultCode = defaultProjectCodeLiteral.replace("#(=> Section:Main",`#(=> Section:Main
#match comment
a1() 
a2() 
print("2") 
a3() 
while True  :
    print("3") `);

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 240000, skipPyodide: false});
});

test.describe("Add Match statement", () => {
    test("Add frame (basic)", async ({page}) => {
        await pressFrameShortcut(page, "m");
        expect(readFileSync(await save(page), "utf-8")).toEqual(basicMatchLiteral.trimStart());
    });

    test("Add frame (with match expression and one guarded extra case)", async ({page}) => {
        await pressFrameShortcut(page, "m");
        await waitForEditorSettled(page);
        await page.keyboard.type("foo");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "c");
        await waitForEditorSettled(page);
        await page.keyboard.type("bar if x>0");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "r");
        await waitForEditorSettled(page);
        await page.keyboard.type("\"hi\"");
        await waitForEditorSettled(page);
        expect(readFileSync(await save(page), "utf-8")).toEqual(`
#(=> Strype:1:std
${defaultStandardStrypeProjectDocLiteral}#(=> Section:Imports
${defaultStrypeProjectImportsLiteral}#(=> Section:Definitions
#(=> Section:Main
match foo  :
    case bar if x > 0  :
        return "hi" 
    case _  :
        pass
myString  = "Hello from Strype" 
print(myString) 
${getDefaultStrypeProjectTestingFullLines()}#(=> Section:End
`.trimStart());
    });

    test("Add frame (complex case blocks)", async ({page}) => {
        await pressFrameShortcut(page, "m");
        await waitForEditorSettled(page);
        await page.keyboard.type("value");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await page.keyboard.press("#");
        await waitForEditorSettled(page);
        await page.keyboard.type(" 1. Literal patterns");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "c");
        await waitForEditorSettled(page);
        await page.keyboard.type("0");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "r");
        await waitForEditorSettled(page);
        await page.keyboard.type("\"Got zero\"");
        await waitForEditorSettled(page);
        await pressN("ArrowDown", 2, true)(page);
        await pressFrameShortcut(page, "c");
        await waitForEditorSettled(page);
        await page.keyboard.type("1|2|3");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "r");
        await waitForEditorSettled(page);
        await page.keyboard.type("\"Got a small number (1-3)\"");
        await waitForEditorSettled(page);
        await pressN("ArrowDown", 2, true)(page);
        await page.keyboard.press("#");
        await waitForEditorSettled(page);
        await page.keyboard.type(" 2. Type patterns");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "c");
        await waitForEditorSettled(page);
        await page.keyboard.type("str()");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "r");
        await waitForEditorSettled(page);
        await page.keyboard.type("f\"Got a string: {value}\"");
        await waitForEditorSettled(page);
        await pressN("ArrowDown", 2, true)(page);
        await pressFrameShortcut(page, "c");
        await waitForEditorSettled(page);
        await page.keyboard.type("int()");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "r");
        await waitForEditorSettled(page);
        await page.keyboard.type("f\"Got an integer: {value}\"");
        await waitForEditorSettled(page);
        await pressN("ArrowDown", 2, true)(page);
        await page.keyboard.press("#");
        await waitForEditorSettled(page);
        await page.keyboard.type(" 3. Sequence patterns");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "c");
        await waitForEditorSettled(page);
        await page.keyboard.type("[x,y]");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "r");
        await waitForEditorSettled(page);
        await page.keyboard.type("f\"Got a 2-item list: x={x}, y={y}");
        await waitForEditorSettled(page);
        await pressN("ArrowDown", 2, true)(page);   
        await page.keyboard.press("#");
        await waitForEditorSettled(page);
        await page.keyboard.type(" 4. Mapping patterns");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "c");
        await waitForEditorSettled(page);
        await page.keyboard.type("{\"type\":\"point\",\"x\":x,\"y\":y}");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "r");
        await waitForEditorSettled(page);
        await page.keyboard.type("f\"Got a point: ({x}, {y})");
        await waitForEditorSettled(page);
        await pressN("ArrowDown", 2, true)(page);
        await page.keyboard.press("#");
        await waitForEditorSettled(page);
        await page.keyboard.type(" 5. Class patterns");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "c");
        await waitForEditorSettled(page);
        await page.keyboard.type("complex(real=r,imag=i)");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "r");
        await waitForEditorSettled(page);
        await page.keyboard.type("f\"Complex number: real={r}, imag={i}");
        await waitForEditorSettled(page);
        await pressN("ArrowDown", 2, true)(page);
        await page.keyboard.press("#");
        await waitForEditorSettled(page);
        await page.keyboard.type(" 6. OR-patterns with structure");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "c");
        await waitForEditorSettled(page);
        await page.keyboard.type("(\"yes\"|\"y\"|\"ok\")");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "r");
        await waitForEditorSettled(page);
        await page.keyboard.type("\"Affirmative\"");
        await waitForEditorSettled(page);
        await pressN("ArrowDown", 2, true)(page);
        await page.keyboard.press("#");
        await waitForEditorSettled(page);
        await page.keyboard.type(" 7. Guard conditions");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "c");
        await waitForEditorSettled(page);
        await page.keyboard.type("int(n) if n<0");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "r");
        await waitForEditorSettled(page);
        await page.keyboard.type("\"Negative integer\"");
        await waitForEditorSettled(page);
        await pressN("ArrowDown", 2, true)(page);
        await pressFrameShortcut(page, "c");
        await waitForEditorSettled(page);
        await page.keyboard.type("int(n) if n>100");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "r");
        await waitForEditorSettled(page);
        await page.keyboard.type("\"Large integer\"");
        await waitForEditorSettled(page);
        await pressN("ArrowDown", 2, true)(page);
        await page.keyboard.press("#");
        await waitForEditorSettled(page);
        await page.keyboard.type(" 8. Default catch-all");
        await waitForEditorSettled(page);
        await pressN("ArrowDown", 2, true)(page);
        await pressFrameShortcut(page, "r");
        await waitForEditorSettled(page);
        await page.keyboard.type("f\"Something else: {value}\"");
        await waitForEditorSettled(page);
        // Note the following content is redacted from points 3 and 4 as we don't support rest patterns yet
        //# 3. Sequence patterns
        //case [x, y, *rest]  :
        //    return f"List with at least 2 items: x={x}, y={y}, rest={rest}" 
        //# 4. Mapping patterns
        //case {"type": "user", "name": name, **extra}  :
        //    return f"User {name} with extra fields {extra}" 
        expect(readFileSync(await save(page), "utf-8")).toEqual(`
#(=> Strype:1:std
${defaultStandardStrypeProjectDocLiteral}#(=> Section:Imports
${defaultStrypeProjectImportsLiteral}#(=> Section:Definitions
#(=> Section:Main
match value  :
    # 1. Literal patterns
    case 0  :
        return "Got zero" 
    case 1 | 2 | 3  :
        return "Got a small number (1-3)" 
    # 2. Type patterns
    case str()  :
        return f"Got a string: {value}" 
    case int()  :
        return f"Got an integer: {value}" 
    # 3. Sequence patterns
    case [x,y]  :
        return f"Got a 2-item list: x={x}, y={y}" 
    # 4. Mapping patterns
    case {"type":"point","x":x,"y":y}  :
        return f"Got a point: ({x}, {y})" 
    # 5. Class patterns
    case complex(real=r,imag=i)  :
        return f"Complex number: real={r}, imag={i}" 
    # 6. OR-patterns with structure
    case ("yes" | "y" | "ok")  :
        return "Affirmative" 
    # 7. Guard conditions
    case int(n) if n < 0  :
        return "Negative integer" 
    case int(n) if n > 100  :
        return "Large integer" 
    # 8. Default catch-all
    case _  :
        return f"Something else: {value}" 
myString  = "Hello from Strype" 
print(myString) 
${getDefaultStrypeProjectTestingFullLines()}#(=> Section:End
`.trimStart());
    });

    test("Wrap with match", async ({page}) => {
        // Select the 2 frames of the default project code (in the main code section)
        await page.keyboard.press((process.platform == "darwin" ? "Meta" : "Control") + "+a");
        // Then wrap with a match statement
        await pressFrameShortcut(page, "m");
        expect(readFileSync(await save(page), "utf-8")).toEqual(`
#(=> Strype:1:std
${defaultStandardStrypeProjectDocLiteral}#(=> Section:Imports
${defaultStrypeProjectImportsLiteral}#(=> Section:Definitions
#(=> Section:Main
match ___strype_blank  :
    case _  :
        myString  = "Hello from Strype" 
        print(myString) 
${getDefaultStrypeProjectTestingFullLines()}#(=> Section:End
`.trimStart());
    });
});

test.describe("Delete Match statement", () => {
    test("Delete before Match", async ({page}) => {
        await pressFrameShortcut(page, "m");
        expect(readFileSync(await save(page), "utf-8")).toEqual(basicMatchLiteral.trimStart());
        await page.keyboard.press("ArrowUp");
        await waitForEditorSettled(page);
        await page.keyboard.press("Delete");
        await waitForEditorSettled(page);
        expect(readFileSync(await save(page, false), "utf-8")).toEqual(defaultProjectCodeLiteral.trimStart());
    });

    test("Backspace after Match", async ({page}) => {
        await pressFrameShortcut(page, "m");
        await waitForEditorSettled(page);
        expect(readFileSync(await save(page), "utf-8")).toEqual(basicMatchLiteral.trimStart());
        await pressN("ArrowDown", 3, true)(page);
        await page.keyboard.press("Backspace");
        await waitForEditorSettled(page);
        expect(readFileSync(await save(page, false), "utf-8")).toEqual(defaultProjectCodeLiteral.trimStart());
    });

    test("Backspace inside Match", async ({page}) => {
        await pressFrameShortcut(page, "m");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await page.keyboard.press("Backspace");
        await waitForEditorSettled(page);
        // This backspace should delete the match and its content
        expect(readFileSync(await save(page), "utf-8")).toEqual(defaultProjectCodeLiteral.trimStart());    
    });
    
    test("Backspace inside complex Match", async ({page}) => {
        // Paste some small complex match case code
        await doPagePaste(page, complexMatchCodeLiteral);
        await waitForEditorSettled(page);
        // Go back to the top of the main section, then inside main
        await page.keyboard.press("Home");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await page.keyboard.press("Backspace");
        await waitForEditorSettled(page);
        // This backspace should delete the match and the cases, bringing up the body contents.
        expect(readFileSync(await save(page), "utf-8")).toEqual(scrappedMatchWithDefaultCode.trimStart());    
    });
    
    test("Backspace inside Case", async ({page}) => {
        await pressFrameShortcut(page, "m");
        // Add a comment and an if in the case
        await pressN("ArrowDown", 2, true)(page);
        await page.keyboard.press("#");
        await waitForEditorSettled(page);
        await page.keyboard.type("comment test");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await pressFrameShortcut(page, "i");
        await waitForEditorSettled(page);
        await pressN("ArrowUp", 2, true)(page);
        // Try backspace: shouldn't change anything as case is not empty-like
        await page.keyboard.press("Backspace");
        await waitForEditorSettled(page);
        expect(readFileSync(await save(page), "utf-8")).toEqual(`
#(=> Strype:1:std
${defaultStandardStrypeProjectDocLiteral}#(=> Section:Imports
${defaultStrypeProjectImportsLiteral}#(=> Section:Definitions
#(=> Section:Main
match ___strype_blank  :
    case _  :
        #comment test
        if ___strype_blank  :
            pass
myString  = "Hello from Strype" 
print(myString) 
${getDefaultStrypeProjectTestingFullLines()}#(=> Section:End
`.trimStart());
        // Delete the if, and try again to backspace: we should delete the case and bring the comment up
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await page.keyboard.press("Delete");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowUp");
        await waitForEditorSettled(page);
        await page.keyboard.press("Backspace");
        await waitForEditorSettled(page);
        expect(readFileSync(await save(page, false), "utf-8")).toEqual(`
#(=> Strype:1:std
${defaultStandardStrypeProjectDocLiteral}#(=> Section:Imports
${defaultStrypeProjectImportsLiteral}#(=> Section:Definitions
#(=> Section:Main
match ___strype_blank  :
    pass
    #comment test
myString  = "Hello from Strype" 
print(myString) 
${getDefaultStrypeProjectTestingFullLines()}#(=> Section:End
`.trimStart());        
    });
});

test("Round trip", async ({page}) => {
    await testPlaywrightRoundTripImportAndDownload(page, "tests/cypress/fixtures/project-match-statement.spy");
});

test.describe("Execute match statement", () => {
    // Check match statement is matched when using the default case
    // (see previous bug https://github.com/k-pet-group/Strype/issues/978 )
    test("Use default case", async ({page}) => {
        await pressFrameShortcut(page, "m");
        await waitForEditorSettled(page);
        await page.keyboard.type("\"1\"");
        await waitForEditorSettled(page);
        // Two arrow right should get us into the default case:
        await pressN("ArrowRight", 2, true)(page);
        // Then we must delete the backspace which is there by default:
        await page.keyboard.press("Delete");
        await waitForEditorSettled(page);
        await page.keyboard.type("\"1\"");
        await waitForEditorSettled(page);
        // One more arrow right takes us to the body:
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        // Add a print("Matched"):
        await pressFrameShortcut(page, "p");
        await page.keyboard.type("\"Matched!\"");
        // Run it:
        await runToFinish(page);
        await checkConsoleContent(page, "Matched!\nHello from Strype\n");
        // Also check it saves to right form:
        expect(readFileSync(await save(page, true), "utf-8")).toEqual(`#(=> Strype:1:std
${defaultStandardStrypeProjectDocLiteral}#(=> Section:Imports
${defaultStrypeProjectImportsLiteral}#(=> Section:Definitions
#(=> Section:Main
match "1"  :
    case "1"  :
        print("Matched!") 
myString  = "Hello from Strype" 
print(myString) 
${getDefaultStrypeProjectTestingFullLines()}#(=> Section:End
`);
    });
});
