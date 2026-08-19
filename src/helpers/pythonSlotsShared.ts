// Parser-agnostic SlotsStructure manipulation helpers, split out into their own leaf module (only
// type-only imports -- erased at compile time, so no runtime dependency) so they can be used from
// code that must stay Playwright-unit-testable without pulling in the app's circular
// types<->store<->storeMethods<->parser<->editor import graph -- see pythonToFrames.ts, which
// re-exports these for the rest of the app (and still owns the Skulpt-specific parsing that isn't
// parser-agnostic).
import type { BaseSlot, FieldSlot, MediaSlot, SlotsStructure, StringSlot } from "@/types/types";

// Deliberately local, trivial reimplementations of types.ts's isFieldBaseSlot/isFieldBracketedSlot/
// isFieldStringSlot -- those are simple property-presence checks, but importing the real ones would
// pull in types.ts's runtime (which has heavy side-effecting imports: i18n, the store, a compiler).
function isBaseSlot(field: FieldSlot): field is BaseSlot {
    return (field as StringSlot).quote === undefined
        && (field as SlotsStructure).openingBracketValue === undefined
        && (field as MediaSlot).mediaType === undefined;
}

export const STRYPE_DUMMY_FIELD = "___strype_dummy";
// Special things in expressions:
export const STRYPE_EXPRESSION_BLANK = "___strype_blank";
// Followed by unicode escapes:
export const STRYPE_INVALID_SLOT = "___strype_invalid_";
export const STRYPE_INVALID_OPS_WRAPPER = "___strype_opsinvalid";
export const STRYPE_INVALID_OP = "___strype_operator_";
// Wraps an f-string whose content can't be emitted as valid Python (an unmatched "{"/"}" --
// which is a genuine SyntaxError in real Python too, e.g. f"{x", not just a tree-sitter parsing
// artefact). See replaceMediaLiteralsAndInvalidOps() below and transformSlotLevel() in parser.ts.
// Deliberately NOT prefixed with STRYPE_INVALID_SLOT ("___strype_invalid_") -- that prefix is
// stripped from any identifier that starts with it (terminalToSlots() in pythonToFramesExpr.ts),
// which would silently mangle this name too if it were a prefix match (confirmed as a real bug
// live in-browser: the call was displayed/reloaded as bare "fstring(...)").
export const STRYPE_INVALID_FSTRING_WRAPPER = "___strype_fstring_wrap";

