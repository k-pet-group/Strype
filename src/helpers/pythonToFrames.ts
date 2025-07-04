import {AllFrameTypesIdentifier, BaseSlot, CaretPosition, ContainerTypesIdentifiers, EditorFrameObjects, FrameObject, getFrameDefType, isFieldBaseSlot, isFieldBracketedSlot, isFieldStringSlot, LabelSlotsContent, SlotsStructure, StringSlot, MessageDefinitions, FormattedMessage, FormattedMessageArgKeyValuePlaceholders} from "@/types/types";
import {useStore} from "@/store/store";
import {getCaretContainerComponent, getFrameComponent, operators, trimmedKeywordOperators} from "@/helpers/editor";
import i18n from "@/i18n";
import {cloneDeep, escapeRegExp} from "lodash";
import {AppName, AppSPYPrefix} from "@/main";
import {toUnicodeEscapes} from "@/parser/parser";
import FrameContainer from "@/components/FrameContainer.vue";

const TOP_LEVEL_TEMP_ID = -999;

const parsedTripleQuotesStrRegex = /^''.*''$/s;

// Type for the things we get from the Skulpt parser:
export interface ParsedConcreteTree {
    type: number;
    value: null | string;
    lineno? : number;
    //col_offset?: number;  -- Don't use this as it seems to have surprising values
    children: null | ParsedConcreteTree[];
}
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
    lineNumberToIndentation: Map<number, string>; // Maps a line number to a string of indentation
    isSPY: boolean;
}

// Declare Skulpt:
declare const Sk: any;

// The different "locations" in Strype 
export enum STRYPE_LOCATION {
    UNKNOWN,
    MAIN_CODE_SECTION,
    IN_FUNCDEF,
    FUNCDEF_SECTION,
    IMPORTS_SECTION
}

// Copies nextId and lastLineProcessed from src to dest
function updateFrom(dest : CopyState, src : CopyState) {
    dest.nextId = src.nextId;
    dest.lastLineProcessed = src.lastLineProcessed;
}

// Simplifies a tree (by collapsing all single-child nodes into the child) in order to make
// it easier to read while debugging error messages
function debugToString(p : ParsedConcreteTree, curIndent: string) : string {
    let s = curIndent + (Sk.ParseTables.number2symbol[p.type] || ("#" + p.type));
    if (p.value) {
        s += " {{" + p.value + "}}";
    }
    if (p.children != null && p.children.length > 0) {
        s += ":\n";
        for (const child of p.children) {
            s += debugToString(child, curIndent + "  ");
        }
        return s;
    }
    else {
        return s + "\n";
    }
}

