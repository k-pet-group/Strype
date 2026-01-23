require("cypress-terminal-report/src/installLogsCollector")();
import failOnConsoleError from "cypress-fail-on-console-error";
failOnConsoleError();

// Must clear all local storage between tests to reset the state:
beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("/",  {onBeforeLoad: (win) => {
        win.localStorage.clear();
        win.sessionStorage.clear();
    }}).then(() => {
        // The Strype IDs and CSS class names aren't directly used in the test
        // but they are used in the support file, so we make them available.
        cy.initialiseSupportStrypeGlobals();
    });
});

import {assertState, focusEditor} from "../support/expression-test-support";

export function testSelection(code : string, selectKeys: string, expectedAfterDeletion : string) : void {
    it("Tests " + code, () => {
        focusEditor();
        cy.get("body").type("{backspace}{backspace}i");
        assertState("{$}");
        cy.get("body").type(" " + code);
        cy.get("body").type(selectKeys);
        cy.get("body").type("{del}");
        assertState(expectedAfterDeletion);
    });
}

export function testPasteThenType(toPaste : string, toTypeAfter: string, expectedFinal : string) : void {
    it("Tests " + toPaste + " >>> " + toTypeAfter, () => {
        focusEditor();
        cy.get("body").type("{backspace}{backspace}i");
        assertState("{$}");
        (cy.focused() as any).paste(toPaste);
        cy.wait(1000);
        cy.get("body").type(toTypeAfter);
        assertState(expectedFinal);
    });
}

describe("Shift-Home selects to the beginning", () => {
    testSelection("a+b","{end}{shift}{home}", "{$}");
    testSelection("a+b","{end}{leftarrow}{shift}{home}", "{$b}");

    testSelection("a+math.sin(b)","{end}{shift}{home}", "{$}");
    testSelection("a+max(b,c)","{end}{shift}{home}", "{$}");
});

describe("Shift-End selects to the end", () => {
    testSelection("a+b","{home}{shift}{end}", "{$}");
    testSelection("a+b","{home}{rightarrow}{shift}{end}", "{a$}");

    testSelection("a+abs(b)","{home}{rightarrow}{shift}{end}", "{a$}");
    testSelection("a+math.sin(b)","{home}{rightarrow}{shift}{end}", "{a$}");
    testSelection("a+max(b,c)","{home}{rightarrow}{shift}{end}", "{a$}");
});

describe("Pasting of incomplete code", () => {
    // If brackets complete, cursor should be after:
    testPasteThenType("print()","a","{print}({}){a$}");
    // If brackets incomplete, cursor should be between
    testPasteThenType("print(","a","{print}({a$}){}");
    // Same principle for nested brackets:
    testPasteThenType("print((","a", "{print}({}({a$}){}){}");
    testPasteThenType("print(()","a","{print}({}({}){a$}){}");
    // Ditto if the brackets are different types:
    testPasteThenType("print([","a", "{print}({}[{a$}]{}){}");
    testPasteThenType("print([]","a","{print}({}[{}]{a$}){}");
    
    // Check what happens when there is content in the bracket:
    testPasteThenType("print((pe","a", "{print}({}({pea$}){}){}");
    testPasteThenType("print((pe)","a","{print}({}({pe}){a$}){}");
    testPasteThenType("print((zzz)pe","a","{print}({}({zzz}){pea$}){}");
    
    // Same principle for strings:
    testPasteThenType("1+\"\"","a","{1}+{}“”{a$}");
    testPasteThenType("1+\"","a","{1}+{}“a$”{}");
    testPasteThenType("print(\"\")","a","{print}({}“”{}){a$}");
    testPasteThenType("print(\"","a","{print}({}“a$”{}){}");
    
    // Test position after pasting excess brackets:
    testPasteThenType("print(1+2))", "a", "{print}({1}+{2}){a$}");
});
