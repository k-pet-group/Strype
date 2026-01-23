require("cypress-terminal-report/src/installLogsCollector")();
import failOnConsoleError from "cypress-fail-on-console-error";
failOnConsoleError();

import {testInsert, testMultiInsert, testBackspace, testPushBracket, PushBracketArrow} from "../support/expression-test-support";

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

describe("Test brackets", () => {
    it("Tests brackets", () => {
        testInsert("a+(b-c)", "{a}+{}_({b}-{c})_{$}");
    });
});

describe("Strype test nested brackets", () => {
    testInsert("((a+b)+c())", "{}_({}_({a}+{b})_{}+{c}_({})_{})_{$}");
    testInsert("((a)c())", "{}_({}_({a})_{c}_({})_{})_{$}", false);

    testBackspace("((\b))", "{}_({$})_{}");
    testBackspace("((a))c((\b))", "{}_({}_({a})_{})_{c}_({$})_{}");
});

describe("Stride TestExpressionSlot.testBrackets()", () => {
    testInsert("a+(b-c)", "{a}+{}_({b}-{c})_{$}");
    testInsert("a+(b-(c*d))", "{a}+{}_({b}-{}_({c}*{d})_{})_{$}");

    // Without close:
    testInsert("(a+b", "{}_({a}+{b$})_{}", false);

    testInsert("(((", "{}_({}_({}_({$})_{})_{})_{}", false);
    testInsert("((()", "{}_({}_({}_({})_{$})_{})_{}", false);
    testInsert("((())", "{}_({}_({}_({})_{})_{$})_{}", false);
    testInsert("((()))", "{}_({}_({}_({})_{})_{})_{$}");

    testInsert("(a+(b*c)+d)", "{}_({a}+{}_({b}*{c})_{}+{d})_{$}");


    // Test inserting bracket later:
    testMultiInsert("abc{(}def", "{abc$def}", "{abc}_({$})_{def}");

    // Test inserting invalid closing bracket later:
    testInsert(")", "{$}", false);
    testInsert("]", "{$}", false);
    testMultiInsert("abc{)}def", "{abc$def}", "{abc$def}");
    testMultiInsert("abc{]}def", "{abc$def}", "{abc$def}");
    testMultiInsert("[abc{)}def]", "{}_[{abc$def}]_{}", "{}_[{abc$def}]_{}");

    testMultiInsert("({(MyWorld)}getWorld()).getWidth()",
        "{}_({$getWorld}_({})_{})_{}.{getWidth}_({})_{}",
        "{}_({}_({MyWorld})_{$getWorld}_({})_{})_{}.{getWidth}_({})_{}");

    testInsert("a(bc)d", "{a}_({bc})_{d$}", false);
});

describe("Stride TestExpressionSlot.testDeleteBracket()", () => {
    testInsert("a+(b*c)", "{a}+{}_({b}*{c})_{$}");
    testBackspace("a+(b*c)\b", "{a}+{b}*{c$}");
    testBackspace("a+(\bb*c)", "{a}+{$b}*{c}");

    testInsert("((MyWorld)getWorld()).getWidth()",
        "{}_({}_({MyWorld})_{getWorld}_({})_{})_{}.{getWidth}_({})_{$}", 
        false);
    testBackspace("((MyWorld)getWorld()).getWidth()\b",
        "{}_({}_({MyWorld})_{getWorld}_({})_{})_{}.{getWidth$}");
    testBackspace("((MyWorld)getWorld()).\bgetWidth()",
        "{}_({}_({MyWorld})_{getWorld}_({})_{})_{$getWidth}_({})_{}");
    testBackspace("((MyWorld)getWorld())\b.getWidth()",
        "{}_({MyWorld})_{getWorld}_({})_{$}.{getWidth}_({})_{}");
    testBackspace("((MyWorld)getWorld(\b)).getWidth()",
        "{}_({}_({MyWorld})_{getWorld$})_{}.{getWidth}_({})_{}");
    testBackspace("((MyWorld)\bgetWorld()).getWidth()",
        "{}_({MyWorld$getWorld}_({})_{})_{}.{getWidth}_({})_{}");
    testBackspace("((\bMyWorld)getWorld()).getWidth()",
        "{}_({$MyWorldgetWorld}_({})_{})_{}.{getWidth}_({})_{}");
    testBackspace("(\b(MyWorld)getWorld()).getWidth()",
        "{$}_({MyWorld})_{getWorld}_({})_{}.{getWidth}_({})_{}"); 
});

