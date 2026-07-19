// Computes the visual spacing "tier" of each operator inside one level (i.e. one
// SlotsStructure.operators array -- top-level or a single bracketed sub-expression)
// of a Strype expression slot. This mirrors the precedence-based spacing approach
// used by BlueJ/Greenfoot's frame editor (InfixStructured.calculatePrecedences /
// Operator.getOperatorPrecedence), adapted for Python operators.
//
// This module is intentionally self-contained (no imports from editor.ts/parser.ts)
// so it stays a pure, independently testable function.

// "sign-medium" is a substitute for "medium", used when a "-"/"+" is a detected unary sign
// (see calculatePrecedenceTiers' isUnarySignAt parameter): visually identical to "medium"
// (same CSS class, see LabelSlot.vue) except with no leading margin. There's no "sign-high"
// because "high" is already zero margin on both sides, and no "sign-low" because unary sign
// now binds as tightly as "~" (see PRECEDENCE), so it never falls that far -- see the
// operatorPrecedence.test-equivalent cases in operator-precedence-calculation.spec.ts for
// why level 2+ isn't reachable for it in practice.
export type PrecedenceTier = "dot" | "comma" | "equals" | "colon" | "keyword-high" | "keyword-medium" | "keyword-low" | "high" | "medium" | "low" | "sign-medium";

// Tokens that never participate in the precedence ladder at all: they always
// render with a fixed tier, and are never candidates when searching for the
// "lowest precedence operator" in a level.
const FIXED_TIERS: Record<string, PrecedenceTier> = {
    ".": "dot",
    "=": "equals",
    ":": "colon",
    ",": "comma",
};

// Tokens that are always word-shaped (keyword) operators. They still participate in the
// same precedence ladder as symbol operators (so e.g. "a not in b and c or d" gets three
// distinct keyword tiers, tightest to loosest), but are rendered with their own
// keyword-high/medium/low tiers rather than the symbol high/medium/low ones, since a
// word-shaped operator can never visually collapse all the way to zero space.
const KEYWORD_OPERATORS = new Set(["and", "or", "not", "in", "is", "is not", "not in", "as", "if", "else", "for", "lambda"]);

// Operators that are always used as a unary prefix in Strype's grammar (always solo,
// always with a blank field before them -- see transformSlotLevel's validity check).
// They should never get a leading margin (there's nothing meaningful to their left),
// only a trailing one to separate them from their operand.
export const UNARY_PREFIX_OPERATORS = new Set(["not", "~", "lambda"]);

// Numeric precedence, ascending = binds tighter (matches BlueJ's convention).
// Only real (non-fixed-tier, non-boundary) operators appear here -- ternary if/else and
// comprehension for/in/if are classified as "boundary" (see classifyRoles) and never
// reach this table.
const PRECEDENCE: Record<string, number> = {
    // "lambda" has no semantic support in Strype (no parameter-list awareness) -- it's
    // recognised as a plain prefix keyword operator, like "not", purely so it can be
    // typed/pasted without error and gets sensible spacing. Its precedence is the lowest
    // of any construct still in the ladder:
    "lambda": 5,
    "or": 20,
    "and": 30,
    "not": 40, // unary keyword "not" -- always solo at index 0 (see transformSlotLevel)
    // comparisons -- all equal precedence, Python chains these non-associatively
    "in": 50, "is": 50, "is not": 50, "not in": 50,
    "==": 50, "!=": 50, "<": 50, "<=": 50, ">": 50, ">=": 50,
    "|": 60,
    "^": 70,
    "&": 80,
    "<<": 90, ">>": 90,
    "+": 100, "-": 100, // binary only -- a detected unary sign uses UNARY_SIGN_PRECEDENCE instead
    "*": 110, "/": 110, "//": 110, "%": 110,
    "~": 120, // unary -- always solo at index 0
    "**": 130,
};

