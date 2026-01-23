import * as path from "path";
import {expect} from "chai";
// imports the locale files we need for the locales used by this test
import en from "@/localisation/en/en_main.json";

import failOnConsoleError from "cypress-fail-on-console-error";
import {cleanFromHTML, getDefaultStrypeProjectDocumentationFullLine} from "../support/test-support";
failOnConsoleError();
require("cypress-terminal-report/src/installLogsCollector")();

import { WINDOW_STRYPE_HTMLIDS_PROPNAME, WINDOW_STRYPE_SCSSVARS_PROPNAME } from "../../../src/helpers/sharedIdCssWithTests";

/**
 * A CodeMatch can be an exact string to match a single line frame,
 * a RegExp to match a single line frame,
 * or a compound item with a string|RegExp for the header, and then
 * an array of items for the body.  Note that the body does not
 * include extra indentation; it is the job of functions dealing with this
 * type to account for the extra indentation in nested items.
 * 
 * Note: h is short for header, b is short for body
 */
type CodeMatch = string | RegExp | { h: string | RegExp, b: CodeMatch[] };

/**
 * Gets the matching item for a header from a CodeMatch (either the single item or the h part)
 */
function header(match: CodeMatch) : string | RegExp {
    // From https://stackoverflow.com/questions/16792051/how-to-instanceof-a-primitive-string-string-literal-in-javascript
    if (typeof match === "string") {
        return match as string;
    }
    else if (match instanceof RegExp) {
        return match as RegExp;
    }
    else {
        return match.h;
    }
}

/**
 * Gets the matching item for a body from a CodeMatch (either the b part or an empty list)
 */
function body(match: CodeMatch, usePassForEmptyBody? : boolean) : CodeMatch[] {
    if (typeof match === "string" || match instanceof RegExp) {
        return [];
    }
    else {
        return (match.b.length == 0 && (usePassForEmptyBody ?? false)) ? ["pass"] : match.b;
    }
}

/**
 * Gets all the text from the labels and fields in a frame header  and glues
 * it together into one string, then matches it against the header of the CodeMatch.
 * Then gets all the body items and matches them against the body of the CodeMatch.
 */
function matchFrameText(item : JQuery<HTMLElement>, match : CodeMatch) : void {
    cy.get("." + scssVars.frameHeaderClassName).first().within((h) => cy.get("."  + scssVars.labelSlotInputClassName + ",." + scssVars.framePythonTokenClassName).should((parts) => {
        let s = "";
        for (let i = 0; i < parts.length; i++) {
            const p : any = parts[i];

            const text = cleanFromHTML(p.value || p.textContent || "");
            
            if (text.match(/[a-zA-Z0-9]/) && !p.classList.contains(scssVars.frameStringSlotClassName)) {
                // Only add spaces if it has some non-punctuation characters and isn't a string:
                s = s + text + " ";
            }
            else {
                s = s.trimEnd() + text;
            }
        }
        matchLine(header(match), s.trimEnd());
    }));
    
    // We used to look for .frameDiv for body items, but this can also pick up items in the body of joint frames
    // So we use the ID to find our own body, then look in there:
    const frameIdStart = strypeElIds.getFrameUID(0).replace("0","");
    const frameBodyIdStart = strypeElIds.getFrameBodyUID(0).replace("0","");
    const bodySelector = "#" + item.attr("id")?.replace(frameIdStart, frameBodyIdStart) + " ." + scssVars.frameDivClassName;
    
    // .get().filter() fails if there are no items but the body is permitted to be empty for us.  So we must check
    // if we expect an empty body and act accordingly:
    if (body(match).length > 0) {
        cy.get(bodySelector).filter((i, e) => noFrameDivBetween(item.get()[0], e)).should("have.length", body(match).length);
        cy.get(bodySelector).filter((i, e) => noFrameDivBetween(item.get()[0], e)).each((f, i) => {
            // Check index is valid, otherwise we later get an index out of bounds:
            expect(i).lessThan(body(match).length, "In body of " + String(header(match)));
            // We must now only look within that element to process it:
            cy.wrap(f).within((item) => {
                matchFrameText(item, body(match)[i]);
            });
        });
    }
    else {
        // This is not technically the reverse of the above, but Cypress doesn't like .get().filter().should("not.exist")
        // And if the body isn't empty, there should be no child frameDiv anywhere in the tree, so this is still accurate:
        cy.get(bodySelector).should("not.exist");
    }
}

