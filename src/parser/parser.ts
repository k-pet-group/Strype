import Compiler from "@/compiler/compiler";
import {hasEditorCodeErrors, trimmedKeywordOperators} from "@/helpers/editor";
import {generateFlatSlotBases, getNextSibling, retrieveSlotByPredicate} from "@/helpers/storeMethods";
import i18n from "@/i18n";
import { useStore } from "@/store/store";
import {AllFrameTypesIdentifier, AllowedSlotContent, BaseSlot, CollapsedState, ContainerTypesIdentifiers, FieldSlot, FlatSlotBase, FrameContainersDefinitions, FrameObject, FrozenState, getLoopFramesTypeIdentifiers, isFieldBaseSlot, isFieldBracketedSlot, isFieldStringSlot, isSlotBracketType, isSlotQuoteType, isSlotStringLiteralType, LabelSlotPositionsAndCode, LabelSlotsPositions, LineAndSlotPositions, MediaSlot, OptionalSlotType, ParserElements, SlotsStructure, SlotType, StringSlot} from "@/types/types";
import { ErrorInfo, TPyParser } from "tigerpython-parser";
import {AppSPYFullPrefix} from "@/main";
/*IFTRUE_isPython */
import { actOnTurtleImport } from "@/helpers/editor";
/*FITRUE_isPython */
import {STRYPE_DUMMY_FIELD, STRYPE_EXPRESSION_BLANK, STRYPE_INVALID_OP, STRYPE_INVALID_OPS_WRAPPER, STRYPE_INVALID_SLOT} from "@/helpers/pythonToFrames";

const INDENT = "    ";
const DISABLEDFRAMES_FLAG =  "\"\"\""; 

// Parse the code contained in the editor, and generate a compiler for this code if no error are found.
// The method returns an object containing the output code and the compiler.
// The destination is .spy, or two types of .py.  The plain "py" omits the docstrings from methods and project
// which can upset the line numbers, for ease of processing during execution, autocomplete, etc.
// The "py-export" is for user-visible Python when we export to Python, and we should include the doc strings.
export function parseCodeAndGetParseElements(requireCompilation: boolean, destination: "spy" | "py-export" | "py"): ParserElements{
    // Errors in the code (precompiled errors and TigerPython errors) are looked up at code edition.
    // Therefore, we expect the errors to already be found out when this method is called, and we don't need
    // to retrieve them again.
    const parser = new Parser(false, destination);
    const out = parser.parse({});

    const hasErrors = hasEditorCodeErrors();
    const compiler = new Compiler();
    if(requireCompilation){
        compiler.compile(out);
    }

    return {parsedOutput: out, hasErrors: hasErrors, compiler: compiler};
}

function isValidPythonName(name: string): boolean {
    // Match Unicode identifiers: start with a Unicode letter or _, then letters/digits/underscores
    // \p{ID_Start} and \p{ID_Continue} are Unicode property escapes (ECMAScript 2018+)
    const identifierRegex = /^[\p{ID_Start}_][\p{ID_Continue}_]*$/u;

    const pythonKeywords = new Set([
        "False", "None", "True", "and", "as", "assert", "async", "await",
        "break", "class", "continue", "def", "del", "elif", "else", "except",
        "finally", "for", "from", "global", "if", "import", "in", "is", "lambda",
        "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
    ]);

    return identifierRegex.test(name) && !pythonKeywords.has(name);
}

function isValidPythonNumber(str: string): boolean {
    const trimmed = str.trim();

    // Regex patterns for Python-style numbers

    const decimalInt = /^[+-]?(0|[1-9][0-9_]*)$/;
    const binaryInt = /^[+-]?0[bB][01_]+$/;
    const octalInt = /^[+-]?0[oO][0-7_]+$/;
    const hexInt = /^[+-]?0[xX][0-9a-fA-F_]+$/;

    const floatNum = /^[+-]?((\d+(_\d+)*\.\d*(_\d+)*)|(\.\d+(_\d+)*)|(\d+(_\d+)*([eE][+-]?\d+(_\d+)*)))$/;

    const complexNum = /^[+-]?((\d+(\.\d*)?)|(\.\d+))?[jJ]$/;

    return (
        decimalInt.test(trimmed) ||
        binaryInt.test(trimmed) ||
        octalInt.test(trimmed) ||
        hexInt.test(trimmed) ||
        floatNum.test(trimmed) ||
        complexNum.test(trimmed)
    ) && !trimmed.endsWith("_");
}

export function toUnicodeEscapes(input: string): string {
    return Array.from(input)
        .map((char) => {
            const code = char.codePointAt(0) ?? 0;
            return "u" + code.toString(16).padStart(4, "0");
        })
        .join("");
}

function interleave<T>(a: T[], b: T[]): T[] {
    const result: T[] = [];
    const maxLength = Math.max(a.length, b.length);

    for (let i = 0; i < maxLength; i++) {
        if (i < a.length) {
            result.push(a[i]);
        }
        if (i < b.length) {
            result.push(b[i]);
        }
    }

    return result;
}