// Given a frame, assigns it a new ID and adds it to the list specified in the CopyState
// If it is not a joint frame, set its parent.
function addFrame(frame: FrameObject, lineno: number | undefined, s: CopyState) : CopyState {
    const id = s.nextId;
    frame.id = id;
    s.loadedFrames[id] = frame;
    frame.isDisabled = lineno != undefined && s.disabledLines.includes(lineno);
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
    // with a single quote token, starting and ending by <''>.
    // If such slot is found in SPY or, for Python, is inside a function call frame that ONLY contains it
    // (i.e. empty slots on the sides and empty operators between) then we transform the frame to a multi lines comment frame.
    // Otherwise, for Python only since SPY wouldn't have that situation, we fix the quotes by removing the extra quotes inside
    // the literal, and replace all line breaks by explicit line break indications ("\\n").
    if(type == AllFrameTypesIdentifier.funccall && slots[0].slotStructures.fields.length == 3 
        && isFieldStringSlot(slots[0].slotStructures.fields[1]) 
        && slots[0].slotStructures.fields[1].quote == "'"
        && parsedTripleQuotesStrRegex.test(slots[0].slotStructures.fields[1].code)
        && isFieldBaseSlot(slots[0].slotStructures.fields[0]) && isFieldBaseSlot(slots[0].slotStructures.fields[2])
        && (slots[0].slotStructures.fields[0] as BaseSlot).code.length == 0 && (slots[0].slotStructures.fields[2] as BaseSlot).code.length == 0
    ){
        // A multilines comment is detected, we transform the frame.
        const stringFieldContent = (slots[0].slotStructures.fields[1] as BaseSlot).code;
        slots[0].slotStructures.fields.splice(0, 3, {code: stringFieldContent.slice(2,-2)});
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
        isCollapsed: false,
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

function parseWithSkulpt(codeLines: string[], mapErrorLineno : (lineno : number) => number) : string | { parseTree: any, addedFakeJoinParent: number } {
    // Special case: things beginning with joint frames (else, elif, except, finally) are
    // not parsed by Skulpt as-is (because they lack the main construct before), but we
    // would like to support parsing them.  So we look for them and try gluing on
    // the mandatory first part (if, try) then if the only parsed thing is the single compound
    // frame (because we don't want to allow else, then some other arbitrary frames)
    // then we take off the head and keep the rest.

    // 0 if we added none, 1 if we added only a parent, 2 if we add a parent and an initial join:
    let addedFakeJoinParent = 0;
    // So, find first word of first non-blank line:
    const firstNonBlank = codeLines.find((l) => l.trim() != "");
    if (firstNonBlank) {
        const leadingIndent = firstNonBlank.replace(/[^ ].*/, "");
        const firstWord = firstNonBlank.replace(/[^a-z].*/, "").trim();
        switch(firstWord) {
        case "elif":
            // We glue an if on:
            codeLines.unshift(leadingIndent + "if True:\n", leadingIndent + "    pass\n");
            addedFakeJoinParent = 1;
            break;
        // So else can actually be with "if" or "try".  We take advantage of the fact that if it's with
        // "if", nothing valid can follow an else.  So it will always be the last item.  With "try"
        // that's not the case.  But if we always glue a "try" on the front, it will work for the solitary-else
        // case for "if", and it will work with "try".  So we do that:
        case "else":
        case "except":
        case "finally":
            // We glue a try on.  We must also glue on an except, because actually "else" is only valid if it follows an "except",
            // and all three are valid to follow a try/except.
            codeLines.unshift(leadingIndent + "try:\n", leadingIndent + "    pass\n", leadingIndent + "except:\n", leadingIndent + "    pass\n");
            addedFakeJoinParent = 2;
            break;
        }
    }
        
    // Have to configure Skulpt even though we're only using it for parsing:
    Sk.configure({});
    let parsed;
    try {
        parsed = Sk.parse("pasted_content.py", codeLines.join("\n"));
    }
    catch (e) {
        return ((e as any).$offset?.v?.[2]?.$mangled ?? (e as any).$msg?.$mangled) + " line: " + mapErrorLineno((e as any).traceback?.[0].lineno);
    }
    return {parseTree: parsed["cst"], addedFakeJoinParent: addedFakeJoinParent};
}

// Gets the leading indent of a string
function getIndent(codeLine: string) {
    return (codeLine.match(/^\s*/) as RegExpMatchArray)[0];
}

const STRYPE_COMMENT_PREFIX = "___strype_comment_";
const STRYPE_LIBRARY_PREFIX = "___strype_library_";

const STRYPE_WHOLE_LINE_BLANK = "___strype_whole_line_blank";

export const STRYPE_DUMMY_FIELD = "___strype_dummy";

// Special things in expressions:
export const STRYPE_EXPRESSION_BLANK = "___strype_blank";
// Followed by unicode escapes:
export const STRYPE_INVALID_SLOT = "___strype_invalid_";

export const STRYPE_INVALID_OPS_WRAPPER = "___strype_opsinvalid";
export const STRYPE_INVALID_OP = "___strype_operator_";

function transformCommentsAndBlanks(codeLines: string[], format: "py" | "spy") : {disabledLines : number[], transformedLines : string[], strypeDirectives: Map<string, string>} { 
    codeLines = [...codeLines];
    const disabledLines : number[] = [];
    const transformedLines : string[] = [];
    const strypeDirectives: Map<string, string> = new Map<string, string>();

    // A reference to the lines containing a comment block (that is, consecutive comment lines), see inline-method below for details.
    const aCommentBlockLines: number[] = [];
    const checkRearrangeCommentsIdent = () => {
        // When the parser have reached a line that is past a block of comments, we need to see if the comments of this block
        // are indented "properly": in Python, comments can be indented anyhow, but since we transform them for Skulpt, any indentation that is not
        // following the Python indentation rule would be seen as an error by Skulpt.
        // The logic is: 
        // - if there is no line before the comments (they are at the start of the code) the indent is 0.
        // - if there is no line after the comments (they are at then end of the code), we indent the block as before or leave it to 0 if it was (and all others).
        // - if lines before and after the comments are with the same indentation: we change the comments' indentation for the same
        // - if the line before the comments has a different indent than the line after, we indent the block as after.
        if(aCommentBlockLines.length == 0){
            // There is no comment to check, we can just return
            return;
        }
        if (format == "spy") {
            // SPYs are assumed to have the comments exactly where they should be, so we don't rearrange:
            return;
        }

        const commentBlockStartLineIndex = aCommentBlockLines[0], commentBlockEndLineIndex = aCommentBlockLines[aCommentBlockLines.length - 1];
        let hasZeroIndent = false;     
        const subrange = transformedLines.slice(commentBlockStartLineIndex, commentBlockEndLineIndex + 1).map((line) => {
            if(commentBlockStartLineIndex == 0){
                return line.trimStart();
            }
            else{
                const indentBefore = /^(\s*).*$/.exec(transformedLines[commentBlockStartLineIndex - 1])?.[1]??"";
                if(commentBlockEndLineIndex == transformedLines.length - 1){
                    hasZeroIndent ||= (/^\s.*$/.exec(line)==null);
                    return (hasZeroIndent ? "" : indentBefore) + line.trimStart();
                }
                else{
                    const indentAfter = /^(\s*).*$/.exec(transformedLines[commentBlockEndLineIndex + 1])?.[1]??"";
                    return indentAfter + line.trimStart();
                }
            }
        });
        transformedLines.splice(commentBlockStartLineIndex, subrange.length , ...subrange);

        // Clear the comment block reference
        aCommentBlockLines.splice(0);
    };

    // Skulpt doesn't preserve blanks or comments so we must find them and transform
    // them into something that does parse.
    // Note that we do not worry about blank spaces inside triple quotes strings: Skulpt won't remove them, 
    // we need to preserve them, so we also need to know when we are inside a triple quotes string.
    // Find all comments.  This isn't quite perfect (with respect to # in strings and triple quotes tokens) but it will do:
    let mostRecentIndent = "", singleIndentLength = 0, isParsingTripleQuotesStr = false;
    for (let i = 0; i < codeLines.length; i++) {
        // Look for # with only space before them, or a # with no quote after (if we are not in the context of a multlines comment):
        const match = /^( *)#(.*)$/.exec(codeLines[i]) ?? /^([^#]*)#([^"]+)$/.exec(codeLines[i]);
        if (match && !isParsingTripleQuotesStr) {
            const directiveMatch = new RegExp("^ *#" + escapeRegExp(AppSPYPrefix) + "([^:]+):(.*)$").exec(codeLines[i]);
            if (directiveMatch) {
                // By default, directives are just added to the map:
                // Note we trim() keys but not values; space may well be important in values:
                const key = directiveMatch[1].trim();
                const value = directiveMatch[2];
                if (key == "Disabled") {
                    // Process line again:
                    codeLines[i] = match[1] + value;
                    disabledLines.push(i+1);
                    i -= 1;
                    continue;
                }
                else if (key == "Library" || key == "LibraryDisabled") {
                    transformedLines.push(match[1] + STRYPE_LIBRARY_PREFIX + toUnicodeEscapes(value));
                    // We know this is only whitespace because directiveMatch also matched:
                    mostRecentIndent = match[1];
                    if (key == "LibraryDisabled") {
                        disabledLines.push(i+1);
                    }
                }
                else {
                    strypeDirectives.set(key, value);
                    // Push a blank to make line numbers match:
                    transformedLines.push("");
                    mostRecentIndent = "";
                }
            }
            else {
                if (match[1].trim() == "") {
                    // Just a single line comment:
                    transformedLines.push(match[1] + STRYPE_COMMENT_PREFIX + toUnicodeEscapes(match[2]));
                    mostRecentIndent = match[1];
                    aCommentBlockLines.push(transformedLines.length-1);
                }
                else {
                    // Code followed by comment, put comment on next line:
                    mostRecentIndent = getIndent(match[1]);
                    transformedLines.push(match[1]);
                    checkRearrangeCommentsIdent();
                    transformedLines.push(mostRecentIndent + STRYPE_COMMENT_PREFIX + toUnicodeEscapes(match[2]));
                }
            }
        }
        else if (codeLines[i].trim() === "" && !isParsingTripleQuotesStr) {
            // Blank line:
            // We indent this to the largest of its indent,
            // and the (smallest of the indent before us and the indent after us).
            let nextIndent = "";
            for (let j = i + 1; j < codeLines.length; j++) {
                if (codeLines[j].trim() != "") {
                    nextIndent = getIndent(codeLines[j]);
                    break;
                }
            }
            const smallestAdjIndent = mostRecentIndent.length <= nextIndent.length ? mostRecentIndent : nextIndent;
            if (codeLines[i].length > smallestAdjIndent.length) {
                transformedLines.push(codeLines[i] + STRYPE_WHOLE_LINE_BLANK);
            }
            else {
                transformedLines.push(smallestAdjIndent + STRYPE_WHOLE_LINE_BLANK);
            }
            checkRearrangeCommentsIdent();
        }
        else if(codeLines[i].trim().includes("'''")){
            // A triple quotes string is at the start of the line, we don't know if it is actually a 
            // "normal" string or a comment, but we care about that later when we put things in frames.
            // For the moment we just try to see if the current line is hangs a triple quotes string
            // literal "started", so we can flag it out; and we arrange the indentation as such:
            // 1) if the line doesn't start with ''' we align the comment at the current mostRecentIndent 
            // or 2) if it's a multiple of the indent unit length we keep it and update the most recent indent,
            // otherwise we take a guess where to start the string literal to the closest indentation..
            const nbTripleQuotesTokens  = (/(?<!\\)'''/gs.exec(codeLines[i])?.length)??0;
            let transformedLine = "";
            if(!isParsingTripleQuotesStr){
                // A string literal starts on that line, we check what indentation to use mentioned above.
                if(codeLines[i].trimStart().startsWith("'''")) {
                    const blanksAtStart = codeLines[i].slice(0, codeLines[i].indexOf("'''"));
                    if(singleIndentLength == 0 || (blanksAtStart.length % singleIndentLength) == 0) {
                        mostRecentIndent = blanksAtStart;
                        transformedLine = codeLines[i];    
                    }                    
                    else{
                        mostRecentIndent = mostRecentIndent.charAt(0).repeat(Math.round(blanksAtStart.length / singleIndentLength) * singleIndentLength);
                        transformedLine = mostRecentIndent + codeLines[i].trimStart();
                    }
                }
                else{
                    // we can leave at it is as we don't know the context.
                    transformedLine = codeLines[i];
                }
            }
            else{
                transformedLine = codeLines[i];
            }

            if(nbTripleQuotesTokens % 2 != 0){
                isParsingTripleQuotesStr = !isParsingTripleQuotesStr;
            }
            transformedLines.push(transformedLine);
        }
        else {
            // Any other valid code, except if we are in the context of triple quotes strings: we keep the line as is.
            if(isParsingTripleQuotesStr){
                transformedLines.push(codeLines[i]);
            }
            else {
                transformedLines.push(codeLines[i].trimEnd());
                mostRecentIndent = getIndent(codeLines[i].trimEnd());
                checkRearrangeCommentsIdent();            
            }
        }

        // Update the indentation "unit" length: that is the length of 1 indentation (like 4 for "   ").
        if(singleIndentLength == 0 && mostRecentIndent.length > 0) {
            singleIndentLength = mostRecentIndent.length;
        }
    }
    // We might have comments at the end of the code, so we need to check their indentation:
    checkRearrangeCommentsIdent();

    return { disabledLines, transformedLines, strypeDirectives };
}

// The main entry point to this module.  Given a string of Python code that the user
// has pasted in, copy it to the store's copiedFrames/copiedSelectionFrameIds fields,
// ready to be pasted immediately afterwards.
// If successful, returns a map with key-value Strype directives.  If unsuccessful, returns a string with some info about
// where the Python parse failed.
export function copyFramesFromParsedPython(codeLines: string[], currentStrypeLocation: STRYPE_LOCATION, format: "py" | "spy", linenoMapping?: Record<number, number>) : string | null | Map<string, string> {
    const mapLineno = (lineno : number) : number => linenoMapping ? linenoMapping[lineno] : lineno;
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
    // Now remove that indent if it exists, and record remaining indent:
    for (let i = 0; i < codeLines.length; i++) {
        codeLines[i] = codeLines[i].slice(lowestIndent);
        indents.set(i + 1, getIndent(codeLines[i]));
    }

    const transformed = transformCommentsAndBlanks(codeLines, format);
    const parsedBySkulpt = parseWithSkulpt(transformed.transformedLines, mapLineno);
    if (typeof parsedBySkulpt === "string") {
        return parsedBySkulpt;
    }
    const addedFakeJoinParent = parsedBySkulpt.addedFakeJoinParent;

    useStore().copiedFrames = {};
    useStore().copiedSelectionFrameIds = [];
    try {
        // Use the next available ID to avoid clashing with any existing IDs:
        copyFramesFromPython(parsedBySkulpt.parseTree, {nextId: useStore().nextAvailableId, addToNonJoint: useStore().copiedSelectionFrameIds, addToJoint: undefined, loadedFrames: useStore().copiedFrames, disabledLines: transformed.disabledLines, parent: null, jointParent: null, lastLineProcessed: 0, lineNumberToIndentation: indents, isSPY: transformed.strypeDirectives.size > 0});
        // At this stage, we can make a sanity check that we can copy the given Python code in the current position in Strype (for example, no "import" in a function definition section)
        if(!canPastePythonAtStrypeLocation(currentStrypeLocation)){
            useStore().copiedFrames = {};
            useStore().copiedSelectionFrameIds = [];
            return i18n.t("messageBannerMessage.incompatiblePythonStrypeSection") as string;
        }

        if (addedFakeJoinParent > 0) {
            // Now have to detach that parent again.  If it was joint frames only, there should be one parent on the list:
            if (useStore().copiedSelectionFrameIds.length == 1) {
                // Clone the list to avoid modification issues:
                useStore().copiedSelectionFrameIds = [...useStore().copiedFrames[useStore().copiedSelectionFrameIds[0]].jointFrameIds.slice(addedFakeJoinParent - 1)];
            }
            else {
                // Uh-oh, they had other things after the else, etc.  We can't handle that, so abandon:
                useStore().copiedFrames = {};
                useStore().copiedSelectionFrameIds = [];
                return i18n.t("messageBannerMessage.wrongPythonStructCopied") as string;
            }
        }
        return null;
    }
    catch (e) {
        console.log(e); // + "On:\n" + debugToString(parsedBySkulpt, "  "));
        // Don't leave partial content:
        useStore().copiedFrames = {};
        useStore().copiedSelectionFrameIds = [];
        return ((e as any).$offset?.v?.[2]?.$mangled ?? (e as any).$msg?.$mangled) + " line: " + mapLineno((e as any).traceback?.[0].lineno);
    }
}

// Concatenates two slot structures with the given operator.
// Eliminates any redundant blank operators.
function concatSlots(lhs: SlotsStructure, operator: string, rhs: SlotsStructure) : SlotsStructure {
    const joined = {fields: [...lhs.fields, ...rhs.fields], operators: [...lhs.operators, {code: operator}, ...rhs.operators]};
    // Eliminate any redundant blank operators (i.e. those where the RHS or RHS is a non-bracketed blank:
    for (let i = 0; i < joined.operators.length; i++) {
        if (joined.operators[i].code === "") {
            // Check LHS and RHS:
            if (isFieldBaseSlot(joined.fields[i])  && isFieldBaseSlot(joined.fields[i+1])) {
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

// Dig down the tree and find the actual value.  Skips down through
// all parents with a single child.  If there is no value or no children,
// an error will be thrown.  This shouldn't happen for the items we are
// calling it on (operators, numeric literals).
function digValue(p : ParsedConcreteTree) : string {
    if (p.value) {
        return p.value;
    }
    else if (p.children == null) {
        throw new Error("Node with no value and no children");
    }
    else if (p.children.length == 1) {
        return digValue(p.children[0]);
    }
    else if (p.type == Sk.ParseTables.sym.comp_op && p.children.length == 2) {
        // "is not" and "not in" show up as this type, with two children:
        return digValue(p.children[0]) + " " + digValue(p.children[1]);
    }
    else {
        throw new Error("Can't find single value in:\n" + debugToString(p, "  "));
    }
}

// The state while parsing a long expression with multiple operands and operators:
interface ParseState {
    seq: ParsedConcreteTree[];
    nextIndex: number;
}

// The index of ParseState will be modified in the given item:
function parseNextTerm(ps : ParseState) : SlotsStructure {
    // Check for unary operator:
    const nextVal = ps.seq[ps.nextIndex].value;
    if (nextVal === "-" || nextVal === "+") {
        // Unary numbers just go in their own field:
        try {
            const valAfterThat = digValue(ps.seq[ps.nextIndex + 1]);
            if (/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(valAfterThat)) {
                ps.nextIndex += 2;
                return {fields: [{code: nextVal + valAfterThat}], operators: []};
            }
        }
        catch (e) {
            // Not an integer then...
        }
        
        ps.nextIndex += 1;
        return concatSlots({fields: [{code: ""}], operators: []}, nextVal, parseNextTerm(ps));
    }
    if (nextVal === "not" || nextVal === ":") {
        ps.nextIndex += 1;
        return concatSlots({fields: [{code: ""}], operators: []}, nextVal, parseNextTerm(ps));
    }
    const term = ps.seq[ps.nextIndex];
    ps.nextIndex += 1;
    return toSlots(term);
}

function replaceMediaLiteralsAndInvalidOps(s : SlotsStructure) : SlotsStructure {
    // We descend the tree, looking for the pattern:
    // <ident>(<string>)
    // and then check the ident and string
    
    // Note: we don't bother with last field because it can't be followed by brackets
    for (let i = 0; i < s.fields.length - 1; i++) {
        const curField = s.fields[i];
        const sub = s.fields[i + 1];
        if (isFieldBaseSlot(curField)
            && s.operators[i].code === ""
            && isFieldBracketedSlot(sub)) {
            const funcCall = curField.code;
            let replaced = false;
            if (["load_image", "load_sound"].includes(funcCall)) {
                // Check the bracket is just a string literal, which will have two blanks either side:
                if (sub.fields.length == 3
                    && sub.openingBracketValue == "("
                    && isFieldBaseSlot(sub.fields[0]) && !(sub.fields[0] as BaseSlot).code
                    && !sub.operators[0].code
                    && isFieldStringSlot(sub.fields[1])
                    && !sub.operators[1].code
                    && isFieldBaseSlot(sub.fields[2]) && !(sub.fields[2] as BaseSlot).code) {

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
                            if (isFieldBaseSlot(opField) && opField.code.startsWith(STRYPE_INVALID_OP)) {
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
                        if (isFieldBaseSlot(cur) && cur.code === ""
                            && isFieldBaseSlot(next) && next.code === ""
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
                    s.operators.splice(i - 1, 0, {code: ""});
                    s.fields.splice(i, 0, {code: ""});
                }
            }
        }
        // We don't descend because toSlots already calls us on any compound slot
    }
    return s;
}

export function fromUnicodeEscapes(input: string): string {
    const regex = /u([0-9a-fA-F]{4})/g;
    return input.replace(regex, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function toSlots(p: ParsedConcreteTree) : SlotsStructure {
    // Handle terminal nodes by just plonking them into a single-field slot:
    if (p.children == null || p.children.length == 0) {
        let val = p.value ?? "";
        if (val.startsWith("\"") || val.startsWith("'")) {
            const str : StringSlot = {code: val.slice(1, val.length - 1), quote: val.slice(0, 1)};
            return {fields: [{code: ""}, str, {code: ""}], operators: [{code: ""}, {code: ""}]};
        }
        else {
            if (val == STRYPE_EXPRESSION_BLANK) {
                val = "";
            }
            else if (val.startsWith(STRYPE_INVALID_SLOT)) {
                val = fromUnicodeEscapes(val.slice(STRYPE_INVALID_SLOT.length));
            }
            return {fields: [{code: val}], operators: []};
        }
    }
    
    // Skulpt's parser seems to output a huge amount of dummy nodes with one child,
    // e.g. an OR inside an AND.  We have a catch-all that just descends if there's only one child:
    if (p.children.length == 1) {
        return toSlots(p.children[0]);
    }

    // Check for brackets:
    if (p.children[0].value === "(" || p.children[0].value === "[" || p.children[0].value === "{") {
        const bracketed =  toSlots({...p, children: p.children.slice(1, p.children.length - 1)});
        // For parameters, we drop the brackets and keep the content:
        if (p.type == Sk.ParseTables.sym.parameters) {
            return bracketed;
        }
        // Bracketed items must be surrounded by empty slot and empty operator each side:
        return {fields: [{code: ""},{...bracketed, openingBracketValue: p.children[0].value}, {code: ""}], operators: [{code: ""}, {code: ""}]};
    }

    const ps = {seq: p.children, nextIndex: 0};
    let latest = parseNextTerm(ps);
    while (ps.nextIndex < p.children.length) {
        const child = p.children[ps.nextIndex];
        if (child.type === Sk.ParseTables.sym.trailer) {
            // A suffix, like an array index lookup.  Join it and move forward only by one:
            const grandchildren = child.children;
            if (grandchildren != null && grandchildren[0].value === ".") {
                latest = concatSlots(latest, ".", toSlots(grandchildren[1]));
            }
            else {
                // Something bracketed:
                latest = concatSlots(latest, "", toSlots(child));
            }
            ps.nextIndex += 1;
            continue;
        }
        // Now we expect a binary operator:        
        let op;
        try {
            op = digValue(child);
            ps.nextIndex += 1;
        }
        catch (err) {
            throw new Error("Cannot find operator " + ps.nextIndex + " in:\n" + debugToString(p, ""), {cause: err});
        }
        if (op != null && (operators.includes(op) || trimmedKeywordOperators.includes(op))) {
            if (op == ":" && ps.nextIndex == ps.seq.length) {
                // Can be blank on RHS of colon
                latest = concatSlots(latest, op, {fields: [{code: ""}], operators: []});
            }
            else {
                latest = concatSlots(latest, op, parseNextTerm(ps));
            }
        }
        else {
            throw new Sk.builtin.SyntaxError("Unknown operator: " + child.type + " \"" + op + "\"", null, p.lineno);
        }
    }
    return replaceMediaLiteralsAndInvalidOps(latest);
}

// Get the children of the node, and throw an error if they are null.  This
// should never happen, but if we use p.children then Typescript complains everywhere
// that it could be null, whereas children(p) satisfies Typescript and gives a useful
// error if it does turn out to be null.
function children(p : ParsedConcreteTree) : ParsedConcreteTree[] {
    if (p.children == null) {
        throw new Error("Null children on node " + JSON.stringify(p));
    }
    return p.children;
}

// Given an index into the children (or a sequence of indexes), apply that and get the appropriate child.
function applyIndex(p : ParsedConcreteTree, index: number | number[]) : ParsedConcreteTree {
    if (typeof(index) === "number") {
        return children(p)[index];
    }
    else {
        const initial = index[0];
        const rest = index.slice(1);
        return applyIndex(children(p)[initial], rest.length == 1 ? rest[0] : rest);
    }
}

// Make a frame using the given frame type, the given index/indices of p's children for the slots,
function getRealLineNo(p: ParsedConcreteTree) : number | undefined {
    if (p.type == Sk.ParseTables.sym.suite) {
        // I don't really understand what this item is (it seems to have the raw content as extra children),
        // but it seems if we ignore these extra children we can proceed and it will all work:
        for (const child of children(p)) {
            if (child.type > 250) { // Only count the non-expression nodes
                return child.lineno;
            }
        }
    }
    return p.lineno;
}

// the given index for the body, and call addFrame on it.
function makeAndAddFrameWithBody(p: ParsedConcreteTree, frameType: string, keywordIndexForLineno: number, childrenIndicesForSlots: (number | number[])[], childIndexForBody: number, s : CopyState) : {s: CopyState, frame: FrameObject} {
    const slots : { [index: number]: LabelSlotsContent} = {};
    for (let slotIndex = 0; slotIndex < childrenIndicesForSlots.length; slotIndex++) {
        slots[slotIndex] = {slotStructures : toSlots(applyIndex(p, childrenIndicesForSlots[slotIndex]))};
    }
    const frame = makeFrame(frameType, slots, s.isSPY);    
    s = addFrame(frame, applyIndex(p, keywordIndexForLineno).lineno, s);
    const frameChildren = children(p);
    const afterChild = copyFramesFromPython(frameChildren[childIndexForBody], {...s, addToNonJoint: frame.childrenIds, addToJoint: undefined, parent: frame});
    s = {...s, nextId: afterChild.nextId, lastLineProcessed: afterChild.lastLineProcessed};
    return {s: s, frame: frame};
}

// Process the given node in the tree at the current point designed by CopyState
// Returns a copy state, including the frame ID of the next insertion point for any following statements
function copyFramesFromPython(p: ParsedConcreteTree, s : CopyState) : CopyState {
    //console.log("Processing type: " + (Sk.ParseTables.number2symbol[p.type] || ("#" + p.type)));
        
    switch (p.type) {
    case Sk.ParseTables.sym.file_input:
        // The outer wrapper for the whole file, just dig in:
        for (const child of children(p)) {
            s = copyFramesFromPython(child, s);
        }
        break;
    case Sk.ParseTables.sym.stmt:
    case Sk.ParseTables.sym.simple_stmt:
    case Sk.ParseTables.sym.small_stmt:
    case Sk.ParseTables.sym.flow_stmt:
    case Sk.ParseTables.sym.compound_stmt:
    case Sk.ParseTables.sym.import_stmt: 
        // Wrappers where we just skip to the children:
        for (const child of children(p)) {
            s = copyFramesFromPython(child, s);
        }
        break;
    case Sk.ParseTables.sym.expr_stmt:
        if (p.children) {
            const index = p.children.findIndex((x) => x.value === "=");
            if (index >= 0) {
                // An assignment
                const lhs = toSlots({...p, children: p.children.slice(0, index)});
                const rhs = toSlots({...p, children: p.children.slice(index + 1)});
                s = addFrame(makeFrame(AllFrameTypesIdentifier.varassign, {0: {slotStructures: lhs}, 1: {slotStructures: rhs}}, s.isSPY), p.lineno, s);
            }
            else {
                const slots = toSlots(p);
                if (slots.fields.length == 1 && (slots.fields[0] as BaseSlot)?.code && (slots.fields[0] as BaseSlot).code.startsWith(STRYPE_COMMENT_PREFIX)) {
                    // A single line comment: we retrieve and decode the comment part following the STRYPE_COMMENT_PREFIX placeholder.
                    const comment = fromUnicodeEscapes((slots.fields[0] as BaseSlot).code.slice(STRYPE_COMMENT_PREFIX.length));
                    s = addFrame(makeFrame(AllFrameTypesIdentifier.comment, {0: {slotStructures: {fields: [{code: comment}], operators: []}}}, s.isSPY), p.lineno, s);    
                }
                else if (slots.fields.length == 1 && (slots.fields[0] as BaseSlot)?.code && (slots.fields[0] as BaseSlot).code.startsWith(STRYPE_LIBRARY_PREFIX)) {
                    const library = fromUnicodeEscapes((slots.fields[0] as BaseSlot).code.slice(STRYPE_LIBRARY_PREFIX.length));
                    s = addFrame(makeFrame(AllFrameTypesIdentifier.library, {0: {slotStructures: {fields: [{code: library}], operators: []}}}, s.isSPY), p.lineno, s);
                }
                else if (slots.fields.length == 1 && (slots.fields[0] as BaseSlot)?.code && (slots.fields[0] as BaseSlot).code === STRYPE_WHOLE_LINE_BLANK) {
                    s = addFrame(makeFrame(AllFrameTypesIdentifier.blank, {}, s.isSPY), p.lineno, s);
                }
                else {
                    // Everything else goes in method call:
                    s = addFrame(makeFrame(AllFrameTypesIdentifier.funccall, {0: {slotStructures: slots}}, s.isSPY), p.lineno, s);
                }
            }
        }
        break;
    case Sk.ParseTables.sym.pass_stmt:
        // We do not insert pass frames.  But we do record the line number
        // because it may matter for processing following comments:
        s = {...s, lastLineProcessed: p.lineno};
        break;
    case Sk.ParseTables.sym.break_stmt:
        s = addFrame(makeFrame(AllFrameTypesIdentifier.break, {}, s.isSPY), p.lineno, s);
        break;
    case Sk.ParseTables.sym.continue_stmt:
        s = addFrame(makeFrame(AllFrameTypesIdentifier.continue, {}, s.isSPY), p.lineno, s);
        break;
    case Sk.ParseTables.sym.global_stmt:
        s = addFrame(makeFrame(AllFrameTypesIdentifier.global, {0: {slotStructures: toSlots(children(p)[1])}}, s.isSPY), p.lineno, s);
        break;
    case Sk.ParseTables.sym.import_name:
        s = addFrame(makeFrame(AllFrameTypesIdentifier.import, {0: {slotStructures: toSlots(children(p)[1])}}, s.isSPY), p.lineno, s);
        break;
    case Sk.ParseTables.sym.import_from:
        s = addFrame(makeFrame(AllFrameTypesIdentifier.fromimport, {0: {slotStructures: toSlots(children(p)[1])}, 1: {slotStructures: toSlots(children(p)[3])}}, s.isSPY), p.lineno, s);
        break;
    case Sk.ParseTables.sym.raise_stmt:
        // Raise may or may not have an expression child after it:
        if (children(p).length >= 2) {
            s = addFrame(makeFrame(AllFrameTypesIdentifier.raise, {0: {slotStructures: toSlots(children(p)[1])}}, s.isSPY), p.lineno, s);
        }
        else {
            s = addFrame(makeFrame(AllFrameTypesIdentifier.raise, {0: {slotStructures: {fields: [{code: ""}], operators: []}}}, s.isSPY), p.lineno, s);
        }
        break;
    case Sk.ParseTables.sym.return_stmt:
        // Return may or may not have an expression child after it:
        if (children(p).length >= 2) {
            s = addFrame(makeFrame(AllFrameTypesIdentifier.return, {0: {slotStructures: toSlots(children(p)[1])}}, s.isSPY), p.lineno, s);
        }
        else {
            s = addFrame(makeFrame(AllFrameTypesIdentifier.return, {0: {slotStructures: {fields: [{code: ""}], operators: []}}}, s.isSPY), p.lineno, s);
        }
        break;
    case Sk.ParseTables.sym.if_stmt: {
        // First child is keyword, second is the condition, third is colon, fourth is body
        const r = makeAndAddFrameWithBody(p, AllFrameTypesIdentifier.if, 0,[1], 3, s);
        s = r.s;
        const ifFrame = r.frame;
        
        // If can have elif, else, so keep going to check for that:
        for (let i = 4; i < children(p).length; i++) {
            if (children(p)[i].value === "else") {
                // Skip the else and the colon, which are separate tokens:
                i += 2;
                updateFrom(s, makeAndAddFrameWithBody(p, AllFrameTypesIdentifier.else, i - 2,[], i, {...s, addToJoint: ifFrame.jointFrameIds, jointParent: ifFrame}).s);
            }
            else if (children(p)[i].value === "elif") {
                // Skip the elif:
                i += 1;
                updateFrom(s, makeAndAddFrameWithBody(p, AllFrameTypesIdentifier.elif, i - 1,[i], i + 2, {...s, addToJoint: ifFrame.jointFrameIds, jointParent: ifFrame}).s);
                // Skip the condition and the colon:
                i += 2;
            }
        }
        break;
    }
    case Sk.ParseTables.sym.while_stmt:
        // First child is keyword, second is the condition, third is colon, fourth is body
        s = makeAndAddFrameWithBody(p, AllFrameTypesIdentifier.while, 0, [1], 3, s).s;
        break;
    case Sk.ParseTables.sym.for_stmt: {
        // First child is keyword, second is the loop var, third is keyword, fourth is collection, fifth is colon, sixth is body
        const r = makeAndAddFrameWithBody(p, AllFrameTypesIdentifier.for, 0, [1, 3], 5, s);
        s = r.s;
        let i = 5;
        if (children(p).length >= 7 && children(p)[6].value === "else") {
            // Skip the else and the colon, which are separate tokens:
            i += 3;
            updateFrom(s, makeAndAddFrameWithBody(p, AllFrameTypesIdentifier.else, 6,[], i, {
                ...s,
                addToJoint: r.frame.jointFrameIds,
                jointParent: r.frame,
            }).s);
        }
        break;
    }
    case Sk.ParseTables.sym.try_stmt: {
        // First is keyword, second is colon, third is body
        const r = makeAndAddFrameWithBody(p, AllFrameTypesIdentifier.try, 0, [], 2, s);
        const tryFrame = r.frame;
        s = r.s;
        
        // The except clauses are descendants of the try block, so we must iterate through later children:
        for (let i = 3; i < children(p).length; i++) {
            const child = children(p)[i];
            if (child.type === Sk.ParseTables.sym.except_clause) {
                // The first child is except keyword.  Everything else is optional, so we have three options:
                // - Blank except
                // - Except with single argument
                // - Except with "x as y" (which we shove into one slot)
                const grandchildren = children(child);
                let exceptFrame;
                if (grandchildren.length == 4 && grandchildren[2].value === "as") {
                    // except ErrorType as varName:
                    exceptFrame = makeFrame(AllFrameTypesIdentifier.except, {0: {slotStructures:
                                concatSlots(toSlots(grandchildren[1]), "as", toSlots(grandchildren[3])),
                    }}, s.isSPY);
                }
                else if (grandchildren.length == 2) {
                    // except varName:
                    const asSlots = toSlots(grandchildren[1]);
                    if (asSlots.fields.length == 1 && (asSlots.fields[0] as BaseSlot)?.code == STRYPE_DUMMY_FIELD) {
                        exceptFrame = null;
                    }
                    else {
                        exceptFrame = makeFrame(AllFrameTypesIdentifier.except, {0: {slotStructures: asSlots}}, s.isSPY);
                    }
                }
                else if (grandchildren.length == 1) {
                    // Just the except keyword, i.e. blank except:
                    exceptFrame = makeFrame(AllFrameTypesIdentifier.except, {0: {slotStructures: {fields: [{code: ""}], operators: []}}}, s.isSPY);
                }
                else {
                    // Shouldn't happen, but skip if so:
                    continue;
                }
                if (exceptFrame) {
                    updateFrom(s, addFrame(exceptFrame, getRealLineNo(child), {...s, addToJoint: tryFrame.jointFrameIds, jointParent: tryFrame}));
                    // The children of the except actually follow as a sibling of the clause, after the colon (hence i + 2):
                    if (s.lastLineProcessed != undefined) {
                        updateFrom(s, copyFramesFromPython(children(p)[i + 2], {...s, addToNonJoint: exceptFrame.childrenIds, parent: exceptFrame}));
                    }
                }
                else if (s.lastLineProcessed) {
                    // We know it's dummy header + pass body, so just add two:
                    s.lastLineProcessed += 2;
                }
            }
            else if (child.value === "finally") {
                // Weirdly, finally doesn't seem to have a proper node type, it's just a normal child
                // followed by a colon followed by a body
                updateFrom(s, makeAndAddFrameWithBody(p, AllFrameTypesIdentifier.finally, i, [], i + 2, {...s, addToJoint: tryFrame.jointFrameIds, jointParent: tryFrame}).s);
            }
            else if (child.value === "else") {
                // else is the same as finally, a normal child then colon then body:
                updateFrom(s, makeAndAddFrameWithBody(p, AllFrameTypesIdentifier.else, i, [], i + 2, {...s, addToJoint: tryFrame.jointFrameIds, jointParent: tryFrame}).s);
            }
        }
        break;
    }
    case Sk.ParseTables.sym.with_stmt:
        // First child is keyword, second is with_item that has [LHS, "as", RHS] as children, third is colon, fourth is body
        s = makeAndAddFrameWithBody(p, AllFrameTypesIdentifier.with, 0, [[1, 0], [1, 2]], 3, s).s;
        break;
    case Sk.ParseTables.sym.suite:
        // I don't really understand what this item is (it seems to have the raw content as extra children),
        // but it seems if we ignore these extra children we can proceed and it will all work:
        for (const child of children(p)) {
            if (child.type > 250) { // Only count the non-expression nodes
                s = copyFramesFromPython(child, s);
            }
        }
        break;
    case Sk.ParseTables.sym.funcdef:
        // First child is keyword, second is the name, third is params, fourth is colon, fifth is body
        s = makeAndAddFrameWithBody(p, AllFrameTypesIdentifier.funcdef, 0, [1, 2], 4, s).s;
        break;
    }
    return s;
}

// Function to check the current position in Strype 
export function findCurrentStrypeLocation(): STRYPE_LOCATION {
    // We detect the location by nativagating to the parents of the current Strype location (blue cursor) until we reach a significant parent type (see enum STRYPE_LOCATION)
    // If are below a frame, we look for its parent right away, otheriwse we can use that frame.
    let {id: navigFrameId, caretPosition: navigFrameCaretPos} = useStore().currentFrame;
    do{
        const frameType = useStore().frameObjects[navigFrameId].frameType;
        switch(frameType.type){
        case ContainerTypesIdentifiers.framesMainContainer:
            return STRYPE_LOCATION.MAIN_CODE_SECTION;
        case AllFrameTypesIdentifier.funcdef:
            // Two possible cases: we are at the body of a function definition or at the bottom:
            // in the first case, we are inside a function definition,
            // in the second case, we are inside the definitions section.
            return (navigFrameCaretPos == CaretPosition.body) ? STRYPE_LOCATION.IN_FUNCDEF : STRYPE_LOCATION.FUNCDEF_SECTION;
        case ContainerTypesIdentifiers.funcDefsContainer:
            return STRYPE_LOCATION.FUNCDEF_SECTION;
        case ContainerTypesIdentifiers.importsContainer:
            return STRYPE_LOCATION.IMPORTS_SECTION;
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
    return STRYPE_LOCATION.UNKNOWN;
}

// This function makes a simple sanity check on the copied Python code (as frames then): we make sure that it "fits" the current Strype location
function canPastePythonAtStrypeLocation(currentStrypeLocation : STRYPE_LOCATION): boolean {
    // In more details, we check the same-leve (top level) frames in the copy:
    // - in the "import" section, only imports can be copied,
    // - in the "function definition" section, only function definitions can be copied
    // - in the "main code" section or inside a function definition frame, only code that doesn't contain imports or function definitions can be copied (and "global" for main code)
    // Comments can also be imported in all sections. 
    // We remove any blank frames that could exist for an imports or function definitions section top frames: they are not required in the editor.
    // Nevertheless, for this test method to complete, we still need to accept blanks to be inside imports and function definitions for validation.
    
    const copiedPythonToFrames = Object.values(useStore().copiedFrames);
    const topLevelCopiedFrames = copiedPythonToFrames.filter((frame) => frame.parentId == TOP_LEVEL_TEMP_ID);
    const topLevelCopiedFrameIds = topLevelCopiedFrames.flatMap((frame) => frame.id);
    // Check if the match between the current Strype location and the copied Python code frames is possible
    switch(currentStrypeLocation){
    case STRYPE_LOCATION.MAIN_CODE_SECTION:
        return !copiedPythonToFrames.some((frame) => [AllFrameTypesIdentifier.import, AllFrameTypesIdentifier.fromimport, AllFrameTypesIdentifier.funcdef, AllFrameTypesIdentifier.global].includes(frame.frameType.type));
    case  STRYPE_LOCATION.IN_FUNCDEF:
        return !copiedPythonToFrames.some((frame) => [AllFrameTypesIdentifier.import, AllFrameTypesIdentifier.fromimport, AllFrameTypesIdentifier.funcdef].includes(frame.frameType.type));
    case  STRYPE_LOCATION.FUNCDEF_SECTION:
        removeTopLevelBlankFrames();
        return !(topLevelCopiedFrames.some((frame) => ![AllFrameTypesIdentifier.funcdef, AllFrameTypesIdentifier.comment, AllFrameTypesIdentifier.blank].includes(frame.frameType.type))
            || copiedPythonToFrames.some((frame) => !topLevelCopiedFrameIds.includes(frame.id) && [AllFrameTypesIdentifier.import, AllFrameTypesIdentifier.fromimport, AllFrameTypesIdentifier.funcdef].includes(frame.frameType.type)));
    case  STRYPE_LOCATION.IMPORTS_SECTION:
        removeTopLevelBlankFrames();
        return !topLevelCopiedFrames.some((frame) => ![AllFrameTypesIdentifier.import, AllFrameTypesIdentifier.fromimport, AllFrameTypesIdentifier.library, AllFrameTypesIdentifier.comment, AllFrameTypesIdentifier.blank].includes(frame.frameType.type));
    default:
        // We shouldn't reach this but for safety we return false
        return false;
    }
}

function removeTopLevelBlankFrames(): void {
    // Remove blank frames in the first level of the copied frames. T
    // This is useful when copying Python code that had line breaks between the function defs or the imports:
    // our editor do not allow adding blank frames, so they shouldn't be kept when pasted.
    const copiedPythonToFrames = Object.values(useStore().copiedFrames);
    const topLevelCopiedFrames = copiedPythonToFrames.filter((frame) => frame.parentId == TOP_LEVEL_TEMP_ID);
    const topLevelBlankFramesIds = topLevelCopiedFrames.filter((frame) => frame.frameType.type === AllFrameTypesIdentifier.blank)
        .map((frame) => frame.id);
    topLevelBlankFramesIds.forEach((frameId) => {
        delete useStore().copiedFrames[frameId];
        useStore().copiedSelectionFrameIds.splice(useStore().copiedSelectionFrameIds.indexOf(frameId), 1);
    });
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

// Takes a list of lines of Python code and splits them into three sections: imports, function definitions, and main code.
// Each line of the original will end up in exactly one of the three parts of the return.
// With Python's indentation rules, this operation is actually easier at line level than it is post-parse.
// The mappings map line numbers in the returned sections to line numbers in the original
export function splitLinesToSections(allLines : string[]) : {imports: string[]; defs: string[]; main: string[], importsMapping: Record<number, number>, defsMapping: Record<number, number>, mainMapping: Record<number, number>, headers: Record<string, string>, format: "py" | "spy"} {
    // There's two possibilities:
    //  - we're loading a .spy with section headings, or
    //  - we're loading a .py where we must infer it.
    // Easy way to find out: check if the first line is a .spy header:
    if (allLines[0].match(new RegExp("^#" + escapeRegExp(AppSPYPrefix) + " *" + AppName + " *:"))) {
        // It's a .spy!  Easy street, let's find the headings:
        let line = 1;
        const r = {
            imports: [] as string[],
            defs: [] as string[],
            main: [] as string[],
            importsMapping: {} as Record<number, number>,
            defsMapping: {} as Record<number, number>,
            mainMapping: {} as Record<number, number>,
            headers: {} as Record<string, string>,
            format: "spy" as "py" | "spy",
        };
        while (line < allLines.length && !allLines[line].match(new RegExp("^#" + escapeRegExp(AppSPYPrefix) + " *Section *:Imports"))) {
            // Everything here should be metadata, add it to headers:
            const m = allLines[line].match(new RegExp("^#" + escapeRegExp(AppSPYPrefix) + "([^:]+):(.*)"));
            if (m) {
                // Note: we only trim left-hand side, right-hand side is as-is:
                r.headers[m[1].trim()] = m[2];
            }
            line += 1;
        }
        line += 1;
        const firstImportLine = line;
        while (line < allLines.length && !allLines[line].match(new RegExp("^#" + escapeRegExp(AppSPYPrefix) + " *Section *:Definitions"))) {
            r.imports.push(allLines[line]);
            r.importsMapping[line - firstImportLine] = line;
            line += 1;
        }
        line += 1;
        const firstDefsLine = line;
        while (line < allLines.length && !allLines[line].match(new RegExp("^#" + escapeRegExp(AppSPYPrefix) + " *Section *:Main"))) {
            r.defs.push(allLines[line]);
            r.defsMapping[line - firstDefsLine] = line;
            line += 1;
        }
        line += 1;
        const firstMainLine = line;
        while (line < allLines.length && !allLines[line].match(new RegExp("^#" + escapeRegExp(AppSPYPrefix) + " *Section *:Main"))) {
            r.main.push(allLines[line]);
            r.mainMapping[line - firstMainLine] = line;
            line += 1;
        }

        return r;
    }
    
    // We associate comments with the line immediately following them, so we keep a list of the most recent comments:
    let latestComments: NumberedLine[] = [];
    const imports: NumberedLine[] = [];
    const defs: NumberedLine[] = [];
    const main: NumberedLine[] = [];
    let addingToDef = false;
    let defIndent = 0;
    allLines.forEach((line : string, zeroBasedLine : number) => {
        const lineWithNum : NumberedLine = {text: line, lineno: zeroBasedLine + 1};
        if (line.match(/^\s*(import|from)\s+/)) {
            // Import:
            imports.push(...latestComments);
            latestComments = [];
            imports.push(lineWithNum);
            addingToDef = false;
        }
        else if (line.match(/^\s*def\s+/)) {
            addingToDef = true;
            defIndent = line.length - line.trimStart().length;
            defs.push(...latestComments.map((l) => ({...l, text: l.text.trimStart() + " ".repeat(defIndent)})));
            latestComments = [];
            defs.push({...lineWithNum, text: line.trimStart()});
            
        }
        else if (line.match(/^\s*#/)) {
            latestComments.push(lineWithNum);
        }
        else if (addingToDef && (line.trim() == "" || (line.length - line.trimStart().length) > defIndent)) {
            // Keep adding to defs until we see a non-comment non-blank line with less or equal indent:
            defs.push(...latestComments);
            latestComments = [];
            defs.push({...lineWithNum, text: line.slice(defIndent)});
        }
        else {
            addingToDef = false;
            main.push(...latestComments);
            latestComments = [];
            // We don't push leading blanks to main (i.e. blank lines while main is empty), otherwise all the blanks before/between imports and defs end up there:
            if (line.trim() != "" || main.length > 0) {
                main.push(lineWithNum);
            }
        }
    });
    // Add any trailing comments:
    main.push(...latestComments);
    return {
        imports: imports.map((l) => l.text),
        defs: defs.map((l) => l.text),
        main: main.map((l) => l.text),
        importsMapping : makeMapping(imports),
        defsMapping : makeMapping(defs),
        mainMapping : makeMapping(main),
        headers: {} as Record<string, string>,
        format: "py",
    };
}

// Returns headers if successful, or null if there was an error (which will already have been shown in the UI)
export function pasteMixedPython(completeSource: string, clearExisting: boolean) : { headers: Record<string, string> } | null {
    const allLines = completeSource.split(/\r?\n/);
    // Split can make an extra blank line at the end which we don't want:
    if (allLines.length > 0 && allLines[allLines.length - 1] === "") {
        allLines.pop();
    }
    const s = splitLinesToSections(allLines);
    
    // Bit awkward but we first attempt to copy each to check for errors because
    // if there are any errors we don't want to paste any:
    let err = copyFramesFromParsedPython(s.imports, STRYPE_LOCATION.IMPORTS_SECTION, s.format, s.importsMapping);
    if (typeof err != "string") {
        err = copyFramesFromParsedPython(s.defs, STRYPE_LOCATION.FUNCDEF_SECTION, s.format, s.defsMapping);
    }
    if (typeof err != "string") {
        err = copyFramesFromParsedPython(s.main, STRYPE_LOCATION.MAIN_CODE_SECTION, s.format, s.mainMapping);
    }
    if (typeof err == "string") {
        const msg = cloneDeep(MessageDefinitions.InvalidPythonParseImport);
        const msgObj = msg.message as FormattedMessage;
        msgObj.args[FormattedMessageArgKeyValuePlaceholders.error.key] = msgObj.args.errorMsg.replace(FormattedMessageArgKeyValuePlaceholders.error.placeholderName, err);

        useStore().showMessage(msg, 10000);
        return null;
    }
    else {
        if (clearExisting) {
            // Clear the current existing code (i.e. frames) of the editor
            useStore().clearAllFrames();
        }
        
        // The logic for pasting is: every frame that are allowed at the current cursor's position are added.
        // Frames that are related to another section where the caret is not present are added in that section.
        const curLocation = findCurrentStrypeLocation();
        const isCurLocationInImportsSection = curLocation == STRYPE_LOCATION.IMPORTS_SECTION, isCurLocationInDefsSection = curLocation == STRYPE_LOCATION.FUNCDEF_SECTION, 
            isCurLocationInMainCodeSection = curLocation == STRYPE_LOCATION.MAIN_CODE_SECTION, isCurLocationInAFuncDefFrame = curLocation == STRYPE_LOCATION.IN_FUNCDEF;

        copyFramesFromParsedPython(s.imports, STRYPE_LOCATION.IMPORTS_SECTION, s.format);
        if (useStore().copiedSelectionFrameIds.length > 0) {
            getCaretContainerComponent(getFrameComponent((isCurLocationInImportsSection) ? useStore().currentFrame.id : useStore().getImportsFrameContainerId) as InstanceType<typeof FrameContainer>).doPaste(isCurLocationInImportsSection ? "caret" : "end");
        }
        copyFramesFromParsedPython(s.defs, STRYPE_LOCATION.FUNCDEF_SECTION, s.format);
        if (useStore().copiedSelectionFrameIds.length > 0) {
            getCaretContainerComponent(getFrameComponent((isCurLocationInDefsSection) ? useStore().currentFrame.id : useStore().getFuncDefsFrameContainerId) as InstanceType<typeof FrameContainer>).doPaste(isCurLocationInDefsSection ? "caret" : "end");
        }
        if (s.main.length > 0) {
            copyFramesFromParsedPython(s.main, (isCurLocationInAFuncDefFrame) ? STRYPE_LOCATION.IN_FUNCDEF : STRYPE_LOCATION.MAIN_CODE_SECTION, s.format);
            if (useStore().copiedSelectionFrameIds.length > 0) {
                getCaretContainerComponent(getFrameComponent((isCurLocationInAFuncDefFrame || isCurLocationInMainCodeSection) ? useStore().currentFrame.id : useStore().getMainCodeFrameContainerId) as InstanceType<typeof FrameContainer>).doPaste((isCurLocationInAFuncDefFrame || isCurLocationInMainCodeSection) ? "caret" : "start");
            }
        }
        return s;
    }
}


const transformTripleQuotesStrings = (slots: {[index: number]: LabelSlotsContent}): void => {
    // This helper function replaces all strings content in slots that came up from parsing triple quotes strings literals.
    // It keeps the single quote string token (resulting from the parsing) and deletes the remaining 2 extra quotes on each ends
    // of the string literal. It also replaces line breaks by literal "\n".
    const doTransformTripleQuotesStringsOnSlotStructs = (slotsStruct: SlotsStructure) => {
        slotsStruct.fields.forEach((fieldSlot) => {
            if(isFieldBracketedSlot(fieldSlot)){
                // Bracket slots have a deeper level, we need to check inside
                doTransformTripleQuotesStringsOnSlotStructs(fieldSlot);
            }
            else if(isFieldStringSlot(fieldSlot) && fieldSlot.quote == "'"){
                // A string: we check if it has been generated from a triple quotes string parsing
                const stringSlotLiteralValue = fieldSlot.code;
                if(parsedTripleQuotesStrRegex.test(stringSlotLiteralValue)){
                    fieldSlot.code = stringSlotLiteralValue.slice(2, -2).replaceAll(/\r?\n/g, "\\n");
                }
            }
            // Else, there is nothing to transform
        });
        
    };
    Object.values(slots).forEach((slotsStruct) => doTransformTripleQuotesStringsOnSlotStructs(slotsStruct.slotStructures));
};
