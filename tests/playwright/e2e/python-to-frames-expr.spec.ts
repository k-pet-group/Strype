import { test, expect } from "@playwright/test";
import Parser from "web-tree-sitter";
import { nodeToSlots, UnsupportedConstructError, setIsSPYForDocStrings } from "@/helpers/pythonToFramesExpr";
import { SlotsStructure } from "@/types/types";
import { getTestPythonParser } from "../support/testTreeSitterParser";

// NOTE: this is really a *unit* test for the pure nodeToSlots() function (see
// src/helpers/pythonToFramesExpr.ts) -- none of it touches a browser page, the DOM, or the live
// app. It's written as a Playwright spec purely to reuse the test infrastructure already in this
// repo, rather than pulling in a second test framework -- see
// operator-precedence-calculation.spec.ts in this same directory for the established precedent.
//
// Unlike that simpler example, this module needs a real tree-sitter parser to produce nodes to
// feed it, so this spec loads the actual wasm files straight out of node_modules (the same way
// the migration's original spike script did) rather than going through
// src/helpers/treeSitterPython.ts, which assumes a browser (import.meta.env.BASE_URL, fetch).
//
// The parser setup itself is shared with python-to-frames-block-walk.spec.ts via
// getTestPythonParser() -- see that helper for why a second independent Parser.init() call in
// this file's own beforeAll broke when both spec files ran in the same worker process.

let parser: Parser;

test.beforeAll(async () => {
    parser = await getTestPythonParser();
});

// Parses `src` as a single expression statement and returns the SlotsStructure for its expression.
function exprSlots(src: string) : SlotsStructure {
    const tree = parser.parse(src);
    const stmt = tree.rootNode.child(0);
    if (!stmt || stmt.type !== "expression_statement") {
        throw new Error("Expected a single expression_statement, got: " + tree.rootNode.toString());
    }
    const expr = stmt.child(0);
    if (!expr) {
        throw new Error("expression_statement had no child");
    }
    return nodeToSlots(expr);
}

function field(code: string) {
    return {code};
}

// Parses `src` as a single match statement and returns the SlotsStructure for its first case
// clause's pattern (a class_pattern node, e.g. "str()", "int(n)", "complex(real=r,imag=i)") --
// unlike exprSlots() above, a match-case pattern can't be reached by parsing a plain expression
// statement, since match statements are a distinct top-level construct in tree-sitter's grammar.
function classPatternSlots(src: string) : SlotsStructure {
    const tree = parser.parse(`match x:\n    case ${src}:\n        pass\n`);
    const matchStmt = tree.rootNode.child(0);
    const caseClause = matchStmt?.childForFieldName("body")?.childForFieldName("alternative");
    // Mirrors copyCaseClause() in pythonToFrames.ts: case_clause has no "pattern" field, so the
    // pattern is found positionally, after the (anonymous, so unnamed-field) "case" keyword token:
    const pattern = caseClause?.child(1);
    if (!pattern) {
        throw new Error("Couldn't find the case clause's pattern in the parsed tree: " + tree.rootNode.toString());
    }
    return nodeToSlots(pattern);
}