// Checks if the level will parse as-is given the arrangement of operators and operands
// If not, it transforms it into a special call ___strype_invalid_ops([]) where each
// item in the list is an operand, or a ___strype_operator_uXXXX escaped operator.
function transformSlotLevel(slots: SlotsStructure, topLevel?: {frameType: string, slotIndex: number}): SlotsStructure {
    // Here's what prevents parsing:
    // - A unary operator (like "not", "~") with something non-blank before it.
    // - Commas at the top-level of most constructs (only assignments, return, for allow it)
    // - Anything with a blank operator between two adjacent non-blank items, except
    //     if the right-hand item is a round or square bracket (function call and list index, respectively)
    let valid = true;
    for (let i = 0; i < slots.operators.length; i++) {
        if (slots.operators[i].code.trim() === "not" || slots.operators[i].code.trim() === "~") {
            // Unary operators only valid at start of bracketed expression:
            if (i != 0) {
                valid = false;
                break;
            }
            
            const preceding = slots.fields[i];
            if (!(isFieldBaseSlot(preceding) && preceding.code.trim() === "")) {
                // Something besides a plain blank before it; not valid unary operator:
                valid = false;
                break;
            }
        }
        // A blank operator is only valid if the right-hand side is:
        // - blank itself,
        // - a round bracket (method call)
        // - a square bracket (list indexing)
        // OR the left-hand side is blank
        // OR the left-hand side is [rbfRBF]+ and the right-hand side is a string literal
        if (slots.operators[i].code.trim() === "") {
            const before = slots.fields[i];
            const blankBefore = isFieldBaseSlot(before) && before.code.trim() === "";
            const rbfBefore = isFieldBaseSlot(before) && before.code.match(/^[rbfRBF]+$/);
            if (rbfBefore && isFieldStringSlot(slots.fields[i+1])) {
                // This is fine, but still need to scan the rest of the items so continue the loop
            }
            else if (!blankBefore) {
                if (i + 1 < slots.fields.length) {
                    const after = slots.fields[i + 1];
                    if (!(isFieldBaseSlot(after) && after.code == "") && !(isFieldBracketedSlot(after) && (after.openingBracketValue == "(" || after.openingBracketValue == "["))) {
                        valid = false;
                        break;
                    }
                }
            }
            else {
                // As a further case, it is not valid to have two blank operators around a blank
                // slot because that indicates that there are two adjacent brackets/quotes, unless
                // the right-hand item is a square bracket (which can be parsed as a subscript)
                if (i > 0 && slots.operators[i - 1].code.trim() === "" && i + 1 < slots.fields.length) {
                    const nextField = slots.fields[i + 1];
                    if (!(isFieldBracketedSlot(nextField) && nextField.openingBracketValue == "[")) {
                        valid = false;
                        break;
                    }
                }
            }
        }
        if (slots.operators[i].code.trim() === ",") {
            if (topLevel) {
                // We invert where commas are allowed:
                if (!([AllFrameTypesIdentifier.varassign,
                    AllFrameTypesIdentifier.for,
                    AllFrameTypesIdentifier.return].includes(topLevel.frameType)
                    || (topLevel.frameType === AllFrameTypesIdentifier.funcdef && topLevel.slotIndex == 1)
                    || (topLevel.frameType === AllFrameTypesIdentifier.fromimport && topLevel.slotIndex == 1)
                    || (topLevel.frameType === AllFrameTypesIdentifier.import && topLevel.slotIndex == 0))) {
                    valid = false;
                }
            }
        }
    }
    if (valid) {
        return slots;
    }
    else {
        return {operators: [{code: ""}, {code: ""}], fields: [
            {code: STRYPE_INVALID_OPS_WRAPPER},
            {openingBracketValue: "(",
                operators: Array.from({length: slots.operators.length + slots.fields.length -1 }, () => {
                    return {code: ","};
                }),
                fields: interleave<(BaseSlot | SlotsStructure | StringSlot | MediaSlot)>(slots.fields.map((f) => {
                    if (isFieldBaseSlot(f) && f.code.trim() === "") {
                        return {code: STRYPE_EXPRESSION_BLANK};
                    }
                    else {
                        return f;
                    }
                }), slots.operators.map((op) => {
                    return {code: STRYPE_INVALID_OP + toUnicodeEscapes(op.code)};
                })),
            },
            {code: ""},
        ]};
    }
}

const collapsedToString: Record<CollapsedState, string> = {
    [CollapsedState.FULLY_VISIBLE]: "FoldToVisible", //Note: we never save this one, but Typescript wants the full set of enum values here
    [CollapsedState.ONLY_HEADER_VISIBLE]: "FoldToHeader",
    [CollapsedState.HEADER_AND_DOC_VISIBLE]: "FoldToDocumentation",
};

// Reverse mapping:
export const stringToCollapsed: Record<string, CollapsedState> = Object.entries(collapsedToString).reduce(
    (acc, [key, value]) => {
        acc[value] = Number(key) as CollapsedState;
        return acc;
    },
    {} as Record<string, CollapsedState>
);

const frozenToString: Record<FrozenState, string> = {
    [FrozenState.UNFROZEN]: "Unfrozen", //Note: we never save this one, but Typescript wants the full set of enum values here
    [FrozenState.FROZEN]: "Frozen",
};

// Reverse mapping:
export const stringToFrozen: Record<string, FrozenState> = Object.entries(frozenToString).reduce(
    (acc, [key, value]) => {
        acc[value] = Number(key) as FrozenState;
        return acc;
    },
    {} as Record<string, FrozenState>
);