// Real Python binds unary +/-/~ all at the same (very tight) precedence, between binary
// */÷///% and **. calculatePrecedenceTiers has no way to tell a unary "-"/"+" from a binary
// one just from its code (unlike "~", which is unconditionally unary) -- the caller passes
// that in via isUnarySignAt, computed from field context it has and this module deliberately
// doesn't (see generateFlatSlotBases).
const UNARY_SIGN_PRECEDENCE = PRECEDENCE["~"];

type Role = "fixed" | "boundary" | "operator";

interface ClassifiedOp {
    index: number;
    code: string;
    role: Role;
}

// Classifies every operator in the flat array by its role. Ternary "if"/"else" and
// comprehension "for"/"in"/"if" aren't operators in the classic sense -- they're clause
// separators, like commas. They always get a fixed "keyword" tier and act as hard
// segment boundaries, splitting the array into independent clauses rather than
// participating in the precedence ladder themselves. Without this, a clause's own
// looser-than-comparison precedence (e.g. the ternary's, or a comprehension's) would
// make the *whole* array look "mixed" and wrongly tighten operators inside one clause --
// e.g. "a if b>c else d" would pull "b>c" to the tightest tier just because "if"/"else"
// happen to sit elsewhere in the same flat array.
//
// "in" is the only ambiguous token: it's a genuine comparison operator ("a in b") outside
// a comprehension, but a clause separator inside one ("for x in y"). Disambiguated by
// position: once a top-level "for" is seen, every subsequent "in" in this same level is
// the comprehension's, not an ordinary operator.
function classifyRoles(operatorCodes: string[]): ClassifiedOp[] {
    let seenTopLevelFor = false;
    return operatorCodes.map((code, index) => {
        if (code in FIXED_TIERS) {
            return { index, code, role: "fixed" as Role };
        }
        if (code === "for") {
            seenTopLevelFor = true;
            return { index, code, role: "boundary" as Role };
        }
        if (code === "if" || code === "else") {
            return { index, code, role: "boundary" as Role };
        }
        if (seenTopLevelFor && code === "in") {
            return { index, code, role: "boundary" as Role };
        }
        return { index, code, role: "operator" as Role };
    });
}

// Mirrors BlueJ's OpPrec pair: the precedence value of the pivot operator
// chosen for a segment (-1 if the segment had no operators), and the visual
// "level" that pivot (and thus the segment as a whole, for combining purposes
// with a parent segment) ended up at.
interface OpPrec {
    prec: number;
    level: number;
}

// Ports BlueJ's InfixStructured.calculatePrecedences: given a segment of
// (index, code) pairs containing no fixed/boundary tokens, finds the single
// lowest-precedence operator (ties broken leftmost), recursively computes the
// left/right sub-segments' levels around it, and combines them the same way
// BlueJ does. Records each pivot's raw numeric level into `levels` by index
// (not yet a tier -- see calculatePrecedenceTiers for why the level-to-tier
// mapping needs the whole segment's range, not just one operator's own level).
function tierSegment(segment: ClassifiedOp[], levels: Map<number, number>, isUnarySignAt: boolean[]): OpPrec {
    let lowestPrec = Number.MAX_SAFE_INTEGER;
    let lowestPos = -1;
    for (let i = 0; i < segment.length; i++) {
        const op = segment[i];
        const prec = isUnarySignAt[op.index] ? UNARY_SIGN_PRECEDENCE : PRECEDENCE[op.code];
        if (prec < lowestPrec) {
            lowestPrec = prec;
            lowestPos = i;
        }
    }

    if (lowestPos === -1) {
        // No operators in this segment.
        return { prec: -1, level: 0 };
    }

    const lhs = segment.slice(0, lowestPos);
    const rhs = segment.slice(lowestPos + 1);
    const lhsResult = tierSegment(lhs, levels, isUnarySignAt);
    const rhsResult = tierSegment(rhs, levels, isUnarySignAt);

    let ourLevel: number;
    if (lhsResult.prec === lowestPrec || rhsResult.prec === lowestPrec || (lhsResult.prec === -1 && rhsResult.prec === -1)) {
        // Same precedence chain as a child (or no operators on either side):
        ourLevel = Math.max(lhsResult.level, rhsResult.level);
    }
    else {
        ourLevel = 1 + Math.max(lhsResult.level, rhsResult.level);
    }

    const pivot = segment[lowestPos];
    levels.set(pivot.index, ourLevel);

    return { prec: lowestPrec, level: ourLevel };
}

