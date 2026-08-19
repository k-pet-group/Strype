import type Parser from "web-tree-sitter";
import type { SlotsStructure, StringSlot } from "@/types/types";
import { operators, trimmedKeywordOperators } from "@/helpers/pythonOperators";
import { concatSlots, replaceMediaLiteralsAndInvalidOps, fromUnicodeEscapes, STRYPE_EXPRESSION_BLANK, STRYPE_INVALID_SLOT } from "@/helpers/pythonSlotsShared";

type SyntaxNode = Parser.SyntaxNode;

// The tree-sitter-based replacement for pythonToFrames.ts's old, now-deleted
// toSlots()/parseNextTerm()/digValue().
//
// Key structural difference from the old Skulpt-based version: Skulpt's grammar produced a flat
// token sequence per precedence level (so the old code had to manually walk operators/operands
// token-by-token via ParseState), whereas tree-sitter nests operators by precedence as real binary
// trees (e.g. "1 + 2 * 3" is binary_operator(1, +, binary_operator(2, *, 3))). But Strype's flat
// slot model (SlotsStructure.fields/operators) has no precedence grouping of its own -- checking
// the old code confirms it flattens across precedence levels too, via recursive concatSlots(), only
// stopping at explicit source parentheses. So this new nodeToSlots() achieves the same flattening
// by recursing through the tree-sitter node tree and concatSlots()-ing every step, relying on
// tree-sitter's *structure* (not manual operator-precedence bookkeeping) to know where each
// sub-expression begins and ends.

export class UnsupportedConstructError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UnsupportedConstructError";
    }
}

const BRACKET_OPEN = new Set(["(", "[", "{"]);

function blankField() : SlotsStructure {
    return {fields: [{code: ""}], operators: []};
}

function isOperatorToken(n : SyntaxNode) : boolean {
    return n.childCount === 0 && (operators.includes(n.text) || trimmedKeywordOperators.includes(n.text));
}

// Walks a flat ordered list of sibling nodes (which may include bare operator/punctuation tokens),
// alternating operand/operator/operand/... -- the tree-sitter equivalent of the old parseNextTerm()
// loop, except each "operand" here is always a single already-structured child node (tree-sitter has
// already resolved precedence/associativity into real sub-trees, so unlike the old code there's no
// need to manually scan ahead for e.g. unary +/- prefixes).
// Exported for reuse by the statement-level tree walk (pythonToFrames.ts) for its own
// keyword-prefixed comma/operator sequences (e.g. global_statement's variable list, an
// import_statement's names after "import"), which need the exact same operand/operator flattening
// as expressions do.
export function flattenChildren(nodes : SyntaxNode[]) : SlotsStructure {
    let idx = 0;
    const readOperand = () : SlotsStructure => {
        if (idx < nodes.length && !isOperatorToken(nodes[idx])) {
            return nodeToSlots(nodes[idx++]);
        }
        // Blank operand: either a leading operator (e.g. the ":" in "a[:2]") or trailing/adjacent
        // operators with nothing between them (e.g. "a[::2]"), or an empty node list altogether.
        return blankField();
    };
    let latest = readOperand();
    while (idx < nodes.length) {
        if (!isOperatorToken(nodes[idx])) {
            // A non-operator node landed where an operator was expected -- rather than silently
            // misinterpreting its text as an operator (and then misreading the *next* node as its
            // operand), fail clearly. This is a real safety net, not just defensive dead code: it's
            // exactly how the "yield" case above would have gone wrong before that explicit check
            // was added, and guards against any other future construct not yet in
            // operators/trimmedKeywordOperators falling through the same way.
            throw new UnsupportedConstructError("Unsupported construct: " + nodes[idx].type);
        }
        let opText = nodes[idx].text;
        idx++;
        // Merge two adjacent operator tokens that form one compound keyword operator, e.g.
        // "is"+"not" -> "is not", or "not"+"in" -> "not in" (comparison_operator surfaces these
        // as two sibling tokens, both under the "operators" field):
        if (idx < nodes.length && isOperatorToken(nodes[idx])) {
            const combined = opText + " " + nodes[idx].text;
            if (trimmedKeywordOperators.includes(combined)) {
                opText = combined;
                idx++;
            }
        }
        latest = concatSlots(latest, opText, readOperand());
    }
    return replaceMediaLiteralsAndInvalidOps(latest);
}

// Wraps already-extracted inner content (the nodes between an opening and closing bracket) as a
// bracketed sub-structure, matching the shape the rest of Strype expects for e.g. call arguments,
// list/tuple/dict/set literals, and parenthesized groups.
function bracketed(inner : SyntaxNode[], openBracket : string) : SlotsStructure {
    const content = flattenChildren(inner);
    return {fields: [{code: ""}, {...content, openingBracketValue: openBracket}, {code: ""}], operators: [{code: ""}, {code: ""}]};
}

