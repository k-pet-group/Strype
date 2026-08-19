import type Parser from "web-tree-sitter";

type SyntaxNode = Parser.SyntaxNode;

// Recovers blank lines and comments from a parsed tree-sitter block, by deriving them from the
// tree post-parse rather than disguising them as fake statements before parsing the way Skulpt's
// approach required (Skulpt's grammar dropped comments/blanks entirely, so they had to be
// smuggled through as fake statements and decoded back out afterwards): tree-sitter's comment
// nodes appear in the tree at their real source position, and blank lines show up as row gaps
// between consecutive children.
//
// A BlockItem is either a real child node (a statement or a comment) or a synthesized blank-line
// marker for a gap in row numbers between two children (or between `afterRow` and the first child,
// or between the last child and `beforeRow`, if given).
export type BlockItem =
    | { kind: "node"; node: SyntaxNode }
    | { kind: "blank"; count: number; startRow: number };

// `afterRow` is the (zero-based) row immediately before this block's content is expected to start
// -- typically the row of the compound statement's own header (e.g. the "if x:" line), so a blank
// line right after the colon is detected. `beforeRow`, if given, is the row immediately after this
// block's content is expected to end -- e.g. the row of a following "elif"/"else"/"except" clause,
// so a blank line right before a joint continuation is still attributed to this block rather than
// silently dropped.
//
// `nodes` is the already-assembled ordered list of this block's items (see getLeadingSiblingComments()
// below for why callers can't just pass a block node's own .children and be done -- a leading
// comment can land outside it).
export function getBlockItems(nodes: SyntaxNode[], afterRow: number, beforeRow?: number) : BlockItem[] {
    const items: BlockItem[] = [];
    let prevEndRow = afterRow;
    for (const child of nodes) {
        const gap = child.startPosition.row - prevEndRow - 1;
        if (gap > 0) {
            items.push({kind: "blank", count: gap, startRow: prevEndRow + 1});
        }
        items.push({kind: "node", node: child});
        prevEndRow = child.endPosition.row;
    }
    if (beforeRow !== undefined) {
        const gap = beforeRow - prevEndRow - 1;
        if (gap > 0) {
            items.push({kind: "blank", count: gap, startRow: prevEndRow + 1});
        }
    }
    return items;
}

// A comment that appears between a compound statement's ":" and the first real statement of its
// body attaches as a direct child of the *enclosing* statement node (e.g. if_statement,
// while_statement, function_definition -- confirmed by a migration spike across every compound
// statement type), not as a child of the block/consequence/body node itself the way every other
// comment in that same block does (including a second leading comment, or any comment once the
// block has at least one real statement in it already) -- apparently because tree-sitter attaches
// extras to the innermost rule that's actually "open" at that source position, and the block
// hasn't structurally started yet at that point. This is a real, confirmed-by-spike behaviour, not
// a hypothetical: it was found because a comment as the very first line of an `if`'s body vanished
// entirely from a round-trip paste/save, its block ending up completely empty.
//
// Returns the leading `comment` children of `headerNode` that appear before `blockNode`, in source
// order, for the caller to prepend to `blockNode`'s own children before passing the combined list
// to getBlockItems().
export function getLeadingSiblingComments(headerNode: SyntaxNode, blockNode: SyntaxNode) : SyntaxNode[] {
    const result: SyntaxNode[] = [];
    for (let i = 0; i < headerNode.childCount; i++) {
        const child = headerNode.child(i) as SyntaxNode;
        if (child.id === blockNode.id) {
            break;
        }
        if (child.type === "comment") {
            result.push(child);
        }
    }
    return result;
}
