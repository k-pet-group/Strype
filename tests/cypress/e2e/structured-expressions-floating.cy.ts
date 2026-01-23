require("cypress-terminal-report/src/installLogsCollector")();
import failOnConsoleError from "cypress-fail-on-console-error";
failOnConsoleError();

import {testInsert, testMultiInsert, testBackspace} from "../support/expression-test-support";

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

describe("Stride TestExpressionSlot.testFloating()", () => {
    // For some of this, they are a syntax error anyway, so it is not crucial which way we split them
    // Still, a regression might indicate a problem

    testInsert("1.0", "{1.0$}");
    testInsert("10.20", "{10.20$}");
    testInsert("a.0", "{a}.{0$}", false);
    testInsert("1.a", "{1}.{a$}", false);
    testInsert("x1.a", "{x1}.{a$}", false);
    testInsert("+1", "{+1$}");
    testInsert("+1.0", "{+1.0$}");
    testInsert("+1.0e5", "{+1.0e5$}");
    testInsert("+1.0e", "{}+{1}.{0e$}", false);
    testInsert("+1.0e+5", "{+1.0e+5$}");
    testInsert("+1.0e+5+6", "{+1.0e+5}+{6$}");
    testInsert("3+1", "{3}+{1$}");
    testInsert("3+1.0", "{3}+{1.0$}");
    testInsert("3+1.0e5", "{3}+{1.0e5$}");
    testInsert("3+1.0e+5", "{3}+{1.0e+5$}");
    testInsert("3+1.0e+5+6", "{3}+{1.0e+5}+{6$}");

    testInsert("+1+2+3", "{+1}+{2}+{3$}");
    testInsert("+1++2", "{+1}+{+2$}");
    testInsert("+1++2+3", "{+1}+{+2}+{3$}");
    testInsert("+1++2++3", "{+1}+{+2}+{+3$}");
    testInsert("++1++2++3", "{}+{+1}+{+2}+{+3$}");
    testMultiInsert("+{1}", "{}+{$}", "{+1$}");
    testMultiInsert("+{+1}", "{}+{$}", "{}+{+1$}");
    testMultiInsert("1++{2}", "{1}+{}+{$}", "{1}+{+2$}");
    testInsert("-1-2-3", "{-1}-{2}-{3$}");
    testInsert("-1--2", "{-1}-{-2$}");
    testInsert("-1--2-3", "{-1}-{-2}-{3$}");
    testInsert("-1--2--3", "{-1}-{-2}-{-3$}");
    testInsert("--1--2--3", "{}-{-1}-{-2}-{-3$}");
    testMultiInsert("-{1}", "{}-{$}", "{-1$}");
    testMultiInsert("-{-1}", "{}-{$}", "{}-{-1$}");
    testMultiInsert("1--{2}", "{1}-{}-{$}", "{1}-{-2$}");

    testInsert("1e6", "{1e6$}");
    testInsert("1e-6", "{1e-6$}");
    testInsert("10e20", "{10e20$}");
    testInsert("10e+20", "{10e+20$}");
    testInsert("10e-20", "{10e-20$}");

    testInsert("1.0.3", "{1}.{0.3$}", false);
    testInsert("1.0.3.4", "{1}.{0}.{3.4$}", false);
    testInsert("1.0.x3.4", "{1}.{0}.{x3}.{4$}", false);

    // The problem here is that + is first an operator, then merged back in,
    // so when we preserve the position after plus, it becomes invalid, so we
    // can't easily test that the right thing happens deleting the plus:
    //testBackspace("+\b1.0e-5", "{$1.0e-5}", false, true);
    //testBackspace("+1\b.0e-5", "{}+{$}.{0e-5}", true, false);
    testBackspace("+1.\b0e-5", "{+1$0e-5}");
    testBackspace("+1.0\be-5", "{+1.$e-5}");
    //testBackspace("+1.0e\b-5", "{+1.0$}-{5}");
    //testBackspace("+1.0e-\b5", "{+1.0e$5}");
    //testBackspace("+1.0e-5\b", "{}+{1}.{0e}-{$}");

    testMultiInsert("{1}e-6", "{$e}-{6}", "{1$e-6}");
    testMultiInsert("1{e}-6", "{1$}-{6}", "{1e$-6}");
    testMultiInsert("1e{-}6", "{1e$6}", "{1e-$6}");
    testMultiInsert("1e-{6}", "{1e}-{$}", "{1e-6$}");

    testMultiInsert("{x}1e-6", "{$1e-6}", "{x$1e}-{6}");
    testMultiInsert("1{x}e-6", "{1$e-6}", "{1x$e}-{6}");
    testMultiInsert("1e{x}-6", "{1e$-6}", "{1ex$}-{6}");
    //testMultiInsert("1e-{x}6", "{1e-$6}", "{1e-x$6}");

    testInsert("1.0", "{1.0$}");
    testInsert("1..0", "{1}.{}.{0$}", false);
    //testBackspace("1..\b0", "{1.$0}", true, false); // backspace after
    //testBackspace("1.\b.0", "{1$.0}", false, true); // delete before
    //testBackspace("a..\bc", "{a}.{$c}", true, false); // backspace after
    //testBackspace("a.\b.c", "{a$}.{c}", false, true); // delete before
});