export default class Parser {
    private startAtFrameId = -100; // default value to indicate there is no start
    private stopAtFrameId = -100; // default value to indicate there is no stop
    private stopAtIncludesLastFrame = false; // what to do with stopAtFrameId; do we include it?
    private exitFlag = false; // becomes true when the stopAtFrameId is reached.
    private framePositionMap: LineAndSlotPositions = {} as LineAndSlotPositions;  // For each line holds the positions the *editable slots* start at
    private line = 0;
    private isDisabledFramesTriggered = false; //this flag is used to notify when we enter and leave the disabled frames.
    private disabledBlockIndent = "";
    private excludeLoopsAndCommentsAndCloseTry = false;
    private ignoreSpecifiFrameId = -100;
    private ignoreCheckErrors = false;
    private saveAsSPY = false;
    private outputProjectDoc = false;
    private stoppedIndentation = ""; // The indentation level when we encountered the stop frame.
    private libraries : string[] = [];
    
    constructor(ignoreCheckErrors = false, destination: "spy" | "py-export" | "py" = "py") {
        this.ignoreCheckErrors = ignoreCheckErrors;
        this.saveAsSPY = destination == "spy";
        this.outputProjectDoc = destination == "spy" || destination == "py-export";
    }

    public getIndent(): string {
        return INDENT;
    }
    
    public getStoppedIndentation() : string {
        return this.stoppedIndentation;
    }
    
    public getLibraries() : string[] {
        return [...this.libraries];
    }

    private parseBlock(block: FrameObject, insideAClass : boolean, indentation: string): string {
        let output = "";
        const children = useStore().getFramesForParentId(block.id);

        if(this.checkIfFrameHasError(block) && !this.saveAsSPY) {
            return "";
        }

        const passBlock = this.excludeLoopsAndCommentsAndCloseTry && getLoopFramesTypeIdentifiers().includes(block.frameType.type);
        // on `excludeLoops` the loop frames must not be added to the code and nor should their contents be indented
        const conditionalIndent = (passBlock) ? "" : INDENT;

        // We only add states if there is a non-default value to save:
        const frameStates : string[] = [];
        if (block.collapsedState != undefined && block.collapsedState != CollapsedState.FULLY_VISIBLE) {
            frameStates.push(collapsedToString[block.collapsedState]);
        }
        if (block.frozenState != undefined && block.frozenState != FrozenState.UNFROZEN) {
            frameStates.push(frozenToString[block.frozenState]);
        }
        
        output +=
            (frameStates.length > 0 && this.saveAsSPY ? indentation + AppSPYFullPrefix + " FrameState:" + frameStates.sort().join(";") + "\n" : "") +
            ((!passBlock)? this.parseStatement(block, insideAClass, indentation) : "") +
            ((this.saveAsSPY && children.length > 0 &&
                ((!block.isDisabled && children.filter((c) => !c.isDisabled && c.frameType.type != AllFrameTypesIdentifier.blank && c.frameType.type != AllFrameTypesIdentifier.comment).length == 0)
                    || (block.isDisabled && children.filter((c) => c.frameType.type != AllFrameTypesIdentifier.blank && c.frameType.type != AllFrameTypesIdentifier.comment).length == 0)))
                ? indentation + conditionalIndent +"pass" + "\n" : "") +
            // We replace an empty block frame content by "pass". We also replace the frame's content if
            // the children are ALL blank or simple comment frames, because Python will see it as a problem. 
            // Any disabled frame (and multi lines comments which are actually transformed to multiple line comments) 
            // won't make an issue when executed, so we parse them normally.
            ((block.frameType.allowChildren && children.length > 0 && 
                children.some((childFrame) => childFrame.isDisabled 
                    || (childFrame.frameType.type != AllFrameTypesIdentifier.blank && (childFrame.frameType.type != AllFrameTypesIdentifier.comment 
                        || (childFrame.frameType.type == AllFrameTypesIdentifier.comment && (childFrame.labelSlotsDict[0].slotStructures.fields[0] as BaseSlot).code.includes("\n"))))))
                ?
                this.parseFrames(
                    children,
                    insideAClass,
                    indentation + conditionalIndent
                ) :
                // When we replace empty body frames by "pass", if that's because we have only blank or comments, we need to
                // replace EACH of these frames by "pass", so we keep the match between the frames and Python code lines coherent...
                ((children.length > 0) ?
                    this.parsePseudoEmptyBlockContent(children, indentation, conditionalIndent)
                    : indentation + conditionalIndent +"pass" + "\n")
            ) 
            +
            ((block.frameType.type == AllFrameTypesIdentifier.try && (useStore().getJointFramesForFrameId(block.id)?.filter((f) => !f.isDisabled).length ?? 0) == 0)
                ? indentation + "except " + STRYPE_DUMMY_FIELD + ":\n" + indentation + "    pass\n" : "") +
            this.parseFrames(
                useStore().getJointFramesForFrameId(block.id),
                insideAClass,
                indentation
            );
        
        return output;
    }

    private parsePseudoEmptyBlockContent(children: FrameObject[], indentation: string, conditionalIndent: string): string {
        // This method is called when parsing the content of a block frame that only contains simple comments or blank frames,
        // effectively making the block content empty. However, we need to 1) allow "passing" the content for Python to 
        // compile properly, and 2) make sure we keep the slots/lines mapping for proper errors handling.
        const emptyContent = this.parseFrames(children, false, indentation + conditionalIndent);
        const passLine = indentation + conditionalIndent + "pass" + "\n";
        return this.saveAsSPY ? emptyContent : passLine.repeat(children.length);
    }
    
