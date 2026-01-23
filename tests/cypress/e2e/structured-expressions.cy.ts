require("cypress-terminal-report/src/installLogsCollector")();
import failOnConsoleError from "cypress-fail-on-console-error";
failOnConsoleError();

import {testInsert, testMultiInsert, testBackspace, testInsertExisting} from "../support/expression-test-support";

// We need this to prevent test failures.  I don't actually know what the error is for sure
// (even if you log it, it is not visible), but I suspect it may be a Brython error that I
// see on the real site to do with an IndentationError in partial code:
Cypress.on("uncaught:exception", (err, runnable) => {
    // returning false here prevents Cypress from failing the test:
    return false;
});

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

describe("Stride TestExpressionSlot.testOperators()", () => {
    // Any tests that are invalid for Python are commented out.  These include
    // those with !, &&, ||, ..
    
    testInsert("aa", "{aa$}");
    testInsert("a+b", "{a}+{b$}");
    testInsert("a+b-c", "{a}+{b}-{c$}");
    testInsert("1++1", "{1}+{+1$}");
    //testInsert("1<2&&3<=4&&5==6+8", "{1}<{2}&&{3}<={4}&&{5}=={6}+{8$}");
    //testInsert("false!=!false", "{false}!={}!{false$}");
    //testInsert("false!=!!!false", "{false}!={}!{}!{}!{false$}");
    // Must surround these in a method call because otherwise the = gets converted
    // to an assignment:
    testInsert("foo(5==-6)", "{foo}({5}=={-6}){$}");
    testInsert("foo(5==--6)", "{foo}({5}=={}-{-6}){$}");
    testInsert("foo(5==----6)", "{foo}({5}=={}-{}-{}-{-6}){$}");
    testInsert("a.b", "{a}.{b$}");
    //testInsert("a..b", "{a}..{b$}");
    testInsert("y-1", "{y}-{1$}");
    testInsert("getY()*1", "{getY}_({})_{}*{1$}");
    testInsert("getY()-1", "{getY}_({})_{}-{1$}");
    testInsert("getY()+-1", "{getY}_({})_{}+{-1$}");

    // Bug found in preview2:
    //testInsert("s.length()..10", "{s}.{length}_({})_{}..{10$}");
    // Partials of above:
    testInsert("s.length()", "{s}.{length}_({})_{$}");
    testInsert("s.length().", "{s}.{length}_({})_{}.{$}", false);
    //testInsert("s.length()..", "{s}.{length}_({})_{}..{$}");
    //testInsert("s.length()..1", "{s}.{length}_({})_{}..{1$}");
});

describe("Stride TestExpressionSlot.testDot()", () => {
    testInsert(".", "{}.{$}", false);
    testInsert("0.", "{0.$}");
    testInsert("a.", "{a}.{$}", false);
    testInsert("foo()", "{foo}_({})_{$}");
    testInsert("foo().bar()", "{foo}_({})_{}.{bar}_({})_{$}");
    testInsert("foo+().", "{foo}+{}_({})_{}.{$}", false);

    testMultiInsert("foo(){.}a", "{foo}_({})_{$a}", "{foo}_({})_{}.{$a}");

    testBackspace("foo()0\b.", "{foo}_({})_{$}.{}");
});

describe("Stride TestExpressionSlot.testOvertype()", () => {
    testInsertExisting("$()", "move", "{move$}_({})_{}");
    testInsertExisting("move$()", "(",  "{move}_({$})_{}");

    testInsertExisting("$\"bye\"", "\"hi\"+", "{}_“hi”_{}+{$}_“bye”_{}");
    testInsertExisting("\"hi$\"", "\"",  "{}_“hi”_{$}");

    // Most operators, like +, don't overtype:
    testInsertExisting("a$+z", "+", "{a}+{$}+{z}");
    testInsertExisting("a$+z", "+b", "{a}+{b$}+{z}");
});