// A minimal, self-contained escape/unescape pair (1-char-lookahead, so unescaping is unambiguous
// in a single left-to-right pass) used only for STRYPE_INVALID_FSTRING_WRAPPER's argument: the
// generic string-slot generation path (parser.ts's getSlotStartsLengthsAndCodeForFrameLabel)
// emits a StringSlot's .code completely verbatim between its quote chars (Strype's normal typed
// input never contains an unescaped matching quote char, since typing one just closes the field
// rather than inserting a literal character -- so there's normally nothing to escape). Here we
// deliberately construct a StringSlot.code containing the original quote char programmatically,
// so -- unlike normal typed input -- it must be escaped ourselves before emission.
export function escapeForPlainStringLiteral(raw: string): string {
    return raw.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
export function unescapeFromPlainStringLiteral(escaped: string): string {
    let result = "";
    for (let i = 0; i < escaped.length; i++) {
        if (escaped[i] === "\\" && i + 1 < escaped.length) {
            result += escaped[i + 1];
            i++;
        }
        else {
            result += escaped[i];
        }
    }
    return result;
}

export function fromUnicodeEscapes(input: string): string {
    const regex = /u([0-9a-fA-F]{4,})/g; // We may not have always only 4 digits after "u", it's only the case for BMP characters
    return input.replace(regex, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

// Concatenates two slot structures with the given operator.
// Eliminates any redundant blank operators.
export function concatSlots(lhs: SlotsStructure, operator: string, rhs: SlotsStructure) : SlotsStructure {
    const joined = {fields: [...lhs.fields, ...rhs.fields], operators: [...lhs.operators, {code: operator}, ...rhs.operators]};
    // Eliminate any redundant blank operators (i.e. those where the RHS or RHS is a non-bracketed blank:
    for (let i = 0; i < joined.operators.length; i++) {
        if (joined.operators[i].code === "") {
            // Check LHS and RHS:
            if (isBaseSlot(joined.fields[i]) && isBaseSlot(joined.fields[i+1])) {
                // We can join the two:
                joined.fields[i] = {code: (joined.fields[i] as BaseSlot).code + (joined.fields[i+1] as BaseSlot).code};
                joined.fields.splice(i + 1, 1);
                joined.operators.splice(i, 1);
                // Make us re-examine operator i:
                i -= 1;
                continue;
            }
        }
    }
    return joined;
}

function isFieldBracketedSlot(field: FieldSlot): field is SlotsStructure {
    return (field as SlotsStructure).openingBracketValue !== undefined;
}

function isFieldStringSlot(field: FieldSlot): field is StringSlot {
    return (field as StringSlot).quote !== undefined;
}

export function replaceMediaLiteralsAndInvalidOps(s : SlotsStructure) : SlotsStructure {
    // We descend the tree, looking for the pattern:
    // <ident>(<string>)
    // and then check the ident and string

    // Note: we don't bother with last field because it can't be followed by brackets
    for (let i = 0; i < s.fields.length - 1; i++) {
        const curField = s.fields[i];
        const sub = s.fields[i + 1];
        if (isBaseSlot(curField)
            && s.operators[i].code === ""
            && isFieldBracketedSlot(sub)) {
            const funcCall = curField.code;
            let replaced = false;
            if (["load_image", "load_sound"].includes(funcCall)) {
                // Check the bracket is just a string literal, which will have two blanks either side:
                if (sub.fields.length == 3
                    && sub.openingBracketValue == "("
                    && isBaseSlot(sub.fields[0]) && !(sub.fields[0] as BaseSlot).code
                    && !sub.operators[0].code
                    && isFieldStringSlot(sub.fields[1])
                    && !sub.operators[1].code
                    && isBaseSlot(sub.fields[2]) && !(sub.fields[2] as BaseSlot).code) {

                    // Need to check ident and content of the bracket:
                    const stringArg = (sub.fields[1] as StringSlot).code;

                    if (funcCall == "load_image"
                        && stringArg.startsWith("data:image/")) {
                        s.fields[i] = {
                            code: "load_image(\"" + stringArg + "\")",
                            mediaType: /data:([^;]+)/.exec(stringArg)?.[1] ?? "image",
                        };
                        replaced = true;
                    }
                    else if (funcCall == "load_sound"
                        && stringArg.startsWith("data:audio/")) {
                        s.fields[i] = {
                            code: "load_sound(\"" + stringArg + "\")",
                            mediaType: /data:([^;]+)/.exec(stringArg)?.[1] ?? "audio",
                        };
                        replaced = true;
                    }
                    // Otherwise don't substitute
                }
            }
            else if (curField.code === STRYPE_INVALID_FSTRING_WRAPPER) {
                // The single argument holds the original prefix+quote+content+quote as an ordinary
                // (non-f) string, safely re-parsed here with the same regex stringNodeToSlots()
                // uses, to reconstruct the [prefix, StringSlot, blank] triple a real string literal
                // would have produced (see transformSlotLevel() in parser.ts for the save side):
                if (sub.fields.length == 3
                    && sub.openingBracketValue == "("
                    && isBaseSlot(sub.fields[0]) && !(sub.fields[0] as BaseSlot).code
                    && !sub.operators[0].code
                    && isFieldStringSlot(sub.fields[1])
                    && !sub.operators[1].code
                    && isBaseSlot(sub.fields[2]) && !(sub.fields[2] as BaseSlot).code) {
                    const raw = unescapeFromPlainStringLiteral((sub.fields[1] as StringSlot).code);
                    const strMatch = /^([rbfRBF]*)(["'])([\s\S]*)$/.exec(raw);
                    if (strMatch) {
                        const quote = strMatch[2];
                        const code = strMatch[3].slice(0, strMatch[3].length - quote.length);
                        s.fields.splice(i, 2, {code: strMatch[1]}, {code, quote} as StringSlot, {code: ""});
                        s.operators.splice(i, 1, {code: ""}, {code: ""});
                    }
                }
            }
            else if (curField.code === STRYPE_INVALID_OPS_WRAPPER) {
                if (sub.openingBracketValue == "("
                    // Check all ops are commas or blank:
                    && !sub.operators.some((op) => op.code != "," && op.code != "")) {
                    const fields = [];
                    const ops = [];
                    // Process all items as alternate fields and ops:
                    for (let i = 0; i < sub.fields.length; i+= 2) {
                        fields.push(sub.fields[i]);
                        if (i + 1 < sub.fields.length) {
                            const opField = sub.fields[i + 1];
                            if (isBaseSlot(opField) && opField.code.startsWith(STRYPE_INVALID_OP)) {
                                ops.push({code: fromUnicodeEscapes(opField.code.slice(STRYPE_INVALID_OP.length))});
                            }
                            else {
                                ops.push({code: ""});
                                i -= 1;
                            }
                        }
                    }
                    // If there are any adjacent blank fields with blank operators
                    // (which can occur in various arrangements involving bracket-adjacency),
                    // trim them:
                    for (let i = 0; i < fields.length - 1; i++) {
                        const cur = fields[i];
                        const next = fields[i + 1];
                        if (isBaseSlot(cur) && cur.code === ""
                            && isBaseSlot(next) && next.code === ""
                            && ops[i].code === "") {
                            fields.splice(i, 1);
                            ops.splice(i, 1);
                            // Process this index again:
                            i -= 1;
                        }
                    }

                    return {fields: fields, operators: ops, openingBracketValue: s.openingBracketValue};
                }
            }

            // But if we did, tidy up surrounding slots:
            if (replaced) {
                // First delete the bracketed arg that we don't need:
                s.fields.splice(i + 1, 1);
                s.operators.splice(i, 1);
                // Then check we have blank operators either side:
                if (s.operators[i].code) {
                    // Check RHS first so we don't need to adjust index:
                    s.operators.splice(i, 0, {code: ""});
                    s.fields.splice(i + 1, 0, {code: ""});
                }
                if (i == 0 || s.operators[i - 1].code) {
                    s.operators.splice(Math.max(i - 1, 0), 0, {code: ""});
                    s.fields.splice(i, 0, {code: ""});
                }
            }
        }
        // We don't descend because toSlots already calls us on any compound slot
    }
    return s;
}
