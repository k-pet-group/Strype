import { AllFrameTypesIdentifier, BaseSlot, CaretPosition, CollapsedState, ContainerTypesIdentifiers, CurrentFrame, EditorFrameObjects, FrameObject, getFrameDefType, isFieldBaseSlot, isFieldBracketedSlot, isFieldStringSlot, LabelSlotsContent, SlotsStructure, MessageDefinitions, FormattedMessage, FormattedMessageArgKeyValuePlaceholders, FrozenState } from "@/types/types";
import {useStore} from "@/store/store";
import {checkCodeErrors} from "@/helpers/storeMethods";
import {CustomEventTypes, getLastCaretPosInsideParent} from "@/helpers/editor";
import i18n from "@/i18n";
import {cloneDeep, escapeRegExp} from "lodash";
import {AppName, AppSPYFullPrefix, eventBus, projectDocumentationFrameId} from "@/helpers/appContext";
import {stringToCollapsed, stringToFrozen} from "@/parser/parser";
import {nextTick} from "vue";
import type Parser from "web-tree-sitter";
import {nodeToSlots, flattenChildren, UnsupportedConstructError, setIsSPYForDocStrings} from "@/helpers/pythonToFramesExpr";
import {getBlockItems, getLeadingSiblingComments} from "@/helpers/pythonToFramesBlockWalk";
import {preprocessBeforeParse, stripDisabledPrefix} from "@/helpers/pythonToFramesPreprocess";
import {getPythonParserSync} from "@/helpers/treeSitterPython";

type TSSyntaxNode = Parser.SyntaxNode;

const TOP_LEVEL_TEMP_ID = -999;

// These regexes are used to find triple single quotes strings within Strype's slots.
// Once parsed to frames, such strings will be created as single or double quoted literals in Strype,
// and the 2 remaining single or double quotes are included at the start and the end of the literal.
// Therefore, we look for the string content starting with '' or "" and finishing with '' or "".
const parsedTripleSingleQuotesStrRegex = /^''.*''$/s, parsedTripleDoubleQuotesStrRegex = /^"".*""$/s;


// The state passed around while copying from Python code into frames
interface CopyState {
    nextId: number; // The next ID to use for a new frame
    lastLineProcessed: number | undefined; // The number of the last line we processed
    addToJoint: number[] | undefined; // List to add frames to
    addToNonJoint: number[]; // List to add frames to
    loadedFrames: EditorFrameObjects; // Map to put all loaded frames into
    parent: FrameObject | null; // The parent, if any, for borrowing the parent ID
    jointParent: FrameObject | null; // The joint parent, if any, for borrowing the parent ID
    disabledLines: number[]; // The line numbers which had a Disabled: prefix
    frameStateLines: Map<number, SavedFrameState>; // The line numbers which had a Collapsed: prefix
    lineNumberToIndentation: Map<number, string>; // Maps a line number to a string of indentation
    transformTopComment: ((content: SlotsStructure) => void) | undefined; // If defined, consumes the top docstring-style comment rather than adding it as a frame.
    isSPY: boolean;
}

// The different "locations" in Strype
export enum STRYPE_LOCATION {
    UNKNOWN,
    PROJECT_DOC_SECTION,
    MAIN_CODE_SECTION,
    IN_FUNCDEF,
    IN_CLASSDEF,
    DEFS_SECTION,
    IMPORTS_SECTION
}

// Copies nextId and lastLineProcessed from src to dest
function updateFrom(dest : CopyState, src : CopyState) {
    dest.nextId = src.nextId;
    dest.lastLineProcessed = src.lastLineProcessed;
}

// Given a frame, assigns it a new ID and adds it to the list specified in the CopyState
// If it is not a joint frame, set its parent.
function addFrame(frame: FrameObject, lineno: number | undefined, s: CopyState) : CopyState {
    const id = s.nextId;
    frame.id = id;
    s.loadedFrames[id] = frame;
    frame.isDisabled = lineno != undefined && s.disabledLines.includes(lineno);
    frame.collapsedState = lineno != undefined ? s.frameStateLines.get(lineno)?.collapsed : undefined;
    frame.frozenState = lineno != undefined ? s.frameStateLines.get(lineno)?.frozen : undefined;
    if (!frame.frameType.isJointFrame) {
        s.addToNonJoint?.push(id);
        if (s.parent != null) {
            frame.parentId = s.parent.id;
            // Don't need to add to children because that will already be the addTo array
        }
        else {
            // The pasting code relies on parent being set to non-zero for non-joint frames,
            // so we just set it to an invalid integer:
            frame.parentId = TOP_LEVEL_TEMP_ID;
        }
    }
    else {
        s.addToJoint?.push(id);
        if (s.jointParent) {
            frame.jointParentId = s.jointParent.id;
        }
    }
    return {...s, nextId: s.nextId + 1, lastLineProcessed: lineno};
}

// Makes a basic frame object with the given type and slots, and dummy/default values for all other fields
function makeFrame(type: string, slots: { [index: number]: LabelSlotsContent}, isSPY: boolean) : FrameObject {
    // We have one special case to consider before "pushing" the frame: we left all triple quotes string
    // being parsed as is by Skulpt. That means that all of them will be put inside a string slot, 
    // either wrappped by a single quote token with literal content starting and ending by <''>, 
    // or wrapped by a double quote token with literal content starting and ending by <"">.
    // If such slot is found in SPY or, for Python, is inside a function call frame that ONLY contains it
    // (i.e. empty slots on the sides and empty operators between) then we transform the frame to a multi lines comment frame.
    // Otherwise, for Python only since SPY wouldn't have that situation, we fix the quotes by removing the extra quotes inside
    // the literal, and replace all line breaks by explicit line break indications ("\\n").
    if(type == AllFrameTypesIdentifier.funccall && slots[0].slotStructures.fields.length == 3 
        && isFieldStringSlot(slots[0].slotStructures.fields[1]) 
        && ((slots[0].slotStructures.fields[1].quote == "'" && parsedTripleSingleQuotesStrRegex.test(slots[0].slotStructures.fields[1].code))
            || (slots[0].slotStructures.fields[1].quote == "\"" && parsedTripleDoubleQuotesStrRegex.test(slots[0].slotStructures.fields[1].code)))
        && isFieldBaseSlot(slots[0].slotStructures.fields[0]) && isFieldBaseSlot(slots[0].slotStructures.fields[2])
        && (slots[0].slotStructures.fields[0] as BaseSlot).code.length == 0 && (slots[0].slotStructures.fields[2] as BaseSlot).code.length == 0
    ){
        // A multilines comment is detected, we transform the frame.
        const stringFieldContent = (slots[0].slotStructures.fields[1] as BaseSlot).code;
        // When we save these items we add extra escapes to all the quotes and backslashes, so we must reverse that here: 
        slots[0].slotStructures.fields.splice(0, 3, {code: stringFieldContent.slice(2,-2)
            .replaceAll(STRYPE_DOC_NEWLINE, "\n")
            .replaceAll("\\'", "'")
            .replaceAll("\\\"", "\"")
            .replaceAll("\\\\", "\\"),
        });
        slots[0].slotStructures.operators.splice(0);
        type = AllFrameTypesIdentifier.comment;
    }
    else if(!isSPY){
        // Replace any potential triple quotes strings to single quote strings (and replaced line breaks)
        transformTripleQuotesStrings(slots);
    }
    return {
        frameType : getFrameDefType(type),
        caretVisibility: CaretPosition.none,
        childrenIds: [],
        id: -100, // Will be set during addFrame
        collapsedState: CollapsedState.FULLY_VISIBLE,
        isDisabled: false,
        isSelected: false,
        isVisible: true,
        jointFrameIds: [],
        jointParentId: 0,
        labelSlotsDict: slots,
        parentId: 0,
        runTimeError: "",
    };
}

// Same joint-frame gluing trick that the old, now-deleted Skulpt-based parseWithSkulpt() used,
// ported to build a plain codeLines array (rather than mutating one in place with embedded
// "\n"s, which parseWithSkulpt's version did -- that was harmless for Skulpt's
// Sk.parse(codeLines.join("\n")) call, since it just produced harmless extra blank lines, but
// tree-sitter is far more literal about row positions, so this version is careful to add
// exactly 2 (elif) or 4 (else/except/finally) real lines, matching the "2 lines per fake-parent
// unit" assumption used by the line-offset math in parseWithTreeSitter() below):
function glueJointFrameHeader(codeLines: string[]) : { codeLines: string[], addedFakeJoinParent: number } {
    let addedFakeJoinParent = 0;
    const firstNonBlank = codeLines.find((l) => l.trim() != "");
    if (firstNonBlank) {
        const leadingIndent = firstNonBlank.replace(/[^ ].*/, "");
        const firstWord = firstNonBlank.replace(/[^a-z].*/, "").trim();
        switch (firstWord) {
        case "elif":
            codeLines = [leadingIndent + "if True:", leadingIndent + "    pass", ...codeLines];
            addedFakeJoinParent = 1;
            break;
        case "else":
        case "except":
        case "finally":
            codeLines = [leadingIndent + "try:", leadingIndent + "    pass", leadingIndent + "except:", leadingIndent + "    pass", ...codeLines];
            addedFakeJoinParent = 2;
            break;
        }
    }
    return {codeLines, addedFakeJoinParent};
}