test.describe("nodeToSlots: literals", () => {
    test("identifier", () => {
        expect(exprSlots("abc\n")).toEqual({fields: [field("abc")], operators: []});
    });

    test("integer", () => {
        expect(exprSlots("123\n")).toEqual({fields: [field("123")], operators: []});
    });

    test("plain string", () => {
        expect(exprSlots("'hello'\n")).toEqual({
            fields: [field(""), {code: "hello", quote: "'"}, field("")],
            operators: [field(""), field("")],
        });
    });

    test("f-string is flattened to raw text (prefix kept)", () => {
        expect(exprSlots("f\"hello {name}\"\n")).toEqual({
            fields: [field("f"), {code: "hello {name}", quote: "\""}, field("")],
            operators: [field(""), field("")],
        });
    });

    test.describe("multi-line docstring dedenting (SPY format only)", () => {
        // Strype's own save logic (parser.ts) re-indents a multi-line docstring's continuation
        // lines to match the surrounding code's indentation when writing a .spy file; loading must
        // reverse that, or the indentation grows by one level on every load/save round-trip --
        // confirmed as a real bug this way (found via a failing e2e round-trip test), not just a
        // theoretical gap. Wrapped in a function body (rather than pasted at module level like
        // exprSlots()'s other callers) so the 4-space indentation before the string is itself
        // syntactically valid Python.
        function docstringSlots(src: string) : SlotsStructure {
            const tree = parser.parse("def f():\n" + src);
            const funcdef = tree.rootNode.child(0);
            const block = funcdef?.childForFieldName("body");
            const stmt = block?.child(0);
            const inner = stmt?.child(0);
            if (!inner) {
                throw new Error("Couldn't find the docstring expression in: " + tree.rootNode.toString());
            }
            return nodeToSlots(inner);
        }

        test.afterEach(() => {
            setIsSPYForDocStrings(false); // don't leak into other tests
        });

        test("dedents continuation lines when isSPY is true", () => {
            setIsSPYForDocStrings(true);
            // The docstring starts at column 4 (right after the block's own "    " indent), so
            // "    line2"/"    " (the closing line) should have that same 4-space indent stripped.
            // Note the "''" left at each end: the generic quote-stripping regex only knows how to
            // strip a single quote character, so a triple-quoted string keeps 2 residual quote
            // characters in its slot content -- matching the old Skulpt-based code's exact same
            // convention (see makeFrame()'s own triple-quote handling, which expects and strips
            // these same residual "''"/'""'-wrapped strings elsewhere), not a bug here:
            const result = docstringSlots("    '''line1\n    line2\n    '''\n");
            expect((result.fields[1] as {code: string}).code).toBe("''line1\nline2\n''");
        });

        test("leaves continuation line indentation untouched when isSPY is false (plain .py)", () => {
            setIsSPYForDocStrings(false);
            const result = docstringSlots("    '''line1\n    line2\n    '''\n");
            expect((result.fields[1] as {code: string}).code).toBe("''line1\n    line2\n    ''");
        });

        test("does not touch a single-line string even when isSPY is true", () => {
            setIsSPYForDocStrings(true);
            expect(docstringSlots("    'hello'\n")).toEqual({
                fields: [field(""), {code: "hello", quote: "'"}, field("")],
                operators: [field(""), field("")],
            });
        });
    });
});

test.describe("nodeToSlots: operators flatten across precedence, matching the old Skulpt-based behaviour", () => {
    test("mixed +/* flattens into one chain (no implicit precedence bracketing)", () => {
        expect(exprSlots("1 + 2 * 3\n")).toEqual({
            fields: [field("1"), field("2"), field("3")],
            operators: [field("+"), field("*")],
        });
    });

    test("explicit parens create a real bracketed sub-structure", () => {
        // A bracketed sub-structure is always padded with blank fields either side (matching the
        // old Skulpt-based code's bracket handling) -- those blanks only get collapsed away by
        // concatSlots() when adjacent to another *unbracketed* blank field, which isn't the case
        // here on either side ((...) is followed directly by "*", and preceded by nothing):
        const result = exprSlots("(1 + 2) * 3\n");
        expect(result.fields.map((f) => (f as {code?: string}).code ?? "<bracketed>")).toEqual(["", "<bracketed>", "", "3"]);
        expect(result.operators.map((o) => o.code)).toEqual(["", "", "*"]);
        expect(result.fields[1]).toMatchObject({openingBracketValue: "("});
        const inner = result.fields[1] as SlotsStructure;
        expect(inner.fields).toEqual([field("1"), field("2")]);
        expect(inner.operators.map((o) => o.code)).toEqual(["+"]);
    });

    test("chained comparison", () => {
        expect(exprSlots("a < b < c\n")).toEqual({
            fields: [field("a"), field("b"), field("c")],
            operators: [field("<"), field("<")],
        });
    });

    test("'is not' merges into one compound operator", () => {
        expect(exprSlots("a is not b\n")).toEqual({
            fields: [field("a"), field("b")],
            operators: [field("is not")],
        });
    });

    test("'not in' merges into one compound operator", () => {
        expect(exprSlots("a not in b\n")).toEqual({
            fields: [field("a"), field("b")],
            operators: [field("not in")],
        });
    });

    test("boolean chain", () => {
        expect(exprSlots("a and b or c\n")).toEqual({
            fields: [field("a"), field("b"), field("c")],
            operators: [field("and"), field("or")],
        });
    });

    test("unary minus", () => {
        expect(exprSlots("-a\n")).toEqual({
            fields: [field(""), field("a")],
            operators: [field("-")],
        });
    });

    test("not", () => {
        expect(exprSlots("not a\n")).toEqual({
            fields: [field(""), field("a")],
            operators: [field("not")],
        });
    });
});