    private parseStatement(statement: FrameObject, insideAClass : boolean, indentation = ""): string {
        let output = indentation;
        const labelSlotsPositionLengths: {[labelSlotsIndex: number]: LabelSlotsPositions} = {};
        
        if(this.checkIfFrameHasError(statement) && !this.saveAsSPY){
            return "";
        }

        // Comments are treated separately for 2 reasons: 1) when we are parsing for a/c we don't want to parse the comments because they mess up with the try block surrounding the lines of code,
        // and 2) we need to check if the comment is multilines for setting the right comment indicator (''' instead of #). A comment is always a single slot so there is no extra logic to consider.
        if((statement.frameType.type === AllFrameTypesIdentifier.comment)
        || (statement.frameType.type === AllFrameTypesIdentifier.library)
        || (statement.frameType.type === AllFrameTypesIdentifier.projectDocumentation)
        || (!this.saveAsSPY && statement.frameType.type === AllFrameTypesIdentifier.funccall && isFieldBaseSlot(statement.labelSlotsDict[0].slotStructures.fields[0]) && (statement.labelSlotsDict[0].slotStructures.fields[0] as BaseSlot).code.startsWith("#"))){
            const commentContent = (statement.labelSlotsDict[0].slotStructures.fields[0] as BaseSlot).code;

            // The project doc is optional so if it's blank omit it, and we don't mind about line numbers for SPY:
            if (statement.frameType.type === AllFrameTypesIdentifier.projectDocumentation && (!this.outputProjectDoc || commentContent.trim().length == 0)) {
                return "";
            }
            
            // Before returning, we update the line counter used for the frame mapping in the parser:
            // +1 except if we are in a multiline comment (and not excluding them) when we then return the number of lines
            this.line += ((this.excludeLoopsAndCommentsAndCloseTry) ? 1 : ((commentContent.includes("\n")) ? commentContent.split("\n").length : 1));

            const passLine = indentation + "pass" + "\n";
            
            if (statement.frameType.type === AllFrameTypesIdentifier.library) {
                if (!statement.isDisabled) {
                    this.libraries.push(commentContent);
                }
                if (this.saveAsSPY) {
                    return indentation + AppSPYFullPrefix + " " + (statement.isDisabled ? "LibraryDisabled" : "Library") + ":" + commentContent + "\n";
                }
                else {
                    return passLine; // Make sure we don't mess up the line numbers
                }
            }

            if (this.excludeLoopsAndCommentsAndCloseTry) {
                return passLine;
            }
            else {
                if (commentContent.includes("\n") || statement.frameType.type === AllFrameTypesIdentifier.projectDocumentation) {
                    // We escape all single quotes because for example if they are at the end of the string it can get confused
                    // (if user ends with a single quote, there will be four single quotes in a row at the end, and Python will parse it
                    // as the first three ending the string, and the fourth as left-over outside the string).
                    // We also need to escape backslashes by doubling them.
                    return indentation + "'''" + commentContent.replaceAll("\n", ("\n" + indentation)).replaceAll("\\", "\\\\").replaceAll("'", "\\'") + "'''\n";
                }
                else {
                    return indentation + "#" + commentContent + "\n";
                }
            }
        }
            
        statement.frameType.labels.forEach((label, labelSlotsIndex) => {
            let hasDocContent = false;
            if(label.showLabel??true){
                if (label.allowedSlotContent == AllowedSlotContent.FREE_TEXT_DOCUMENTATION) {
                    if (useStore().frameObjects[statement.id].labelSlotsDict[labelSlotsIndex].slotStructures.fields.length > 1 || (useStore().frameObjects[statement.id].labelSlotsDict[labelSlotsIndex].slotStructures.fields[0] as BaseSlot).code.trim().length > 0) {
                        if (label.newLine ?? false) {
                            // If we are in a free text documentation situation (in functions or classes docs), we need to account for all the line breaks this comment can contain.
                            this.line += ((((useStore().frameObjects[statement.id].labelSlotsDict[labelSlotsIndex].slotStructures.fields[0] as BaseSlot).code.trim().length > 0)) ? ((useStore().frameObjects[statement.id].labelSlotsDict[labelSlotsIndex].slotStructures.fields[0] as BaseSlot).code.split("\n").length) : 1);
                            // Newlines indent below, e.g. comments in funcdef frames:
                            output += "\n" + indentation + "    ";
                        }
                        output += "'''";
                        hasDocContent = true;
                    }
                }
                else {
                    // For varassign frames, the symbolic assignment on the UI should be replaced by the Python "=" symbol
                    output += ((label.label.length > 0 && statement.frameType.type === AllFrameTypesIdentifier.varassign) ? " = " : label.label);
                    if (label.appendSelfWhenInClass && insideAClass) {
                        // In Python it's okay to have a trailing comma on the params, so we don't need to check
                        // whether any actual params follow:
                        output += "self,";
                    }
                }
            }
            
            //if there are slots
            if(label.showSlots??true){
                // Record each slots' vertical positions for that label.
                const currentPosition = output.length;
                const slotStartsLengthsAndCode = this.getSlotStartsLengthsAndCodeForFrameLabel(useStore().frameObjects[statement.id].labelSlotsDict[labelSlotsIndex].slotStructures, currentPosition, label.optionalSlot ?? OptionalSlotType.REQUIRED, label.allowedSlotContent ?? AllowedSlotContent.TERMINAL_EXPRESSION, {frameType: statement.frameType.type, slotIndex: labelSlotsIndex});
                labelSlotsPositionLengths[labelSlotsIndex] = {
                    slotStarts: slotStartsLengthsAndCode.slotStarts, 
                    slotLengths: slotStartsLengthsAndCode.slotLengths,
                    slotIds: slotStartsLengthsAndCode.slotIds,
                    slotTypes: slotStartsLengthsAndCode.slotTypes,
                };
                // add their code to the output
                

                if (hasDocContent) {
                    // We escape all single quotes because for example if they are at the end of the string it can get confused
                    // (if user ends with a single quote, there will be four single quotes in a row at the end, and Python will parse it
                    // as the first three ending the string, and the fourth as left-over outside the string).
                    // We also need to escape backslashes by doubling them.
                    output += slotStartsLengthsAndCode.code.trimStart().replaceAll("\n", ("\n" + indentation + "    ")).replaceAll("\\", "\\\\").replaceAll("'", "\\'") + "'''";
                }
                else if (label.allowedSlotContent != AllowedSlotContent.FREE_TEXT_DOCUMENTATION) {
                    output += slotStartsLengthsAndCode.code.trimStart() + " ";
                }
            }            
        });
        
        output += "\n";
    
        this.framePositionMap[this.line] =  {frameId: statement.id, labelSlotStartLengths: labelSlotsPositionLengths};
        
        // We increment the line by 1 (next line) except when we are in an EMPTY block frame, as the empty "body" is replaced by "pass" in the parser,
        // that should be counted as a line (so we increment by 2)
        const incrementValue = (statement.frameType.allowChildren && statement.childrenIds.length == 0) ? 2 : 1;
        this.line += incrementValue;

        return output;
    }