// Depth-first search for the first ERROR or MISSING node in a parsed tree -- tree-sitter never
// throws on invalid input (unlike Sk.parse()), it always returns a complete tree with these
// error-marker nodes standing in for the unparseable part. The resulting user-facing message is
// deliberately generic ("Invalid Python code at line N") rather than trying to synthesise a
// specific reason from the error node's grammar context, which would need per-grammar-rule
// knowledge to phrase well and would still often be wrong for cascading/recovered errors.
function findFirstErrorNode(node: TSSyntaxNode) : TSSyntaxNode | null {
    if (node.type === "ERROR" || node.isMissing) {
        return node;
    }
    for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) {
            const found = findFirstErrorNode(child);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

// The tree-sitter-based replacement for the old, now-deleted parseWithSkulpt(). `mapErrorLineno`
// is expected to operate on plain, un-glued codeLines line numbers (1-based) -- this function itself subtracts
// the fake-join-parent glue offset before calling it, so callers don't need to know about gluing.
function parseWithTreeSitter(codeLines: string[], mapErrorLineno : (lineno : number) => number) : string | { tree: Parser.Tree, disabledLines: number[], addedFakeJoinParent: number } {
    const glued = glueJointFrameHeader(codeLines);
    const preprocessed = preprocessBeforeParse(glued.codeLines);
    const parser = getPythonParserSync();
    const tree = parser.parse(preprocessed.source);
    // web-tree-sitter's Parser wraps a native (Emscripten-bound) object that isn't freed by JS
    // garbage collection -- it must be explicitly deleted, or its underlying WASM memory leaks
    // permanently for the life of the page. The parser itself is only needed to produce the tree
    // (which is independent once returned), so it can be freed immediately here; the tree is
    // deleted by copyFramesFromParsedPython() once the frame-walk that consumes it is done. This
    // was a real, unbounded leak (confirmed by counting: every paste/load call reaches here up to
    // 5 times -- once per section -- with a fresh, never-deleted `new Parser()` each time), and is
    // the actual root cause behind CI's intermittent "WebAssembly.Memory(): could not allocate
    // memory" failures during long, many-test-per-process CI runs -- not "tree-sitter is just
    // heavy" (a single parser+tree is tiny; thousands of leaked ones over a long browser session
    // are not).
    parser.delete();
    if (tree.rootNode.hasError) {
        const errorNode = findFirstErrorNode(tree.rootNode);
        const gluedLineno = errorNode ? errorNode.startPosition.row + 1 : 1;
        const glueOffsetLines = glued.addedFakeJoinParent * 2;
        const originalLineno = Math.max(1, gluedLineno - glueOffsetLines);
        // This path returns just the error message, not the tree -- so unlike the success path,
        // nothing else will ever call tree.delete() for us:
        tree.delete();
        return i18n.global.t("messageBannerMessage.invalidPythonCodeSyntax") + " line: " + mapErrorLineno(originalLineno);
    }
    return {tree, disabledLines: preprocessed.disabledLines, addedFakeJoinParent: glued.addedFakeJoinParent};
}

// Gets the leading indent of a string
function getIndent(codeLine: string) {
    return (codeLine.match(/^\s*/) as RegExpMatchArray)[0];
}

const STRYPE_DOC_NEWLINE = "___strype_doc_newline";

// Defined in pythonSlotsShared.ts (a dependency-free leaf module, along with concatSlots(),
// replaceMediaLiteralsAndInvalidOps() and fromUnicodeEscapes() below) and re-exported here so
// existing importers of pythonToFrames.ts are unaffected:
import { STRYPE_DUMMY_FIELD, STRYPE_EXPRESSION_BLANK, STRYPE_INVALID_SLOT, STRYPE_INVALID_OPS_WRAPPER, STRYPE_INVALID_OP, STRYPE_INVALID_FSTRING_WRAPPER, concatSlots, replaceMediaLiteralsAndInvalidOps, fromUnicodeEscapes, escapeForPlainStringLiteral } from "@/helpers/pythonSlotsShared";
export { STRYPE_DUMMY_FIELD, STRYPE_EXPRESSION_BLANK, STRYPE_INVALID_SLOT, STRYPE_INVALID_OPS_WRAPPER, STRYPE_INVALID_OP, STRYPE_INVALID_FSTRING_WRAPPER, concatSlots, replaceMediaLiteralsAndInvalidOps, fromUnicodeEscapes, escapeForPlainStringLiteral };

export interface SavedFrameState {
    collapsed?: CollapsedState;
    frozen?: FrozenState;
    // Could be more in future, potentially
}

// findStringEnd() and transformCommentsAndBlanks() (the old Skulpt-era preprocessing pass,
// replaced by preprocessBeforeParse() in pythonToFramesPreprocess.ts) used to live here, along
// with the rest of the Skulpt-based parseWithSkulpt()/copyFramesFromPython() cluster this
// module used before switching to tree-sitter -- all deleted once the new pipeline was proven
// via the e2e suite.

// Information about a set of "copied" frames.  This is the result of parsing
// Python into a set of frame objects.
interface CopiedFrames {
    frameIds: number[];
    frames: EditorFrameObjects;
    // The project documentation is special because it's a singleton frame, so its content is recorded separately:
    docSlots: SlotsStructure | undefined;
}

class CopyFailure extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CopyFailure";
    }
}

// Offsets all IDs by the given amount, ready for insertion into real frames
// Modifies in-place and returns the modified item
export function offsetAllIds(frames: CopiedFrames, offset: number) : CopiedFrames {
    for (let i = 0; i < frames.frameIds.length; i++) {
        frames.frameIds[i] += offset;
    }
    // Can't modify keys while iterating so take a copy, remove them all, put them all back offset:
    const entries = Object.entries(frames.frames);
    for (const key in frames.frames) {
        delete frames.frames[Number(key)];
    }
    for (const [id, frame] of entries) {
        frames.frames[Number(id) + offset] = frame;
        
        // We also have to modify all child IDs etc:
        // Don't add the offset if the parent or joint parent is -1:
        frame.parentId = frame.parentId <= 0 ? frame.parentId : frame.parentId + offset;
        frame.jointParentId = frame.jointParentId <= 0 ? frame.jointParentId : frame.jointParentId + offset;
        // No such issues with our ID or child IDs:
        frame.id += offset;
        for (let i = 0; i < frame.childrenIds.length; i++) {
            frame.childrenIds[i] += offset;
        }
        for (let i = 0; i < frame.jointFrameIds.length; i++) {
            frame.jointFrameIds[i] += offset;
        }        
    }
    return frames;
}

// The main entry point to this module. Given a string of Python code that the user has pasted in
// (already split into lines), return the frames after parsing with tree-sitter. If unsuccessful,
// throws CopyFailure with a string with some info about where the Python parse failed. Calls the
// tree-sitter-based parse/walk pipeline (parseWithTreeSitter() + processBlockItems()); this used
// to call a Skulpt-based parseWithSkulpt() + copyFramesFromPython() pipeline instead, since deleted.
function copyFramesFromParsedPython(codeLines: string[], currentStrypeLocation: STRYPE_LOCATION, format: "py" | "spy", linenoMapping?: Record<number, number>) : CopiedFrames {
    const indents = new Map<number, string>();

    // Then find the common amount of indentation on non-blank lines and remove it:
    // This way if the user parses in something like this from the middle of some Python:
    // "    if x > 8:"
    // "      x = 10"
    // "    else:"
    // "      x = 12"
    // (which is invalid in Python because you can't have a leading indent on the first line),
    // we interpret it as :
    // "if x > 8:"
    // "  x = 10"
    // "else:"
    // "  x = 12"
    // (note that just removing indent on first line wouldn't make the else line up correctly)
    let lowestIndent = 999999;
    for (const codeLine of codeLines) {
        if (codeLine.trim() != "") {
            // Is bound to match because even the empty line matches:
            const indent = getIndent(codeLine).length;
            if (indent < lowestIndent) {
                lowestIndent = indent;
            }
        }
    }
    // Now remove that indent if it exists, and record remaining indent. A disabled line's
    // "#(=> Disabled:" marker always sits at column 0 regardless of the real code's nesting depth
    // underneath, so the indent recorded here must be measured on the de-prefixed content (see
    // stripDisabledPrefix()), not the raw line -- otherwise every disabled line looks like it's at
    // indent 0, which findTrailingBlankBoundary() relies on this map to get right:
    for (let i = 0; i < codeLines.length; i++) {
        codeLines[i] = codeLines[i].slice(lowestIndent);
        indents.set(i + 1, getIndent(stripDisabledPrefix(codeLines[i])));
    }

    // Unlike Skulpt's transformCommentsAndBlanks(), preprocessBeforeParse() (called inside
    // parseWithTreeSitter()) never changes the line count, so -- unlike the old mapLineno, which
    // had to go via transformedLineOrigin to undo that -- codeLines line numbers already line up
    // directly with what parseWithTreeSitter() reports (once it's undone its own glue offset):
    const mapLineno = (lineno : number) : number => linenoMapping ? linenoMapping[lineno] : lineno;

    const parsed = parseWithTreeSitter(codeLines, mapLineno);
    if (typeof parsed === "string") {
        throw new CopyFailure(parsed);
    }
    const addedFakeJoinParent = parsed.addedFakeJoinParent;

    try {
        const result : CopiedFrames = {frameIds: [], frames: {}, docSlots: undefined};
        // Must be set before the tree walk starts -- stringNodeToSlots() (pythonToFramesExpr.ts)
        // reads this to decide whether to dedent multi-line docstring content:
        setIsSPYForDocStrings(format === "spy");
        // We assign new IDs starting from 1, later on they are offset:
        processBlockItems(parsed.tree.rootNode.children, -1, undefined, {nextId: 1, addToNonJoint: result.frameIds, addToJoint: undefined, loadedFrames: result.frames, disabledLines: parsed.disabledLines, frameStateLines: new Map<number, SavedFrameState>(), parent: null, jointParent: null, lastLineProcessed: 0, lineNumberToIndentation: indents, isSPY: format === "spy", transformTopComment: (c) => {
            result.docSlots = c;
        }});
        // At this stage, we can make a sanity check that we can copy the given Python code in the current position in Strype (for example, no "import" in a function definition section)
        if(!canPastePythonAtStrypeLocation(currentStrypeLocation, result)){
            throw new CopyFailure(i18n.global.t("messageBannerMessage.incompatiblePythonStrypeSection"));
        }

        if (addedFakeJoinParent > 0) {
            // Now have to detach that parent again.  If it was joint frames only, there should be one parent on the list:
            if (result.frameIds.length == 1) {
                // Clone the list to avoid modification issues:
                result.frameIds = [...result.frames[result.frameIds[0]].jointFrameIds.slice(addedFakeJoinParent - 1)];
            }
            else {
                // Uh-oh, they had other things after the else, etc.  We can't handle that, so abandon:
                throw new CopyFailure(i18n.global.t("messageBannerMessage.wrongPythonStructCopied"));
            }
        }
        return result;
    }
    catch (e) {
        console.warn(e);
        if (e instanceof CopyFailure) {
            throw e;
        }
        throw new CopyFailure(e instanceof Error ? e.message : String(e));
    }
    finally {
        // Frees the tree's underlying native (Emscripten-bound) WASM object -- see the comment on
        // parser.delete() in parseWithTreeSitter() for why this matters. Runs whether the walk
        // above succeeded or threw, so every parse -- not just the happy path -- gets cleaned up:
        // a single copy/paste calls copyFramesFromParsedPython() up to 5 times (once per section),
        // so a leak here would multiply fast across a long test/browser session.
        parsed.tree.delete();
    }
}

// Whether a parsed expression is "simple" enough that re-using it as an operand
// (as we do when expanding an augmented assignment like "a += b" into "a = a + b")
// doesn't need extra brackets to stay unambiguous: a single token, a single function
// call, or a single member/method-call chain. All of those only ever join sub-parts
// with a blank ("") or a "." operator; anything else (a real binary/unary operator)
// means brackets are needed to preserve the original semantics.
function isSimpleAugAssignOperand(slots: SlotsStructure) : boolean {
    return slots.operators.every((op) => op.code === "" || op.code === ".");
}

// ---------------------------------------------------------------------------------------------
// The tree-sitter-based statement walker: driven by tree-sitter's field API instead of
// positional child indices, and by nodeToSlots()/flattenChildren() (pythonToFramesExpr.ts) for
// expression content and getBlockItems() (pythonToFramesBlockWalk.ts) for blank-line/comment
// recovery -- see those modules' own doc comments for the design rationale. Can't be
// unit-tested standalone the way those two modules are (it needs makeFrame()/addFrame(), which
// need real FrameObject/i18n machinery), so its correctness is validated via the existing e2e
// paste/load suites instead, not via Playwright-as-unit-test specs.
// ---------------------------------------------------------------------------------------------