test.describe("nodeToSlots: calls, attributes, subscripts, slices", () => {
    test("attribute chain", () => {
        expect(exprSlots("a.b.c\n")).toEqual({
            fields: [field("a"), field("b"), field("c")],
            operators: [field("."), field(".")],
        });
    });

    test("call with positional args", () => {
        const result = exprSlots("f(a, b)\n");
        expect(result.fields[0]).toEqual(field("f"));
        expect(result.operators[0].code).toBe("");
        const argsField = result.fields[1] as SlotsStructure & {openingBracketValue?: string};
        expect(argsField.openingBracketValue).toBe("(");
        expect(argsField.fields).toEqual([field("a"), field("b")]);
        expect(argsField.operators.map((o) => o.code)).toEqual([","]);
    });

    test("empty call", () => {
        const result = exprSlots("f()\n");
        const argsField = result.fields[1] as SlotsStructure;
        expect(argsField.fields).toEqual([field("")]);
        expect(argsField.operators).toEqual([]);
    });

    test("keyword argument", () => {
        const result = exprSlots("f(c=1)\n");
        const argsField = result.fields[1] as SlotsStructure;
        expect(argsField.fields).toEqual([field("c"), field("1")]);
        expect(argsField.operators.map((o) => o.code)).toEqual(["="]);
    });

    test("splat and double-splat call args", () => {
        const result = exprSlots("f(*args, **kwargs)\n");
        const argsField = result.fields[1] as SlotsStructure;
        // *args -> ["", "args"] joined by "*"; combined across the comma with **kwargs similarly:
        expect(argsField.operators.map((o) => o.code)).toEqual(["*", ",", "**"]);
    });

    test("subscript", () => {
        const result = exprSlots("a[1]\n");
        expect(result.fields[0]).toEqual(field("a"));
        const subField = result.fields[1] as SlotsStructure & {openingBracketValue?: string};
        expect(subField.openingBracketValue).toBe("[");
        expect(subField.fields).toEqual([field("1")]);
    });

    test("attribute then subscript then attribute", () => {
        // As above, the blank field trailing the "[c]" bracket survives because it's followed by
        // "." (not another unbracketed blank), so it doesn't get collapsed away:
        const result = exprSlots("a.b[c].d\n");
        expect(result.fields.map((f) => (f as {code?: string}).code ?? "<bracketed>")).toEqual(["a", "b", "<bracketed>", "", "d"]);
        expect(result.operators.map((o) => o.code)).toEqual([".", "", "", "."]);
    });

    test("full slice a[1:2:3]", () => {
        const result = exprSlots("a[1:2:3]\n");
        const subField = result.fields[1] as SlotsStructure;
        expect(subField.fields).toEqual([field("1"), field("2"), field("3")]);
        expect(subField.operators.map((o) => o.code)).toEqual([":", ":"]);
    });

    test("partial slice a[:2]", () => {
        const result = exprSlots("a[:2]\n");
        const subField = result.fields[1] as SlotsStructure;
        expect(subField.fields).toEqual([field(""), field("2")]);
        expect(subField.operators.map((o) => o.code)).toEqual([":"]);
    });

    test("partial slice a[1:]", () => {
        const result = exprSlots("a[1:]\n");
        const subField = result.fields[1] as SlotsStructure;
        expect(subField.fields).toEqual([field("1"), field("")]);
        expect(subField.operators.map((o) => o.code)).toEqual([":"]);
    });

    test("empty-bounds slice a[::2]", () => {
        const result = exprSlots("a[::2]\n");
        const subField = result.fields[1] as SlotsStructure;
        expect(subField.fields).toEqual([field(""), field(""), field("2")]);
        expect(subField.operators.map((o) => o.code)).toEqual([":", ":"]);
    });
});

test.describe("nodeToSlots: literal containers", () => {
    test("list literal", () => {
        const result = exprSlots("[1, 2]\n");
        const listField = result.fields[1] as SlotsStructure & {openingBracketValue?: string};
        expect(listField.openingBracketValue).toBe("[");
        expect(listField.fields).toEqual([field("1"), field("2")]);
    });

    test("tuple literal", () => {
        const result = exprSlots("(1, 2)\n");
        const tupField = result.fields[1] as SlotsStructure & {openingBracketValue?: string};
        expect(tupField.openingBracketValue).toBe("(");
    });

    test("dict literal", () => {
        const result = exprSlots("{1: 2, 3: 4}\n");
        const dictField = result.fields[1] as SlotsStructure & {openingBracketValue?: string};
        expect(dictField.openingBracketValue).toBe("{");
        expect(dictField.fields).toEqual([field("1"), field("2"), field("3"), field("4")]);
        expect(dictField.operators.map((o) => o.code)).toEqual([":", ",", ":"]);
    });

    test("set literal", () => {
        const result = exprSlots("{1, 2}\n");
        const setField = result.fields[1] as SlotsStructure & {openingBracketValue?: string};
        expect(setField.openingBracketValue).toBe("{");
        expect(setField.fields).toEqual([field("1"), field("2")]);
    });

    test("empty list/dict/tuple", () => {
        expect((exprSlots("[]\n").fields[1] as SlotsStructure).fields).toEqual([field("")]);
        expect((exprSlots("{}\n").fields[1] as SlotsStructure).fields).toEqual([field("")]);
        expect((exprSlots("()\n").fields[1] as SlotsStructure).fields).toEqual([field("")]);
    });
});