    private parseFrames(codeUnits: FrameObject[], parentInsideAClass = false, indentation = ""): string {
        let output = "";
        let lineCode = "";

        //if the current frame is a container, we don't parse it as such
        //but parse directly its children (frames that it contains)
        let exitNextFrame = false;
        for (const frame of codeUnits) {
            if (exitNextFrame) {
                this.exitFlag = true;
                break;
            }
            if(frame.id === this.stopAtFrameId || this.exitFlag){
                if (frame.id === this.stopAtFrameId) {
                    this.stoppedIndentation = indentation;
                }
                if (frame.id == this.stopAtFrameId && this.stopAtIncludesLastFrame) {
                    exitNextFrame = true;
                }
                else {
                    this.exitFlag = true; // this is used in case we are inside a recursion
                    break;
                }
            }

            if(frame.id == this.ignoreSpecifiFrameId){
                // We still need to put something here, in case we are in an empty block, we add a f() dummy function to have something.
                output += `${indentation}f()\n`;
                this.line += 1;
                continue;
            }
            
            if (this.saveAsSPY && frame.frameType.type === ContainerTypesIdentifiers.framesMainContainer) {
                output += AppSPYFullPrefix + " Section:Main\n";
                this.line += 1;
            }
            else if (this.saveAsSPY && frame.frameType.type === ContainerTypesIdentifiers.defsContainer) {
                output += AppSPYFullPrefix + " Section:Definitions\n";
                this.line += 1;
            }
            else if (this.saveAsSPY && frame.frameType.type === ContainerTypesIdentifiers.importsContainer) {
                output += AppSPYFullPrefix + " Section:Imports\n";
                this.line += 1;
            }
            
            //if the frame is disabled and we were not in a disabled group of frames, add the comments flag
            //(to avoid weird Python code, if that first disabled frame is a joint frame (like "else") then we align the comment with the other joint/root bodies)
            let disabledFrameBlockFlag = "";
            let thisIndentation = indentation;
            if(!this.saveAsSPY && (frame.isDisabled ? !this.isDisabledFramesTriggered : this.isDisabledFramesTriggered)) {
                this.isDisabledFramesTriggered = !this.isDisabledFramesTriggered;
                if(frame.isDisabled) {
                    this.disabledBlockIndent = (indentation + ((frame.frameType.isJointFrame) ? INDENT : ""));
                }
                disabledFrameBlockFlag = this.saveAsSPY ? "" : (this.disabledBlockIndent + DISABLEDFRAMES_FLAG + "\n");
                
                //and also increment the line number that we use for mapping frames and code lines (even if the disabled frames don't map exactly, 
                //it doesn't matter since we will not have errors to show in those anyway)
                this.line += 1;
            }
            else if (this.saveAsSPY && frame.isDisabled && frame.frameType.type != AllFrameTypesIdentifier.library) {
                // Disabled libraries are treated differently because they already aren't real code.
                disabledFrameBlockFlag = "";
                // Don't add the disabled prefix twice:
                if (!indentation.match(/^ *#/)) {
                    thisIndentation = indentation + AppSPYFullPrefix + " Disabled:";
                }
            }
            
            const insideAClass = parentInsideAClass || frame.frameType.type == AllFrameTypesIdentifier.classdef;

            lineCode = frame.frameType.allowChildren ?
                // frame with children
                (Object.values(FrameContainersDefinitions).find((e) => e.type ===frame.frameType.type))?
                    // for containers call parseFrames again on their frames
                    this.parseFrames(useStore().getFramesForParentId(frame.id), insideAClass, "") 
                    :
                    // for simple block frames (i.e. if) call parseBlock
                    this.parseBlock(frame, insideAClass, thisIndentation) 
                : 
                // single line frame
                this.parseStatement(frame, insideAClass, thisIndentation);

            output += disabledFrameBlockFlag + lineCode;
            
            if (this.exitFlag && frame.frameType.type == AllFrameTypesIdentifier.try) {
                // We need to add an extra except to finish the try frame off and make it valid:
                output += thisIndentation + "except:\n" + thisIndentation + "    pass\n"; 
            }

            if (this.saveAsSPY && frame.frameType.type === ContainerTypesIdentifiers.framesMainContainer) {
                output += AppSPYFullPrefix + " Section:End\n";
            }            
        }

        if (exitNextFrame) {
            this.exitFlag = true;
        }

        return output;
    }
    
    public parseJustImports() : string {
        return this.parse({startAtFrameId: useStore().getImportsFrameContainerId, stopAt: {frameId: useStore().getDefsFrameContainerId, includeThisFrame: false}});
    }

    public parse({startAtFrameId, stopAt, excludeLoopsAndCommentsAndCloseTry, defsLast, ignoreSpecifiFrameId}: {startAtFrameId?: number, stopAt?: {frameId: number, includeThisFrame: boolean}, excludeLoopsAndCommentsAndCloseTry?: boolean, defsLast?: boolean; ignoreSpecifiFrameId?: number}): string {
        let output = "";
        if(startAtFrameId){
            this.startAtFrameId = startAtFrameId;
        }
        if(stopAt){
            this.stopAtFrameId = stopAt.frameId;
            this.stopAtIncludesLastFrame = stopAt.includeThisFrame;
        }

        if(excludeLoopsAndCommentsAndCloseTry){
            this.excludeLoopsAndCommentsAndCloseTry = excludeLoopsAndCommentsAndCloseTry;
        }

        if(ignoreSpecifiFrameId){
            this.ignoreSpecifiFrameId = ignoreSpecifiFrameId;
        }

        /* IFTRUE_isPython */
        // We look if Turtle has been imported to notify the editor UI
        actOnTurtleImport();
        /* FITRUE_isPython */

        let parentInsideAClass = false;
        let codeUnits: FrameObject[];
        if (this.startAtFrameId > -100) {
            codeUnits = [useStore().frameObjects[this.startAtFrameId]];
            parentInsideAClass = useStore().frameObjects[codeUnits[0].parentId].frameType.type == AllFrameTypesIdentifier.classdef;
        }
        else {            
            codeUnits = useStore().getFramesForParentId(0);
            if (defsLast) {
                codeUnits = codeUnits
                    .filter((item) => item.frameType.type !== ContainerTypesIdentifiers.defsContainer)
                    .concat(codeUnits.filter((item) => item.frameType.type === ContainerTypesIdentifiers.defsContainer));
            }
        }
        output += this.parseFrames(codeUnits, parentInsideAClass, "");
        // We could have disabled frame(s) just at the end of the code. 
        // Since no further frame would be used in the parse to close the ongoing comment block we need to check
        // if there are disabled frames being rendered when reaching the end of the editor's code.
        let disabledFrameBlockFlag = "";
        if(this.isDisabledFramesTriggered && !this.saveAsSPY) {
            this.isDisabledFramesTriggered = !this.isDisabledFramesTriggered;
            disabledFrameBlockFlag = this.disabledBlockIndent + DISABLEDFRAMES_FLAG ;
        }
        //console.timeEnd();
        return output + disabledFrameBlockFlag;
    }

    public getErrors(inputCode = ""): ErrorInfo[] {
        // If TigerPython offers errors in the same locale that Strype (and their locale code matches) we use that locale,
        // otherwise, English is used. The check is done in Strype when the locale is changed so we don't always check the
        // locale again and again when parsing the code...
        TPyParser.setLanguage(useStore().tigerPythonLang??"en");
        TPyParser.warningAsErrors = false;
        let code: string = inputCode;
        if (!inputCode) {
            code = this.parse({});
        }

        try {
            return TPyParser.findAllErrors(code);
        }
        catch (e) {
            return [{line:1, offset: 0, msg: "Unknown TigerPython error", code: ""}];
        }
    }

    public getErrorsFormatted(inputCode = ""): string {
        // We don't consider an empty code as a valid code: generate an error for that and set the main frame container erroneous
        if(inputCode.trim().length == 0){
            return i18n.t("appMessage.emptyCodeError") as string;
        }

        const errors = this.getErrors(inputCode);
        let errorString = "";
        if (errors.length > 0) {
            errorString = `${errors.map((e: any) => {
                return `\n${e.line}:${e.offset} | ${e.msg}`;
            })}`;

            
            // For each error, show red wiggles below its input in the UI
            errors.forEach((error: ErrorInfo) => {
                if(this.framePositionMap[error.line] !== undefined) {
                    // We try to locate the error inside the frames' slots.
                    // If a TigerPython error is raised AND that frame does not contain any slot, then we show the error on the frame.
                    // Look up in which slot the error should be shown (where the error offset is slotStart[i]<= offset AND slotStart[i] + slotLength[i] >= offset)
                    const labelSlotStartLengthsObj = Object.entries(this.framePositionMap[error.line].labelSlotStartLengths);
                    if(labelSlotStartLengthsObj.length > 0) {
                        let labelSlotsIndex = -1;
                        let slotId: string | undefined = undefined;
                        let slotType: SlotType = SlotType.code;                    
                        labelSlotStartLengthsObj.forEach((labelSlotStartLengthsEntry, labelSlotStartLengthsEntryIndex) => 
                            labelSlotStartLengthsEntry[1].slotStarts.forEach((slotStart, slotStartIndex) => {
                            // As we add a line extra space at every end of a line, it is possible that for the last slot of the frame, the error is found to be at the very end
                            // so for that very last slot, we add an extra unit of length to solve the problem that the error offset is found at the end of the line
                                const endOfLineOffset = (labelSlotStartLengthsEntryIndex == Object.keys(this.framePositionMap[error.line].labelSlotStartLengths).length - 1 && slotStartIndex == labelSlotStartLengthsEntry[1].slotStarts.length - 1) 
                                    ? 1 : 0;
                                if(slotStart <= error.offset && (slotStart + labelSlotStartLengthsEntry[1].slotLengths[slotStartIndex] + endOfLineOffset) >= error.offset){
                                // We do not allow an error to be shown on an operator. If that happens (for example the case of the "Unexcepted end of line or input" error if line ends with operator, and next is if frame)
                                // then we show the error on the following slot (an operator is always followed by something).
                                    const isErrorOnOperator = (labelSlotStartLengthsEntry[1].slotTypes[slotStartIndex] == SlotType.operator);
                                    labelSlotsIndex = parseInt(labelSlotStartLengthsEntry[0]);
                                    const slotStartIndexToUse = (isErrorOnOperator) ? slotStartIndex + 1 : slotStartIndex;
                                    slotId = labelSlotStartLengthsEntry[1].slotIds[slotStartIndexToUse];
                                    slotType = labelSlotStartLengthsEntry[1].slotTypes[slotStartIndexToUse];
                                }
                            }));

                        // Only show error if we have found the slot (slot errors)
                        if(labelSlotsIndex > -1 && slotId !== undefined && useStore().lastAddedFrameIds != this.framePositionMap[error.line].frameId){
                            useStore().setSlotErroneous({
                                frameId: this.framePositionMap[error.line].frameId,
                                labelSlotsIndex: labelSlotsIndex,
                                slotId: slotId,
                                slotType: slotType, 
                                error: error.msg,
                                // Other properties are not used
                                code: "",
                                initCode: "",
                                isFirstChange: true,
                            });
                        }
                    }
                    else{
                        // The case of an erreonous frame.
                        useStore().setFrameErroneous(this.framePositionMap[error.line].frameId, error.msg);
                    }
                }
            });
        }

        return errorString;
    }

    public removeErrorsFromParsedCode(code: string): string {
        const errors = this.getErrors(code);

        const lines = code.split(/\r?\n/g);

        // regularExpression to check the number of indentations 
        const regExp = new RegExp(INDENT, "g");

        let filteredCode = "";
    
        // We need to count the num of indentations to remove indented lines who's parent has an error
        let previousIndents = 0;

        // A flag that tells whether an error has open in a line; Used to avoid checking indented
        // -to the erroneous- lines of code
        let errorOpen = false;
        
        // remove errors line by line
        lines.forEach( (line,index) => {

            // get all the spaces at the beginning of a line
            // ^ = start , [\s]* = all space characters , [?!\s] = until you don't see a space
            const spaces = line.match(/^([\s]*[?!\s]){1}/g)??[""];
            // now count the number or indentations at the beginning of the line
            const indentationsInLine = (spaces.shift()?.match(regExp) || []).length;

            // If there was an error detected and we are inside it then go to the next iteration.
            if(errorOpen && indentationsInLine > previousIndents) {
                return;
            }

            // if the line has an error
            if(errors.find( (error) => error.line === index)) {
                // open the error flag
                errorOpen = true;
                // do not include the line
            }
            else {
                // no error found
                errorOpen = false;
                // include the line
                filteredCode += "\n"+line;
            }

            // store the indentations of this line as we go below (sibling code) or in it (child code)
            previousIndents = indentationsInLine;

        });
        
        return filteredCode;
    }

    public getAllImportsAndClassesCodeWithoutError(): string {
        // This is called to parse the imports and user defined classes of the project.
        // Note that to make it easier, we just get the whole "definitions" section rather than really just keeping the classes.
        const importCode = this.parse({startAtFrameId: useStore().getImportsFrameContainerId, stopAt:{frameId: useStore().getDefsFrameContainerId, includeThisFrame: false}, excludeLoopsAndCommentsAndCloseTry: true});        
        const classesCode = this.parse({startAtFrameId: useStore().getDefsFrameContainerId, stopAt:{frameId: useStore().getMainCodeFrameContainerId, includeThisFrame: false}, excludeLoopsAndCommentsAndCloseTry: true});
        return this.removeErrorsFromParsedCode(`${importCode}\n${classesCode}`);
    }

    public getWholeClassCodeWithoutError(classFrameId: number, currentFrameId: number): string{
        // This is called to parse the whole code of a user defined class bar the current frame we're in,
        // (similar to getCodeWithoutError but with only parsing a specifc frame).
        const classFrameSiblingId = getNextSibling(classFrameId);
        const frameIdAfterClass = (classFrameSiblingId > 0) ? classFrameSiblingId : useStore().getMainCodeFrameContainerId; // If that class is last in definitions, next frame is in "my code";
        const code = this.parse({startAtFrameId: classFrameId, stopAt:{frameId: frameIdAfterClass, includeThisFrame: false}, excludeLoopsAndCommentsAndCloseTry: true, ignoreSpecifiFrameId: currentFrameId});
        return this.removeErrorsFromParsedCode(code);
    }

    public getCodeWithoutErrors(endFrameId: number, defsLast: boolean): string {
        // defsLast is set to true when we are inside the def section: the variables in "my code"
        // may be required from within and therefore we need to place them before to interpreted properly.
        const code = this.parse({stopAt: {frameId: endFrameId, includeThisFrame: false}, excludeLoopsAndCommentsAndCloseTry: true, defsLast});
        return this.removeErrorsFromParsedCode(code);
    }

    public getFullCode(): string {
        return this.parse({excludeLoopsAndCommentsAndCloseTry: false});
    }

    private checkIfFrameHasError(frame: FrameObject): boolean {
        return !this.ignoreCheckErrors && retrieveSlotByPredicate(Object.values(frame.labelSlotsDict).map((labelSlotDict) => labelSlotDict.slotStructures),
            (slot: FieldSlot) => ((slot as BaseSlot).error?.length??0) > 0) != undefined;
    }

    public getFramePositionMap(): LineAndSlotPositions {
        return this.framePositionMap;
    }

    public getSlotStartsLengthsAndCodeForFrameLabel(slotStructures: SlotsStructure, currentOutputPosition: number, optionalSlot: OptionalSlotType, allowed: AllowedSlotContent, topLevel?: {frameType: string, slotIndex: number}): LabelSlotPositionsAndCode {
        // To retrieve this information, we procede with the following: 
        // we get the flat map of the slots and operate a consumer at each iteration to retrieve the infos we need
        let code = "";
        const slotStarts: number[] = [];
        const slotLengths: number[] = [];
        const slotIds: string[] = [];
        const slotTypes: SlotType[] = [];
        const addSlotInPositionLengths = (length: number, id: string, appendedCode: string, type: SlotType) => {
            slotStarts.push(currentOutputPosition + code.length);
            slotLengths.push(length); // add the surounding spaces
            slotIds.push(id);
            code += appendedCode;
            slotTypes.push(type);
        };

        generateFlatSlotBases({allowedSlotContent: allowed }, slotStructures, "", (flatSlot: FlatSlotBase, besidesOp: boolean, opAfter: undefined | string) => {
            if(isSlotQuoteType(flatSlot.type) || isSlotBracketType(flatSlot.type) || flatSlot.type === SlotType.media){
                // a quote or a bracket is a 1 character token, shown in the code
                // but it's not editable so we don't include it in the slot positions
                code += flatSlot.code;
            }
            else if(flatSlot.type == SlotType.operator){
                // an operator, if not blank, is shown in the code and we keep spaces surrounding it (for keyword operators)
                // there could be an error on an operator, so we included it in the slot positions
                if(flatSlot.code.length > 0){
                    // Add extra 2 characters for the surrounding spaces
                    const operatorSpace = (trimmedKeywordOperators.includes(flatSlot.code)) ? " " : "";
                    addSlotInPositionLengths(flatSlot.code.length + 2, flatSlot.id, operatorSpace + flatSlot.code + operatorSpace, flatSlot.type);
                }
            }
            else{        
                // that's an editable (code) slot, we get the position and length for that slot
                // we trim the field's code when we are not in a string literal
                let flatSlotCode = (isSlotStringLiteralType(flatSlot.type) ? flatSlot.code : flatSlot.code.trim());
                if (flatSlot.type != SlotType.string) {
                    if (besidesOp && this.saveAsSPY && flatSlotCode === "" && allowed != AllowedSlotContent.FREE_TEXT_DOCUMENTATION) {
                        flatSlotCode = STRYPE_EXPRESSION_BLANK;
                    }
                    if (this.saveAsSPY && flatSlotCode != "") {
                        let valid = true;
                        switch (allowed) {
                        case AllowedSlotContent.ONLY_NAMES:
                            valid = isValidPythonName(flatSlotCode);
                            break;
                        case AllowedSlotContent.ONLY_NAMES_OR_STAR:
                            valid = flatSlotCode.trim() == "*" || isValidPythonName(flatSlotCode);
                            break;
                        case AllowedSlotContent.TERMINAL_EXPRESSION:
                            valid = ["False", "None", "True"].includes(flatSlotCode.trim()) ||
                                isValidPythonName(flatSlotCode) ||
                                isValidPythonNumber(flatSlotCode);
                            // There is one very specific case that confuses the Python parser
                            // If there is a valid number followed by dot operator followed by something
                            // else (which won't be a valid number; if it was, we would have already made it one slot).
                            // So if we are a number followed by dot operator, we are considered invalid:
                            if (opAfter === "." && isValidPythonNumber(flatSlotCode)) {
                                valid = false;
                            }
                            break;
                        }
                        if (!valid) {
                            flatSlotCode = STRYPE_INVALID_SLOT + toUnicodeEscapes(flatSlotCode);
                        }
                    }
                }
                addSlotInPositionLengths(flatSlotCode.length, flatSlot.id, flatSlotCode, flatSlot.type);
            }
        }, this.saveAsSPY && allowed != AllowedSlotContent.FREE_TEXT_DOCUMENTATION ? transformSlotLevel : ((s) => s), topLevel);

        // There are a few fields which are permitted to be blank:
        if (this.saveAsSPY && code == "" && optionalSlot == OptionalSlotType.REQUIRED && allowed != AllowedSlotContent.FREE_TEXT_DOCUMENTATION) {
            code = STRYPE_EXPRESSION_BLANK;
        }
        
        return {code: code, slotLengths: slotLengths, slotStarts: slotStarts, slotIds: slotIds, slotTypes: slotTypes}; 
    }
}