const spyDirectiveRegex = new RegExp("^" + escapeRegExp(AppSPYFullPrefix) + "([^:]+):(.*)$");

function tsLineno(node: TSSyntaxNode) : number {
    return node.startPosition.row + 1;
}

// Given an expression node, returns its SlotsStructure, or a single blank field if the node is
// undefined (mirrors the old code's handling of e.g. a bare "return"/"raise" with no value).
function tsSlotsOrBlank(node: TSSyntaxNode | null) : SlotsStructure {
    return node ? nodeToSlots(node) : {fields: [{code: ""}], operators: []};
}

// Processes a single comment node: either a plain comment, a Library:/LibraryDisabled: directive
// (-> library frame), or a FrameState: directive (-> recorded against the following line, no frame
// produced), or (if s.transformTopComment is set, i.e. this is the first item directly inside a
// funcdef/classdef body) consumed as that def's doc "comment".
function processCommentNode(node: TSSyntaxNode, s: CopyState) : CopyState {
    const text = node.text; // includes the leading "#"
    const m = spyDirectiveRegex.exec(text);
    if (m) {
        const key = m[1].trim();
        const value = m[2];
        if (key == "Library" || key == "LibraryDisabled") {
            const frame = makeFrame(AllFrameTypesIdentifier.library, {0: {slotStructures: {fields: [{code: value}], operators: []}}}, s.isSPY);
            const newState = addFrame(frame, tsLineno(node), s);
            if (key == "LibraryDisabled") {
                // Unlike the "#(=> Disabled:" prefix on a real code line (stripped and recorded in
                // preprocessBeforeParse()'s disabledLines before parsing even starts), a disabled
                // library is a distinct directive keyword recognised only here, post-parse -- so
                // mark it disabled directly rather than relying on the disabledLines lookup in
                // addFrame(). Must happen *after* addFrame(), not before: addFrame() unconditionally
                // overwrites frame.isDisabled from its own disabledLines lookup (which will be false
                // here, since this line was never in disabledLines), clobbering a value set earlier
                // -- confirmed as a real bug this way: a "#(=> LibraryDisabled:" round-tripped back
                // out as a plain (non-disabled) "#(=> Library:".
                frame.isDisabled = true;
            }
            return newState;
        }
        if (key == "FrameState") {
            const states = value.trim().split(";");
            const composite = {} as SavedFrameState;
            for (const st of states) {
                if (st.trim() in stringToCollapsed) {
                    composite.collapsed = stringToCollapsed[st.trim()];
                }
                if (st.trim() in stringToFrozen) {
                    composite.frozen = stringToFrozen[st.trim()];
                }
            }
            // Applies to the line immediately following this comment (matching the old code's "+1"
            // semantics), regardless of any further blanks/comments between here and the next real
            // frame -- frameStateLines is a Map reference shared via CopyState, so mutating it here
            // is visible to the addFrame() call for that following frame:
            s.frameStateLines.set(node.startPosition.row + 2, composite);
            return s;
        }
        // Any other directive (e.g. a stray/malformed one, or -- confirmed the real case here by a
        // failing e2e run -- splitLinesToSections()'s main-section loop terminating on
        // "Section:Main" instead of "Section:End", a pre-existing, unrelated bug that lets the
        // trailing "#(=> Section:End" line leak into the main section's content instead of being
        // stripped before parsing like the other Section:* headers are): swallow it silently,
        // producing no frame at all, matching the old Skulpt-based code's "not one we have to deal
        // with during parsing, probably a config setting, so record for later processing" fallback
        // (which pushed a *blank*, unmarked source line -- not a STRYPE_WHOLE_LINE_BLANK marker --
        // so Skulpt never turned it into a frame either). Rendering it as a plain comment instead
        // (an earlier version of this code did) surfaces that latent splitLinesToSections bug as a
        // visible regression: e2e specs assert no comment frame's text starts with "(=>", since
        // that would mean a special directive comment leaked through unprocessed.
        return s;
    }
    const commentText = text.slice(1); // drop the leading "#"; no unicode-escape decoding needed
    // -- unlike the old disguised-as-identifier comments, this is the real source text already.
    // Deliberately never consumes s.transformTopComment, even if set: in the old Skulpt-based code,
    // a real "#"-prefixed comment was *never* eligible to become a funcdef/classdef/project doc --
    // only a triple-quoted *string literal* (parsed as an expression, then makeFrame()'s own
    // special case converting it to a "comment"-type frame) was, entirely inside
    // copyExpressionStatement()'s misc/funccall path below, which is the only place that checks
    // s.transformTopComment. Checking it here too (an earlier version of this code did) is what
    // actually caused a real, confirmed-by-e2e bug: a plain "# some text" comment placed right
    // before a def/class -- as its own standalone comment frame, the common paste pattern -- was
    // silently swallowed by copyFramesFromParsedPython()'s unconditional docSlots-capturing
    // transformTopComment (set up for every section, e.g. the funcDefs section's own independent
    // parse, not just the actual project-doc parse) instead of becoming the comment frame it should.
    return addFrame(makeFrame(AllFrameTypesIdentifier.comment, {0: {slotStructures: {fields: [{code: commentText}], operators: []}}}, s.isSPY), tsLineno(node), s);
}

// Processes every item (statement, comment, or blank-line run) in an already-assembled, ordered
// list of a block's items (a block/consequence/body node's own .children, typically prefixed with
// any leading sibling comments -- see getLeadingSiblingComments() -- or the top-level module
// node's .children). `afterRow`/`beforeRow` are passed straight through to getBlockItems() -- see
// its doc comment.
function processBlockItems(nodes: TSSyntaxNode[], afterRow: number, beforeRow: number | undefined, s: CopyState) : CopyState {
    for (const item of getBlockItems(nodes, afterRow, beforeRow)) {
        if (item.kind === "blank") {
            // getBlockItems()'s row range for this blank run was computed statically, before any
            // processing happened. But if the *preceding* node was itself a compound statement,
            // copyBlockBody() may already have claimed some of these same rows as blank lines
            // nested inside its own body (see findTrailingBlankBoundary()'s doc comment) --
            // s.lastLineProcessed (1-indexed) reflects how far that recursion actually got, which
            // can run deeper than this item's row range accounts for. Skip re-emitting rows
            // already claimed that way as this (enclosing) level's own blanks, rather than
            // double-counting them:
            const alreadyClaimedThroughRow = (s.lastLineProcessed ?? 0) - 1; // 0-indexed
            const firstUnclaimedRow = Math.max(item.startRow, alreadyClaimedThroughRow + 1);
            for (let row = firstUnclaimedRow; row < item.startRow + item.count; row++) {
                // Blanks are not allowed directly inside class defs (matching old behaviour):
                if (s.parent?.frameType.type != AllFrameTypesIdentifier.classdef) {
                    s = addFrame(makeFrame(AllFrameTypesIdentifier.blank, {}, s.isSPY), row + 1, s);
                }
            }
        }
        else if (item.node.type === "comment") {
            s = processCommentNode(item.node, s);
        }
        else {
            s = copyFramesFromTreeSitterNode(item.node, s);
        }
        // Only the very first item in a block can be a def's doc "comment" -- once anything at all
        // has been processed (even a blank or an ordinary comment), that possibility is gone:
        s = {...s, transformTopComment: undefined};
    }
    return s;
}

// Handles an expr_stmt-equivalent's inner "assignment" node specially (splitting into separate
// target/value slots) rather than going through nodeToSlots() generically -- a chained assignment
// like "a = b = 1" still works, since nodeToSlots() on the nested "right" assignment node falls
// through to its generic flattenChildren() case (treating the nested "=" as an ordinary operator),
// matching the old Skulpt-based code's behaviour for the same input.
function copyAssignmentStatement(node: TSSyntaxNode, s: CopyState) : CopyState {
    const left = node.childForFieldName("left");
    const right = node.childForFieldName("right");
    if (!left || !right) {
        throw new Error("Malformed assignment node: " + node.text);
    }
    const lhs = nodeToSlots(left);
    const rhs = nodeToSlots(right);
    return addFrame(makeFrame(AllFrameTypesIdentifier.varassign, {0: {slotStructures: lhs}, 1: {slotStructures: rhs}}, s.isSPY), tsLineno(node), s);
}

// Strype has no dedicated frame for augmented assignment (e.g. "a += b"), so -- matching the old
// code -- it's expanded into the equivalent "a = a + b" instead. This isn't behaviour-compliant
// for targets with side effects (e.g. "a().x += b" would evaluate "a()" twice) but that's an
// accepted, unlikely-to-occur limitation, carried over unchanged.
function copyAugmentedAssignmentStatement(node: TSSyntaxNode, s: CopyState) : CopyState {
    const left = node.childForFieldName("left");
    const opNode = node.childForFieldName("operator");
    const right = node.childForFieldName("right");
    if (!left || !opNode || !right) {
        throw new Error("Malformed augmented_assignment node: " + node.text);
    }
    const lhs = nodeToSlots(left);
    const rhsOperand = nodeToSlots(right);
    const op = opNode.text.slice(0, -1); // strip the trailing "=" from e.g. "+=" to get "+"
    const bracketedRhsOperand = isSimpleAugAssignOperand(rhsOperand) ? rhsOperand :
        {fields: [{code: ""}, {...rhsOperand, openingBracketValue: "("}, {code: ""}], operators: [{code: ""}, {code: ""}]};
    const rhs = concatSlots(cloneDeep(lhs), op, bracketedRhsOperand);
    return addFrame(makeFrame(AllFrameTypesIdentifier.varassign, {0: {slotStructures: lhs}, 1: {slotStructures: rhs}}, s.isSPY), tsLineno(node), s);
}

function copyExpressionStatement(node: TSSyntaxNode, s: CopyState) : CopyState {
    const inner = node.child(0);
    if (!inner) {
        throw new Error("Empty expression_statement");
    }
    if (inner.type === "assignment") {
        return copyAssignmentStatement(inner, s);
    }
    if (inner.type === "augmented_assignment") {
        return copyAugmentedAssignmentStatement(inner, s);
    }
    // Everything else (a bare call, attribute access, identifier, etc.) goes in a "misc" frame --
    // makeFrame() itself detects the standalone-triple-quoted-string special case and converts it
    // to a comment frame, same as the old code:
    const slots = nodeToSlots(inner);
    const misc = makeFrame(AllFrameTypesIdentifier.funccall, {0: {slotStructures: slots}}, s.isSPY);
    if (misc.frameType.type == AllFrameTypesIdentifier.comment && s.transformTopComment) {
        s.transformTopComment(misc.labelSlotsDict[0].slotStructures);
        return {...s, transformTopComment: undefined};
    }
    return addFrame(misc, tsLineno(node), s);
}

