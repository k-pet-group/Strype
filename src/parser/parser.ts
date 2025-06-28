import Compiler from "@/compiler/compiler";
import { hasEditorCodeErrors, trimmedKeywordOperators } from "@/helpers/editor";
import { generateFlatSlotBases, retrieveSlotByPredicate } from "@/helpers/storeMethods";
import i18n from "@/i18n";
import { useStore } from "@/store/store";
import {AllFrameTypesIdentifier, AllowedSlotContent, BaseSlot, ContainerTypesIdentifiers, FieldSlot, FlatSlotBase, FrameContainersDefinitions, FrameObject, getLoopFramesTypeIdentifiers, isFieldBaseSlot, isFieldBracketedSlot, isSlotBracketType, isSlotQuoteType, isSlotStringLiteralType, LabelSlotPositionsAndCode, LabelSlotsPositions, LineAndSlotPositions, MediaSlot, ParserElements, SlotsStructure, SlotType, StringSlot} from "@/types/types";
import { ErrorInfo, TPyParser } from "tigerpython-parser";
import {AppSPYPrefix} from "@/main";
/*IFTRUE_isPython */
import { actOnTurtleImport } from "@/helpers/editor";
/*FITRUE_isPython */
import {STRYPE_DUMMY_FIELD, STRYPE_EXPRESSION_BLANK, STRYPE_INVALID_OP, STRYPE_INVALID_OPS_WRAPPER, STRYPE_INVALID_SLOT} from "@/helpers/pythonToFrames";
const INDENT = "    ";
const DISABLEDFRAMES_FLAG =  "\"\"\""; 