// Comprehensions ([x for x in y if z], {x for x in y}, {k:v for k,v in y}, (x for x in y)) have a
// body followed by one or more for_in_clause/if_clause siblings with no operator tokens joining
// them at this level (the "for"/"in"/"if" keywords are fields *inside* those clause nodes, not
// siblings alongside them) -- so unlike ordinary bracketed content, this can't reuse
// flattenChildren() directly and needs its own walk, mirroring the old code's explicit
// comp_for/comp_iter/comp_if handling.
function comprehensionToSlots(node : SyntaxNode, openBracket : string) : SlotsStructure {
    const body = node.childForFieldName("body");
    let latest = body ? nodeToSlots(body) : blankField();
    for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (!child) {
            continue;
        }
        if (child.type === "for_in_clause") {
            const left = child.childForFieldName("left");
            const right = child.childForFieldName("right");
            if (left && right) {
                latest = concatSlots(latest, "for", concatSlots(nodeToSlots(left), "in", nodeToSlots(right)));
            }
        }
        else if (child.type === "if_clause") {
            // Children: ["if", <condition>]
            const cond = child.child(1);
            if (cond) {
                latest = concatSlots(latest, "if", nodeToSlots(cond));
            }
        }
    }
    return {fields: [{code: ""}, {...latest, openingBracketValue: openBracket}, {code: ""}], operators: [{code: ""}, {code: ""}]};
}

// Whether the source currently being walked is SPY format -- set once per parse via
// setIsSPYForDocStrings() (called from copyFramesFromParsedPython() in pythonToFrames.ts, which
// already knows the format) rather than threaded as a parameter through every nodeToSlots() call
// site, since only stringNodeToSlots() below actually needs it. Module-level mutable state is a
// bit of a blunt instrument, but the alternative -- an extra parameter on every recursive
// nodeToSlots()/flattenChildren() call across this whole file -- is worse for something this
// narrowly scoped, and parses are never concurrent (this module has no async boundaries mid-walk).
let currentIsSPY = false;
export function setIsSPYForDocStrings(isSPY : boolean) : void {
    currentIsSPY = isSPY;
}