// When a compound statement's body has no following elif/else/except/case clause to anchor
// getBlockItems()'s `beforeRow` (see copyBlockBody() below), a trailing blank line right before
// the dedent back to the enclosing scope is otherwise invisible to this block: getBlockItems()
// only sees the row gap between this block's own last statement and whatever the *enclosing*
// scope's next sibling is, and -- with no beforeRow -- attributes the whole gap to that enclosing
// scope instead, so an indented trailing blank silently moves out of the block it visually
// belongs to. Since Python's grammar treats blank lines as pure whitespace with no node of their
// own, indentation is the only remaining signal for which scope a blank line "belongs" to: this
// claims blank lines immediately after `afterRow` for as long as they're indented at least as
// deep as `minIndentCols`, using the source-derived `lineNumberToIndentation` map (built once
// up-front in copyFramesFromParsedPython(), covering every line including blank ones). Returns
// the 0-indexed row one past the last claimed blank line (suitable as getBlockItems'/
// copyBlockBody's `beforeRow`), or undefined if no blank line follows.
function findTrailingBlankBoundary(afterRow: number, minIndentCols: number, s: CopyState) : number | undefined {
    let lastClaimedRow: number | undefined;
    for (let candidateRow = afterRow + 1; ; candidateRow++) {
        const lineIndent = s.lineNumberToIndentation.get(candidateRow + 1); // map is 1-indexed
        if (lineIndent === undefined || lineIndent.length < minIndentCols) {
            break;
        }
        lastClaimedRow = candidateRow;
    }
    return lastClaimedRow === undefined ? undefined : lastClaimedRow + 1;
}

// A block-like container's own startPosition/endPosition only span its actual statements (no
// visibility of the header line before it or a following elif/else/except sibling after it), so
// callers must pass in the right row bounds explicitly -- see getBlockItems()'s doc comment. Also
// prepends any leading sibling comments (see getLeadingSiblingComments()) that tree-sitter attached
// to `headerNode` instead of `blockNode` itself.
//
// If the caller has no explicit `beforeRow` (no following elif/else/except/case clause), falls
// back to findTrailingBlankBoundary() so this block still claims its own indented trailing
// blanks -- processBlockItems() then relies on `s.lastLineProcessed` to stop the *enclosing*
// scope from re-claiming those same rows as its own blanks (see the comment there).
function copyBlockBody(blockNode: TSSyntaxNode, headerNode: TSSyntaxNode, s: CopyState, beforeRow?: number) : CopyState {
    const nodes = [...getLeadingSiblingComments(headerNode, blockNode), ...blockNode.children];
    if (beforeRow === undefined && nodes.length > 0) {
        const lastRow = nodes[nodes.length - 1].endPosition.row;
        beforeRow = findTrailingBlankBoundary(lastRow, nodes[0].startPosition.column, s);
    }
    return processBlockItems(nodes, headerNode.startPosition.row, beforeRow, s);
}

function copyIfStatement(node: TSSyntaxNode, s: CopyState) : CopyState {
    const condition = node.childForFieldName("condition");
    const consequence = node.childForFieldName("consequence");
    if (!condition || !consequence) {
        throw new Error("Malformed if_statement: " + node.text);
    }
    const ifFrame = makeFrame(AllFrameTypesIdentifier.if, {0: {slotStructures: nodeToSlots(condition)}}, s.isSPY);
    s = addFrame(ifFrame, tsLineno(node), s);
    const clauses = node.children.filter((c) => c.type === "elif_clause" || c.type === "else_clause");
    const firstClauseRow = clauses.length > 0 ? clauses[0].startPosition.row : undefined;
    // Only pull nextId/lastLineProcessed back from the recursive body walk (via updateFrom()),
    // never reassign `s` wholesale to its return value -- that would clobber s.parent/addToJoint/
    // etc. with whatever the deepest-processed nested item's state happened to be, which is
    // exactly the bug this comment is here to stop from reappearing (found by manually smoke-
    // testing this code in a real browser before wiring it in further -- an `if` statement's own
    // body was silently coming out empty because of it). Matches the old Skulpt-based code's own
    // makeAndAddFrameWithBody(), which does the same for exactly this reason.
    // transformTopComment must be cleared, not inherited, whenever recursing into a *nested* body
    // that isn't itself a funcdef/classdef -- otherwise a doc-comment callback set up for an
    // *outer* funcdef/classdef/the module (project doc) leaks several levels down and silently
    // swallows the first comment of this unrelated nested block instead of it becoming its own
    // comment frame. This was a real bug, not a hypothetical one: e.g. a comment that happened to
    // be the first line inside an `if` nested inside a funcdef vanished entirely from a round-trip
    // paste/save, because it got misidentified as that funcdef's doc-comment.
    updateFrom(s, copyBlockBody(consequence, node, {...s, addToNonJoint: ifFrame.childrenIds, addToJoint: undefined, parent: ifFrame, transformTopComment: undefined}, firstClauseRow));
    for (let i = 0; i < clauses.length; i++) {
        const clause = clauses[i];
        const nextClauseRow = i + 1 < clauses.length ? clauses[i + 1].startPosition.row : undefined;
        const body = clause.childForFieldName("consequence") ?? clause.childForFieldName("body");
        if (!body) {
            throw new Error("Malformed elif/else clause: " + clause.text);
        }
        if (clause.type === "elif_clause") {
            const cond = clause.childForFieldName("condition");
            if (!cond) {
                throw new Error("Malformed elif_clause: " + clause.text);
            }
            const elifFrame = makeFrame(AllFrameTypesIdentifier.elif, {0: {slotStructures: nodeToSlots(cond)}}, s.isSPY);
            const elifState = addFrame(elifFrame, tsLineno(clause), {...s, addToJoint: ifFrame.jointFrameIds, jointParent: ifFrame});
            updateFrom(s, copyBlockBody(body, clause, {...elifState, addToNonJoint: elifFrame.childrenIds, addToJoint: undefined, parent: elifFrame, transformTopComment: undefined}, nextClauseRow));
        }
        else {
            const elseFrame = makeFrame(AllFrameTypesIdentifier.else, {}, s.isSPY);
            const elseState = addFrame(elseFrame, tsLineno(clause), {...s, addToJoint: ifFrame.jointFrameIds, jointParent: ifFrame});
            updateFrom(s, copyBlockBody(body, clause, {...elseState, addToNonJoint: elseFrame.childrenIds, addToJoint: undefined, parent: elseFrame, transformTopComment: undefined}, nextClauseRow));
        }
    }
    return s;
}

function copyWhileStatement(node: TSSyntaxNode, s: CopyState) : CopyState {
    const condition = node.childForFieldName("condition");
    const body = node.childForFieldName("body");
    const alternative = node.childForFieldName("alternative"); // else_clause, if present
    if (!condition || !body) {
        throw new Error("Malformed while_statement: " + node.text);
    }
    const whileFrame = makeFrame(AllFrameTypesIdentifier.while, {0: {slotStructures: nodeToSlots(condition)}}, s.isSPY);
    s = addFrame(whileFrame, tsLineno(node), s);
    updateFrom(s, copyBlockBody(body, node, {...s, addToNonJoint: whileFrame.childrenIds, addToJoint: undefined, parent: whileFrame, transformTopComment: undefined}, alternative?.startPosition.row));
    if (alternative) {
        const elseBody = alternative.childForFieldName("body");
        if (!elseBody) {
            throw new Error("Malformed else_clause: " + alternative.text);
        }
        const elseFrame = makeFrame(AllFrameTypesIdentifier.else, {}, s.isSPY);
        const elseState = addFrame(elseFrame, tsLineno(alternative), {...s, addToJoint: whileFrame.jointFrameIds, jointParent: whileFrame});
        updateFrom(s, copyBlockBody(elseBody, alternative, {...elseState, addToNonJoint: elseFrame.childrenIds, addToJoint: undefined, parent: elseFrame, transformTopComment: undefined}));
    }
    return s;
}

function copyForStatement(node: TSSyntaxNode, s: CopyState) : CopyState {
    const left = node.childForFieldName("left");
    const right = node.childForFieldName("right");
    const body = node.childForFieldName("body");
    const alternative = node.childForFieldName("alternative"); // else_clause, if present
    if (!left || !right || !body) {
        throw new Error("Malformed for_statement: " + node.text);
    }
    const forFrame = makeFrame(AllFrameTypesIdentifier.for, {0: {slotStructures: nodeToSlots(left)}, 1: {slotStructures: nodeToSlots(right)}}, s.isSPY);
    s = addFrame(forFrame, tsLineno(node), s);
    updateFrom(s, copyBlockBody(body, node, {...s, addToNonJoint: forFrame.childrenIds, addToJoint: undefined, parent: forFrame, transformTopComment: undefined}, alternative?.startPosition.row));
    if (alternative) {
        const elseBody = alternative.childForFieldName("body");
        if (!elseBody) {
            throw new Error("Malformed else_clause: " + alternative.text);
        }
        const elseFrame = makeFrame(AllFrameTypesIdentifier.else, {}, s.isSPY);
        const elseState = addFrame(elseFrame, tsLineno(alternative), {...s, addToJoint: forFrame.jointFrameIds, jointParent: forFrame});
        updateFrom(s, copyBlockBody(elseBody, alternative, {...elseState, addToNonJoint: elseFrame.childrenIds, addToJoint: undefined, parent: elseFrame, transformTopComment: undefined}));
    }
    return s;
}

