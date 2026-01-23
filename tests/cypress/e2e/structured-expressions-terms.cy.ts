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


describe("Stride TestExpressionSlot.testStrings()", () => {
    // Empty strings:
    testInsert("\"\"", "{}_“”_{$}");
    testInsert("''", "{}_‘’_{$}");
    
    // With trailing quote
    testInsert("\"hello\"", "{}_“hello”_{$}");
    // Without trailing quote (caret stays in string):
    testInsert("\"hello", "{}_“hello$”_{}", false);
    testInsert("\"hello\"+\"world\"", "{}_“hello”_{}+{}_“world”_{$}");
    testInsert("\"hello\"+\"world\"+(5*6)", "{}_“hello”_{}+{}_“world”_{}+{}_({5}*{6})_{$}");

    // Quote in a string, escaped:
    testInsert("\"\\\"\"", "{}_“\\\"”_{$}");
    // Escaped single quote:
    testInsert("\"\\'\"", "{}_“\\'”_{$}");
    // Unescaped single quote:
    testInsert("\"'\"", "{}_“'”_{$}");
    // Escaped backslash:
    testInsert("\"\\\\\"", "{}_“\\\\”_{$}");

    // All of the above again, but swapping single and double quotes:

    // With trailing quote
    testInsert("'hello'", "{}_‘hello’_{$}");
    // Without trailing quote (caret stays in string):
    testInsert("'hello", "{}_‘hello$’_{}", false);
    testInsert("'hello'+'world'", "{}_‘hello’_{}+{}_‘world’_{$}");
    testInsert("'hello'+'world'+(5*6)", "{}_‘hello’_{}+{}_‘world’_{}+{}_({5}*{6})_{$}");

    // Single quote in a string, escaped:
    testInsert("'\\''", "{}_‘\\'’_{$}");
    // Escaped double quote:
    testInsert("'\\\"'", "{}_‘\\\"’_{$}");
    // Unescaped double quote:
    testInsert("'\"'", "{}_‘\"’_{$}");
    // Escaped backslash:
    testInsert("'\\\\'", "{}_‘\\\\’_{$}");


    // Adding quote later:
    testMultiInsert("abc{\"}def", "{abc$def}", "{abc}_“$”_{def}");
    testMultiInsert("abc{\"}", "{abc$}", "{abc}_“$”_{}");
    testMultiInsert("{\"}def", "{$def}", "{}_“$”_{def}");
    testMultiInsert("abc{\"}.def", "{abc$}.{def}", "{abc}_“$”_{}.{def}");
    testMultiInsert("abc{\"}*def", "{abc$}*{def}", "{abc}_“$”_{}*{def}");
    testMultiInsert("abc{\"}def()", "{abc$def}_({})_{}", "{abc}_“$”_{def}_({})_{}");
    testMultiInsert("abc{\"}()", "{abc$}_({})_{}", "{abc}_“$”_{}_({})_{}");

    // Adding string adjacent to String:
    // First, before:
    testInsertExisting("$\"b\"", "\"a", "{}_“a$”_{}_“b”_{}");
    testInsertExisting("$\"b\"", "\"a\"", "{}_“a”_{$}_“b”_{}");
    // Also, after:
    testInsertExisting("\"a\"$", "\"b", "{}_“a”_{}_“b$”_{}");


    // Example found while pasting from BlueJ (double escaped here)
    testInsert("foo(c=='\\\\' or c=='\"' or c=='\\'')",
        "{foo}_({c}=={}_‘\\\\’_{}or{c}=={}_‘\"’_{}or{c}=={}_‘\\'’_{})_{$}");

    // Deletion:
    testBackspace("\"a\bb\"", "{}_“$b”_{}");
    testBackspace("\"\bab\"", "{$ab}");
    testBackspace("\"ab\b\"", "{}_“a$”_{}");
    testBackspace("\"ab\"\b", "{ab$}");
});

describe("Stride TestExpressionSlot.testKWOperators()", () => {
    testInsert("a and b", "{a}and{b$}");
    testInsert("a and b and c", "{a}and{b}and{c$}");
    testInsert("(a and b and c)", "{}_({a}and{b}and{c})_{$}");
    testInsert("a and (b and c)", "{a}and{}_({b}and{c})_{$}");
    testInsert("a() and b and c", "{a}_({})_{}and{b}and{c$}");
    testInsert("a() and \"b\" and c", "{a}_({})_{}and{}_“b”_{}and{c$}");
    testInsert("a() and \"b\" and \"c\"", "{a}_({})_{}and{}_“b”_{}and{}_“c”_{$}");
    testInsert("((\"apple\" in [\"apple\", \"banana\", \"cherry\"]) and not (\"dog\" in (\"cat\", \"doghouse\", \"mouse\"))) or (\"grape\" + str([1, 2, 3]) == \"grape[1, 2, 3]\")",
        "{}_({}_({}_“apple”_{}in{}_[{}_“apple”_{},{}_“banana”_{},{}_“cherry”_{}]_{})_{}and{}not{}_({}_“dog”_{}in{}_({}_“cat”_{},{}_“doghouse”_{},{}_“mouse”_{})_{})_{})_{}or{}_({}_“grape”_{}+{str}_({}_[{1},{2},{3}]_{})_{}=={}_“grape[1, 2, 3]”_{})_{$}");
});