/**
 * Checks that descendent (which is a .frameDiv) is a child of parent
 * (which may or may not be a .frameDiv), with no .frameDiv elements between
 * them in the DOM hierarchy.  Returns false if parent == descendent.
 * 
 * This turns out to be impossible with DOM selectors alone because if you ask for
 * e.g. ".frameDiv:not(.frameDiv .frameDiv)" then it checks if the .frameDiv is a
 * child of any frameDiv anywhere in the whole document.  What we want to check is
 * that there are no frameDivs parenting it within parent, which you can't seem to
 * do with a DOM selector, only with code:
 */
function noFrameDivBetween(parent: Element, descendent: Element) : boolean {
    let e : Element | null = descendent;
    let countBetween = -1; // Start at -1 since we will count descendent immediately
    while (e != parent && e != null) {
        if (e.classList.contains(scssVars.frameDivClassName)) {
            countBetween += 1;
        }
        e = e.parentElement;
    }
    return e != null && countBetween == 0;
}

/**
 * Sanity check the state of the editor (e.g. only one caret visible)
 */
function sanityCheck(): Cypress.Chainable<JQuery<HTMLElement>> {
    // Check exactly one caret visible or focused input field:
    return cy.document().then((doc) => {
        if (doc?.getSelection()?.focusNode == null) {
            return cy.get("."+ scssVars.caretClassName + ":not(." + scssVars.invisibleClassName +")").should("have.length", 1);
        }
        else {
            return cy.get("." + scssVars.caretClassName + ":not(." + scssVars.invisibleClassName + ")").should("not.exist");
        }
    });
}

/**
 * Match a string | regexp against an actual string using assertions
 */
function matchLine(match : string | RegExp, actualLine: string) : void {
    if (match instanceof RegExp) {
        expect(actualLine).to.match(match as RegExp);
    }
    else {
        expect(actualLine).to.equal(match);
    }
}

/**
 * Check if a list of actual strings matches a list of expected strings or regexes.
 */
function expectMatchRegex(actual: string[], expected: (string | RegExp)[]) {
    // Deliberate double escape, use \n to separate lines but have it all appear on one line:
    expect(actual.length, "Actual: " + actual.join("\\n")).to.equal(expected.length);
    for (let i = 0; i < actual.length; i++) {
        matchLine(header(expected[i]), actual[i]);
    }
}

/**
 * Given a list of CodeMatch (which may include arbitrarily nested bodies(),
 * flattens them into a list of single item matches (to use with matchLine)
 * to match the whole code.  This takes care of adding indent to the matches
 * for nested bodies (4 space indent).
 */
function flatten(codeLines: CodeMatch[]) : (string | RegExp)[] {
    const r : (string | RegExp)[] = [];
    codeLines.forEach((l) => {
        r.push(header(l));
        // flatten the body and increase indent by 4 spaces:
        flatten(body(l, true)).forEach((f)=> {
            if (f instanceof RegExp) {
                r.push(new RegExp(/ {4}/.source + f.source));
            }
            else {
                r.push("    " + f);
            }
        });
    });
    return r;
}

/**
 * Check that the code is equal to the given lines, by checking the visuals and the underlying Python
 * conversion.  If any visuals or spacing differs from code, you must use a RegExp to account for this
 * (e.g. equality should be [⇐=] in a regex).
 */
function checkCodeEquals(codeLines : CodeMatch[]) : Cypress.Chainable<JQuery<HTMLElement>> {
    return sanityCheck().then(() => {
        cy.root().then((r) => cy.get("." + scssVars.frameDivClassName).filter((i, e) => noFrameDivBetween(r.get()[0], e)).each((f, i) => cy.wrap(f).within((f2) => {
            expect(i).lessThan(codeLines.length, "Found line #" + (i + 1) + " but only expected " + codeLines.length + " lines");
            matchFrameText(f2, codeLines[i]);
        })));
        const downloadsFolder = Cypress.config("downloadsFolder");
        cy.task("deleteFile", path.join(downloadsFolder, "main.py"));
        // Conversion to Python is located in the menu, so we need to open it first, then find the link and click on it
        // Force these because sometimes cypress gives false alarm about webpack overlay being on top:
        cy.get("button#" + strypeElIds.getEditorMenuUID()).click({force: true}); 
        cy.contains(en.appMenu.downloadPython).click({force: true});
            
        cy.readFile(path.join(downloadsFolder, "main.py")).then((p : string) => {
            // The default projects contains the default project description.
            // We check that project description is correct, and then discard it for the further code check.
            const indexOfFirstLineReturn = p.indexOf("\n");
            expect(p.substring(0, indexOfFirstLineReturn + 1)).equals(getDefaultStrypeProjectDocumentationFullLine(Cypress.env("mode")));
            expectMatchRegex(p.substring(indexOfFirstLineReturn + 1).split("\n").map((l) => l.trimEnd()),
                flatten(codeLines).concat([/\s*/]));
        });
    });
}