function copyTryStatement(node: TSSyntaxNode, s: CopyState) : CopyState {
    const body = node.childForFieldName("body");
    if (!body) {
        throw new Error("Malformed try_statement: " + node.text);
    }
    const clauses = node.children.filter((c) => c.type === "except_clause" || c.type === "else_clause" || c.type === "finally_clause");
    const firstClauseRow = clauses.length > 0 ? clauses[0].startPosition.row : undefined;
    const tryFrame = makeFrame(AllFrameTypesIdentifier.try, {}, s.isSPY);
    s = addFrame(tryFrame, tsLineno(node), s);
    updateFrom(s, copyBlockBody(body, node, {...s, addToNonJoint: tryFrame.childrenIds, addToJoint: undefined, parent: tryFrame, transformTopComment: undefined}, firstClauseRow));

    for (let i = 0; i < clauses.length; i++) {
        const clause = clauses[i];
        const nextClauseRow = i + 1 < clauses.length ? clauses[i + 1].startPosition.row : undefined;
        if (clause.type === "except_clause") {
            // The except clause's own value/pattern is everything between "except" and ":" -- it
            // may be absent (blank except), a plain expression, or an "X as y" as_pattern:
            const valueChild = clause.child(1);
            let exceptFrame: FrameObject | null;
            if (!valueChild || valueChild.type === ":") {
                exceptFrame = makeFrame(AllFrameTypesIdentifier.except, {0: {slotStructures: {fields: [{code: ""}], operators: []}}}, s.isSPY);
            }
            else if (valueChild.type === "as_pattern") {
                const exceptType = valueChild.child(0);
                const alias = valueChild.childForFieldName("alias");
                if (!exceptType || !alias) {
                    throw new Error("Malformed except-as clause: " + clause.text);
                }
                exceptFrame = makeFrame(AllFrameTypesIdentifier.except, {0: {slotStructures: concatSlots(nodeToSlots(exceptType), "as", nodeToSlots(alias))}}, s.isSPY);
            }
            else {
                const valueSlots = nodeToSlots(valueChild);
                // A "solo try" (one with no except the user actually wrote) still needs *some*
                // except clause to be valid Python syntax, so Strype's own save logic (parser.ts)
                // writes a placeholder identifier (STRYPE_DUMMY_FIELD, "___strype_dummy") as its
                // type in that case; recognise that placeholder here and skip adding any except
                // frame at all for it -- matching the old Skulpt-based code's identical check and
                // its exceptFrame=null-then-skip handling, not just blanking the slot (Strype's try
                // frame doesn't need a real except child to render a solo try). Confirmed as a real
                // gap by e2e: this placeholder was round-tripping as a literal "___strype_dummy"
                // identifier left in a genuine (non-blank) except frame's slot, rather than being
                // recognised and the whole clause dropped:
                const isDummyPlaceholder = valueSlots.fields.length === 1 && valueSlots.operators.length === 0
                    && (valueSlots.fields[0] as BaseSlot).code === STRYPE_DUMMY_FIELD;
                exceptFrame = isDummyPlaceholder ? null : makeFrame(AllFrameTypesIdentifier.except, {0: {slotStructures: valueSlots}}, s.isSPY);
            }
            if (exceptFrame) {
                const exceptBody = clause.childForFieldName("block") ?? clause.child(clause.childCount - 1);
                if (!exceptBody) {
                    throw new Error("Malformed except_clause: " + clause.text);
                }
                const exceptState = addFrame(exceptFrame, tsLineno(clause), {...s, addToJoint: tryFrame.jointFrameIds, jointParent: tryFrame});
                updateFrom(s, copyBlockBody(exceptBody, clause, {...exceptState, addToNonJoint: exceptFrame.childrenIds, addToJoint: undefined, parent: exceptFrame, transformTopComment: undefined}, nextClauseRow));
            }
        }
        else if (clause.type === "finally_clause") {
            const finallyBody = clause.childForFieldName("block") ?? clause.child(clause.childCount - 1);
            if (!finallyBody) {
                throw new Error("Malformed finally_clause: " + clause.text);
            }
            const finallyFrame = makeFrame(AllFrameTypesIdentifier.finally, {}, s.isSPY);
            const finallyState = addFrame(finallyFrame, tsLineno(clause), {...s, addToJoint: tryFrame.jointFrameIds, jointParent: tryFrame});
            updateFrom(s, copyBlockBody(finallyBody, clause, {...finallyState, addToNonJoint: finallyFrame.childrenIds, addToJoint: undefined, parent: finallyFrame, transformTopComment: undefined}, nextClauseRow));
        }
        else {
            // else_clause
            const elseBody = clause.childForFieldName("body");
            if (!elseBody) {
                throw new Error("Malformed else_clause: " + clause.text);
            }
            const elseFrame = makeFrame(AllFrameTypesIdentifier.else, {}, s.isSPY);
            const elseState = addFrame(elseFrame, tsLineno(clause), {...s, addToJoint: tryFrame.jointFrameIds, jointParent: tryFrame});
            updateFrom(s, copyBlockBody(elseBody, clause, {...elseState, addToNonJoint: elseFrame.childrenIds, addToJoint: undefined, parent: elseFrame, transformTopComment: undefined}, nextClauseRow));
        }
    }
    return s;
}

function copyWithStatement(node: TSSyntaxNode, s: CopyState) : CopyState {
    const withClause = node.child(1);
    const body = node.childForFieldName("body");
    if (!withClause || withClause.type !== "with_clause" || !body) {
        throw new Error("Malformed with_statement: " + node.text);
    }
    const withItems = withClause.children.filter((c) => c.type === "with_item");
    if (withItems.length !== 1) {
        // Strype's "with" frame only has slots for a single context-manager/target pair -- the old
        // Skulpt-based grammar only ever exposed one with_item too, so this isn't a new gap, but
        // unlike that old code (which would have just silently used/dropped whichever items it
        // happened to index into), reject explicitly:
        throw new UnsupportedConstructError("Only a single 'with ... as ...' item is supported");
    }
    const value = withItems[0].childForFieldName("value");
    if (!value) {
        throw new Error("Malformed with_item: " + withItems[0].text);
    }
    let target: TSSyntaxNode | null = null;
    let contextManager = value;
    if (value.type === "as_pattern") {
        contextManager = value.child(0) as TSSyntaxNode;
        const alias = value.childForFieldName("alias");
        target = alias ? alias.child(0) ?? alias : null;
    }
    const withFrame = makeFrame(AllFrameTypesIdentifier.with, {0: {slotStructures: nodeToSlots(contextManager)}, 1: {slotStructures: tsSlotsOrBlank(target)}}, s.isSPY);
    s = addFrame(withFrame, tsLineno(node), s);
    // Must pull nextId/lastLineProcessed back via updateFrom() rather than returning the nested
    // body walk's state directly -- that state's `parent` is withFrame, not this statement's own
    // outer parent, and returning it as-is would leak into whatever sibling statement gets
    // processed next (processBlockItems() does `s = copyFramesFromTreeSitterNode(...)`, so any
    // handler that returns a body-walk's raw result corrupts every later sibling's parent too, not
    // just its own). See copyIfStatement()'s comment for how this was actually found.
    updateFrom(s, copyBlockBody(body, node, {...s, addToNonJoint: withFrame.childrenIds, addToJoint: undefined, parent: withFrame, transformTopComment: undefined}));
    return s;
}

// Blanks/removes a method's leading "self" parameter (Strype adds it automatically for methods,
// so it shouldn't be shown as an explicit param): keeps a single field but blanks its content if
// it's the only param, otherwise drops it (and its following operator) entirely.
function removeFirstFuncParam(params: LabelSlotsContent) {
    if (params && params.slotStructures.fields.length == 1) {
        (params.slotStructures.fields[0] as BaseSlot).code = "";
    }
    else if (params && params.slotStructures.fields.length > 1) {
        params.slotStructures.fields.splice(0, 1);
        params.slotStructures.operators.splice(0, 1);
    }
}

function copyFunctionDefinition(node: TSSyntaxNode, s: CopyState) : CopyState {
    const name = node.childForFieldName("name");
    const parameters = node.childForFieldName("parameters");
    const body = node.childForFieldName("body");
    const returnType = node.childForFieldName("return_type");
    if (!name || !parameters || !body) {
        throw new Error("Malformed function_definition: " + node.text);
    }
    if (returnType) {
        throw new UnsupportedConstructError("Return type annotations are not supported");
    }
    if (parameters.children.some((c) => c.type === "typed_parameter" || c.type === "typed_default_parameter")) {
        throw new UnsupportedConstructError("Parameter type annotations are not supported");
    }
    const funcdefFrame = makeFrame(AllFrameTypesIdentifier.funcdef, {0: {slotStructures: nodeToSlots(name)}, 1: {slotStructures: nodeToSlots(parameters)}}, s.isSPY);
    s = addFrame(funcdefFrame, tsLineno(node), s);
    // Check this *before* the recursive body walk, not after -- s.parent must still be the
    // outer/enclosing frame at that point (whether this def is directly inside a class), not
    // whatever the body walk's nested state last set parent to (see copyIfStatement()'s comment
    // for the general hazard this avoids -- this was the other bug it caught: a method's own
    // params ended up with a literal duplicate "self" typed into them, because this check read
    // s.parent *after* it had already been clobbered to funcdefFrame by the reassignment that
    // used to be here, so it was always false and removeFirstFuncParam() never ran):
    const isMethod = s.parent?.frameType.type == AllFrameTypesIdentifier.classdef;
    updateFrom(s, copyBlockBody(body, node, {
        ...s,
        addToNonJoint: funcdefFrame.childrenIds,
        addToJoint: undefined,
        parent: funcdefFrame,
        transformTopComment: (comment) => {
            funcdefFrame.labelSlotsDict[3] = {slotStructures: comment};
        },
    }));
    if (!(3 in funcdefFrame.labelSlotsDict)) {
        funcdefFrame.labelSlotsDict[3] = {slotStructures: {operators: [], fields: [{code: ""}]}};
    }
    if (isMethod) {
        // Remove the first param, assuming it is the "self" parameter that Strype adds automatically:
        removeFirstFuncParam(funcdefFrame.labelSlotsDict[1]);
    }
    return s;
}

function copyClassDefinition(node: TSSyntaxNode, s: CopyState) : CopyState {
    const name = node.childForFieldName("name");
    const body = node.childForFieldName("body");
    const superclasses = node.childForFieldName("superclasses"); // an argument_list, if present
    if (!name || !body) {
        throw new Error("Malformed class_definition: " + node.text);
    }
    let nameSlots = nodeToSlots(name);
    if (superclasses) {
        // Strype represents the parent-class list as a bracketed sub-structure appended directly
        // into the single "name" slot (matching the old code's approach), rather than as a
        // separate slot of its own. Unlike Skulpt's arglist (which excluded the parens
        // themselves), tree-sitter's `superclasses` field is the *whole* argument_list node,
        // parens included -- nodeToSlots() on that already returns a correctly bracketed
        // SlotsStructure (its own bracket-detection kicks in), so flattening just its inner
        // children directly here (skipping the "(" and ")" tokens) and marking *that* as
        // bracketed is correct; calling nodeToSlots(superclasses) and then also setting
        // openingBracketValue on the result double-wraps it -- confirmed as a real bug this way,
        // not just theoretically: "class Foo(Parent):" was round-tripping as "class Foo((Parent)):".
        const parents = flattenChildren(superclasses.children.slice(1, superclasses.childCount - 1));
        parents.openingBracketValue = "(";
        nameSlots = {fields: [...nameSlots.fields, parents, {code: ""}], operators: [...nameSlots.operators, {code: ""}, {code: ""}]};
    }
    const classdefFrame = makeFrame(AllFrameTypesIdentifier.classdef, {0: {slotStructures: nameSlots}}, s.isSPY);
    s = addFrame(classdefFrame, tsLineno(node), s);
    updateFrom(s, copyBlockBody(body, node, {
        ...s,
        addToNonJoint: classdefFrame.childrenIds,
        addToJoint: undefined,
        parent: classdefFrame,
        transformTopComment: (comment) => {
            classdefFrame.labelSlotsDict[2] = {slotStructures: comment};
        },
    }));
    if (!(2 in classdefFrame.labelSlotsDict)) {
        classdefFrame.labelSlotsDict[2] = {slotStructures: {operators: [], fields: [{code: ""}]}};
    }
    return s;
}

function copyMatchStatement(node: TSSyntaxNode, s: CopyState) : CopyState {
    const subject = node.childForFieldName("subject");
    const body = node.childForFieldName("body");
    if (!subject || !body) {
        throw new Error("Malformed match_statement: " + node.text);
    }
    // Unlike the old code's customised, permissive Skulpt grammar (which allowed bare simple
    // statements directly under a match block, requiring a dedicated post-hoc check to reject
    // them), standard tree-sitter-python's match_statement.body structurally only accepts
    // case_clauses -- anything else comes back as an ERROR node, which findFirstErrorNode()
    // surfaces via the generic "Invalid Python code" error, so no equivalent check is needed here.
    const matchFrame = makeFrame(AllFrameTypesIdentifier.match, {0: {slotStructures: nodeToSlots(subject)}}, s.isSPY);
    s = addFrame(matchFrame, tsLineno(node), s);
    updateFrom(s, copyBlockBody(body, node, {...s, addToNonJoint: matchFrame.childrenIds, addToJoint: undefined, parent: matchFrame, transformTopComment: undefined}));
    return s;
}