describe("Stride TestExpressionSlot.testPushBracket()", () => {
    // Simple bracketed expressions (outside of)
    testPushBracket("(test)$",
        // Push to left, and again to see it is not doing anything
        // Then move caret to left to get inside brackets, and push right to get same code as original 
        // (but different cursor position)
        ["{}_({})_{$test}", "{}_({})_{$test}","{}_({$})_{test}", "{}_({test$})_{}"],
        [PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.LEFT, PushBracketArrow.MODIF_RIGHT]);
    testPushBracket("$(test)",
        // Push to right, and again to see it is not doing anything
        // Then move caret to right to get inside brackets, and push left to get same code as original 
        // (but different cursor position)
        ["{test$}_({})_{}", "{test$}_({})_{}", "{test}_({$})_{}", "{}_({$test})_{}"],
        [PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT,  PushBracketArrow.RIGHT, PushBracketArrow.MODIF_LEFT]);
    testPushBracket("$(ab + cd)",
        [
            // Push right all the way, and again to see it is not doing anything (ends up with "ab+cd$()")
            "{ab$}_({}+{cd})_{}", "{ab}+{$}_({cd})_{}", "{ab}+{cd$}_({})_{}", "{ab}+{cd$}_({})_{}",
            // Then move caret to right to get inside brackets, push right to see it does nothing, 
            // move again to right, push left to see it does nothing (ends up with "ab+cd+()$")
            "{ab}+{cd}_({$})_{}", "{ab}+{cd}_({$})_{}", "{ab}+{cd}_({})_{$}", "{ab}+{cd}_({})_{$}",
            // Move left to be inside the brackets and push left all the way, and again to see it is not doing anything 
            // (ends with original bar the cursor position)
            "{ab}+{cd}_({$})_{}", "{ab}+{}_({$cd})_{}", "{ab}_({$}+{cd})_{}", "{}_({$ab}+{cd})_{}", "{}_({$ab}+{cd})_{}",
        ],
        [
            PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT,
            PushBracketArrow.RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.RIGHT, PushBracketArrow.MODIF_LEFT, 
            PushBracketArrow.LEFT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT ]);    
    testPushBracket("$(ab)+cd",
        [
            // Push right, then try again see it is not doing anything (ends up with "ab($)+cd")
            "{ab$}_({})_{}+{cd}", "{ab$}_({})_{}+{cd}",
            // Then move right into the parentheses, and push right all the way (ends up with "ab(+cd$)")
            "{ab}_({$})_{}+{cd}", "{ab}_({}+{$})_{cd}", "{ab}_({}+{cd$})_{}",
            // Then get to the start of the parentheses content, and push left all the way,
            // and try again to see it is not doing anything (ends up with original bar the cursor position)
            "{ab}_({}+{c$d})_{}", "{ab}_({}+{$cd})_{}", "{ab}_({$}+{cd})_{}", "{}_({$ab}+{cd})_{}", "{}_({$ab}+{cd})_{}",
        ],
        [
            PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT, 
            PushBracketArrow.RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT, 
            PushBracketArrow.LEFT, PushBracketArrow.LEFT, PushBracketArrow.LEFT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT,
        ]);
    testPushBracket("$(ab+)",
        // Push right all the way, and try again see it is not doing anything
        // (ends up with "ab+$()")
        ["{ab$}_({}+{})_{}", "{ab}+{$}_({})_{}", "{ab}+{$}_({})_{}"],
        [PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT]);
    testPushBracket("$(ab)+",
        // Push right all the way, and try again see it is not doing anything
        // (ends up with "ab+$()")
        ["{ab$}_({})_{}+{}", "{ab$}_({})_{}+{}"],
        [ PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT]);
    testPushBracket("+(ab + cd$)",
        // Push right to see it does nothing, then go to the parentheses' content start,
        // and push left and try again see it is not doing anything
        // (ends up with "($+ab+cd)")
        ["{}+{}_({ab}+{cd$})_{}", "{$}+{}_({ab}+{cd})_{}", "{}+{$}_({ab}+{cd})_{}", "{}+{}_({$ab}+{cd})_{}", "{}_({$}+{ab}+{cd})_{}", "{}_({$}+{ab}+{cd})_{}"],
        [PushBracketArrow.MODIF_RIGHT, PushBracketArrow.HOME,PushBracketArrow.RIGHT, PushBracketArrow.RIGHT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT]);

    
    // Simple bracketed expressions (inside of)
    testPushBracket("($test)",
        // Push left to see it does nothing, and then go to parentheses' content end, and push right to see it does nothing
        // ends up with original bar the cursor position
        ["{}_({$test})_{}", "{}_({test})_{$}", "{}_({test$})_{}", "{}_({test$})_{}"],
        [PushBracketArrow.MODIF_LEFT, PushBracketArrow.END, PushBracketArrow.LEFT, PushBracketArrow.MODIF_RIGHT]);
    testPushBracket("(ab$)+)",
        // Push right and try again to see it does nothing (ends up with "(ab+$)")
        ["{}_({ab}+{$})_{}", "{}_({ab}+{$})_{}" ],
        [PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT]);    
    
    // More complex expressions: operators, nesting
    testPushBracket("foo($)bar", 
        [
            // Push right then move right and push left to get back to initial state
            "{foo}_({bar$})_{}", "{foo}_({bar})_{$}", "{foo}_({})_{$bar}",
            // Then move left and push left to end up with "($foo)bar")
            "{foo}_({$})_{bar}", "{}_({$foo})_{bar}",
            // Then go to end of parentheses content and push right (ends up with "(foobar$)")
            "{}_({f$oo})_{bar}", "{}_({fo$o})_{bar}", "{}_({foo$})_{bar}","{}_({foobar$})_{}",
        ], 
        [
            PushBracketArrow.MODIF_RIGHT, PushBracketArrow.RIGHT, PushBracketArrow.MODIF_LEFT, 
            PushBracketArrow.LEFT, PushBracketArrow.MODIF_LEFT,
            PushBracketArrow.RIGHT, PushBracketArrow.RIGHT, PushBracketArrow.RIGHT, PushBracketArrow.MODIF_RIGHT,
        ]); 

    testPushBracket("foo(1,$)bar(2)", 
        [
            // Push right all the way, push left (ends up with "foo(1,bar()$2)")
            "{foo}_({1},{bar$})_{}_({2})_{}", "{foo}_({1},{bar}_({2})_{$})_{}", "{foo}_({1},{bar}_({})_{$2})_{}",
            // Move left and push left all the way (ends up with "foo(($1,bar)2)"),
            "{foo}_({1},{bar}_({$})_{2})_{}", "{foo}_({1},{}_({$bar})_{2})_{}", "{foo}_({1}_({$},{bar})_{2})_{}", "{foo}_({}_({$1},{bar})_{2})_{}",
            // Move to end of the expression and push left all the way (ends up with "foo()$(1,bar)2")
            "{foo}_({}_({1},{bar})_{2})_{$}", "{foo}_({}_({1},{bar})_{})_{$2}", "{foo}_({})_{$}_({1},{bar})_{2}",
        ], 
        [
            PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_LEFT,
            PushBracketArrow.LEFT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT,
            PushBracketArrow.END, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT,
        ]); 

    testPushBracket("foo(bar($)3) + 4", 
        [
            // Push right, and try again see it doesn't do anything (ends up with "foo(bar(3$))+4")
            "{foo}_({bar}_({3$})_{})_{}+{4}", "{foo}_({bar}_({3$})_{})_{}+{4}",
            // Move left and push left, and try again see it doesn't do anything (ends up with "foo(($bar3))+4"),
            "{foo}_({bar}_({$3})_{})_{}+{4}", "{foo}_({}_({$bar3})_{})_{}+{4}", "{foo}_({}_({$bar3})_{})_{}+{4}",
            // Move left, push left, move left, push right all the way (ends up with "foo(bar3)$()+4")
            "{foo}_({$}_({bar3})_{})_{}+{4}", "{}_({$foo}_({bar3})_{})_{}+{4}", "{$}_({foo}_({bar3})_{})_{}+{4}", "{foo$}_({}_({bar3})_{})_{}+{4}", "{foo}_({bar3})_{$}_({})_{}+{4}",
        ], 
        [
            PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT,
            PushBracketArrow.LEFT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT,
            PushBracketArrow.LEFT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.LEFT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT,
        ]); 
    
    testPushBracket("foo([1,$]2).bar()", 
        [
            // Push right, and try again see it doesn't do anything (ends up with "foo([1,2$]).bar()")
            "{foo}_({}_[{1},{2$}]_{})_{}.{bar}_({})_{}", "{foo}_({}_[{1},{2$}]_{})_{}.{bar}_({})_{}",
            // Go to start of the square brackets content, try push left see it doesn't do anything ("ends up with "foo([$1,2]).bar()")
            "{foo}_({}_[{1},{$2}]_{})_{}.{bar}_({})_{}", "{foo}_({}_[{1$},{2}]_{})_{}.{bar}_({})_{}", "{foo}_({}_[{$1},{2}]_{})_{}.{bar}_({})_{}", "{foo}_({}_[{$1},{2}]_{})_{}.{bar}_({})_{}",
            // Move left, push right all the way (ends up with "foo(1,2$[]).bar()")
            "{foo}_({$}_[{1},{2}]_{})_{}.{bar}_({})_{}", "{foo}_({1$}_[{},{2}]_{})_{}.{bar}_({})_{}", "{foo}_({1},{$}_[{2}]_{})_{}.{bar}_({})_{}", "{foo}_({1},{2$}_[{}]_{})_{}.{bar}_({})_{}",
            // Go inside "bar($)" (end, left), push left all the way (ends up with "($foo(1,2[]).bar)")
            "{foo}_({1},{2}_[{}]_{})_{}.{bar}_({})_{$}", "{foo}_({1},{2}_[{}]_{})_{}.{bar}_({$})_{}",
            "{foo}_({1},{2}_[{}]_{})_{}.{}_({$bar})_{}", "{foo}_({1},{2}_[{}]_{})_{}_({$}.{bar})_{}", "{foo}_({$}_({1},{2}_[{}]_{})_{}.{bar})_{}", "{}_({$foo}_({1},{2}_[{}]_{})_{}.{bar})_{}",

        ],
        [
            PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT,
            PushBracketArrow.LEFT, PushBracketArrow.LEFT, PushBracketArrow.LEFT, PushBracketArrow.MODIF_LEFT,
            PushBracketArrow.LEFT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT,
            PushBracketArrow.END, PushBracketArrow.LEFT, 
            PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT,PushBracketArrow.MODIF_LEFT,
        ]);

    testPushBracket("foo((1+2)*(3-4)$)+5",
        [
            // Push left all the way (ends up with "foo((1+2)*()$3-4)+5")
            "{foo}_(_{}_({1}+{2})_{}*_{}({3}-{})_{$4})_{}+{5}", "{foo}_(_{}_({1}+{2})_{}*_{}({3})_{$}-{4})_{}+{5}", "{foo}_(_{}_({1}+{2})_{}*_{}({})_{$3}-{4})_{}+{5}",
            // Move after "foo(" (home then 4x right), push right all the way (ends up with "foo(1+2$()*()3-4)+5")
            // NOTE: here push skip the single "+" when pushing because at some point we have {-2}, unary operator
            "{$foo}_(_{}_({1}+{2})_{}*_{}({})_{3}-{4})_{}+{5}", "{f$oo}_(_{}_({1}+{2})_{}*_{}({})_{3}-{4})_{}+{5}", "{fo$o}_(_{}_({1}+{2})_{}*_{}({})_{3}-{4})_{}+{5}", "{foo$}_(_{}_({1}+{2})_{}*_{}({})_{3}-{4})_{}+{5}","{foo}_(_{$}_({1}+{2})_{}*_{}({})_{3}-{4})_{}+{5}", "{foo}_(_{1$}_({+2})_{}*_{}({})_{3}-{4})_{}+{5}", "{foo}_(_{1}+{2$}_({})_{}*_{}({})_{3}-{4})_{}+{5}",
            // Move after "foo" (home, then 3x right), push right all the way (7 ends up with "foo1+2()*()3-4$()+5")
            "{$foo}_({1}+{2}_({})_{}*{}_({})_{3}-{4})_{}+{5}", "{f$oo}_(_{1}+{2}_({})_{}*_{}({})_{3}-{4})_{}+{5}", "{fo$o}_(_{1}+{2}_({})_{}*_{}({})_{3}-{4})_{}+{5}", "{foo$}_(_{1}+{2}_({})_{}*_{}({})_{3}-{4})_{}+{5}",
            "{foo1$}_(_{+2}_({})_{}*_{}({})_{3}-{4})_{}+{5}", "{foo1}+{2$}_({}_({})_{}*{}_({})_{3}-{4})_{}+{5}", "{foo1}+{2}_({})_{$}_({}*{}_({})_{3}-{4})_{}+{5}",
            "{foo1}+{2}_({})_{}*{$}_({}_({})_{3}-{4})_{}+{5}", "{foo1}+{2}_({})_{}*{}_({})_{$}_({3}-{4})_{}+{5}", 
            "{foo1}+{2}_({})_{}*{}_({})_{3$}_({-4})_{}+{5}", "{foo1}+{2}_({})_{}*_{}_({})_{3}-{4$}_({})_{}+{5}",            
        ],
        [
            PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT,
            PushBracketArrow.HOME, PushBracketArrow.RIGHT, PushBracketArrow.RIGHT, PushBracketArrow.RIGHT, PushBracketArrow.RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT,
            PushBracketArrow.HOME, PushBracketArrow.RIGHT, PushBracketArrow.RIGHT, PushBracketArrow.RIGHT,
            PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT,
            PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT,
            PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT,
        ]);
    
        
    testPushBracket("(ab$)+()",
        [
            // Push right all the way, then try again as well as push left to see it doesn't do anything (ends up with "(ab+()$)")
            "{}_({ab}+{$})_{}_({})_{}", "{}_({ab}+{}_({})_{$})_{}", "{}_({ab}+{}_({})_{$})_{}", "{}_({ab}+{}_({})_{$})_{}",
            // Move cursor left, push left all the way and try again to see it doesn't do anything (ends up "(($ab+))")
            "{}_({ab}+{}_({$})_{})_{}", "{}_({ab}_({$}+{})_{})_{}", "{}_({}_({$ab}+{})_{})_{}", "{}_({}_({$ab}+{})_{})_{}",
            // Move cursor left, push right all the way and try again to see it doesn't do anything (ends up "(ab+$)()")
            "{}_({$}_({ab}+{})_{})_{}", "{}_({ab$}_({}+{})_{})_{}", "{}_({ab}+{$}_({})_{})_{}", "{}_({ab}+{$}_({})_{})_{}",
        ],
        [
            PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_LEFT,
            PushBracketArrow.LEFT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT,
            PushBracketArrow.LEFT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT,
        ]);
        
    testPushBracket("$(\"abc\"+f\"def\")",
        [
            // Push right all the way (ends up with ""abc"+f"def"$()")
            "{}_“abc”_{$}_({}+{f}_“def”_{})_{}", "{}_“abc”_{}+_{$}_({f}_“def”_{})_{}", "{}_“abc”_{}+{f$}_({}_“def”_{})_{}", "{}_“abc”_{}+{f}_“def”_{$}_({})_{}",
            // Move right inside parentheses, push left all the way (ends up same as orignal bar cursor position)
            "{}_“abc”_{}+{f}_“def”_{}_({$})_{}", "{}_“abc”_{}+{f}_({$}_“def”_{})_{}", "{}_“abc”_{}+{}_({$f}_“def”_{}){}", "{}_“abc”_{}_({$}+{f}_“def”_{})_{}", "{}_({$}_“abc”_{}+{f}_“def”_{}){}",  
            // Move at then end of expression (end), push left all the way (ends up with "()$"abc"+f"def"")
            "{}_({}_“abc”_{}+{f}_“def”_{})_{$}", "{}_({}_“abc”_{}+{f})_{$}_“def”_{}", "{}_({}_“abc”_{}+{})_{$f}_“def”_{}", "{}_({}_“abc”_{})_{$}+{f}_“def”_{}", "{}_({})_{$}_“abc”_{}+{f}_“def”_{}",
            // Move left, push right (ends up with "("abc"$)+f"def"")
            "{}_({$})_{}_“abc”_{}+{f}_“def”_{}", "{}_({}_“abc”_{$})_{}+{f}_“def”_{}",
        ],
        [
            PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT,
            PushBracketArrow.RIGHT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT,
            PushBracketArrow.END, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT, PushBracketArrow.MODIF_LEFT,
            PushBracketArrow.LEFT, PushBracketArrow.MODIF_RIGHT,
        ]);

    // Tests with media slots 
    // THE EXPECTED RESULTS DO NOT INCLUDE THE MEDIA SLOT: they will be seen as a "§" token in the test
    testPushBracket("set_background(load_image(\"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII\")) + abc + 2",
        [
            // Move just after the "set_background()" brackets (x6 left)
            "{set_background}_({}_§_{})_{}+{abc}+{$2}", "{set_background}_({}_§_{})_{}+{abc$}+{2}", "{set_background}_({}_§_{})_{}+{ab$c}+{2}", "{set_background}_({}_§_{})_{}+{a$bc}+{2}", "{set_background}_({}_§_{})_{}+{$abc}+{2}", "{set_background}_({}_§_{})_{$}+{abc}+{2}",
            // Push left, and move left to bring cursor between brackets (ends up with "set_background($)§+abc+2")
            "{set_background}_({})_{$}_§_{}+{abc}+{2}", "{set_background}_({$})_{}_§_{}+{abc}+{2}", 
            // Push right all the way (ends up with "set_background(§+abc+2$)")
            "{set_background}_({}_§_{$})_{}+{abc}+{2}", "{set_background}_({}_§_{}+{$})_{abc}+{2}", "{set_background}_({}_§_{}+{abc$})_{}+{2}", "{set_background}_({}_§_{}+{abc}+{$})_{2}", "{set_background}_({}_§_{}+{abc}+{2$})_{}",
            // Move just before the opening bracket of set_background() (8x left) and push right all the way (ends up with "set_background§+abc+2$()")
            "{set_background}_({}_§_{}+{abc}+{$2})_{}", "{set_background}_({}_§_{}+{abc$}+{2})_{}", "{set_background}_({}_§_{}+{ab$c}+{2})_{}", "{set_background}_({}_§_{}+{a$bc}+{2})_{}", "{set_background}_({}_§_{}+{$abc}+{2})_{}", "{set_background}_({}_§_{$}+{abc}+{2})_{}", "{set_background}_({$}_§_{}+{abc}+{2})_{}", "{set_background$}_({}_§_{}+{abc}+{2})_{}",
            "{set_background}_§_{$}_({}+{abc}+{2})_{}", "{set_background}_§_{}+{$}_({abc}+{2})_{}", "{set_background}_§_{}+{abc$}_({+2})_{}", "{set_background}_§_{}+{abc}+{2$}_({})_{}",
        ],
        [
            PushBracketArrow.LEFT, PushBracketArrow.LEFT, PushBracketArrow.LEFT, PushBracketArrow.LEFT, PushBracketArrow.LEFT, PushBracketArrow.LEFT,
            PushBracketArrow.MODIF_LEFT, PushBracketArrow.LEFT,
            PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT,
            PushBracketArrow.LEFT, PushBracketArrow.LEFT, PushBracketArrow.LEFT, PushBracketArrow.LEFT, PushBracketArrow.LEFT, PushBracketArrow.LEFT, PushBracketArrow.LEFT, PushBracketArrow.LEFT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT, PushBracketArrow.MODIF_RIGHT,
        ],
        true);
    
    // No bracket to push (shouldn't do anything)
    testPushBracket("$(abc+de)",
        [
            // Push left (stay the same), move right and push right (stay the same),
            "{$}_({abc}+{de})_{}", "{}_({$abc}+{de})_{}", "{}_({$abc}+{de})_{}",
            // move to end (end then left) and push left (stay the same), move left and push right (stay the same)
            "{}_({abc}+{de})_{$}", "{}_({abc}+{de$})_{}", "{}_({abc}+{de$})_{}", "{}_({abc}+{d$e})_{}", "{}_({abc}+{d$e})_{}",
        ],
        [
            PushBracketArrow.MODIF_LEFT, PushBracketArrow.RIGHT, PushBracketArrow.MODIF_RIGHT,
            PushBracketArrow.END, PushBracketArrow.LEFT,  PushBracketArrow.MODIF_LEFT, PushBracketArrow.LEFT, PushBracketArrow.MODIF_RIGHT,
        ]);
});