// Maps a level to a tier once we know whether this segment is "mixed" (see below).
// Keyword operators get their own high/medium/low ladder, parallel to the symbol one,
// since they can never render as tightly as a symbol can.
function tierForLevel(level: number, isKeyword: boolean): PrecedenceTier {
    if (level === 0) {
        return isKeyword ? "keyword-high" : "high";
    }
    else if (level === 1) {
        return isKeyword ? "keyword-medium" : "medium";
    }
    else {
        return isKeyword ? "keyword-low" : "low";
    }
}

// isUnarySignAt: parallel to operatorCodes, true at indices where a "-"/"+" is a detected
// unary sign (see generateFlatSlotBases) rather than an ordinary binary operator. Ignored
// at every other index. Defaulted so existing call sites without any unary "-"/"+" don't
// need to pass it.
export function calculatePrecedenceTiers(operatorCodes: string[], isUnarySignAt: boolean[] = []): PrecedenceTier[] {
    const tiers: PrecedenceTier[] = new Array(operatorCodes.length).fill("high");

    const classified = classifyRoles(operatorCodes);

    // Assign fixed tiers directly.
    classified.forEach((op) => {
        if (op.role === "fixed") {
            tiers[op.index] = FIXED_TIERS[op.code];
        }
        else if (op.role === "boundary") {
            // Not part of the ladder at all (see classifyRoles), so there's no computed
            // level to map -- "keyword-medium" is the same neutral default that a solo/
            // unmixed symbol operator gets ("medium").
            tiers[op.index] = "keyword-medium";
        }
    });

    // Split into segments at every fixed/boundary token, and tier each
    // "operator"-role segment independently.
    let currentSegment: ClassifiedOp[] = [];
    const flushSegment = () => {
        if (currentSegment.length > 0) {
            const levels = new Map<number, number>();
            tierSegment(currentSegment, levels, isUnarySignAt);

            // A segment where every operator lands at level 0 has only a single
            // precedence present throughout (e.g. "a+b+c", "a<b<c") -- there's
            // nothing to visually differentiate, so instead of using the tightest
            // tier we use "medium" (or "keyword-medium") as a neutral default. The
            // tightest tier is reserved for when the segment actually becomes mixed
            // (level 0 no longer the only level present): e.g. "a+b+c or d" pulls "+"
            // down to "high" once "or" introduces a second, looser precedence -- and
            // likewise "a not in b and c or d" spreads "not in"/"and"/"or" across all
            // three keyword tiers, since they're three distinct precedences competing
            // in the same segment.
            const maxLevel = Math.max(...currentSegment.map((op) => levels.get(op.index) ?? 0));

            currentSegment.forEach((op) => {
                const isKeyword = KEYWORD_OPERATORS.has(op.code);
                let tier = (maxLevel === 0)
                    ? (isKeyword ? "keyword-medium" : "medium")
                    : tierForLevel(levels.get(op.index) ?? 0, isKeyword);
                // A detected unary sign substitutes in "sign-medium" for "medium" so the CSS
                // layer knows to suppress its leading margin ("high" needs no substitute --
                // already zero margin on both sides; "low" isn't reachable now that unary
                // sign binds as tightly as "~", see UNARY_SIGN_PRECEDENCE):
                if (isUnarySignAt[op.index] && tier === "medium") {
                    tier = "sign-medium";
                }
                tiers[op.index] = tier;
            });

            currentSegment = [];
        }
    };
    classified.forEach((op) => {
        if (op.role === "operator") {
            currentSegment.push(op);
        }
        else {
            flushSegment();
        }
    });
    flushSegment();

    return tiers;
}