function copyCaseClause(node: TSSyntaxNode, s: CopyState) : CopyState {
    const pattern = node.childForFieldName("pattern") ?? node.child(1);
    const body = node.childForFieldName("consequence") ?? node.childForFieldName("body") ?? node.child(node.childCount - 1);
    // The "guard" field is an if_clause node ([if, <condition>], the same shape used inside
    // comprehensions -- see comprehensionToSlots()), not the bare condition, so its "if" keyword
    // child must be skipped here to avoid it appearing twice: once as part of nodeToSlots(guard)
    // itself, and once more from the explicit "if" operator below (found via the same real-browser
    // smoke test that caught the state-clobbering bugs above -- "case 2 if x > 0:" was rendering
    // as "case 2 if if x > 0:"):
    const guard = node.childForFieldName("guard");
    const guardCondition = guard?.child(1);
    if (!pattern || !body) {
        throw new Error("Malformed case_clause: " + node.text);
    }
    const patternSlots = guardCondition ? concatSlots(nodeToSlots(pattern), "if", nodeToSlots(guardCondition)) : nodeToSlots(pattern);
    const caseFrame = makeFrame(AllFrameTypesIdentifier.case, {0: {slotStructures: patternSlots}}, s.isSPY);
    s = addFrame(caseFrame, tsLineno(node), s);
    updateFrom(s, copyBlockBody(body, node, {...s, addToNonJoint: caseFrame.childrenIds, addToJoint: undefined, parent: caseFrame, transformTopComment: undefined}));
    return s;
}

function copyFramesFromTreeSitterNode(node: TSSyntaxNode, s: CopyState) : CopyState {
    switch (node.type) {
    case "expression_statement":
        return copyExpressionStatement(node, s);
    case "pass_statement":
        return {...s, lastLineProcessed: tsLineno(node)};
    case ";":
        // A statement-terminating/-separating semicolon (e.g. "x = 1;" or "x = 1; y = 2") is its
        // own sibling node in tree-sitter's tree, not part of the statement(s) either side of it
        // (confirmed live: parsing "x = 1; y = 2" gives three top-level children -- expression_
        // statement, ";", expression_statement). It carries no content of its own -- real Python
        // treats it purely as a separator -- so it's a no-op here, same as pass_statement:
        return {...s, lastLineProcessed: tsLineno(node)};
    case "break_statement":
        return addFrame(makeFrame(AllFrameTypesIdentifier.break, {}, s.isSPY), tsLineno(node), s);
    case "continue_statement":
        return addFrame(makeFrame(AllFrameTypesIdentifier.continue, {}, s.isSPY), tsLineno(node), s);
    case "global_statement":
        return addFrame(makeFrame(AllFrameTypesIdentifier.global, {0: {slotStructures: flattenChildren(node.children.slice(1))}}, s.isSPY), tsLineno(node), s);
    case "import_statement":
        return addFrame(makeFrame(AllFrameTypesIdentifier.import, {0: {slotStructures: flattenChildren(node.children.slice(1))}}, s.isSPY), tsLineno(node), s);
    case "import_from_statement": {
        const moduleNode = node.childForFieldName("module_name");
        const importIdx = node.children.findIndex((c) => c.type === "import" && c.childCount === 0);
        if (!moduleNode || importIdx < 0) {
            throw new Error("Malformed import_from_statement: " + node.text);
        }
        const names = flattenChildren(node.children.slice(importIdx + 1));
        return addFrame(makeFrame(AllFrameTypesIdentifier.fromimport, {0: {slotStructures: nodeToSlots(moduleNode)}, 1: {slotStructures: names}}, s.isSPY), tsLineno(node), s);
    }
    case "raise_statement": {
        if (node.childCount > 2) {
            // "raise X from Y" -- the old Skulpt-based grammar's raise_stmt never had more than one
            // value child, so this is a genuinely new case, not previously exercised; reject
            // explicitly rather than silently dropping the "from" clause:
            throw new UnsupportedConstructError("'raise ... from ...' is not supported");
        }
        return addFrame(makeFrame(AllFrameTypesIdentifier.raise, {0: {slotStructures: tsSlotsOrBlank(node.child(1))}}, s.isSPY), tsLineno(node), s);
    }
    case "return_statement":
        return addFrame(makeFrame(AllFrameTypesIdentifier.return, {0: {slotStructures: tsSlotsOrBlank(node.child(1))}}, s.isSPY), tsLineno(node), s);
    case "if_statement":
        return copyIfStatement(node, s);
    case "while_statement":
        return copyWhileStatement(node, s);
    case "for_statement":
        return copyForStatement(node, s);
    case "try_statement":
        return copyTryStatement(node, s);
    case "with_statement":
        return copyWithStatement(node, s);
    case "function_definition":
        return copyFunctionDefinition(node, s);
    case "class_definition":
        return copyClassDefinition(node, s);
    case "match_statement":
        return copyMatchStatement(node, s);
    case "case_clause":
        return copyCaseClause(node, s);
    case "decorated_definition":
        // Decorators are confirmed unsupported -- Strype's frame model has no representation for them:
        throw new UnsupportedConstructError("Decorators are not supported");
    default:
        // Anything else (del, assert, nonlocal, a module-level yield/await, etc.) is grammatically
        // parseable by tree-sitter but has no corresponding Strype frame -- reject explicitly
        // rather than silently dropping the statement, which is what the old code's switch (with
        // no matching case) would otherwise have done:
        throw new UnsupportedConstructError("Unsupported Python construct: " + node.type);
    }
}

// Function to check the current position in Strype.
// If a specific frame is given, we look for the position of this frame instead of the current frame.
export function findCurrentStrypeLocation(options?: {lookForGivenFramePosition?: {id: number, caretPosition: CaretPosition}}): {strypeLocation: STRYPE_LOCATION, locationFrameId: number} {
    // We detect the location by nativagating to the parents of the current Strype location (blue cursor) until we reach a significant parent type (see enum STRYPE_LOCATION)
    // If are below a frame, we look for its parent right away, otheriwse we can use that frame.
    let {id: navigFrameId, caretPosition: navigFrameCaretPos} = (options?.lookForGivenFramePosition)??useStore().currentFrame;
    do{
        const frameType = useStore().frameObjects[navigFrameId].frameType;
        switch(frameType.type){
        case ContainerTypesIdentifiers.framesMainContainer:
            return {strypeLocation: STRYPE_LOCATION.MAIN_CODE_SECTION, locationFrameId: navigFrameId};
        case AllFrameTypesIdentifier.classdef:
            return {strypeLocation: (navigFrameCaretPos == CaretPosition.body) ? STRYPE_LOCATION.IN_CLASSDEF : STRYPE_LOCATION.DEFS_SECTION, locationFrameId: navigFrameId};
        case AllFrameTypesIdentifier.funcdef:
            // We are at the body of a function definition, or at the bottom: in the first case, we are
            // inside a function definition; in the second, we are inside the definitions section.
            return {strypeLocation: (navigFrameCaretPos == CaretPosition.body) ? STRYPE_LOCATION.IN_FUNCDEF : STRYPE_LOCATION.DEFS_SECTION, locationFrameId: navigFrameId};
        case ContainerTypesIdentifiers.defsContainer:
            return {strypeLocation: STRYPE_LOCATION.DEFS_SECTION, locationFrameId: navigFrameId};
        case ContainerTypesIdentifiers.importsContainer:
            return {strypeLocation: STRYPE_LOCATION.IMPORTS_SECTION, locationFrameId: navigFrameId};
        default:
            if (useStore().frameObjects[navigFrameId].jointParentId > 0) {
                navigFrameId = useStore().frameObjects[navigFrameId].jointParentId;
            }
            else {
                navigFrameId = useStore().frameObjects[navigFrameId].parentId;
            }
            navigFrameCaretPos = CaretPosition.body; // since the frame is contained in something else.
            break;
        }
    }while(navigFrameId != 0);
    return {strypeLocation: STRYPE_LOCATION.UNKNOWN, locationFrameId: -100};
}

// This function makes a simple sanity check on the copied Python code (as frames then): we make sure that it "fits" the current Strype location
function canPastePythonAtStrypeLocation(currentStrypeLocation : STRYPE_LOCATION, frames: CopiedFrames): boolean {
    // In more details, we check the same-leve (top level) frames in the copy:
    // - in the "import" section, only imports can be copied,
    // - in the "function definition" section, only function definitions can be copied
    // - in the "main code" section or inside a function definition frame, only code that doesn't contain imports or function definitions can be copied (and "global" for main code)
    // Comments can also be imported in all sections. 
    // We remove any blank frames that could exist for an imports or function definitions section top frames: they are not required in the editor.
    // Nevertheless, for this test method to complete, we still need to accept blanks to be inside imports and function definitions for validation.
    
    const copiedPythonToFrames = Object.values(frames.frames);
    const topLevelCopiedFrames = copiedPythonToFrames.filter((frame) => frame.parentId == TOP_LEVEL_TEMP_ID);
    const topLevelCopiedFrameIds = topLevelCopiedFrames.flatMap((frame) => frame.id);
    // Check if the match between the current Strype location and the copied Python code frames is possible
    switch(currentStrypeLocation){
    case STRYPE_LOCATION.MAIN_CODE_SECTION:
        return !copiedPythonToFrames.some((frame) => [AllFrameTypesIdentifier.import, AllFrameTypesIdentifier.fromimport, AllFrameTypesIdentifier.classdef, AllFrameTypesIdentifier.funcdef, AllFrameTypesIdentifier.global].includes(frame.frameType.type));
    case STRYPE_LOCATION.IN_FUNCDEF:
        return !copiedPythonToFrames.some((frame) => [AllFrameTypesIdentifier.import, AllFrameTypesIdentifier.fromimport, AllFrameTypesIdentifier.classdef, AllFrameTypesIdentifier.funcdef].includes(frame.frameType.type));
    case STRYPE_LOCATION.DEFS_SECTION:
        frames = removeTopLevelBlankFrames(frames);
        // We are checking if we can paste; the not at the beginning means everything inside the ensuing bracket is actually the cases
        // where we *cannot* paste, then we invert this to get all the cases we can paste
        return !(topLevelCopiedFrames.some((frame) => ![AllFrameTypesIdentifier.funcdef, AllFrameTypesIdentifier.classdef, AllFrameTypesIdentifier.varassign, AllFrameTypesIdentifier.comment, AllFrameTypesIdentifier.blank].includes(frame.frameType.type))
            || copiedPythonToFrames.some((frame) =>
                // Look only at non-top-level (i.e. child) frames    
                !topLevelCopiedFrameIds.includes(frame.id) &&
                // Look for frames which are outright banned as children: 
                ([AllFrameTypesIdentifier.import, AllFrameTypesIdentifier.fromimport, AllFrameTypesIdentifier.classdef].includes(frame.frameType.type)
                // Funcdefs are a special case; they can be children, but only inside classes:
                ||
                (frame.frameType.type === AllFrameTypesIdentifier.funcdef
                    // Forbidden if either their parent is not top-level,
                    && (!topLevelCopiedFrameIds.includes(frame.parentId)
                        // Or if that parent is not a class:
                        || !topLevelCopiedFrames.some((p) => p.id == frame.parentId && p.frameType.type == AllFrameTypesIdentifier.classdef)))
                )));
    case  STRYPE_LOCATION.IMPORTS_SECTION:
        frames = removeTopLevelBlankFrames(frames);
        return !topLevelCopiedFrames.some((frame) => ![AllFrameTypesIdentifier.import, AllFrameTypesIdentifier.fromimport, AllFrameTypesIdentifier.library, AllFrameTypesIdentifier.comment, AllFrameTypesIdentifier.blank].includes(frame.frameType.type));
    case STRYPE_LOCATION.PROJECT_DOC_SECTION:
        frames = removeTopLevelBlankFrames(frames);
        // Given we transform top comment, shouldn't be anything left:
        return topLevelCopiedFrames.length == 0;
    default:
        // We shouldn't reach this but for safety we return false
        return false;
    }
}

