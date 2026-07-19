import { test, expect } from "@playwright/test";
import { calculatePrecedenceTiers, PrecedenceTier } from "@/helpers/operatorPrecedence";

// NOTE: this is really a *unit* test for the pure calculatePrecedenceTiers() function (see
// src/helpers/operatorPrecedence.ts) -- none of it touches a browser page, the DOM, or the
// live app. It's written as a Playwright spec purely to reuse the test infrastructure
// already in this repo (it runs alongside the rest of the Playwright suite with `npm run
// test:playwright`), rather than pulling in a second test framework (e.g. Vitest) just for
// one module. For the equivalent coverage against the real, rendered app -- typing/pasting/
// loading actual expressions and reading the CSS tier classes back from the live DOM -- see
// operator-precedence-spacing.spec.ts in this same directory.

test.describe("calculatePrecedenceTiers", () => {
    test("gives a sole operator the neutral 'medium' tier (nothing to contrast against)", () => {
        // a+b -- only one precedence present (trivially), so it's not "mixed" yet.
        expect(calculatePrecedenceTiers(["+"])).toEqual(["medium"] satisfies PrecedenceTier[]);
    });

    test("gives an equal-precedence chain the neutral 'medium' tier throughout", () => {
        // a+b+c -- a single precedence spans the whole segment, so every '+' is "medium".
        expect(calculatePrecedenceTiers(["+", "+"])).toEqual(["medium", "medium"] satisfies PrecedenceTier[]);
    });

    test("ties correctly for mixed precedence", () => {
        // a+b*c: '+' is looser (more space) than '*' (tighter, less space) -- this segment
        // is genuinely mixed, so the tightest-binding operator ('*') gets pulled to "high".
        expect(calculatePrecedenceTiers(["+", "*"])).toEqual(["medium", "high"] satisfies PrecedenceTier[]);
    });

    test("pulls a same-precedence chain from 'medium' down to 'high' once the segment becomes mixed", () => {
        // a+b+c (isolated) -- single precedence throughout, neutral "medium":
        expect(calculatePrecedenceTiers(["+", "+"])).toEqual(["medium", "medium"] satisfies PrecedenceTier[]);
        // a+b+c or d -- introducing "or" makes the segment mixed, so the '+' chain --
        // now the tightest-binding operator present -- is pulled down to "high". "or" is
        // the sole (loosest) keyword here, one level looser than the '+' chain, so it
        // lands on "keyword-medium" rather than the flat "keyword" tier of before:
        const tiers = calculatePrecedenceTiers(["+", "+", "or"]);
        expect(tiers).toEqual(["high", "high", "keyword-medium"] satisfies PrecedenceTier[]);
    });

    test("caps deep same-precedence chains at the neutral 'medium' tier throughout", () => {
        // a+b+c+d+e+f+g (6 '+' operators, all in the same precedence chain, never mixed)
        const tiers = calculatePrecedenceTiers(["+", "+", "+", "+", "+", "+"]);
        expect(tiers.every((t) => t === "medium")).toBe(true);
    });

    test("caps deep mixed-precedence nesting at the 'low'/'keyword-low' tier rather than growing further", () => {
        // Alternating strictly-looser-then-tighter operators nested many levels deep:
        // or, and, |, ^, &, <<, +, * -- each strictly tighter than the last, so precedence
        // recursion keeps incrementing the level, but must still collapse to high/medium/low
        // (or keyword-high/medium/low for the two keyword operators). This segment is
        // thoroughly mixed, so the standard level-to-tier mapping applies throughout.
        const tiers = calculatePrecedenceTiers(["or", "and", "|", "^", "&", "<<", "+", "*"]);
        // "or"/"and" are both keywords, and both deep enough (levels 7 and 6) to be capped
        // at "keyword-low" -- they still land on one of the three keyword tiers, never a
        // made-up 4th one, even though their raw levels differ:
        expect(tiers[0]).toBe("keyword-low"); // 'or'
        expect(tiers[1]).toBe("keyword-low"); // 'and'
        // The symbol operators must likewise each be one of the three real (non-keyword) tiers:
        const symbolTiers = [tiers[2], tiers[3], tiers[4], tiers[5], tiers[6], tiers[7]];
        symbolTiers.forEach((t) => expect(["high", "medium", "low"]).toContain(t));
        expect(tiers[7]).toBe("high"); // '*' is the tightest-binding operator here
    });

    test("spreads three differently-precedenced keyword operators across all three keyword tiers", () => {
        // a not in b and c or d: "not in" (a comparison, prec 50) binds tightest, "and"
        // (prec 30) is next, "or" (prec 20) is loosest -- three distinct precedences
        // competing in one segment, so keyword operators get real tiering just like
        // symbol operators do, rather than a single flat "keyword" tier for all of them:
        const tiers = calculatePrecedenceTiers(["not in", "and", "or"]);
        expect(tiers).toEqual(["keyword-high", "keyword-medium", "keyword-low"] satisfies PrecedenceTier[]);
    });

    test("still only shows two keyword tiers when only two precedences are present", () => {
        // a and b or c: "and" (prec 30) tighter than "or" (prec 20) -- only two distinct
        // precedences, so only two tiers show up, same as the symbol ladder would:
        expect(calculatePrecedenceTiers(["and", "or"])).toEqual(["keyword-high", "keyword-medium"] satisfies PrecedenceTier[]);
    });

    test("gives 'not' the neutral keyword tier when solo, and '~' the neutral symbol tier when solo", () => {
        // Solo/unmixed, so each gets its own ladder's neutral default -- "keyword-medium"
        // for the keyword "not", "medium" for the symbol "~":
        expect(calculatePrecedenceTiers(["not"])).toEqual(["keyword-medium"] satisfies PrecedenceTier[]);
        // '~' alone is a sole (unmixed) operator, so it gets the same "medium" default as
        // any other lone operator -- its unary-prefix leading margin is separately
        // suppressed at the CSS layer (see LabelSlot.vue), independent of tier.
        expect(calculatePrecedenceTiers(["~"])).toEqual(["medium"] satisfies PrecedenceTier[]);
    });

    test("gives comma/dot/equals/colon their fixed tiers and never selects them as a pivot", () => {
        expect(calculatePrecedenceTiers([","])).toEqual(["comma"] satisfies PrecedenceTier[]);
        expect(calculatePrecedenceTiers(["."])).toEqual(["dot"] satisfies PrecedenceTier[]);
        expect(calculatePrecedenceTiers(["="])).toEqual(["equals"] satisfies PrecedenceTier[]);
        expect(calculatePrecedenceTiers([":"])).toEqual(["colon"] satisfies PrecedenceTier[]);

        // foo(a, b=1+2): the '+' must tier correctly (as a sole/neutral operator, "medium"),
        // unaffected by the ',' and '=' around it.
        const tiers = calculatePrecedenceTiers([",", "=", "+"]);
        expect(tiers).toEqual(["comma", "equals", "medium"] satisfies PrecedenceTier[]);
    });

    test("splits independently at each comma, unaffected by precedence on the other side", () => {
        // f(a+b, c*d, e/f): each segment gets its own independent tiering; each is a sole
        // operator in its own segment, so each defaults to "medium".
        const tiers = calculatePrecedenceTiers(["+", ",", "*", ",", "/"]);
        expect(tiers).toEqual(["medium", "comma", "medium", "comma", "medium"] satisfies PrecedenceTier[]);
    });

    test("treats ternary if/else as hard segment boundaries, not ordinary operators", () => {
        // a+b if c else d+e -- if/else aren't operators in the classic sense (they're
        // clause separators, like commas), so they split the array into three independent
        // segments (before 'if', between 'if'/'else', after 'else') instead of competing
        // for the precedence pivot. Each '+' is a sole operator in its own branch, so each
        // stays "medium" -- unaffected by if/else sitting elsewhere in the same array:
        const tiers = calculatePrecedenceTiers(["+", "if", "else", "+"]);
        expect(tiers[0]).toBe("medium");
        expect(tiers[3]).toBe("medium");
        expect(tiers[1]).toBe("keyword-medium");
        expect(tiers[2]).toBe("keyword-medium");
    });

    test("doesn't let a ternary's if/else tighten a comparison in its condition", () => {
        // a if b>c else d -- '>' sits in its own segment (between 'if' and 'else'), so it
        // gets the neutral "medium" default like any other sole operator, rather than
        // being pulled to "high" just because if/else's own (looser) precedence would
        // otherwise make this look like a "mixed" segment:
        const tiers = calculatePrecedenceTiers(["if", ">", "else"]);
        expect(tiers[0]).toBe("keyword-medium");
        expect(tiers[1]).toBe("medium");
        expect(tiers[2]).toBe("keyword-medium");
    });

    test("treats comprehension for/in/if as hard segment boundaries, not ordinary operators", () => {
        // [x+1 for x in range(10) if x>2] -- 'range(10)' is a nested bracket, not part of
        // this level. The '+' and '>' are each a sole operator in their own segment
        // (comma/comprehension markers are hard boundaries), so each is "medium".
        const tiers = calculatePrecedenceTiers(["+", "for", "in", "if", ">"]);
        expect(tiers).toEqual(["medium", "keyword-medium", "keyword-medium", "keyword-medium", "medium"] satisfies PrecedenceTier[]);
    });

    test("disambiguates a real comparison 'in' from a comprehension 'in' by position", () => {
        // Real comparison, before any 'for': a in b -- solo, so the neutral keyword default:
        expect(calculatePrecedenceTiers(["in"])).toEqual(["keyword-medium"] satisfies PrecedenceTier[]);
        // Comprehension clause separator, after 'for': [x for x in y] -- boundary role,
        // same fixed neutral default:
        const tiers = calculatePrecedenceTiers(["for", "in"]);
        expect(tiers).toEqual(["keyword-medium", "keyword-medium"] satisfies PrecedenceTier[]);
    });

    test("handles an empty operators array", () => {
        expect(calculatePrecedenceTiers([])).toEqual([] satisfies PrecedenceTier[]);
    });

    test("treats 'lambda' as a pass-through prefix keyword operator, binding loosest of all", () => {
        // lambda n: -n -- fields would be ["", "n", "", "n"], no semantic understanding
        // of the parameter list is needed for tiering purposes. "lambda" is solo in its
        // own segment (":" splits it off from the body), so it gets the neutral
        // "keyword-medium" default; the lone "-" gets the neutral "medium" default.
        expect(calculatePrecedenceTiers(["lambda", ":", "-"])).toEqual(["keyword-medium", "colon", "medium"] satisfies PrecedenceTier[]);
        // lambda binds looser than everything else still in the ladder if it ever shares
        // a segment with other real operators (see PRECEDENCE) -- solo here, though:
        expect(calculatePrecedenceTiers(["lambda"])).toEqual(["keyword-medium"] satisfies PrecedenceTier[]);
    });
});