// Parse the code contained in the editor, and generate a compiler for this code if no error are found.
// The method returns an object containing the output code and the compiler.
export function parseCodeAndGetParseElements(requireCompilation: boolean, saveAsSPY?: boolean): ParserElements{
    // Errors in the code (precompiled errors and TigerPython errors) are looked up at code edition.
    // Therefore, we expect the errors to already be found out when this method is called, and we don't need
    // to retrieve them again.
    const parser = new Parser(false, saveAsSPY);
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
        if (slots.operators[i].code.trim() === "") {
            const before = slots.fields[i];
            if (!(isFieldBaseSlot(before) && before.code.trim() === "")) {
                if (i + 1 < slots.fields.length) {
                    const after = slots.fields[i + 1];
                    if (!(isFieldBaseSlot(after) && after.code == "") && !(isFieldBracketedSlot(after) && (after.openingBracketValue == "(" || after.openingBracketValue == "["))) {
                        valid = false;
                        break;
                    }
                }
            }
        }
        if (slots.operators[i].code.trim() === ",") {
            if (topLevel) {
                if (![AllFrameTypesIdentifier.varassign,
                    AllFrameTypesIdentifier.for,
                    AllFrameTypesIdentifier.return].includes(topLevel.frameType)) {
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

export default class Parser {
    private startAtFrameId = -100; // default value to indicate there is no start
    private stopAtFrameId = -100; // default value to indicate there is no stop
    private exitFlag = false; // becomes true when the stopAtFrameId is reached.
    private framePositionMap: LineAndSlotPositions = {} as LineAndSlotPositions;  // For each line holds the positions the *editable slots* start at
    private line = 0;
    private isDisabledFramesTriggered = false; //this flag is used to notify when we enter and leave the disabled frames.
    private disabledBlockIndent = "";
    private excludeLoopsAndCommentsAndCloseTry = false;
    private ignoreCheckErrors = false;
    private saveAsSPY = false;
    private stoppedIndentation = ""; // The indentation level when we encountered the stop frame.
    private libraries : string[] = [];
    
    constructor(ignoreCheckErrors?: boolean, saveAsSPY?: boolean) {
        if(ignoreCheckErrors != undefined){
            this.ignoreCheckErrors = ignoreCheckErrors;
        }
        this.saveAsSPY = saveAsSPY ?? false;
    }
    
    public getStoppedIndentation() : string {
        return this.stoppedIndentation;
    }
    
    public getLibraries() : string[] {
        return [...this.libraries];
    }

    private parseBlock(block: FrameObject, indentation: string): string {
        let output = "";
        const children = useStore().getFramesForParentId(block.id);

        if(this.checkIfFrameHasError(block) && !this.saveAsSPY) {
            return "";
        }

        const passBlock = this.excludeLoopsAndCommentsAndCloseTry && getLoopFramesTypeIdentifiers().includes(block.frameType.type);
        // on `excludeLoops` the loop frames must not be added to the code and nor should their contents be indented
        const conditionalIndent = (passBlock) ? "" : INDENT;

        output += 
            ((!passBlock)? this.parseStatement(block, indentation) : "") +
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
                indentation
            );
        
        return output;
    }

    private parsePseudoEmptyBlockContent(children: FrameObject[], indentation: string, conditionalIndent: string): string {
        // This method is called when parsing the content of a block frame that only contains simple comments or blank frames,
        // effectively making the block content empty. However, we need to 1) allow "passing" the content for Python to 
        // compile properly, and 2) make sure we keep the slots/lines mapping for proper errors handling.
        const emptyContent = this.parseFrames(children, indentation + conditionalIndent);
        const passLine = indentation + conditionalIndent + "pass" + "\n";
        return this.saveAsSPY ? emptyContent : passLine.repeat(children.length);
    }
    
    private parseStatement(statement: FrameObject, indentation = ""): string {
        let output = indentation;
        const labelSlotsPositionLengths: {[labelSlotsIndex: number]: LabelSlotsPositions} = {};
        
        if(this.checkIfFrameHasError(statement) && !this.saveAsSPY){
            return "";
        }

        // Comments are treated separately for 2 reasons: 1) when we are parsing for a/c we don't want to parse the comments because they mess up with the try block surrounding the lines of code,
        // and 2) we need to check if the comment is multilines for setting the right comment indicator (''' instead of #). A comment is always a single slot so there is no extra logic to consider.
        if((statement.frameType.type === AllFrameTypesIdentifier.comment)
        || (statement.frameType.type === AllFrameTypesIdentifier.library)
        || (!this.saveAsSPY && statement.frameType.type === AllFrameTypesIdentifier.funccall && isFieldBaseSlot(statement.labelSlotsDict[0].slotStructures.fields[0]) && (statement.labelSlotsDict[0].slotStructures.fields[0] as BaseSlot).code.startsWith("#"))){
            const commentContent = (statement.labelSlotsDict[0].slotStructures.fields[0] as BaseSlot).code;
            
            // Before returning, we update the line counter used for the frame mapping in the parser:
            // +1 except if we are in a multiline comment (and not excluding them) when we then return the number of lines-1 + 2 for the multi quotes
            // (for UI purpose our multiline comments content always terminates with an extra line return so we need to discard it)
            this.line += ((this.excludeLoopsAndCommentsAndCloseTry) ? 1 : ((commentContent.includes("\n")) ? 1 + commentContent.split("\n").length : 1));

            const passLine = indentation + "pass" + "\n";
            
            if (statement.frameType.type === AllFrameTypesIdentifier.library) {
                if (!statement.isDisabled) {
                    this.libraries.push(commentContent);
                }
                if (this.saveAsSPY) {
                    return indentation + "#" + AppSPYPrefix + " " + (statement.isDisabled ? "LibraryDisabled" : "Library") + ":" + commentContent + "\n";
                }
                else {
                    return passLine; // Make sure we don't mess up the line numbers
                }
            }
            
            return (this.excludeLoopsAndCommentsAndCloseTry)
                ? passLine // This will just be an empty code placeholder, so it shouldn't be a problem for the code
                : ((commentContent.includes("\n")) ? (indentation+"'''\n" + indentation + commentContent.replaceAll("\n", ("\n"+indentation)).replaceAll("'''","\\'\\'\\'") + "'''\n") : (indentation + "#" + commentContent + "\n"));
        }
            
        statement.frameType.labels.forEach((label, labelSlotsIndex) => {
            // For varassign frames, the symbolic assignment on the UI should be replaced by the Python "=" symbol
            if(label.showLabel??true){
                output += ((label.label.length > 0 && statement.frameType.type === AllFrameTypesIdentifier.varassign) ? " = " : label.label);
            }
            
            //if there are slots
            if(label.showSlots??true){
                // Record each slots' vertical positions for that label.
                const currentPosition = output.length;
                const slotStartsLengthsAndCode = this.getSlotStartsLengthsAndCodeForFrameLabel(useStore().frameObjects[statement.id].labelSlotsDict[labelSlotsIndex].slotStructures, currentPosition, label.optionalSlot ?? false, label.allowedSlotContent ?? AllowedSlotContent.TERMINAL_EXPRESSION, {frameType: statement.frameType.type, slotIndex: labelSlotsIndex});
                labelSlotsPositionLengths[labelSlotsIndex] = {
                    slotStarts: slotStartsLengthsAndCode.slotStarts, 
                    slotLengths: slotStartsLengthsAndCode.slotLengths,
                    slotIds: slotStartsLengthsAndCode.slotIds,
                    slotTypes: slotStartsLengthsAndCode.slotTypes,
                };
                // add their code to the output
                output += slotStartsLengthsAndCode.code.trimStart() + " ";
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

    private parseFrames(codeUnits: FrameObject[], indentation = ""): string {
        let output = "";
        let lineCode = "";

        //if the current frame is a container, we don't parse it as such
        //but parse directly its children (frames that it contains)
        for (const frame of codeUnits) {
            if(frame.id === this.stopAtFrameId || this.exitFlag){
                this.exitFlag = true; // this is used in case we are inside a recursion
                if (frame.id === this.stopAtFrameId) {
                    this.stoppedIndentation = indentation;
                }
                break;
            }
            
            if (this.saveAsSPY && frame.frameType.type === ContainerTypesIdentifiers.framesMainContainer) {
                output += "#" + AppSPYPrefix + " Section:Main\n";
                this.line += 1;
            }
            else if (this.saveAsSPY && frame.frameType.type === ContainerTypesIdentifiers.funcDefsContainer) {
                output += "#" + AppSPYPrefix + " Section:Definitions\n";
                this.line += 1;
            }
            else if (this.saveAsSPY && frame.frameType.type === ContainerTypesIdentifiers.importsContainer) {
                output += "#" + AppSPYPrefix + " Section:Imports\n";
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
                    thisIndentation = indentation + "#" + AppSPYPrefix + " Disabled:";
                }
            }

            lineCode = frame.frameType.allowChildren ?
                // frame with children
                (Object.values(FrameContainersDefinitions).find((e) => e.type ===frame.frameType.type))?
                    // for containers call parseFrames again on their frames
                    this.parseFrames(useStore().getFramesForParentId(frame.id), "") 
                    :
                    // for simple block frames (i.e. if) call parseBlock
                    this.parseBlock(frame, thisIndentation) 
                : 
                // single line frame
                this.parseStatement(frame, thisIndentation);

            output += disabledFrameBlockFlag + lineCode;
            
            if (this.exitFlag && frame.frameType.type == AllFrameTypesIdentifier.try) {
                // We need to add an extra except to finish the try frame off and make it valid:
                output += thisIndentation + "except:\n" + thisIndentation + "    pass\n"; 
            }

            if (this.saveAsSPY && frame.frameType.type === ContainerTypesIdentifiers.framesMainContainer) {
                output += "#" + AppSPYPrefix + " Section:End\n";
            }            
        }

        return output;
    }
    
    public parseJustImports() : string {
        return this.parse({startAtFrameId: useStore().getImportsFrameContainerId, stopAtFrameId: useStore().getFuncDefsFrameContainerId});
    }

    public parse({startAtFrameId, stopAtFrameId, excludeLoopsAndCommentsAndCloseTry, defsLast}: {startAtFrameId?: number, stopAtFrameId?: number, excludeLoopsAndCommentsAndCloseTry?: boolean, defsLast?: boolean}): string {
        let output = "";
        if(startAtFrameId){
            this.startAtFrameId = startAtFrameId;
        }
        if(stopAtFrameId){
            this.stopAtFrameId = stopAtFrameId;
        }

        if(excludeLoopsAndCommentsAndCloseTry){
            this.excludeLoopsAndCommentsAndCloseTry = excludeLoopsAndCommentsAndCloseTry;
        }

        /* IFTRUE_isPython */
        // We look if Turtle has been imported to notify the editor UI
        actOnTurtleImport();
        /* FITRUE_isPython */

        //console.time();
        let codeUnits: FrameObject[];
        if (this.startAtFrameId > -100) {
            codeUnits = [useStore().frameObjects[this.startAtFrameId]];
        }
        else {            
            codeUnits = useStore().getFramesForParentId(0);
            if (defsLast) {
                codeUnits = codeUnits
                    .filter((item) => item.frameType.type !== ContainerTypesIdentifiers.funcDefsContainer)
                    .concat(codeUnits.filter((item) => item.frameType.type === ContainerTypesIdentifiers.funcDefsContainer));
            }
        }
        output += this.parseFrames(codeUnits, "");
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

    public getCodeWithoutErrors(endFrameId: number, defsLast: boolean): string {
        const code = this.parse({stopAtFrameId: endFrameId, excludeLoopsAndCommentsAndCloseTry: true, defsLast});

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

    public getSlotStartsLengthsAndCodeForFrameLabel(slotStructures: SlotsStructure, currentOutputPosition: number, optionalSlot: boolean, allowed: AllowedSlotContent, topLevel?: {frameType: string, slotIndex: number}): LabelSlotPositionsAndCode {
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

        generateFlatSlotBases(slotStructures, "", (flatSlot: FlatSlotBase, besidesOp: boolean, opAfter: undefined | string) => {
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
                    if (besidesOp && this.saveAsSPY && flatSlotCode === "") {
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
        }, this.saveAsSPY ? transformSlotLevel : ((s) => s), topLevel);

        // There are a few fields which are permitted to be blank:
        if (this.saveAsSPY && code == "" && !optionalSlot) {
            code = STRYPE_EXPRESSION_BLANK;
        }
        
        return {code: code, slotLengths: slotLengths, slotStarts: slotStarts, slotIds: slotIds, slotTypes: slotTypes}; 
    }
}
