import { test, expect } from "@playwright/test";
import Parser from "web-tree-sitter";
import { getBlockItems, getLeadingSiblingComments } from "@/helpers/pythonToFramesBlockWalk";
import { getTestPythonParser } from "../support/testTreeSitterParser";

// NOTE: this is really a *unit* test for the pure getBlockItems() function (see
// src/helpers/pythonToFramesBlockWalk.ts) -- see python-to-frames-expr.spec.ts in this same
// directory for why this is a Playwright spec rather than a Vitest one, and for why the parser
// setup is shared via getTestPythonParser() rather than each spec file calling Parser.init()
// itself.

let parser: Parser;

test.beforeAll(async () => {
    parser = await getTestPythonParser();
});

function summarise(src: string, afterRow: number, beforeRow?: number) {
    const tree = parser.parse(src);
    const module = tree.rootNode;
    return getBlockItems(module.children, afterRow, beforeRow).map((item) =>
        item.kind === "blank" ? `blank(${item.count})@${item.startRow}` : item.node.type + ":" + item.node.text.replace(/\n/g, "\\n"));
}

test.describe("getBlockItems", () => {
    test("no blanks, no comments", () => {
        expect(summarise("a = 1\nb = 2\n", -1)).toEqual([
            "expression_statement:a = 1",
            "expression_statement:b = 2",
        ]);
    });

    test("a single blank line between two statements", () => {
        expect(summarise("a = 1\n\nb = 2\n", -1)).toEqual([
            "expression_statement:a = 1",
            "blank(1)@1",
            "expression_statement:b = 2",
        ]);
    });

    test("multiple consecutive blank lines are counted", () => {
        expect(summarise("a = 1\n\n\n\nb = 2\n", -1)).toEqual([
            "expression_statement:a = 1",
            "blank(3)@1",
            "expression_statement:b = 2",
        ]);
    });

    test("a leading blank line (before the first statement) is detected via afterRow", () => {
        // afterRow = -1 means "row -1 is the last row before content starts" i.e. row 0 is the
        // first possible content row -- so a blank line 0 followed by content on row 1 is a gap:
        expect(summarise("\na = 1\n", -1)).toEqual([
            "blank(1)@0",
            "expression_statement:a = 1",
        ]);
    });

    test("no leading blank reported when content starts immediately", () => {
        expect(summarise("a = 1\n", -1)).toEqual(["expression_statement:a = 1"]);
    });

    test("comments appear as ordinary items, interleaved in source order", () => {
        expect(summarise("a = 1\n# hello\nb = 2\n", -1)).toEqual([
            "expression_statement:a = 1",
            "comment:# hello",
            "expression_statement:b = 2",
        ]);
    });

    test("a blank line between a statement and a following comment", () => {
        expect(summarise("a = 1\n\n# hello\nb = 2\n", -1)).toEqual([
            "expression_statement:a = 1",
            "blank(1)@1",
            "comment:# hello",
            "expression_statement:b = 2",
        ]);
    });

    test("trailing blank before a following joint continuation, via beforeRow", () => {
        // "a = 1" is on row 0; row 1 is blank; the following "elif"/"else" clause is simulated as
        // starting on row 2 (passed in as beforeRow), so the gap is exactly the one blank row 1:
        expect(summarise("a = 1\n\n", -1, 2)).toEqual([
            "expression_statement:a = 1",
            "blank(1)@1",
        ]);
    });

    test("no trailing blank reported when beforeRow is immediately after the last statement", () => {
        expect(summarise("a = 1\n", -1, 1)).toEqual(["expression_statement:a = 1"]);
    });
});

test.describe("getLeadingSiblingComments", () => {
    // A comment between a compound statement's ":" and the first real statement of its body
    // attaches as a direct child of the *enclosing* statement node, not of the block/consequence/
    // body node itself -- confirmed by spike across if/while/for/function_definition. This is the
    // real-world bug this function exists to work around: without it, such a comment vanished
    // entirely (the block appeared empty) because copyBlockBody() only ever looked at the block
    // node's own .children.
    test("a single leading comment attaches to the header node, not the block", () => {
        const tree = parser.parse("if True:\n    # c1\n    pass\n");
        const ifStatement = tree.rootNode.child(0) as Parser.SyntaxNode;
        const block = ifStatement.childForFieldName("consequence") as Parser.SyntaxNode;
        expect(block.children.map((c) => c.type)).toEqual(["pass_statement"]);
        expect(getLeadingSiblingComments(ifStatement, block).map((c) => c.text)).toEqual(["# c1"]);
    });

    test("multiple leading comments, including a blank line among them, all attach to the header", () => {
        const tree = parser.parse("if True:\n    # c1\n    # c2\n\n    # c3\n    pass\n");
        const ifStatement = tree.rootNode.child(0) as Parser.SyntaxNode;
        const block = ifStatement.childForFieldName("consequence") as Parser.SyntaxNode;
        expect(getLeadingSiblingComments(ifStatement, block).map((c) => c.text)).toEqual(["# c1", "# c2", "# c3"]);
    });

    test("a comment after the block's first real statement stays inside the block (nothing to do)", () => {
        const tree = parser.parse("def foo():\n    a = 1\n    # comment\n    b = 2\n");
        const funcdef = tree.rootNode.child(0) as Parser.SyntaxNode;
        const block = funcdef.childForFieldName("body") as Parser.SyntaxNode;
        expect(block.children.map((c) => c.type)).toEqual(["expression_statement", "comment", "expression_statement"]);
        expect(getLeadingSiblingComments(funcdef, block)).toEqual([]);
    });

    test("no leading comment at all", () => {
        const tree = parser.parse("if True:\n    pass\n");
        const ifStatement = tree.rootNode.child(0) as Parser.SyntaxNode;
        const block = ifStatement.childForFieldName("consequence") as Parser.SyntaxNode;
        expect(getLeadingSiblingComments(ifStatement, block)).toEqual([]);
    });
});