test.describe("calculatePrecedenceTiers: per-level independence", () => {
    // generateFlatSlotBases() (see src/helpers/storeMethods.ts) calls calculatePrecedenceTiers()
    // once per SlotsStructure level, recursing into brackets separately -- so calling it
    // directly, once per level, here is a faithful (and DOM-free) stand-in for that wiring.
    // The live-DOM equivalent of these two cases (typing/pasting the real bracketed
    // expressions and reading the rendered tier classes) is in
    // operator-precedence-spacing.spec.ts's "(a+b)*(c+d)" tests.

    test("tiers each level independently of its neighbours", () => {
        // (a+b)*(c+d): each bracket's '+' is a sole operator within its own level, and the
        // outer level (blank placeholder, '*', blank placeholder) has only one real
        // operator -- so all three render as "medium".
        expect(calculatePrecedenceTiers(["+"])).toEqual(["medium"] satisfies PrecedenceTier[]); // inside (a+b)
        const outerTiers = calculatePrecedenceTiers(["", "*", ""]);
        expect(outerTiers[1]).toBe("medium"); // outer '*', solo
        expect(calculatePrecedenceTiers(["+"])).toEqual(["medium"] satisfies PrecedenceTier[]); // inside (c+d)
    });

    test("pulls the outer operator to 'high' once the outer level is itself mixed", () => {
        // (a+b)*(c+d)+e: the outer level now has two real operators ('*' and '+') at
        // different precedences, so it's mixed and the tighter one ('*') is pulled to
        // "high". The inner brackets are completely unaffected either way.
        expect(calculatePrecedenceTiers(["+"])).toEqual(["medium"] satisfies PrecedenceTier[]); // inside (a+b), unaffected
        const outerTiers = calculatePrecedenceTiers(["", "*", "+"]);
        expect(outerTiers[1]).toBe("high"); // outer '*'
        expect(outerTiers[2]).toBe("medium"); // outer '+'
        expect(calculatePrecedenceTiers(["+"])).toEqual(["medium"] satisfies PrecedenceTier[]); // inside (c+d), unaffected
    });
});

