import Compiler from "@/compiler/compiler";
import { actOnTurtleImport, hasEditorCodeErrors, trimmedKeywordOperators } from "@/helpers/editor";
import { generateFlatSlotBases, retrieveSlotByPredicate } from "@/helpers/storeMethods";
import i18n from "@/i18n";
import { useStore } from "@/store/store";
import { AllFrameTypesIdentifier, BaseSlot, FieldSlot, FlatSlotBase, FrameContainersDefinitions, FrameObject, getLoopFramesTypeIdentifiers, isFieldBaseSlot, isSlotBracketType, isSlotQuoteType, isSlotStringLiteralType, LabelSlotPositionsAndCode, LabelSlotsPositions, LineAndSlotPositions, ParserElements, SlotsStructure, SlotType } from "@/types/types";
import { ErrorInfo, TPyParser } from "tigerpython-parser";

const INDENT = "    ";
const DISABLEDFRAMES_FLAG =  "\"\"\""; 

// Parse the code contained in the editor, and generate a compiler for this code if no error are found.
// The method returns an object containing the output code and the compiler.
export function parseCodeAndGetParseElements(requireCompilation: boolean): ParserElements{
    // Errors in the code (precompiled errors and TigerPython errors) are looked up at code edition.
    // Therefore, we expect the errors to already be found out when this method is called, and we don't need
    // to retrieve them again.
    const parser = new Parser();
    const out = parser.parse();

    const hasErrors = hasEditorCodeErrors();
    const compiler = new Compiler();
    if(requireCompilation){
        compiler.compile(out);
    }

    return {parsedOutput: out, hasErrors: hasErrors, compiler: compiler};
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

    constructor(ignoreCheckErrors?: boolean){
        if(ignoreCheckErrors != undefined){
            this.ignoreCheckErrors = ignoreCheckErrors;
        }
    }

    private parseBlock(block: FrameObject, indentation: string): string {
        let output = "";
        const children = useStore().getFramesForParentId(block.id);

        if(this.checkIfFrameHasError(block)) {
            return "";
        }

        const passBlock = this.excludeLoopsAndCommentsAndCloseTry && getLoopFramesTypeIdentifiers().includes(block.frameType.type);
        // on `excludeLoops` the loop frames must not be added to the code and nor should their contents be indented
        const conditionalIndent = (passBlock) ? "" : INDENT;

        output += 
            ((!passBlock)? this.parseStatement(block, indentation) : "") + 
            // We replace an empty block frame content by "pass". We also replace the frame's content if
            // the children are ALL blank or simple comment frames, because Python will see it as a problem. 
            // Any disabled frame (and multi lines comments which are actually transformed to multiple line comments) 
            // won't make an issue when executed, so we parse them normally.
            ((block.frameType.allowChildren && children.length > 0 && 
                children.some((childFrame) =>  childFrame.isDisabled 
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
            this.parseFrames(
                useStore().getJointFramesForFrameId(block.id, "all"), 
                indentation
            );
        
        return output;
    }

    private parsePseudoEmptyBlockContent(children: FrameObject[], indentation: string, conditionalIndent: string): string {
        // This method is called when parsing the content of a block frame that only contains simple comments or blank frames,
        // effectively making the block content empty. However, we need to 1) allow "passing" the content for Python to 
        // compile properly, and 2) make sure we keep the slots/lines mapping for proper errors handling.
        this.parseFrames(children);
        return (indentation + conditionalIndent +"pass" + "\n").repeat(children.length);
    }
    
    private parseStatement(statement: FrameObject, indentation = ""): string {
        let output = indentation;
        const labelSlotsPositionLengths: {[labelSlotsIndex: number]: LabelSlotsPositions} = {};
        
        if(this.checkIfFrameHasError(statement)){
            return "";
        }

        // Comments are treated separately for 2 reasons: 1) when we are parsing for a/c we don't want to parse the comments because they mess up with the try block surrounding the lines of code,
        // and 2) we need to check if the comment is multilines for setting the right comment indicator (''' instead of #). A comment is always a single slot so there is no extra logic to consider.
        if((statement.frameType.type === AllFrameTypesIdentifier.comment) 
        || (statement.frameType.type === AllFrameTypesIdentifier.funccall && isFieldBaseSlot(statement.labelSlotsDict[0].slotStructures.fields[0]) && (statement.labelSlotsDict[0].slotStructures.fields[0] as BaseSlot).code.startsWith("#"))){
            const commentContent = (statement.labelSlotsDict[0].slotStructures.fields[0] as BaseSlot).code;
            // Before returning, we update the line counter used for the frame mapping in the parser:
            // +1 except if we are in a multiline comment (and not excluding them) when we then return the number of lines-1 + 2 for the multi quotes
            // (for UI purpose our multiline comments content always terminates with an extra line return so we need to discard it)
            this.line += ((this.excludeLoopsAndCommentsAndCloseTry) ? 1 : ((commentContent.includes("\n")) ? 1 + commentContent.split("\n").length : 1));
            return (this.excludeLoopsAndCommentsAndCloseTry)
                ? "pass" // This will just be an empty code placeholder, so it shouldn't be a problem for the code
                : ((commentContent.includes("\n")) ? (indentation+"'''\n" + indentation + commentContent.replaceAll("\n", ("\n"+indentation)).replaceAll("'''","\\'\\'\\'") + "'''\n") : (indentation + "#" + commentContent + "\n"));
        }
            
        statement.frameType.labels.forEach((label, labelSlotsIndex) => {
            // For varassign frames, the symbolic assignment on the UI should be replaced by the Python "=" symbol
            if(label.showLabel??true){
                if ((statement.frameType.type === AllFrameTypesIdentifier.list || statement.frameType.type === AllFrameTypesIdentifier.set)){
                    if(label.label === " &#x21D0; ["){
                        output += " = [";
                    } 
                    else if(label.label === " &#x21D0; {"){
                        output += " = {";
                    } 
                    else if(label.label === "]"){
                        output += "]";
                    }
                    else if(label.label === "}"){
                        output += "}";
                    } 
                    else{
                        output += label.label;
                    }
                } 
                else{
                    output += ((label.label.length > 0 && (statement.frameType.type === AllFrameTypesIdentifier.varassign)) ? " = " : label.label);
                }
            }
            
            //if there are slots
            if(label.showSlots??true){
                // Record each slots' vertical positions for that label.
                const currentPosition = output.length;
                const slotStartsLengthsAndCode = this.getSlotStartsLengthsAndCodeForFrameLabel(useStore().frameObjects[statement.id].labelSlotsDict[labelSlotsIndex].slotStructures, currentPosition);
                labelSlotsPositionLengths[labelSlotsIndex] = {
                    slotStarts: slotStartsLengthsAndCode.slotStarts, 
                    slotLengths: slotStartsLengthsAndCode.slotLengths,
                    slotIds: slotStartsLengthsAndCode.slotIds,
                    slotTypes: slotStartsLengthsAndCode.slotTypes,
                };
                // add their code to the output
                output += slotStartsLengthsAndCode.code + " ";
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
                break;
            }
            //if the frame is disabled and we were not in a disabled group of frames, add the comments flag
            let disabledFrameBlockFlag = "";
            if(frame.isDisabled ? !this.isDisabledFramesTriggered : this.isDisabledFramesTriggered) {
                this.isDisabledFramesTriggered = !this.isDisabledFramesTriggered;
                if(frame.isDisabled) {
                    this.disabledBlockIndent = indentation;
                }
                disabledFrameBlockFlag = this.disabledBlockIndent + DISABLEDFRAMES_FLAG +"\n";
                //and also increment the line number that we use for mapping frames and code lines (even if the disabled frames don't map exactly, 
                //it doesn't matter since we will not have errors to show in those anyway)
                this.line += 1;
            }

            lineCode = frame.frameType.allowChildren ?
                // frame with children
                (Object.values(FrameContainersDefinitions).find((e) => e.type ===frame.frameType.type))?
                    // for containers call parseFrames again on their frames
                    this.parseFrames(useStore().getFramesForParentId(frame.id), "") 
                    :
                    // for simple block frames (i.e. if) call parseBlock
                    this.parseBlock(frame, indentation) 
                : 
                // single line frame
                this.parseStatement(frame, indentation);

            output += disabledFrameBlockFlag + lineCode;
            
            if (this.exitFlag && frame.frameType.type == AllFrameTypesIdentifier.try) {
                // We need to add an extra except to finish the try frame off and make it valid:
                output += indentation + "except:\n" + indentation + "    pass\n"; 
            }
        }

        return output;
    }

    public parse(startAtFrameId?: number, stopAtFrameId?: number, excludeLoopsAndCommentsAndCloseTry?: boolean): string {
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

        // We look if Turtle has been imported to notify the editor UI
        actOnTurtleImport();

        //console.time();
        output += this.parseFrames((this.startAtFrameId > -100) ? [useStore().frameObjects[this.startAtFrameId]] : useStore().getFramesForParentId(0));
        // We could have disabled frame(s) just at the end of the code. 
        // Since no further frame would be used in the parse to close the ongoing comment block we need to check
        // if there are disabled frames being rendered when reaching the end of the editor's code.
        let disabledFrameBlockFlag = "";
        if(this.isDisabledFramesTriggered) {
            this.isDisabledFramesTriggered = !this.isDisabledFramesTriggered;
            disabledFrameBlockFlag = this.disabledBlockIndent + DISABLEDFRAMES_FLAG ;
        }
        //console.timeEnd();
        return output + disabledFrameBlockFlag;
    }

    public getErrors(inputCode = ""): ErrorInfo[] {
        TPyParser.setLanguage("en");
        TPyParser.warningAsErrors = false;
        let code: string = inputCode;
        if (!inputCode) {
            code = this.parse();
        }

        return TPyParser.findAllErrors(code);
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
                return `\n${e.Ltigerpython_parser_ErrorInfo__f_line}:${e.Ltigerpython_parser_ErrorInfo__f_offset} | ${e.Ltigerpython_parser_ErrorInfo__f_msg}`;
            })}`;

            
            // For each error, show red wiggles below its input in the UI
            errors.forEach((error: ErrorInfo) => {
                if(this.framePositionMap[error.line] !== undefined) {
                    // Look up in which slot the error should be shown (where the error offset is slotStart[i]<= offset AND slotStart[i] + slotLength[i] >= offset)
                    let labelSlotsIndex = -1;
                    let slotId: string | undefined = undefined;
                    let slotType: SlotType = SlotType.code;
                    Object.entries(this.framePositionMap[error.line].labelSlotStartLengths).forEach((labelSlotStartLengthsEntry, labelSlotStartLengthsEntryIndex) => 
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

                    // Only show error if we have found the slot
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
            });
        }

        return errorString;
    }

    public getCodeWithoutErrorsAndLoops(endFrameId: number): string {
        const code = this.parse(undefined, endFrameId, true);

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
        
        let output = "";                     // the code that will go to Skulpt for autocomplete
        let prevIndentation = 0;             // holds the indentation of the previous line
        const openedTryMap = [] as string[]; // For each try opened, we store the white spaces in front of it.
        let tryFromTheUser = false;          // When the except is open no need to add try catch in it.

        // Now add try/except statements around each statement and block
        // This cannot be done on the previous stage (error removal) as 
        // There may be some blocks with potentially unhandled errors by 
        // try/except, like `for:` or `import 3 from x`
        filteredCode.split(/\r?\n/g).forEach( (line) => {

            // get all the spaces at the beginning of a line
            const spaces = line.match(/^([\s]*[?!\s]){1}/g)??[""];
            // now count the number or indentations at the beginning of the line
            const indentationsInLine = (spaces[0]?.match(regExp) || []).length; 

            // Whenever the indentation count in the line is reduced, we are exiting a block statement
            // At that incidence (and since it is not a compound AND there has been an opened try earlier)
            // we need to close the trys with excepts
            if( indentationsInLine < prevIndentation && !this.isCompoundStatement(line,spaces) && openedTryMap.length>0 && !this.isExcept(line,spaces)) {

                // How many indentations we went left?
                const indentsDiff = prevIndentation - indentationsInLine;

                // For every indentation close the try and remove it from the map
                for (let i = 0; i < indentsDiff; i++) {
                    const tryIndent = openedTryMap.pop();

                    // This case is only for exiting a function, where there is an indent diff
                    // but there is no try opened!
                    if(tryIndent === undefined) { 
                        break;
                    }
                    output += tryIndent + "except:\n" + tryIndent + INDENT + "pass" + "\n";
                }
            }

            // if the line is not empty and not comprised only from white spaces
            if(line && (/\S/.test(line))) {
                // Compound statements do not get an indentation, every other statement in the block does
                const conditionalIndent = (!this.isCompoundStatement(line,spaces) && !this.isTryOrExcept(line,spaces) && !tryFromTheUser ) ? INDENT : "";
                // If we add a try, we need to know how far in we are already from previous trys
                const tryIndentation = INDENT.repeat(openedTryMap.length);
                
                if ( this.isTry(line,spaces) ) {
                    tryFromTheUser = true;
                }

                // Add the try only if it's not a compound nor func def nor an except nor a try
                if(!this.isCompoundStatement(line,spaces) && !this.isFunctionDef(line,spaces) && !this.isTryOrExcept(line,spaces) && !tryFromTheUser) {
                    output += (spaces + tryIndentation + "try:\n");
                    openedTryMap.push(spaces + tryIndentation);
                }
                
                // Add the line -- we add indent only if we're not in function declaration line
                output += 
                    ((!this.isFunctionDef(line,spaces)) ? 
                        (tryIndentation + conditionalIndent)
                        :
                        "") 
                    + line + "\n"; // `line` includes `spaces` at its beginning

                // Add the except if the line is not a compound AND not a func def AND not the starting of a block nor an except
                if(!this.isCompoundStatement(line,spaces) && !this.isFunctionDef(line,spaces) && !line.endsWith(":") && !this.isTryOrExcept(line,spaces) && !tryFromTheUser){
                    output += spaces + tryIndentation + "except:\n" + spaces + tryIndentation + INDENT + "pass" + "\n";
                    openedTryMap.pop();
                }
                
                if( tryFromTheUser && !this.isTry(line,spaces) ) {
                    tryFromTheUser = false;
                }
            }
            // Before going to the new line, we need to store the indentation of this lines
            prevIndentation = indentationsInLine;
        });

        return output;
    }

    public getFullCode(): string {
        return this.parse(undefined, undefined, false);
    }

    private checkIfFrameHasError(frame: FrameObject): boolean {
        return !this.ignoreCheckErrors && retrieveSlotByPredicate(Object.values(frame.labelSlotsDict).map((labelSlotDict) => labelSlotDict.slotStructures),
            (slot: FieldSlot) => ((slot as BaseSlot).error?.length??0) > 0) != undefined;
    }

    private isCompoundStatement(line: string, spaces: string[]): boolean {
        // it's a compound statement if
        return line.startsWith(spaces+"elif ") ||  // it's an elif statement OR
               line.startsWith(spaces+"else ") ||  // it's an else statement OR
               line.startsWith(spaces+"finally "); // it's a finally statement
        
        // We do not have to check try and except here as they are checked by getCodeWithoutErrors       
    }

    private isTryOrExcept(line: string, spaces: string[]): boolean {
        return this.isTry(line,spaces) || this.isExcept(line,spaces);
    }

    private isTry(line: string, spaces: string[]): boolean {
        return line.startsWith(spaces+"try:");  // it's a try statement
    }

    private isExcept(line: string, spaces: string[]): boolean {
        return line.startsWith(spaces+"except ") || line.startsWith(spaces+"except:"); // it's an except statement
    }

    private isFunctionDef(line: string, spaces: string[]): boolean {
        // it's not a function definition  if
        return line.startsWith(spaces+"def ");  // it starts with a def
    }

    public getFramePositionMap(): LineAndSlotPositions {
        return this.framePositionMap;
    }

    public getSlotStartsLengthsAndCodeForFrameLabel(slotStructures: SlotsStructure, currentOutputPosition: number): LabelSlotPositionsAndCode {
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

        generateFlatSlotBases(slotStructures, "", (flatSlot: FlatSlotBase) => {
            if(isSlotQuoteType(flatSlot.type) || isSlotBracketType(flatSlot.type)){
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
                const flatSlotCode = (isSlotStringLiteralType(flatSlot.type) ? flatSlot.code : flatSlot.code.trim());
                addSlotInPositionLengths(flatSlotCode.length, flatSlot.id, flatSlotCode, flatSlot.type);
            }
        });
        return {code: code, slotLengths: slotLengths, slotStarts: slotStarts, slotIds: slotIds, slotTypes: slotTypes}; 
    }
}