describe("Stride TestExpressionSlot.testBackspace()", () => {
    testBackspace("\bxyz", "{$xyz}");
    testBackspace("x\byz", "{$yz}");
    testBackspace("xy\bz", "{x$z}");
    testBackspace("xyz\b", "{xy$}");

    testBackspace("xy\b+ab", "{x$}+{ab}");
    testBackspace("xy+\bab", "{xy$ab}");
    testBackspace("xy+a\bb", "{xy}+{$b}");

    // TODO convert these to Strype equivalent:
    //testBackspace("new t\bon", "{}new {$on}");
    // This one isn't possible using delete, but is by using backspace:
    //testBackspace("new \bton", "{new$ton}", true, false);
    // This one isn't possible using backspace, but is by using delete:
    //testBackspace("n\bew ton", "{$ewton}", false, true);

    testBackspace("move(\b)", "{move$}");
    testBackspace("(\b)", "{$}");
});

describe("Test word operators", () => {
    testInsert("a or ", "{a}or{$}", false);
    testInsert("a or b", "{a}or{b$}");
    testInsert("or b", "{}or{b$}", false);
    testInsert("orb", "{orb$}");
    testInsert("not a", "{}not{a$}");
    testInsert("orc or ork", "{orc}or{ork$}");
    testInsert("notand or nand", "{notand}or{nand$}");
    testInsert("nor or neither", "{nor}or{neither$}");
    testInsert("öor or oör", "{öor}or{oör$}");
    testInsert("a is b", "{a}is{b$}");
    testInsert("a is not b", "{a}is not{b$}");
    testInsert("a or not b", "{a}or{}not{b$}");
    testInsert("a and or in b", "{a}and{}or{}in{b$}", false);
    
    testMultiInsert("a is {not }b", "{a}is{$b}", "{a}is not{$b}");
    testMultiInsert("a or {not }b", "{a}or{$b}", "{a}or{}not{$b}");
   
    testBackspace("a or \bb", "{a$b}", true, false);
    testBackspace("a is not \bb", "{a}is{$b}", true, false);    
    testBackspace("a \bis not b", "{a$}not{b}", false, true);    
    testBackspace("a or not \bb", "{a}or{$b}", true, false);
    testBackspace("a or \bnot b", "{a$}not{b}", true, false);

    testInsert("1or 2", "{1or 2$}", false);
    testInsert("1 or 2", "{1}or{2$}");
    testInsert("1 or2", "{1 or2$}", false);
    
    testInsert("ab and cd and ef", "{ab}and{cd}and{ef$}");
    testMultiInsert("ab{ and cd} and ef", "{ab$}and{ef}", "{ab}and{cd$}and{ef}");
    testMultiInsert("ab{ } and ef", "{ab$}and{ef}", "{ab $}and{ef}");
    testMultiInsert("ab{+cd} and ef", "{ab$}and{ef}", "{ab}+{cd$}and{ef}");
    testMultiInsert("ab{ andor} and (ef)", "{ab$}and{}_({ef})_{}", "{ab}and{}or{$}and{}_({ef})_{}");
    testMultiInsert("ab{ andcd} and (ef)", "{ab$}and{}_({ef})_{}", "{ab}and{cd$}and{}_({ef})_{}");
    testMultiInsert("ab{ and cd} and (ef)", "{ab$}and{}_({ef})_{}", "{ab}and{cd$}and{}_({ef})_{}");
    testMultiInsert("pre or (ab{ and cd} and ef) or post", "{pre}or{}_({ab$}and{ef})_{}or{post}", "{pre}or{}_({ab}and{cd$}and{ef})_{}or{post}");
    testMultiInsert("(a0) or ab{ and cd} and ef", "{}_({a0})_{}or{ab$}and{ef}", "{}_({a0})_{}or{ab}and{cd$}and{ef}");
    testInsert("(a+b)or c", "{}_({a}+{b})_{}or{c$}");
    testInsert("(a+b)or (c-d)", "{}_({a}+{b})_{}or{}_({c}-{d})_{$}");
    testInsert("(a and b)or (c and d)", "{}_({a}and{b})_{}or{}_({c}and{d})_{$}");
});