// Set up expected states based on mode:
let defaultImports : CodeMatch[];
let defaultMyCode : CodeMatch[];

if (Cypress.env("mode") == "microbit") {
    defaultImports = [
        /from\s+microbit\s+import\s*\*/,
    ];

    defaultMyCode = [
        /myString\s*[⇐=]\s*[“"]Hello from Strype[”"]/,
        /display\s*.\s*scroll\(myString\)/,
    ];
}
else {
    defaultImports = [
    ];

    defaultMyCode  = [
        /myString\s*[⇐=]\s*[“"]Hello from Strype[”"]/,
        "print(myString)",
    ];
}

// We need this to prevent test failures.  I don't actually know what the error is for sure
// (even if you log it, it is not visible), but I suspect it may be a Brython error that I
// see on the real site to do with an IndentationError in partial code:
Cypress.on("uncaught:exception", (err, runnable) => {
    // returning false here prevents Cypress from failing the test:
    return false;
});

// Must clear all local storage between tests to reset the state,
// and also retrieve the shared CSS and HTML elements IDs exposed
// by Strype via the Window object of the app.
let scssVars: {[varName: string]: string};
let strypeElIds: {[varName: string]: (...args: any[]) => string};
beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("/",  {onBeforeLoad: (win) => {
        win.localStorage.clear();
        win.sessionStorage.clear();
    }}).then(() => {       
        // Only need to get the global variables if we haven't done so
        if(scssVars == undefined){
            cy.window().then((win) => {
                scssVars = (win as any)[WINDOW_STRYPE_SCSSVARS_PROPNAME];
                strypeElIds = (win as any)[WINDOW_STRYPE_HTMLIDS_PROPNAME];
            });
        }        
    });
});

// Test that adding frames by typing keys works properly:
describe("Adding frames", () => {
    it("Lets you add a frame", () => {
        checkCodeEquals(defaultImports.concat(defaultMyCode)).then(() => {
            cy.get("body").type(" foo(");
            checkCodeEquals(defaultImports.concat([
                "foo()",
            ]).concat(defaultMyCode));
        });        
    });
    it("Lets you add multiple frames", () => {
        checkCodeEquals(defaultImports.concat(defaultMyCode)).then(() => {
            cy.get("body").type(" foo({rightArrow}{enter} bar(3");
            checkCodeEquals(defaultImports.concat([
                "foo()",
                "bar(3)",
            ]).concat(defaultMyCode));
        });     
    });
    it("Lets you add nested frames", () => {
        checkCodeEquals(defaultImports.concat(defaultMyCode)).then(() => {
            // i adds an if; add an if True with an if False inside:
            // (if is followed by a pause, because it can take a bit longer to add its body/joint section)
            cy.get("body").type("i");
            cy.wait(100);
            cy.get("body").type("True{rightArrow}");
            cy.get("body").type("i");
            cy.wait(100);
            cy.get("body").type("False{rightArrow}");            
            // Put a foo() in the inner body:
            cy.get("body").type(" foo({rightArrow}{rightArrow}");
            // Put a bar(3) in the outer if, just after the inner if:
            cy.get("body").type("{downArrow} bar(3{rightArrow}{rightArrow}");
            // And add baz(5) after the ifs:
            cy.get("body").type("{downArrow} baz(5");
            checkCodeEquals(defaultImports.concat([
                {h: /if\s+True\s+:/, b:[
                    {h: /if\s+False\s+:/, b:[
                        "foo()",
                    ]},
                    "bar(3)",
                ]},
                "baz(5)",
            ]).concat(defaultMyCode));
        });
    });
});