test.describe("nodeToSlots: comprehensions", () => {
    test("list comprehension with condition", () => {
        const result = exprSlots("[a for a in b if c]\n");
        const inner = result.fields[1] as SlotsStructure;
        expect(inner.fields).toEqual([field("a"), field("a"), field("b"), field("c")]);
        expect(inner.operators.map((o) => o.code)).toEqual(["for", "in", "if"]);
    });

    test("dict comprehension", () => {
        const result = exprSlots("{k: v for k, v in items}\n");
        const inner = result.fields[1] as SlotsStructure;
        // body is "k: v" (a pair, itself flattened) then "for" "k,v" "in" "items":
        expect(inner.fields.map((f) => (f as {code?: string}).code)).toEqual(["k", "v", "k", "v", "items"]);
        expect(inner.operators.map((o) => o.code)).toEqual([":", "for", ",", "in"]);
    });

    test("multiple if clauses", () => {
        const result = exprSlots("[a for a in b if c if d]\n");
        const inner = result.fields[1] as SlotsStructure;
        expect(inner.operators.map((o) => o.code)).toEqual(["for", "in", "if", "if"]);
    });
});

test.describe("nodeToSlots: lambda and ternary", () => {
    test("lambda", () => {
        // lambda_parameters has no brackets in Python's grammar (unlike a def's parameter list),
        // so its comma-joined params flatten directly into the same top-level sequence as
        // "lambda"/":"/the body, rather than becoming a bracketed sub-structure:
        const result = exprSlots("lambda a, b: a + b\n");
        expect(result.fields).toEqual([field(""), field("a"), field("b"), field("a"), field("b")]);
        expect(result.operators.map((o) => o.code)).toEqual(["lambda", ",", ":", "+"]);
    });

    test("ternary (conditional expression)", () => {
        expect(exprSlots("a if b else c\n")).toEqual({
            fields: [field("a"), field("b"), field("c")],
            operators: [field("if"), field("else")],
        });
    });
});

test.describe("nodeToSlots: match-case class patterns", () => {
    // Previously entirely unhandled: any match-case pattern using a class pattern (even the
    // simplest, argument-less "case str():") threw UnsupportedConstructError("Unsupported
    // construct: (") -- nodeToSlots() had no case for tree-sitter's class_pattern node type, so
    // it fell through to the generic default case, which flattens node.children directly
    // (including the raw "(" token). Confirmed as a real gap via CI, not synthetic: a match
    // statement using int()/complex() patterns failed load-save-book-demo-projects.spec.ts's
    // round-trip test for a real fixture. See the "class_pattern" case in nodeToSlots().
    test("argument-less class pattern", () => {
        expect(classPatternSlots("str()")).toEqual({
            fields: [field("str"), {openingBracketValue: "(", fields: [field("")], operators: []}, field("")],
            operators: [field(""), field("")],
        });
    });

    test("class pattern with a single positional capture", () => {
        expect(classPatternSlots("int(n)")).toEqual({
            fields: [field("int"), {openingBracketValue: "(", fields: [field("n")], operators: []}, field("")],
            operators: [field(""), field("")],
        });
    });

    test("class pattern with multiple keyword captures", () => {
        expect(classPatternSlots("complex(real=r,imag=i)")).toEqual({
            fields: [field("complex"), {openingBracketValue: "(", fields: [field("real"), field("r"), field("imag"), field("i")], operators: [field("="), field(","), field("=")]}, field("")],
            operators: [field(""), field("")],
        });
    });
});

test.describe("nodeToSlots: unsupported constructs stay explicitly rejected", () => {
    test("yield throws UnsupportedConstructError (rather than silently mis-flattening)", () => {
        // yield is only valid inside a function body:
        const tree = parser.parse("def f():\n    yield a\n");
        const yieldStmt = tree.rootNode.child(0)?.childForFieldName("body")?.child(0);
        if (!yieldStmt) {
            throw new Error("Couldn't find the yield statement in the parsed tree");
        }
        expect(() => nodeToSlots(yieldStmt)).toThrow(UnsupportedConstructError);
    });

    test("walrus operator throws UnsupportedConstructError", () => {
        expect(() => exprSlots("(n := 10)\n")).toThrow(UnsupportedConstructError);
    });
});