test.describe("calculatePrecedenceTiers: detected unary sign ('-'/'+')", () => {
    // The isUnarySignAt parameter is how generateFlatSlotBases (storeMethods.ts) tells this
    // function that a particular "-"/"+" is acting as a unary sign rather than an ordinary
    // binary operator (it can't be told apart from the code alone, unlike "~"/"not"/"lambda"
    // -- see UNARY_PREFIX_OPERATORS). Real Python binds unary +/-/~ all at the same, very
    // tight precedence (between binary */÷///% and **) -- a detected unary sign uses that
    // same tight value here, not binary +/-'s much looser one.

    test("a solo unary sign gets the neutral 'sign-medium' tier (same rule as any solo operator)", () => {
        // -x alone: nothing to contrast against, so -- like any solo operator -- it gets the
        // neutral default rather than the tightest tier. "sign-medium" is that default with
        // the leading margin suppressed (there's nothing meaningful to a unary sign's left).
        expect(calculatePrecedenceTiers(["-"], [true])).toEqual(["sign-medium"] satisfies PrecedenceTier[]);
    });

    test("an ordinary binary '-' is unaffected when not flagged as a unary sign", () => {
        // x-y: same array as the unary case above, but isUnarySignAt is false here --
        // ordinary binary "-", neutral "medium" like any other solo binary operator:
        expect(calculatePrecedenceTiers(["-"], [false])).toEqual(["medium"] satisfies PrecedenceTier[]);
        // Omitting isUnarySignAt entirely defaults to "nothing is unary", same result:
        expect(calculatePrecedenceTiers(["-"])).toEqual(["medium"] satisfies PrecedenceTier[]);
    });

    test("a mixed unary sign binds tight enough to reach 'high', pulling the binary operator around it looser", () => {
        // -x+y: unary "-" now binds as tightly as "~", tighter than binary "+", so "+"
        // becomes the pivot and "-" is pulled to "high" (needing no substitute -- "high" is
        // already zero margin on both sides) while "+" lands on the ordinary "medium":
        expect(calculatePrecedenceTiers(["-", "+"], [true, false])).toEqual(["high", "medium"] satisfies PrecedenceTier[]);
        // -x*y: same story against '*', which is tighter than binary +/- but still looser
        // than a unary sign:
        expect(calculatePrecedenceTiers(["-", "*"], [true, false])).toEqual(["high", "medium"] satisfies PrecedenceTier[]);
    });

    test("two adjacent unary operators of tied precedence both get the neutral default", () => {
        // ~-x: "~" (always unary, precedence 120) and a detected unary "-" (also 120) tie,
        // so -- same as any equal-precedence chain -- both get the neutral default rather
        // than being pulled apart. "-" additionally substitutes to "sign-medium":
        expect(calculatePrecedenceTiers(["~", "-"], [false, true])).toEqual(["medium", "sign-medium"] satisfies PrecedenceTier[]);
    });

    test("a unary sign binds looser than '**' on its left, matching real Python's -x**y == -(x**y)", () => {
        // -x**y: "**" (130) is the only thing tighter than a unary sign (120), so "-" is
        // pulled to "sign-medium" (looser) while "**" stays "high":
        expect(calculatePrecedenceTiers(["-", "**"], [true, false])).toEqual(["sign-medium", "high"] satisfies PrecedenceTier[]);
    });

    test("a unary sign among multiple binary operators still resolves per-operator correctly", () => {
        // -x+y*z: unary "-" (tight) and "*" (tighter than binary +/-) both end up "high",
        // while the loosest operator present, binary "+", is pulled to "medium":
        expect(calculatePrecedenceTiers(["-", "+", "*"], [true, false, false])).toEqual(["high", "medium", "high"] satisfies PrecedenceTier[]);
    });
});