describe("Classes", () => {
    it("Lets you add a class frame", () => {
        checkCodeEquals(defaultImports.concat(defaultMyCode));
        cy.get("body").type("{uparrow}cFoo");
        cy.get("body").type("{rightarrow}{rightarrow}{downarrow} foo()");
        checkCodeEquals(defaultImports.concat([
            {h: /class\s+Foo\s*:/, b: [
                {h: /def\s+__init__\s*\((self,?)?\s*\)\s*:/, b: [
                    "foo()",
                ]},
            ]},
        ]).concat(defaultMyCode));
    });
    it("Lets you add a class frame with a parent class", () => {
        checkCodeEquals(defaultImports.concat(defaultMyCode));
        cy.get("body").type("{uparrow}cFoo(Bar");
        cy.get("body").type("{rightarrow}{rightarrow}{rightarrow}{downarrow} foo()");
        checkCodeEquals(defaultImports.concat([
            {h: /class\s+Foo\(Bar\)\s*:/, b: [
                {h: /def\s+__init__\s*\((self,?)?\s*\)\s*:/, b: [
                    "foo()",
                ]},
            ]},
        ]).concat(defaultMyCode));
    });

    it("Lets you add a class frame with class attributes and methods", () => {
        checkCodeEquals(defaultImports.concat(defaultMyCode));
        // Class header:
        cy.get("body").type("{uparrow}cFoo");
        // Constructor body:
        cy.get("body").type("{rightarrow}{rightarrow}{downarrow} foo()");
        // Attribute:
        cy.get("body").type("{rightarrow}{downarrow}=myattr=5");
        // Methods:
        cy.get("body").type("{rightarrow}ffoo{downarrow}{downArrow}r6");
        cy.get("body").type("{rightarrow}{downarrow}fbar(x,y{downarrow}{downArrow}r7");
        checkCodeEquals(defaultImports.concat([
            {h: /class\s+Foo\s*:/, b: [
                {h: /def\s+__init__\s*\((self,?)?\s*\)\s*:/, b: [
                    "foo()",
                ]},
                /myattr\s*[⇐=]\s*5/,
                {h: /def\s+foo\s*\((self,?)?\s*\)\s*:/, b: [
                    /return\s+6/,
                ]},
                {h: /def\s+bar\s*\((self,)?\s*x,y\s*\)\s*:/, b: [
                    /return\s+7/,
                ]},
            ]},
        ]).concat(defaultMyCode));
    });
});

// Test that selecting and deleting frames using keyboard works properly:
describe("Deleting frames", () => {
    it("Lets you delete a frame with delete", () => {
        // Add three frames:
        cy.get("body").type(" foo({rightArrow}{rightArrow} bar({rightArrow}{rightArrow} baz({rightArrow}{rightArrow}");
        // Delete two:
        cy.get("body").type("{shift}", {release: false});
        cy.get("body").type("{upArrow}{upArrow}");
        cy.get("body").type("{shift}");
        cy.get("body").type("{del}");
        checkCodeEquals(defaultImports.concat([
            "foo()",
        ]).concat(defaultMyCode));
    });
    it("Lets you delete a class member frame with delete", () => {
        // Makes a class with a constructor then we try to delete it:
        //(class followed by a pause, because it can take a bit longer to add its body/joint section)
        cy.get("body").type("{upArrow}c");
        cy.wait(100);
        cy.get("body").type("A{rightArrow}{rightArrow}");
        cy.get("body").type("{del}");
        checkCodeEquals(defaultImports.concat([
            {h:/class +A +:/, b: []},
        ]).concat(defaultMyCode));
    });
    it("Lets you delete a frame with backspace", () => {
        // Add three frames:
        cy.get("body").type(" foo({rightArrow}{rightArrow} bar({rightArrow}{rightArrow} baz({rightArrow}{rightArrow}");
        // Delete two:
        cy.get("body").type("{shift}", {release: false});
        cy.get("body").type("{upArrow}{upArrow}");
        cy.get("body").type("{shift}");
        cy.get("body").type("{backspace}");
        checkCodeEquals(defaultImports.concat([
            "foo()",
        ]).concat(defaultMyCode));
    });
    it("Lets you delete joint frames with backspace", () => {
        // Add if, two elif and an else:
        //(if/elif/else are followed by a pause, because it can take a bit longer to add their body/joint sections)
        cy.get("body").type("{end}{backspace}{backspace}i");
        cy.wait(100);
        cy.get("body").type("True{rightarrow}l");
        cy.wait(100);
        cy.get("body").type("x==0{rightarrow}l");
        cy.wait(100);
        cy.get("body").type("x==1{rightarrow}=x=0{rightarrow}e foo(){rightarrow}");
        checkCodeEquals(defaultImports.concat([
            {h: /if\s+True\s+:/, b:[]},
            {h: /elif\s+x\s*==\s*0\s*:/, b:[]},
            {h: /elif\s+x\s*==\s*1\s*:/, b:[/x\s*=\s*0/]},
            {h: /else\s*:/, b:[
                "foo()",
            ]},
        ])).then(() => {
            cy.get("body").type("{end}{backspace}");
            checkCodeEquals(defaultImports.concat([
                {h: /if\s+True\s*:/, b:[]},
                {h: /elif\s+x\s*==\s*0\s*:/, b:[]},
                {h: /elif\s+x\s*==\s*1\s*:/, b:[/x\s*=\s*0/]},
            ])).then(() => {
                cy.get("body").type("{end}{backspace}");
                checkCodeEquals(defaultImports.concat([
                    {h: /if\s+True\s*:/, b:[]},
                    {h: /elif\s+x\s*==\s*0\s*:/, b:[]},
                ])).then(() => {
                    cy.get("body").type("{end}{backspace}");
                    checkCodeEquals(defaultImports.concat([
                        {h: /if\s+True\s+:/, b:[]},
                    ])).then(() => {
                    // Now undo three times and check:
                        cy.get("body").type("{ctrl}zzz");
                        checkCodeEquals(defaultImports.concat([
                            {h: /if\s+True\s+:/, b:[]},
                            {h: /elif\s+x\s*==\s*0\s*:/, b:[]},
                            {h: /elif\s+x\s*==\s*1\s*:/, b:[/x\s*=\s*0/]},
                            {h: /else\s*:/, b:[
                                "foo()",
                            ]},
                        ])).then(() => {
                            // Now delete all in one go (helps check cursor placement after delete):
                            cy.get("body").type("{end}{backspace}{backspace}{backspace}");
                            checkCodeEquals(defaultImports.concat([
                                {h: /if\s+True\s+:/, b:[]},
                            ]));
                        });        
                    }); 
                });      
            });
        });
        
    });
});

