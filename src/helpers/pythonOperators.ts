// The symbolic/keyword operator lists, split out into their own leaf module (no imports) so they
// can be used from code that must stay Playwright-unit-testable without pulling in the app's
// circular types<->store<->storeMethods<->parser<->editor import graph -- see editor.ts, which
// re-exports these for the rest of the app.

// For Strype, we ignore the following double/triple operators += -= /= *= %= //= **= &= |= ^= >>= <<=
export const operators = [".","+","-","/","*","%",":","//","**","&","|","~","^",">>","<<",
    "==","=","!=",">=","<=","<",">",","];
// Note that for those textual operator keywords, we only have space surrounding the single words: double words don't need
// as they will always come from a combination of writing one word then the other (the first will be added as operator);
// "as" is added in the operator list for imports, but it will be discarded when not dealing with import frames.
// Important that the longer operators come before the shorter ones with the same prefix:
// "lambda" is recognised as a plain prefix keyword operator (like "not") so it can be
// typed/pasted without crashing and gets sensible precedence-based spacing, but Strype
// gives it no semantic support (no parameter-list awareness) -- it's a pass-through.
export const keywordOperatorsWithSurroundSpaces = [" and ", " in ", " is not ", " is ", " or ", " not in ", " not ", " as ", " if ", " else ", " for ", " lambda "];
export const trimmedKeywordOperators = keywordOperatorsWithSurroundSpaces.map((spacedOp) => spacedOp.trim());