// Strings (including f-strings) are flattened back to their raw source text rather than walked --
// tree-sitter's byte ranges make this easier than reconstructing token values, and Strype only ever
// stores a whole string literal as one opaque slot anyway (see toSlots()'s old strMatch regex, which
// this mirrors exactly).
function stringNodeToSlots(node : SyntaxNode) : SlotsStructure {
    const val = node.text;
    // ([\s\S] matches any char, including newlines, present if the string is triple-quoted):
    const strMatch = /^([rbfRBF]*)(["'])([\s\S]+)$/.exec(val);
    if (strMatch) {
        let code = strMatch[3].slice(0, strMatch[3].length - strMatch[2].length);
        // A multi-line (triple-quoted) docstring in a .spy file has each of its continuation lines
        // indented to match the surrounding code's indentation, by Strype's own save logic (see
        // parser.ts) -- reversed here on load by stripping that same indentation (the column the
        // string itself starts at) back off, so the stored slot content matches what was actually
        // typed rather than accumulating extra indentation on every load/save round-trip. Only
        // done for .spy (not plain .py, where a docstring's internal indentation is genuine
        // user content and must be preserved verbatim) -- confirmed as a real, not just
        // theoretical, gap: multi-line class/function doc-comments were gaining 4 extra spaces of
        // indentation on every re-save of a .spy fixture.
        if (currentIsSPY && code.includes("\n")) {
            const indent = " ".repeat(node.startPosition.column);
            code = code.split("\n").map((line, i) => (i > 0 && line.startsWith(indent)) ? line.slice(indent.length) : line).join("\n");
        }
        const str : StringSlot = {code, quote: strMatch[2]};
        return {fields: [{code: strMatch[1]}, str, {code: ""}], operators: [{code: ""}, {code: ""}]};
    }
    // Shouldn't happen for a genuine `string` node, but fall back to treating it as plain text:
    return {fields: [{code: val}], operators: []};
}

function terminalToSlots(node : SyntaxNode) : SlotsStructure {
    let val = node.text;
    if (val === STRYPE_EXPRESSION_BLANK) {
        val = "";
    }
    else if (val.startsWith(STRYPE_INVALID_SLOT)) {
        val = fromUnicodeEscapes(val.slice(STRYPE_INVALID_SLOT.length));
    }
    return {fields: [{code: val}], operators: []};
}

export function nodeToSlots(node : SyntaxNode) : SlotsStructure {
    if (node.type === "string") {
        return stringNodeToSlots(node);
    }
    if (node.type === "named_expression") {
        // Walrus operator (:=) -- deliberately kept unsupported, to keep the Skulpt->tree-sitter
        // parser swap itself scope-neutral (no new frame types/behaviour, just a different parser):
        throw new UnsupportedConstructError("The walrus operator (:=) is not supported");
    }
    if (node.type === "yield") {
        // Strype has no generator/yield frame at all -- confirmed by the old Skulpt-based
        // copyFramesFromPython() never having a case for it. "yield" isn't a recognised operator
        // token (it's not in operators/trimmedKeywordOperators), so without this explicit check it
        // would silently fall through to flattenChildren() and be mis-parsed (its own child nodes
        // would get misinterpreted as an operand/operator pair) rather than clearly rejected:
        throw new UnsupportedConstructError("yield is not supported");
    }
    if (node.childCount === 0) {
        return terminalToSlots(node);
    }
    if (node.childCount === 1) {
        // Mirrors the old code's collapse of single-child wrapper nodes:
        return nodeToSlots(node.child(0) as SyntaxNode);
    }

    const first = node.child(0) as SyntaxNode;
    if (first.childCount === 0 && BRACKET_OPEN.has(first.text)) {
        // parenthesized_expression, tuple, list, dictionary, set, argument_list, parameters,
        // lambda_parameters is NOT bracketed so doesn't hit this branch, *_comprehension,
        // generator_expression:
        if (node.type.endsWith("_comprehension") || node.type === "generator_expression") {
            return comprehensionToSlots(node, first.text);
        }
        const inner : SyntaxNode[] = [];
        for (let i = 1; i < node.childCount - 1; i++) {
            inner.push(node.child(i) as SyntaxNode);
        }
        if (node.type === "parameters") {
            // Parameters are handled like the old Skulpt-based code did: brackets dropped, only
            // the content kept (the surrounding frame's own slot syntax supplies the parens):
            return flattenChildren(inner);
        }
        return bracketed(inner, first.text);
    }

    switch (node.type) {
    case "call": {
        const func = node.childForFieldName("function");
        const args = node.childForFieldName("arguments");
        if (!func || !args) {
            throw new Error("Malformed call node: " + node.text);
        }
        // Must go through replaceMediaLiteralsAndInvalidOps() here too, not just inside
        // flattenChildren() -- it specifically recognises an "<ident>(<bracketed-arg>)" call
        // pattern (load_image(...)/load_sound(...) media literals, and the
        // STRYPE_INVALID_OPS_WRAPPER round-trip placeholder for content that can't be
        // represented as valid Python), but a `call` node is dispatched directly here rather
        // than through flattenChildren()'s generic operand/operator walk, so without this it's
        // silently skipped for every call -- confirmed as a real bug: a saved
        // "___strype_opsinvalid(...)" placeholder (used to round-trip an otherwise-unrepresentable
        // slot, e.g. grapheme clusters used outside a string) was round-tripping back out as a
        // literal, still-wrapped call instead of being unwrapped back to its original content.
        return replaceMediaLiteralsAndInvalidOps(concatSlots(nodeToSlots(func), "", nodeToSlots(args)));
    }
    case "class_pattern": {
        // A match-case class pattern -- e.g. "case int(n):", "case complex(real=r,imag=i):" --
        // is structurally almost identical to a call ("ClassName(args)"), but tree-sitter gives
        // it its own node type rather than reusing "call", and unlike "call" it has no separate
        // "arguments" sub-node wrapping the "(...)" span -- the "(" and ")" are direct children
        // of the class_pattern node itself, siblings of the class name (a dotted_name). Each
        // argument is itself wrapped in a case_pattern node (positional: a dotted_name; keyword:
        // a keyword_pattern, structurally identical to an ordinary keyword_argument's
        // "identifier = value" and already handled by flattenChildren()'s default fallback) --
        // both single-child wrappers that nodeToSlots()'s own childCount===1 collapse (above)
        // unwraps automatically, so no special-casing is needed for them here.
        //
        // Previously entirely unhandled -- match-case patterns using any class pattern (even the
        // simplest, argument-less "case str():") fell through to the generic default case below,
        // which flattens node.children directly including the raw "(" token, hitting
        // flattenChildren()'s UnsupportedConstructError. Confirmed as a real gap via CI (a match
        // statement using an int()/complex() pattern failed the whole file's round-trip test),
        // not just synthetic cases -- also confirmed there's no historical support to preserve:
        // match statements didn't exist under the old Skulpt-based parser at all.
        const className = node.child(0);
        const bracketIdx = node.children.findIndex((c) => c.text === "(");
        if (!className || bracketIdx === -1) {
            throw new Error("Malformed class_pattern node: " + node.text);
        }
        const inner = node.children.slice(bracketIdx + 1, node.children.length - 1);
        return concatSlots(nodeToSlots(className), "", bracketed(inner, "("));
    }
    case "subscript": {
        const value = node.childForFieldName("value");
        if (!value) {
            throw new Error("Malformed subscript node: " + node.text);
        }
        const bracketIdx = node.children.findIndex((c) => c.text === "[");
        const inner = node.children.slice(bracketIdx + 1, node.children.length - 1);
        return concatSlots(nodeToSlots(value), "", bracketed(inner, "["));
    }
    default:
        // binary_operator, boolean_operator, comparison_operator, not_operator, unary_operator,
        // attribute (joined by "."), lambda, conditional_expression (ternary), keyword_argument,
        // default_parameter, slice, and generic comma/keyword-joined sequences (global_statement's
        // variable list, delete_statement, assert_statement, expression_list, pattern_list, etc.)
        // all reduce to the same flat operand/operator/operand/... shape once bracket-detection and
        // the structural cases above are out of the way:
        return flattenChildren(node.children);
    }
}