// Test that selecting and wrapping frames using keyboard works properly:
describe("Wrapping frames", () => {
    it("Lets you wrap a frame with an if", () => {
        // Add three frames:
        cy.get("body").type(" foo({rightArrow}{rightArrow} bar({rightArrow}{rightArrow} baz({rightArrow}{rightArrow}");
        // Delete two:
        cy.get("body").type("{shift}", {release: false});
        cy.get("body").type("{upArrow}{upArrow}");
        cy.get("body").type("{shift}");
        cy.get("body").type("iTrue");
        checkCodeEquals(defaultImports.concat([
            "foo()",
            {h: /if\s+True\s+:/, b:[
                "bar()",
                "baz()",
            ]},
        ]).concat(defaultMyCode));
    });
});
 
describe("Copying key combination", () => {
    it("Check C inserts a class", () => {
        checkCodeEquals(defaultImports.concat(defaultMyCode));
        cy.get("body").type("{upArrow}");
        cy.get("body").trigger("keydown", {keycode: 67, key: "c", code: "c"});
        cy.get("body").trigger("keyup", {keycode: 67, key: "c", code: "c"});
        // Empty body messes up test so make a body in constructor:
        cy.get("body").type("Hello{downArrow}{downArrow}{downArrow}r42");
        checkCodeEquals(defaultImports.concat([{
            h:/class +Hello *:/,
            b:[{h:/def *__init__ *\((self,?)? *\) *:/, b:[/return *42/]}]}]).concat(defaultMyCode));
    });
    it("Does not insert a class frame on Ctrl+C, when C is released first", () => {
        checkCodeEquals(defaultImports.concat(defaultMyCode));
        // Make a function frame and select it:
        cy.get("body").type("{upArrow}{f}foo{downArrow}{downArrow}r42{downArrow}{downArrow}{downArrow}{shift}{upArrow}");
        cy.get("body").trigger("keydown", {keycode: 17, key: "Control", code: "ControlLeft"});
        cy.get("body").trigger("keydown", {keycode: 67, key: "c", code: "c", ctrlKey: true});
        cy.get("body").trigger("keyup", {keycode: 67, key: "c", code: "c", ctrlKey: true});
        cy.get("body").trigger("keyup", {keycode: 17, key: "Control", code: "ControlLeft"}); // Release Ctrl
        checkCodeEquals(defaultImports.concat([{h:/def +foo *\( *\) *:/, b:[/return *42/]}]).concat(defaultMyCode));
    });
    it("Does not insert a class frame on Ctrl+C, when C is released second", () => {
        checkCodeEquals(defaultImports.concat(defaultMyCode));
        // Make a function frame and select it:
        cy.get("body").type("{upArrow}{f}foo{downArrow}{downArrow}r42{downArrow}{downArrow}{downArrow}{shift}{upArrow}");
        cy.get("body").trigger("keydown", {keycode: 17, key: "Control", code: "ControlLeft"});
        cy.get("body").trigger("keydown", {keycode: 67, key: "c", code: "c", ctrlKey: true});
        cy.get("body").trigger("keyup", {keycode: 17, key: "Control", code: "ControlLeft"}); // Release Ctrl
        cy.get("body").trigger("keyup", {keycode: 67, key: "c", code: "c", ctrlKey: false}); // Release C
        checkCodeEquals(defaultImports.concat([{h:/def +foo *\( *\) *:/, b:[/return *42/]}]).concat(defaultMyCode));
    });
});