// Note: modifies in-place, but for convenience returns its parameter
function removeTopLevelBlankFrames(frames: CopiedFrames): CopiedFrames {
    // Remove blank frames in the first level of the copied frames. T
    // This is useful when copying Python code that had line breaks between the function defs or the imports:
    // our editor do not allow adding blank frames, so they shouldn't be kept when pasted.
    const copiedPythonToFrames = Object.values(frames.frames);
    const topLevelCopiedFrames = copiedPythonToFrames.filter((frame) => frame.parentId == TOP_LEVEL_TEMP_ID);
    const topLevelBlankFramesIds = topLevelCopiedFrames.filter((frame) => frame.frameType.type === AllFrameTypesIdentifier.blank)
        .map((frame) => frame.id);
    topLevelBlankFramesIds.forEach((frameId) => {
        delete frames.frames[frameId];
        frames.frameIds.splice(frames.frameIds.indexOf(frameId), 1);
    });
    return frames;
}

interface NumberedLine {
    lineno: number;
    text: string;
}

function makeMapping(section: NumberedLine[]) : Record<number, number> {
    return section.reduce((acc, item, index) => {
        acc[index + 1] = item.lineno;
        return acc;
    }, {} as Record<number, number>);
}

// Takes a list of lines of Python code and splits them into four sections: imports, function definitions, class definitions, and main code.
// Each line of the original will end up in exactly one of the four parts of the return.
// With Python's indentation rules, this operation is actually easier at line level than it is post-parse.
// The mappings map line numbers in the returned sections to line numbers in the original
function splitLinesToSections(allLines : string[], leadingAssignmentsGoInDefs: boolean) : {projectDoc: string[], imports: string[]; funcDefs: string[]; classDefs: string[]; main: string[], importsMapping: Record<number, number>, funcDefsMapping: Record<number, number>, classDefsMapping: Record<number, number>, mainMapping: Record<number, number>, headers: Record<string, string>, format: "py" | "spy"} {
    // There's two possibilities:
    //  - we're loading a .spy with section headings, or
    //  - we're loading a .py where we must infer it.
    // Easy way to find out: check if the first line is a .spy header:
    if (allLines.length > 0 && allLines[0].match(new RegExp("^" + escapeRegExp(AppSPYFullPrefix) + " *" + AppName + " *:"))) {
        // It's a .spy!  Easy street, let's find the headings:
        let line = 1;
        const r = {
            projectDoc: [] as string[],
            imports: [] as string[],
            funcDefs: [] as string[],
            classDefs: [] as string[],
            main: [] as string[],
            importsMapping: {} as Record<number, number>,
            funcDefsMapping: {} as Record<number, number>,
            classDefsMapping: {} as Record<number, number>,
            mainMapping: {} as Record<number, number>,
            headers: {} as Record<string, string>,
            format: "spy" as "py" | "spy",
        };
        while (line < allLines.length && !allLines[line].match(new RegExp("^" + escapeRegExp(AppSPYFullPrefix) + " *Section *:Imports"))) {
            // Everything here should be metadata, add it to headers:
            const m = allLines[line].match(new RegExp("^" + escapeRegExp(AppSPYFullPrefix) + "([^:]+):(.*)"));
            if (m) {
                // Note: we only trim left-hand side, right-hand side is as-is:
                r.headers[m[1].trim()] = m[2];
            }
            else {
                r.projectDoc.push(allLines[line]);
            }
            line += 1;
        }
        line += 1;
        const firstImportLine = line;
        while (line < allLines.length && !allLines[line].match(new RegExp("^" + escapeRegExp(AppSPYFullPrefix) + " *Section *:Definitions"))) {
            r.imports.push(allLines[line]);
            r.importsMapping[line - firstImportLine] = line;
            line += 1;
        }
        line += 1;
        const firstDefsLine = line;
        while (line < allLines.length && !allLines[line].match(new RegExp("^" + escapeRegExp(AppSPYFullPrefix) + " *Section *:Main"))) {
            // Since it's an SPY we just say it's all class defs so it all ends up at top level:
            r.classDefs.push(allLines[line]);
            r.classDefsMapping[line - firstDefsLine] = line;
            line += 1;
        }
        line += 1;
        const firstMainLine = line;
        while (line < allLines.length && !allLines[line].match(new RegExp("^" + escapeRegExp(AppSPYFullPrefix) + " *Section *:Main"))) {
            r.main.push(allLines[line]);
            r.mainMapping[line - firstMainLine] = line;
            line += 1;
        }

        return r;
    }
    
    // We associate comments with the line immediately following them, so we keep a list of the most recent comments:
    let latestComments: NumberedLine[] = [];
    let latestAssignments: NumberedLine[] = [];
    const projectDoc: NumberedLine[] = [];
    const imports: NumberedLine[] = [];
    const funcDefs: NumberedLine[] = [];
    const classDefs: NumberedLine[] = [];
    const main: NumberedLine[] = [];
    // -1 if we're not in a def
    let outermostDefIndentLevel = -1;
    let curDefTypeIsClass = false;
    allLines.forEach((line : string, zeroBasedLine : number) => {
        const lineWithNum : NumberedLine = {text: line, lineno: zeroBasedLine + 1};
        const indentLevel = line.length - line.trimStart().length;
        if (line.trim() != "" && indentLevel <= outermostDefIndentLevel) {
            outermostDefIndentLevel = -1;
        }
        if (line.match(/^\s*["'].*/) && imports.length + funcDefs.length + classDefs.length + main.length == 0) {
            projectDoc.push(lineWithNum);
        }
        else if (line.match(/^\s*(import|from)\s+/)) {
            // Import:
            imports.push(...latestComments);
            latestComments = [];
            imports.push(lineWithNum);
        }
        // We're only the new outermost if there is no current outermost:
        else if (line.match(/^\s*class\s+/) && outermostDefIndentLevel == -1) {
            classDefs.push(...latestComments.map((l) => ({...l, text: l.text.trimStart() + " ".repeat(indentLevel)})));
            latestComments = [];
            classDefs.push(...latestAssignments);
            latestAssignments = [];
            classDefs.push({...lineWithNum, text: line.trimStart()});
            outermostDefIndentLevel = indentLevel;
            curDefTypeIsClass = true;
        }
        else if (line.match(/^\s*def\s+/) && outermostDefIndentLevel == -1) {
            funcDefs.push(...latestComments.map((l) => ({...l, text: l.text.trimStart() + " ".repeat(indentLevel)})));
            latestComments = [];
            funcDefs.push(...latestAssignments);
            latestAssignments = [];
            funcDefs.push({...lineWithNum, text: line.trimStart()});
            outermostDefIndentLevel = indentLevel;
            curDefTypeIsClass = false;
        }
        else if (line.match(/^\s*#/)) {
            latestComments.push(lineWithNum);
        }
        else if (outermostDefIndentLevel >= 0) {
            // Keep adding to defs until we see a non-comment non-blank line with less or equal indent:
            (curDefTypeIsClass ? classDefs : funcDefs).push(...latestComments);
            latestComments = [];
            (curDefTypeIsClass ? classDefs : funcDefs).push({...lineWithNum, text: line.slice(outermostDefIndentLevel)});
        }
        // Does it look like an assignment:
        else if (line.match(/^\s*[A-Za-z_][A-Za-z0-9_.,\[\]()\s]*?(?<![!<>=:])=(?!=)/)) {
            if (main.length == 0) {
                latestAssignments.push(lineWithNum);
            }
            else {
                main.push(lineWithNum);
            }
        }
        else {
            const mainWasEmpty = main.length == 0;
            main.push(...latestComments);
            latestComments = [];
            // We don't push leading blanks to main (i.e. blank lines while main is empty), otherwise all the blanks before/between imports and defs end up there:
            if (line.trim() != "" || !mainWasEmpty) {
                if (latestAssignments.length > 0) {
                    if (mainWasEmpty && leadingAssignmentsGoInDefs) {
                        funcDefs.push(...latestAssignments);
                    }
                    else {
                        main.push(...latestAssignments);
                    }
                    latestAssignments = [];
                }
                main.push(lineWithNum);
            }
        }
    });
    // Add any trailing comments and assignments:
    if (main.length == 0 && leadingAssignmentsGoInDefs) {
        funcDefs.push(...latestAssignments);
    }
    else {
        main.push(...latestAssignments);
    }
    main.push(...latestComments);
    
    return {
        projectDoc: projectDoc.sort((a, b) => a.lineno - b.lineno).map((l) => l.text), 
        imports: imports.sort((a, b) => a.lineno - b.lineno).map((l) => l.text),
        funcDefs: funcDefs.sort((a, b) => a.lineno - b.lineno).map((l) => l.text),
        classDefs: classDefs.sort((a, b) => a.lineno - b.lineno).map((l) => l.text),
        main: main.sort((a, b) => a.lineno - b.lineno).map((l) => l.text),
        importsMapping : makeMapping(imports),
        funcDefsMapping : makeMapping(funcDefs),
        classDefsMapping : makeMapping(classDefs),
        mainMapping : makeMapping(main),
        headers: {} as Record<string, string>,
        format: "py",
    };
}

// Returns headers if successful, or null if there was an error (which will already have been shown in the UI)
export function pasteMixedPython(completeSource: string, at: CurrentFrame, clearExisting: boolean = false, dontSetCaretAfter: boolean = false, ignoreStateBackup: boolean = false) : { headers: Record<string, string> } | null {
    const allLines = completeSource.split(/\r?\n/);
    // Split can make an extra blank line at the end which we don't want:
    if (allLines.length > 0 && allLines[allLines.length - 1] === "") {
        allLines.pop();
    }
    // If we are clearing all, we are effectively pasting into the main section,
    // no matter where the frame cursor happens to be:
    const curLocation = clearExisting ? STRYPE_LOCATION.MAIN_CODE_SECTION : findCurrentStrypeLocation({lookForGivenFramePosition: at}).strypeLocation;
    const s = splitLinesToSections(allLines, curLocation == STRYPE_LOCATION.DEFS_SECTION || curLocation == STRYPE_LOCATION.IMPORTS_SECTION);


    let importFrames : CopiedFrames;
    let funcDefFrames : CopiedFrames;
    let classDefFrames : CopiedFrames;
    let mainFrames : CopiedFrames;
    let docFrames : CopiedFrames;
    try {
        importFrames = copyFramesFromParsedPython(s.imports, STRYPE_LOCATION.IMPORTS_SECTION, s.format, s.importsMapping);
        funcDefFrames = copyFramesFromParsedPython(s.funcDefs, STRYPE_LOCATION.DEFS_SECTION, s.format, s.funcDefsMapping);
        classDefFrames = copyFramesFromParsedPython(s.classDefs, STRYPE_LOCATION.DEFS_SECTION, s.format, s.classDefsMapping);
        // We may be trying to paste something inside a function defintion.
        // The "content" to paste is seen as if it was to paste in the main section,
        // however the rules are slightly different: we use the current location to decide
        // what container we should check the code against.
        const pastingSectionTarget = (curLocation == STRYPE_LOCATION.IN_FUNCDEF) ? STRYPE_LOCATION.IN_FUNCDEF : STRYPE_LOCATION.MAIN_CODE_SECTION;
        mainFrames = copyFramesFromParsedPython(s.main, pastingSectionTarget, s.format, s.mainMapping);
        docFrames = copyFramesFromParsedPython(s.projectDoc, STRYPE_LOCATION.PROJECT_DOC_SECTION, s.format, s.mainMapping);
    }
    catch (err : any) {
        const msg = cloneDeep(MessageDefinitions.InvalidPythonParseImport);
        const msgObj = msg.message as FormattedMessage;
        msgObj.args[FormattedMessageArgKeyValuePlaceholders.error.key] = msgObj.args.errorMsg.replace(FormattedMessageArgKeyValuePlaceholders.error.placeholderName, err?.message);

        useStore().showMessage(msg, 10000);
        return null;
    }
    if (clearExisting) {
        // Clear the current existing code (i.e. frames) of the editor
        useStore().clearAllFrames();
    }
    
    // The logic for pasting is: every frame that are allowed at the current cursor's position are added.
    // Frames that are related to another section where the caret is not present are added in that section.
    if (docFrames.docSlots) {
        const docFrame = useStore().frameObjects[projectDocumentationFrameId] as FrameObject;
        docFrame.labelSlotsDict[0].slotStructures = docFrames.docSlots;
    }
    
    let posAfter = at;
    // Set to true if the main-code paste was rejected by insertFramesAtPosition (e.g. pasting a
    // joint frame like "else" at a position where it wouldn't form legal code).  Only mainFrames
    // can trigger this: imports/classDefs/funcDefs are never joint frames themselves, and a joint
    // frame pasted without its parent if/try can only ever land in mainFrames (see
    // splitLinesToSections), so insertFramesAtPosition's non-joint branch -- which never rejects --
    // is the only one those three other groups can hit. In that case the frames were never
    // actually added to the store, so we must not treat them as pasted below.
    let pasteRejected = false;

    // The rule for cursor positions for pasting in other sections is the point closest to the frame cursor;
    // see individual comments below

    if (importFrames.frameIds.length > 0) {
        const currentCaretContainerPosition = (curLocation == STRYPE_LOCATION.IMPORTS_SECTION)
            ? {...at}
            // If we're not in the imports, we know we're below it:
            : getLastCaretPosInsideParent(useStore().getImportsFrameContainerId);
        offsetAllIds(importFrames, useStore().nextAvailableId);
        const adjusted = useStore().insertFramesAtPosition({target: currentCaretContainerPosition, sourceFrames: importFrames, ignoreStateBackup});
        if (curLocation == STRYPE_LOCATION.IMPORTS_SECTION) {
            posAfter = adjusted ?? posAfter;
        }
    }
    if (classDefFrames.frameIds.length > 0) {
        let currentCaretContainerPosition: { id: number; caretPosition: CaretPosition };
        if (curLocation == STRYPE_LOCATION.DEFS_SECTION) {
            currentCaretContainerPosition = {...at};
        }
        else if (curLocation == STRYPE_LOCATION.IMPORTS_SECTION || curLocation == STRYPE_LOCATION.IN_FUNCDEF || curLocation == STRYPE_LOCATION.IN_CLASSDEF) {
            // Closest to imports is top of defs:
            // And for defs... we could find the closest cursor in the defs but it's quite fiddly so let's just add at the beginning:
            currentCaretContainerPosition = {id: useStore().getDefsFrameContainerId, caretPosition: CaretPosition.body};
        }
        else {
            // We are in main, use the bottom:
            currentCaretContainerPosition = getLastCaretPosInsideParent(useStore().getDefsFrameContainerId);
        }
        offsetAllIds(classDefFrames, useStore().nextAvailableId);
        const adjusted = useStore().insertFramesAtPosition({target: currentCaretContainerPosition, sourceFrames: classDefFrames, ignoreStateBackup});
        if (curLocation == STRYPE_LOCATION.DEFS_SECTION) {
            posAfter = adjusted ?? posAfter;
            // Adjust in case we also paste more in the defs:
            at = adjusted ?? at;
        }

    }
    if (funcDefFrames.frameIds.length > 0) {
        let currentCaretContainerPosition: { id: number; caretPosition: CaretPosition };
        if (curLocation == STRYPE_LOCATION.DEFS_SECTION || curLocation == STRYPE_LOCATION.IN_CLASSDEF) {
            currentCaretContainerPosition = {...at};
        }
        else if (curLocation == STRYPE_LOCATION.IMPORTS_SECTION || curLocation == STRYPE_LOCATION.IN_FUNCDEF) {
            // Closest to imports is top of defs:
            // And for defs... we could find the closest cursor in the defs but it's quite fiddly so let's just add at the beginning:
            currentCaretContainerPosition = {id: useStore().getDefsFrameContainerId, caretPosition: CaretPosition.body};
        }
        else {
            // We are in main, use the bottom:
            currentCaretContainerPosition = getLastCaretPosInsideParent(useStore().getDefsFrameContainerId);
        }
        offsetAllIds(funcDefFrames, useStore().nextAvailableId);
        // There is one awkward case.  If we copy a function from a class, it gets copied as "def foo(self)"
        // because the user might be pasting it externally.  But when we paste back in to Strype, because we add self
        // automatically, the function becomes "def foo(self, self)".  We strip it whether we're pasting into a class
        // (where we add self automatically) or as a top-level function (where a leading "self" almost certainly came
        // from copying a method, and doesn't belong on a plain function either way):
        Object.values(funcDefFrames.frames).forEach((frame: FrameObject) => {
            if (frame.frameType.type == AllFrameTypesIdentifier.funcdef) {
                const params = frame.labelSlotsDict[1];
                // We have to spot it by name as it may be a plain function:
                if (isFieldBaseSlot(params.slotStructures.fields[0]) && params.slotStructures.fields[0].code === "self") {
                    removeFirstFuncParam(params);
                }
            }
        });

        const adjusted = useStore().insertFramesAtPosition({target: currentCaretContainerPosition, sourceFrames: funcDefFrames, ignoreStateBackup});
        if (curLocation == STRYPE_LOCATION.DEFS_SECTION || curLocation == STRYPE_LOCATION.IN_CLASSDEF) {
            posAfter = adjusted ?? posAfter;
        }
    }
    if (mainFrames.frameIds.length > 0) {
        // If we're not in the main section, closest cursor will be the top:
        const currentCaretContainerPosition = (curLocation == STRYPE_LOCATION.IN_FUNCDEF || curLocation == STRYPE_LOCATION.MAIN_CODE_SECTION)
            ? {...at}
            : {id : useStore().getMainCodeFrameContainerId, caretPosition: CaretPosition.body};
        offsetAllIds(mainFrames, useStore().nextAvailableId);
        const adjusted = useStore().insertFramesAtPosition({target: currentCaretContainerPosition, sourceFrames: mainFrames, ignoreStateBackup});
        if (adjusted == null) {
            pasteRejected = true;
            // Nothing was actually inserted, so make sure it's not treated as pasted below:
            mainFrames.frames = {};
        }
        else if (curLocation == STRYPE_LOCATION.IN_FUNCDEF || curLocation == STRYPE_LOCATION.MAIN_CODE_SECTION) {
            posAfter = adjusted;
        }
    }
    if (pasteRejected) {
        useStore().showMessage(MessageDefinitions.ForbiddenFramePaste, 10000);
    }
    if (!dontSetCaretAfter) {
        useStore().setCurrentFrame(posAfter, true);
    }
    const framesAdded = [
        Object.keys(importFrames.frames),
        Object.keys(classDefFrames.frames),
        Object.keys(funcDefFrames.frames),
        Object.keys(mainFrames.frames),
    ].flat().map(Number);
    void nextTick(() => {
        eventBus.emit(CustomEventTypes.updateParamPrompts, framesAdded);
        framesAdded.forEach((pastedFrameId) => checkCodeErrors(pastedFrameId));
    });
    
    return {headers: s.headers};
}

const transformTripleQuotesStrings = (slots: {[index: number]: LabelSlotsContent}): void => {
    // This helper function replaces all strings content in slots that came up from parsing triple quotes strings literals.
    // It keeps the single or double quote string token (resulting from the parsing) and deletes the remaining 2 extra quotes on each ends
    // of the string literal. It also replaces line breaks by literal "\n".
    const doTransformTripleQuotesStringsOnSlotStructs = (slotsStruct: SlotsStructure) => {
        slotsStruct.fields.forEach((fieldSlot) => {
            if(isFieldBracketedSlot(fieldSlot)){
                // Bracket slots have a deeper level, we need to check inside
                doTransformTripleQuotesStringsOnSlotStructs(fieldSlot);
            }
            else if(isFieldStringSlot(fieldSlot)){
                // A string: we check if it has been generated from a triple quotes string parsing
                const stringSlotLiteralValue = fieldSlot.code;
                if((fieldSlot.quote == "'" && parsedTripleSingleQuotesStrRegex.test(stringSlotLiteralValue)) 
                    || (fieldSlot.quote == "\"" && parsedTripleDoubleQuotesStrRegex.test(stringSlotLiteralValue))){
                    fieldSlot.code = stringSlotLiteralValue.slice(2, -2).replaceAll(/\r?\n/g, STRYPE_DOC_NEWLINE);
                }
            }
            // Else, there is nothing to transform
        });
        
    };
    Object.values(slots).forEach((slotsStruct) => doTransformTripleQuotesStringsOnSlotStructs(slotsStruct.slotStructures));
};

