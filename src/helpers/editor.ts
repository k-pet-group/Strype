import i18n from "@/i18n";
import { useStore } from "@/store/store";
import { AddFrameCommandDef, AddShorthandFrameCommandDef, AllFrameTypesIdentifier, areSlotCoreInfosEqual, BaseSlot, CaretPosition, FieldSlot, FrameContextMenuActionName, FrameContextMenuShortcut, FramesDefinitions, getFrameDefType, isFieldBaseSlot, isFieldBracketedSlot, isFieldMediaSlot, isFieldStringSlot, isSlotBracketType, isSlotQuoteType, isSlotStringLiteralType, MediaSlot, ModifierKeyCode, NavigationPosition, Position, SelectAllFramesAction, SlotCoreInfos, SlotCursorInfos, SlotsStructure, SlotType, StringSlot } from "@/types/types";
import { getAboveFrameCaretPosition, getAllChildrenAndJointFramesIds, getAvailableNavigationPositions, getFrameBelowCaretPosition, getFrameContainer, getFrameSectionIdFromFrameId } from "./storeMethods";
import { splitByRegexMatches, strypeFileExtension } from "./common";
import {getContentForACPrefix} from "@/autocompletion/acManager";
import scssVars  from "@/assets/style/_export.module.scss";
import html2canvas, { Options } from "html2canvas";
import CaretContainer from "@/components/CaretContainer.vue";
import { vm } from "@/main";
import Vue from "vue";
import Frame from "@/components/Frame.vue";
import FrameContainer from "@/components/FrameContainer.vue";
import FrameBody from "@/components/FrameBody.vue";
import JointFrames from "@/components/JointFrames.vue";
// #v-ifdef MODE == VITE_STANDARD_PYTHON_MODE
import CommandsComponent from "@/components/Commands.vue";
import PythonExecutionArea from "@/components/PythonExecutionArea.vue";
import { debounce } from "lodash";
// #v-endif
import {toUnicodeEscapes} from "@/parser/parser";
import {fromUnicodeEscapes} from "@/helpers/pythonToFrames";

export const undoMaxSteps = 50;
export const autoSaveFreqMins = 2; // The number of minutes between each autosave action.

// Constants used for query parameters parsing
// The target to fetch the project (for now, we only support Google Drive. We use the enum StrypeSyncTarget for values)
export const sharedStrypeProjectTargetKey = "shared_proj_targ"; 
// The URL of the project, with the URL pattern (template) for each possible target
export const sharedStrypeProjectIdKey = "shared_proj_id";

// LocalStorage keys used by Strype 
export enum AutoSaveKeyNames {
    settingsState = "StrypeSettingsState",
    pythonEditorState = "PythonStrypeSavedState",
    mbEditor = "MicrobitStrypeSavedState",
}

// Custom JS events in Strype
export enum CustomEventTypes {
    appResetProject = "appResetProject",
    appShowProgressOverlay = "appShowProgressOverlay",
    contextMenuHovered = "contextMenuHovered",
    requestCaretContextMenuClose="requestCaretContextMenuClose",
    requestAppNotOnTop="requestAppNotOnTop",
    editorAddFrameCommandsUpdated = "frameCommandsUpdated",
    frameContentEdited = "frameContentEdited",
    notifyLabelSlotInError = "notifyLabelSlotInError",
    requestSlotsRefactoring ="requestSlotsRefactoring",
    editableSlotGotCaret= "slotGotCaret",
    editableSlotLostCaret = "slotLostCaret",
    editorContentPastedInSlot = "contentPastedInSlot",
    scrollCaretIntoView = "scrollCaretIntoView",
    addFunctionToEditorProjectSave = "addToProjectSaveFunction",
    removeFunctionToEditorProjectSave = "rmToProjectSaveFunction",
    requestEditorProjectSaveNow = "requestProjectSaveNow",
    saveStrypeProjectDoneForLoad = "saveProjDoneForLoad",
    unsupportedByStrypeFilePicked = "unsupportedByStrypeFilePicked",
    acItemHovered = "acItemHovered",
    openSharedFileDone = "openSharedFileDone",
    dropFramePositionsUpdated = "dropFramePositionsUpdated",
    resetLSOnShareProjectLoadConfirmed = "resetLSOnShareProjectLoadConfirmed",
    requestedCloudDrivePickerPickedItem = "requestedCloudDrivePickerPickedItme",
    exposedCloudDrivePickerPickedItem = "exposedCloudDrivePickerPickedItem",
    requestedCloudDriveItemChildren = "requestedCloudDriveItemChildren",
    exposedCloudDriveItemChidren = "exposedCloudDriveItemChidren",
    requestedCloudDrivePickerRefresh = "requestedCloudDrivePickerRefresh",
    cutFrameSelection = "cutFrameSelection",
    copyFrameSelection = "copyFrameSelection",
    updateParamPrompts = "updateParamPrompts",
    // #v-ifdef MODE == VITE_STANDARD_PYTHON_MODE
    pythonExecAreaMounted = "peaMounted",
    pythonExecAreaExpandCollapseChanged = "peaExpandCollapsChanged",
    pythonConsoleRequestFocus = "pythonConsoleReqFocus",
    pythonConsoleAfterInput = "pythonConsoleAfterInput",
    notifyTurtleUsage = "turtleUsage",
    pythonExecAreaSizeChanged = "peaSizeChanged",
    skulptMouseEventListenerOff = "skMouseEventsOff",
    skulptTimerEventListenerOff = "skTimerEventsOff",
    highlightPythonRunningState = "highlightPythonRunningState"
    // #v-endif
}

export const frameContextMenuShortcuts: FrameContextMenuShortcut[] = [
    {actionName: FrameContextMenuActionName.copy, firstModifierKey: [ModifierKeyCode.ctrl, ModifierKeyCode.meta], mainKey: "c"},
    {actionName: FrameContextMenuActionName.cut, firstModifierKey: [ModifierKeyCode.ctrl, ModifierKeyCode.meta], mainKey: "x"},
    {actionName: FrameContextMenuActionName.paste, firstModifierKey: [ModifierKeyCode.ctrl, ModifierKeyCode.meta], mainKey: "v"},
    {actionName: FrameContextMenuActionName.delete, mainKey: "delete"},
];

export function getFrameContainerUID(frameId: number): string {
    return "frameContainer_" + frameId;
}

export function getFrameBodyUID(frameId: number): string {
    return "frameBodyId_" + frameId;
}

export function getFrameBodyRef(): string {
    return "frameBody";
}

export function getJointFramesRef(): string {
    return "jointFrames";
}

export function getFrameUID(frameId: number): string{
    return "frame_id_" + frameId;
}

export function getFrameHeaderUID(frameId: number): string{
    // Change parseFrameHeaderUID and isElementUIDFrameHeaderDiv if this changes
    return "frameHeader_" + frameId;
}

export function parseFrameHeaderUID(frameHeaderUID: string): number{
    // Cf. getFrameHeaderUID for the ID template
    return parseInt(frameHeaderUID.substring(frameHeaderUID.indexOf("_") + 1));
}

export function isElementUIDFrameHeader(frameHeaderUID: string): boolean {
    return frameHeaderUID.match(/^frameHeader_(-?\d+)$/) != null;
}

export function getAppSimpleMsgDlgId(): string {
    return "appSimpleMsgModalDlg";
}

export function getImportDiffVersionModalDlgId(): string {
    return "importDiffVersionModalDlg";
}

export function getCloudLoginErrorModalDlgId(): string {
    return "cloudLoginErrorModalDlg";
}

const frameUIDRegex = /^frame_id_(\d+)$/;
export function isIdAFrameId(id: string): boolean {
    return id.match(frameUIDRegex) !== null;
}

// Parse a frameUID to retrieve the frame ID. 
// As finding the match against the regex may fail, we need a fallout value: -100;
export function parseFrameUID(frameUID: string): number {
    const frameUIDMatch = frameUID.match(frameUIDRegex);
    return (frameUIDMatch) ? parseInt(frameUIDMatch[1]) : -100;
}

const labelSlotUIDRegex = /^input_frame_(-?\d+)_label_(\d+)_slot_([0-7]{8})_(\d+(,\d+)*)$/;
export function getLabelSlotUID(slotCoreInfos: SlotCoreInfos): string {
    // If a change is done in this method, also update isElementEditLabelSlotInput() and parseLabelSlotUID()
    // For explanation about the slotID format, see generateFlatSlotBases() in storeMethods.ts
    // note: slotype is an enum value, which is rendered as an octal 8 digits value (eg "00000010")
    const paddedTypValue = slotCoreInfos.slotType.toString(8).padStart(8,"0");
    return "input_frame_" + slotCoreInfos.frameId + "_label_" + slotCoreInfos.labelSlotsIndex + "_slot_" + paddedTypValue + "_" + slotCoreInfos.slotId;
}


export function parseLabelSlotUID(UID: string): SlotCoreInfos {
    // Cf. getLabelSlotUID() for the format
    const res: SlotCoreInfos = {frameId: -100, labelSlotsIndex: -1, slotId: "", slotType: SlotType.code };
    const UIDMatch = UID.match(labelSlotUIDRegex);
    if(UIDMatch){
        res.frameId = parseInt(UIDMatch[1]);
        res.labelSlotsIndex = parseInt(UIDMatch[2]);
        res.slotId = UIDMatch[4];
        res.slotType = parseInt(UIDMatch[3], 8);
    }
    return res;
}

export function isElementLabelSlotInput(element: EventTarget | null): element is HTMLSpanElement {
    if(!(element instanceof HTMLSpanElement)){
        return false;
    }
    // Cf. getLabelSlotUID() for the format
    return (element as HTMLSpanElement).id.match(labelSlotUIDRegex) != null;
}

export function isElementEditableLabelSlotInput(element: EventTarget | null): boolean{
    if(!(element instanceof HTMLSpanElement)){
        return false;
    }
    // Cf. getLabelSlotUID() for the format
    const regexMatch = (element as HTMLSpanElement).id.match("^input_frame_-?\\d+_label_\\d+_slot_0000000(\\d)_\\d+(,\\d+)*$");
    return regexMatch != null && parseInt(regexMatch[1]) < 8;
}

export function isLabelSlotEditable(type: SlotType): boolean {
    return !isSlotBracketType(type) && !isSlotQuoteType(type) && type != SlotType.operator;
}

export function getACLabelSlotUID(slotCoreInfos: SlotCoreInfos): string {
    return getLabelSlotUID(slotCoreInfos) + "_AutoCompletion";
}

export function getAddFrameCmdElementUID(commandType: string): string {
    return "addFrameCmd_" + commandType;
}

export function getAppLangSelectId(): string {
    return "strypeLangSelect";
}

// #v-ifdef MODE == VITE_STANDARD_PYTHON_MODE
/** This section contains accessors for the PEA components' ID, used within the application */
export function getPEAComponentRefId(): string {
    return "peaComponent";
}

export function getPEAControlsDivId(): string {
    return "peaControlsDiv";
}

export function getPEATabContentContainerDivId(): string {
    return "peaTabContentContainerDiv";
}

export function getPEAGraphicsContainerDivId(): string {
    return "peaGraphicsContainerDiv";
}

export function getPEAGraphicsDivId(): string {
    return "peaGraphicsDiv";
}

export function getPEAConsoleId(): string {
    return "peaConsole";
}
/** end of section */
// #v-endif

export function getTextStartCursorPositionOfHTMLElement(htmlElement: HTMLSpanElement): number {
    // For (editable) spans, it is not straight forward to retrieve the text cursor position, we do it via the selection API
    // if the text in the element is selected, we show the start of the selection.
    let caretPos = 0;
    const sel = document.getSelection();
    if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        if (range.commonAncestorContainer.parentNode == htmlElement
            || range.commonAncestorContainer.parentNode?.parentNode == htmlElement) {
            caretPos = range.startOffset;
        }
    }
    return caretPos;
}

export function getFocusedEditableSlotTextSelectionStartEnd(labelSlotUID: string): {selectionStart: number, selectionEnd: number} {
    // A helper function to get the selection relative to a *focused* slot: if the selection spans across several slots, we get the right boundary values for the given slot
    const focusCursorInfos = useStore().focusSlotCursorInfos;
    const anchorCursorInfos = useStore().anchorSlotCursorInfos;
    if(anchorCursorInfos != null && focusCursorInfos != null ){
        if(areSlotCoreInfosEqual(anchorCursorInfos.slotInfos, focusCursorInfos.slotInfos)){
            // The selection is within a slot, so we just return the positions
            return {selectionStart: Math.min(focusCursorInfos.cursorPos, anchorCursorInfos.cursorPos), selectionEnd: Math.max(focusCursorInfos.cursorPos, anchorCursorInfos.cursorPos)};
        }
        else{
            // The selection spans across slots (but we cannot be across frames): we check whether this slot is part of the selection,
            // we only need to check where is the anchor cursor: before or after the focus cursor
            const cursorComp = getSelectionCursorsComparisonValue() as number;
            if(cursorComp < 0){
                // the anchor is somewhere before the focus cursor: the selection start is 0 for this slot
                return {selectionStart: 0, selectionEnd: focusCursorInfos.cursorPos};
            }
            else{
                // the anchor is somewhere after the focus cursor: the selection end is at the end of the slot
                return {selectionStart: focusCursorInfos.cursorPos, selectionEnd: (document.getElementById(labelSlotUID) as HTMLSpanElement).textContent?.replace(/\u200B/g, "")?.length??0};
            }
        }
    }

    // If no selection we return negative values
    return {selectionStart: -1, selectionEnd: -1};
}

export function setDocumentSelection(anchorCursorInfos: SlotCursorInfos, focusCursorInfos: SlotCursorInfos): void{
    const anchorElement = document.getElementById(getLabelSlotUID(anchorCursorInfos.slotInfos));
    const focusElement = document.getElementById(getLabelSlotUID(focusCursorInfos.slotInfos));
    if(anchorElement && focusElement){
        // Before doing the selection, we make sure that we can use the given slot cursor infos:
        // when a slot is empty, the span element doesn't have a firstChild attribute. In this case,
        // the node for the selection that we use is the span itself relative its parent.
        // (a span isn't directly contained in the contenteditable div )
        const anchorNode = ((anchorElement.textContent??"").length > 0)
            ? anchorElement.firstChild as Node
            : anchorElement.parentElement as Node;

        const anchorOffset = ((anchorElement.textContent??"").length > 0) 
            ? anchorCursorInfos.cursorPos
            : Object.values(anchorNode.childNodes).findIndex((node: any) => node.id === anchorElement.id);

        const focusNode = ((focusElement.textContent??"").length > 0)
            ? focusElement.firstChild as Node
            : focusElement.parentElement as Node;
            
        const focusOffset = ((focusElement.textContent??"").length > 0) 
            ? focusCursorInfos.cursorPos
            : Object.values(focusNode.childNodes).findIndex((node: any) => node.id === focusElement.id);

        document.getSelection()?.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
    }    
}

export function getFrameLabelSlotsStructureUID(frameId: number, labelIndex: number): string{
    return "labelSlotsStruct" + frameId + "_"  + labelIndex;
}

// Helper method to retrieve the literal python code from a frame label structure UI
// frameLabelStruct: the HTML element representing the current frame label structure
// currentSlotUID: the HTML id for the current editable slot we are in
// delimiters: optional object to indicate from and to which slots parsing the code, requires the slots UID and stop is exclusive
export function getFrameLabelSlotLiteralCodeAndFocus(frameLabelStruct: HTMLElement, currentSlotUID: string,  options?: {delimiters?: {startSlotUID: string, stopSlotUID: string}, useFlatMediaDataCode?: boolean}): {uiLiteralCode: string, focusSpanPos: number, hasStringSlots: boolean, mediaLiterals: {code: string, mediaType: string}[]}{
    let focusSpanPos = 0;
    let uiLiteralCode = "";
    let foundFocusSpan = false;
    let ignoreSpan = !!(options?.delimiters);
    let hasStringSlots = false;
    const mediaLiterals : {code: string, mediaType: string}[] = [];
    // The container and intermediate divs can have relevant text if Firefox has done a "bad delete"
    // (see comment in LabelSlotsStructure.onInput):
    frameLabelStruct.querySelectorAll("." + scssVars.labelSlotInputClassName + ", ." + scssVars.labelSlotContainerClassName + ", ." + scssVars.labelSlotMediaClassName).forEach((spanElement) => {
        // Sometimes div can end up with text content after a selection and overtype (a "bad delete") that seems to happen on Firefox.
        // We only care about these divs if there is text content
        // directly inside the div (which shouldn't happen except in this situation)
        if (spanElement.classList.contains(scssVars.labelSlotContainerClassName)) {
            // Find all the text node direct children:
            const directTextNodes = Array.from(spanElement.childNodes).filter(
                (child) => child.nodeType === Node.TEXT_NODE
            );
            // Combine the text content from all direct text nodes (should only be one, but no harm doing all):
            const content = directTextNodes.map((textNode) => textNode.textContent).join("");
            if (content.length > 0) {
                // Found this bad input:
                uiLiteralCode += content;
                // Also, we know the cursor should be directly after this bad input:
                foundFocusSpan = true;
                focusSpanPos += content.length;
            }
            return;
        }

        if(options?.useFlatMediaDataCode){
            // When this option is set, we are in a "simple" code slot that contains literal code not yet being parsed.
            // Therefore, we need to retrieve all the media that could be in that literal code so further parsing use them.
            const ms = splitByRegexMatches(spanElement.textContent??"", /(?:load_image|load_sound)\("data:(?:image|audio)[^;]*;base64,[^"]+"\)/);
            for (let i = 0; i < ms.length; i++) {
                // We know even values (0, 2) are the plain string parts inbetween regex matches,
                // and odd values (1, 3) are the parts which matched the regex:
                if ((i % 2) != 0) {
                    // fish out the details:
                    const details = /data:([^;]+);base64,[^"']+/.exec(ms[i]);
                    if (details) {
                        const dataAndBase64 = details[0];
                        const mediaDataCode = (details[1].startsWith("image") ? "load_image" : "load_sound") + "(\"" + dataAndBase64 + "\")";
                        mediaLiterals.push({code: mediaDataCode, mediaType: details[1]});
                    }
                }
            }
        }

        if (spanElement.classList.contains(scssVars.labelSlotMediaClassName)) {
            const code = spanElement.getAttribute("data-code");
            // We add the code, but also record the image literal for later manipulation:
            if (code) {
                uiLiteralCode += code;
                mediaLiterals.push({code: code, mediaType: spanElement.getAttribute("data-mediaType") ?? ""});
            }
            // Media literals are considered to be one character wide:
            if (!foundFocusSpan) {
                focusSpanPos += 1;
            }
            return;
        }
        
        if((options?.delimiters) && (options.delimiters.startSlotUID == spanElement.id || options.delimiters.stopSlotUID == spanElement.id)){
            ignoreSpan = !ignoreSpan ;
        } 
        if(!ignoreSpan) {
            // The code is extracted from the span; if requested, we only transform the string quotes to have a clear context to refer to in the parser, regardless the content of the strings
            // (so for example, if in the string slot a used typed "test\" (without double quotes!), the parsing would not be disturbed by the non terminating escaping "\" at the end)
            const labelSlotCoreInfos = parseLabelSlotUID(spanElement.id);
            if(isSlotQuoteType(labelSlotCoreInfos.slotType)){
                hasStringSlots = true;
                switch(spanElement.textContent){
                case UIDoubleQuotesCharacters[0]:
                case UIDoubleQuotesCharacters[1]:
                    uiLiteralCode += STRING_DOUBLEQUOTE_PLACERHOLDER;
                    break;
                case UISingleQuotesCharacters[0]:
                case UISingleQuotesCharacters[1]:
                    uiLiteralCode += STRING_SINGLEQUOTE_PLACERHOLDER;
                    break;            
                }
            }
            else{
                // We use the content of the slot as is
                if((spanElement.textContent?.includes(STRING_DOUBLEQUOTE_PLACERHOLDER) || spanElement.textContent?.includes(STRING_SINGLEQUOTE_PLACERHOLDER)) as boolean){
                    hasStringSlots = true;
                }
                uiLiteralCode += (spanElement.textContent??"").replace(/\u200B/g, "");
            }
        
            if(spanElement.id === currentSlotUID && !foundFocusSpan){
                focusSpanPos += (useStore().focusSlotCursorInfos?.cursorPos??0);     
                foundFocusSpan = true;
            }
            else{
                // In most cases, we just increment the length by the span content length,
                // BUT there are 2 exceptions: textual operators require surrounding spaces to be inserted, and those spaces do not appear on the UI
                // therefore we need to account for them when dealing with such operators;
                // and if we parse the string quotes, we need to set the position value as if the quotes were still here (because they are in the UI)
                let spacesOffset = 0;
                const spanElementContentLength = (spanElement.textContent?.replace(/\u200B/g, "")?.length??0);
                // Note that sometimes the frameId is unavailable (-100) so the frame object may not be available, hence we need ?. when accessing it:
                const frameType : string | undefined = useStore().frameObjects[parseLabelSlotUID(spanElement.id).frameId]?.frameType?.type;
                const ignoreAsKW = (spanElement.textContent == "as" && frameType != AllFrameTypesIdentifier.import && frameType != AllFrameTypesIdentifier.except);
                if(!ignoreAsKW && !isSlotStringLiteralType(labelSlotCoreInfos.slotType) && (trimmedKeywordOperators.includes(spanElement.textContent??""))){
                    spacesOffset = 2;
                    // Reinsert the spaces in the literal code
                    uiLiteralCode = uiLiteralCode.substring(0, uiLiteralCode.length - spanElementContentLength) 
                    + " " + uiLiteralCode.substring(uiLiteralCode.length - spanElementContentLength) 
                    + " ";
                }
                let stringPlaceHoldersCursorOffset = 0; // The offset induced by the difference of length between the string quotes and their placeholder representation
                const stringPlaceholderMatcher = (spanElement.textContent as string).match(new RegExp("("+STRING_SINGLEQUOTE_PLACERHOLDER.replaceAll("$","\\$")+"|"+STRING_DOUBLEQUOTE_PLACERHOLDER.replaceAll("$","\\$")+")", "g"));
                if(stringPlaceholderMatcher != null){
                    // The difference is 1 character per found placeholders 
                    stringPlaceHoldersCursorOffset = stringPlaceholderMatcher.length * (STRING_DOUBLEQUOTE_PLACERHOLDER.length - 1);
                }

                if(!foundFocusSpan) {
                    focusSpanPos += (spanElementContentLength + spacesOffset - stringPlaceHoldersCursorOffset);
                }
            }
        }
    });    
    return {uiLiteralCode: uiLiteralCode, focusSpanPos: focusSpanPos, hasStringSlots: hasStringSlots, mediaLiterals: mediaLiterals};
}


export function getFrameContextMenuUID(frameUID: string): string {
    return frameUID + "_frameContextMenu";
}

export function getCodeEditorUID(): string {
    return getFrameContainerUID(useStore().getMainCodeFrameContainerId);
}

export function getCaretUID(caretAssignedPosition: string, frameId: number): string {
    return "caret_"+caretAssignedPosition+"_"+frameId;
}

const caretContainerUIDRegex = /caret_(.+)_of_frame_(-?\d*)/;
export function getCaretContainerUID(caretPos: CaretPosition, frameId: number): string {
    // If a change is made in this method, reflect it on the regex above.
    return "caret_" + caretPos + "_of_frame_" + frameId;
}

export function isCaretContainerElement(id: string): boolean {
    return caretContainerUIDRegex.test(id);
}

export function getCaretContainerRef(): string {
    return "caretContainer";
}

export function getCommandsContainerUID(): string {
    return "editorCommands";
}

export function getEditorID(): string {
    return "editor";
}

export function getEditorMenuUID(): string {
    return "showHideMenu";
} 

export function getMenuLeftPaneUID(): string {
    return "menu-bar";
}

export function getNewProjectLinkId(): string {
    return "newProjectLink";
}

export function getLoadProjectLinkId(): string {
    return "loadProjectLink";
}

export function getSaveProjectLinkId(): string {
    return "saveStrypeProjLink";
}

export function getShareProjectLinkId(): string {
    return "shareStrypeProjLink";
}

export function getImportFileInputId(): string {
    return "importFileInput";
}

export function getCloudDriveHandlerComponentRefId(): string {
    return "cloudDriveHandlerComponent";
}

export function getLoadFromFSStrypeButtonId(): string {
    return "loadFromFSStrypeButton";
}

export function getStrypeCommandComponentRefId(): string {
    return "strypeCommands";
}

// The following helpers traverse the component refs to retrieve the desired component
export function getFrameComponent(frameId: number, innerLookDetails?: {frameParentComponent: InstanceType<typeof Frame> | InstanceType<typeof FrameContainer> | InstanceType<typeof FrameBody> | InstanceType<typeof JointFrames>, listOfFrameIdToCheck: number[]}): InstanceType<typeof Frame> | InstanceType<typeof FrameContainer> | undefined {
    // This methods gets the (Vue) reference of a frame based on its ID, or undefined if we could not find it.
    // The logic to retrieve the reference relies on the implementation of the editor, as we look in 
    // the frame containers which are supposed to hold the frames, and within frame body/joint when a frame can have children/joint frames.
    // If no root is provided, we assume we search the frame reference everywhere in the editor, meaning we look into the frame containers of App (this)
    // IMPORTANT NOTE: we are getting arrays of refs here when retrieving the refs, because the referenced elements are within a v-for
    // https://laracasts.com/discuss/channels/vue/ref-is-an-array 
    let result = undefined;
    if(innerLookDetails){                
        for(const childFrameId of innerLookDetails.listOfFrameIdToCheck){
            const childFrameComponent = ((innerLookDetails.frameParentComponent.$refs[getFrameUID(childFrameId)] as (Vue|Element)[])[0] as InstanceType<typeof Frame>);
            if(childFrameId == frameId){
                // Found the frame directly inside this list of frames
                result =  childFrameComponent;
                break;
            }
            else if(useStore().frameObjects[childFrameId].childrenIds.length > 0 || useStore().frameObjects[childFrameId].jointFrameIds.length > 0){
                // That frame isn't the one we want, but maybe it contains the one we want so we look into it.
                // We first look into the children, the joint frames (which may have children as well)
                const frameBodyComponent = (childFrameComponent.$refs[getFrameBodyRef()] as InstanceType<typeof FrameBody>); // There is 1 body in a frame, no v-for is used, we have 1 element
                if (!frameBodyComponent){
                    // This can happen when a frame is folded; have to return undefined:
                    return undefined;
                }
                result = getFrameComponent(frameId, {frameParentComponent: frameBodyComponent, listOfFrameIdToCheck: useStore().frameObjects[childFrameId].childrenIds});

                if(!result){
                    // Check joints if we didn't find anything in the children
                    const jointFramesComponent = (childFrameComponent.$refs[getJointFramesRef()] as InstanceType<typeof FrameBody>); // There is 1 joint frames strcut in a frame, no v-for is used, we have 1 element
                    result = getFrameComponent(frameId, {frameParentComponent: jointFramesComponent, listOfFrameIdToCheck: useStore().frameObjects[childFrameId].jointFrameIds});
                }

                if(result){
                    break;
                }
            }
        }
    }
    else{
        // When we look for the frame from the whole editor, we need to find in wich frame container that frame lives.
        // We don't need to parse recursively for getting the refs/frames as we can just find out what frame container it is in first directly...
        // And if we are already in the container (body), then we just return this component 
        const frameContainerId = (frameId < 0) ? frameId : getFrameContainer(frameId);
        const containerElementRefs = vm.$root.$children[0].$refs[getFrameContainerUID(frameContainerId)] as (Vue|Element)[]; // Retrieve in App
        if(containerElementRefs) {
            result = (frameId < 0) 
                ? containerElementRefs[0] as InstanceType<typeof FrameContainer>
                : getFrameComponent(frameId,{frameParentComponent: containerElementRefs[0] as InstanceType<typeof FrameContainer>, listOfFrameIdToCheck: useStore().frameObjects[frameContainerId].childrenIds});
        }
    }

    return result;
}

export function getCaretContainerComponent(frameComponent: InstanceType<typeof Frame> | InstanceType<typeof FrameContainer>): InstanceType<typeof CaretContainer> {
    const caretContainerComponent = (useStore().currentFrame.id < 0 || useStore().currentFrame.caretPosition == CaretPosition.below)
        ? (frameComponent.$refs[getCaretContainerRef()] as InstanceType<typeof CaretContainer>)
        : ((frameComponent.$refs[getFrameBodyRef()] as InstanceType<typeof FrameBody>).$refs[getCaretContainerRef()] as InstanceType<typeof CaretContainer>); 
    return caretContainerComponent;                              
}
// End for component retriever

export function getSaveAsProjectModalDlg(): string {
    return "save-strype-project-modal-dlg";
}

export function getStrypeSaveProjectNameInputId(): string {
    return "saveStrypeFileNameInput";
}

export function getSaveStrypeProjectToFSButtonId() : string {
    return "saveStrypeProjectToFSStrypeButton";
}

export function getEditorMiddleUID(): string {
    return "editorCodeDiv";
}

export function getCommandsRightPaneContainerId(): string {
    return "commandsContainerDiv";
}

export function getActiveContextMenu(): HTMLElement | null {
    // Helper method to get the currently active context menu. 
    // Explanation: menus have a "v-context" class, and role "menu" (for the root menu in submenus),
    // we want the menus that are not closed or hidden nor empty
    const foundNoneHiddenContextMenu = document.querySelector(".v-context[role='menu']:not([style*='display: none;']):not([hidden])");
    if(foundNoneHiddenContextMenu && foundNoneHiddenContextMenu.childElementCount == 0){
        return null;
    }
    return foundNoneHiddenContextMenu as HTMLElement | null;    
}

export function isContextMenuItemSelected(): boolean {
    // Helper menu to know if a context menu has an option selected (in other words, the menu is having the focus).
    // We first look if a menu is active, then if it is, we 
    const aShowingContextMenu = getActiveContextMenu();
    if(aShowingContextMenu != null){
        return (aShowingContextMenu.querySelector("a:focus") != null);
    }
    else {
        return false;
    }
}

export function setContextMenuEventClientXY(event: MouseEvent, positionForMenu?: Position): void {
    Object.defineProperty(event, "clientX", {
        value: (positionForMenu?.left != undefined) ? positionForMenu.left: event.pageX,
        writable: true,
    });

    Object.defineProperty(event, "clientY", {
        value: (positionForMenu?.top != undefined) ? positionForMenu.top : ((positionForMenu?.bottom != undefined) ? positionForMenu.bottom : event.pageY),
        writable: true,
    });

}

export function adjustContextMenuPosition(event: MouseEvent, contextMenu: HTMLElement, positionForMenu?: Position): void {
    // These situations can happen:
    // - we didn't provide any positioning request (case of click): we check the bottom of temporary (invisible) menu is in view
    //   if not, we slide the menu so that the bottom position is at the click
    // - we provided a positioning request (case of KB shortcut) AND we passed the "top" property in our position: keep as is
    // - we provided a positioning request (case of KB shortcut) AND we passed the "bottom" property in our position: 
    //   we slide the menu so that the actual height of the menu is deducted from the "bottom" property value 
    //   (so the bottom of the menu and the bottom of the target (last selected frame or context menu container) are aligned)
    if(positionForMenu){
        if(positionForMenu.bottom != undefined){
            const newMenuTopPosition = positionForMenu.bottom - contextMenu.getBoundingClientRect().height;
            contextMenu.style.top = newMenuTopPosition+"px";
        }
    }
    else if(event.pageY + contextMenu.getBoundingClientRect().height > (document.getElementById(getEditorMiddleUID())?.getBoundingClientRect().height??0)){
        const newMenuTopPosition = event.pageY - contextMenu.getBoundingClientRect().height;
        contextMenu.style.top = newMenuTopPosition+"px";
    }
}

export function handleContextMenuKBInteraction(keyDownStr: string): void {
    // This helper method handles the keyboard interaction with the frames/caret context menu.
    // Vue-context only handles escape and up/down interaction, we need to work out the rest...
    // Note that the CSS styling for this menu is both using custom classes and overwriting exisitng classes of the component (cf Frame.vue)
    const contextMenuElement = getActiveContextMenu();
    if(contextMenuElement){
        if (keyDownStr.toLowerCase() == "enter"){
            useStore().ignoreKeyEvent = true; // So the enter key up event won't be picked up by Commands.vue
            (document.activeElement as HTMLElement)?.click();
            // A submenu parent item would typically not do anything special at click, but we want to get the submenu open
            if(document.activeElement?.parentElement?.classList.contains("v-context__sub")){
                // We simulate a right arrow hit which would open the submenu and get into it (we need to do this on the root menu)
                document.activeElement.dispatchEvent(
                    new KeyboardEvent("keydown", {
                        bubbles: true,
                        keyCode: 39, // yes, that's deprecated, but the library uses that...
                    })
                );
            }
        }   
    }
}

export const fileImportSupportedFormats: string[] = [strypeFileExtension, "py"];

// Check if the code contains errors: precompiled errors & TigerPyton errors are all indicated in the editor
// by an error class on a frame header ("frameHearder_<frameId> + "error") or an editable slot ("labelSlot-input" + "errorSlot").
let errorHTMLElements: HTMLElement[]  | null = null;

export function checkEditorCodeErrors(): void{
    // Clear or construcct the current list first
    if(errorHTMLElements == null){
        errorHTMLElements = [];
    }
    else{
        (errorHTMLElements as HTMLElement[]).splice(0, (errorHTMLElements as HTMLElement[]).length);
    }

    // Then look up errors based on CSS
    const erroneousHTMLElements = [...document.getElementsByClassName(scssVars.errorClassName), ...document.getElementsByClassName(scssVars.errorSlotClassName)];
    if(erroneousHTMLElements.length > 0){
        for(const erroneousHTMLElement of erroneousHTMLElements) {
            if(erroneousHTMLElement.classList.contains(scssVars.labelSlotInputClassName) || erroneousHTMLElement.classList.contains(scssVars.frameHeaderClassName) || erroneousHTMLElement.classList.contains(scssVars.frameDivClassName)){
                errorHTMLElements.push(erroneousHTMLElement as HTMLElement);
            }
        }

        // The elements NEED to be in order so we can navigate through them.
        // In other words, we sort out the elements based on their vertical position first, then horizontal position.
        errorHTMLElements.sort((el1, el2) => {
            if(el1.getBoundingClientRect().y != el2.getBoundingClientRect().y){
                return el1.getBoundingClientRect().y - el2.getBoundingClientRect().y;
            }
            else{
                return el1.getBoundingClientRect().x - el2.getBoundingClientRect().x;
            }
        });
    }
}

export function getEditorCodeErrorsHTMLElements(): HTMLElement[] {
    if(errorHTMLElements == null){
        // If we never checked errors, we do it at this stage
        checkEditorCodeErrors();
    }

    return (errorHTMLElements as HTMLElement[]);
}

export function countEditorCodeErrors(): number {
    if(errorHTMLElements == null){
        // If we never checked errors, we do it at this stage
        checkEditorCodeErrors();
    }
    return (errorHTMLElements as HTMLElement[]).length;
}

export function hasEditorCodeErrors(): boolean {
    return countEditorCodeErrors() > 0;
}

export function hasPrecompiledCodeError(): boolean {
    return hasEditorCodeErrors() && !errorHTMLElements?.some((element) => isElementUIDFrameHeader(element.id));                                                                    
}

// This methods checks for the relative positions of the current position (which can be a focused slot or a blue caret) towards the positions of the errors (slots or 1st slot in frame header or a frame)
// We return the "full" index (of the error list) if the current position is ON an error, otherwise "semi" indexes that will allow navigating the errors properly:
// for example if the current position is before the first error, the index is -0.5 so we can still go down and reach error indexed 0
export function getNearestErrorIndex(): number {
    if(errorHTMLElements == null){
        // If we never checked errors, we do it at this stage
        checkEditorCodeErrors();
    }
    
    const errorsElmtIds = (errorHTMLElements as HTMLElement[]).flatMap((elmt) => elmt.id);
    const isEditing = useStore().isEditing;

    // Three situations can happen: we have an error in a slot (the most common case) or we have an error for the whole frame
    // (this is rare but can happen, for example in the situation of a wrongly constructed "try" structure (TP error)).

    // Get the slot currently being edited OR the current caret position : we check first if that's one of the error so it would be a "real" index of the error array
    // if it's not, then we'll find in between which 2 errors we're in and use a "semi" index
    const currentFrame = useStore().currentFrame;
    const currentFocusedElementId = (isEditing && useStore().focusSlotCursorInfos != undefined) 
        ? getLabelSlotUID(useStore().focusSlotCursorInfos?.slotInfos as SlotCoreInfos) 
        : getCaretUID(currentFrame.caretPosition, currentFrame.id);
    const belowCurrentCaretFrameId = (!isEditing) ? getFrameBelowCaretPosition({frameId: currentFrame.id, caretPosition: currentFrame.caretPosition, isSlotNavigationPosition: false}) : null;
    // Case 1: we are in a slot that is erroneous, or in a slot of an erroneous frame
    if(errorsElmtIds.includes(currentFocusedElementId) || (isEditing && errorsElmtIds.includes(getFrameHeaderUID(useStore().focusSlotCursorInfos?.slotInfos.frameId as number)))){
        return errorsElmtIds.indexOf((errorsElmtIds.includes(currentFocusedElementId)) ? currentFocusedElementId : getFrameHeaderUID(useStore().focusSlotCursorInfos?.slotInfos.frameId as number));
    }
    // Case 2: we are not editing and the caret position is above an erroneous frame (by convention)
    else if(!isEditing && belowCurrentCaretFrameId && errorsElmtIds.includes(getFrameUID(belowCurrentCaretFrameId))) {
        return errorsElmtIds.indexOf(getFrameUID(belowCurrentCaretFrameId));
    }
    else{
        // Case 2: not in an error, we find out our relative position to the list of errors
        const allCaretPositions = getAvailableNavigationPositions();
        // Get all position indexes (we use one single array for simplication, the current slot or frame caret is put AT THE END of the array)
        const allPosIndexes:number[] = [];
        [...errorsElmtIds, currentFocusedElementId].forEach((elementId) => {
            const isElementEditableSlot = isElementEditableLabelSlotInput(document.getElementById(elementId));
            const isElementFrameHeader = isElementUIDFrameHeader(elementId);
            const isElementWholeFrame = isIdAFrameId(elementId);
            // Look the position of a slot (an error or the currently focused slot, or the first slot of an erroneous frame)
            if(isElementEditableSlot || isElementFrameHeader){
                const slotInfos: SlotCoreInfos = (isElementEditableSlot) 
                    ? parseLabelSlotUID(elementId)
                    : {frameId: parseFrameHeaderUID(elementId), slotId: "0", labelSlotsIndex: 0, slotType: SlotType.code};
                allPosIndexes.push(allCaretPositions.findIndex((navPos) => navPos.isSlotNavigationPosition && navPos.frameId == slotInfos.frameId 
                    && navPos.labelSlotsIndex == slotInfos.labelSlotsIndex && navPos.slotId == slotInfos.slotId 
                    && navPos.slotType == slotInfos.slotType));
            }
            else if(isElementWholeFrame){
                // Get the caret position above the frame - if that frame still exists !
                // (when deleting it from the body, the frame may be gone but the errors still not updated)
                const frameId = parseFrameUID(elementId);
                const caretPosAbove = getAboveFrameCaretPosition(frameId);
                if(caretPosAbove) {
                    allPosIndexes.push(allCaretPositions.findIndex((navPos) => !navPos.isSlotNavigationPosition && navPos.frameId == caretPosAbove.frameId && navPos.caretPosition == caretPosAbove.caretPosition));
                }
            }
            // Look for the position of the current focused blue caret (because if we have an element that is the caret it can only be the current blue caret, there is no errors on a blue caret...)
            else{
                allPosIndexes.push(allCaretPositions.findIndex((navPos) => !navPos.isSlotNavigationPosition && navPos.frameId == currentFrame.id && navPos.caretPosition == currentFrame.caretPosition));
            }
        });
        
        // Now we can find the relative position of the current position with regards to the errors' positions
        const currentFocusedPosIndex = allPosIndexes.pop() as number;
        if(currentFocusedPosIndex < allPosIndexes[0]){
            return -0.5;
        }
        else if (currentFocusedPosIndex > allPosIndexes[allPosIndexes.length - 1]){
            return allPosIndexes.length;
        }
        else{
            const nextErrorPosIndex = allPosIndexes.findIndex((posIndex) => posIndex > currentFocusedPosIndex) as number;
            return nextErrorPosIndex - 0.5;
        }            
    }
}

// Helper function to generate the frame commands on demand. 
// Calls will happen when the frames are created the first time, and whenever the language is changed
// IMPORTANT : make sure that the shortcut assigned to a frame IS NOT assigned to a shorthand frame (see hiddenShorthandFrames) 
// unless conflicts are clearly impossible.
export function generateAllFrameCommandsDefs():void {
    allFrameCommandsDefs = {
        " ": [{
            type: getFrameDefType(AllFrameTypesIdentifier.funccall),
            description: i18n.t("frame.funccall_desc") as string,
            shortcuts: [" "],
            symbol: i18n.t("buttonLabel.spaceBar") as string,
        }],
        "=": [{
            type: getFrameDefType(AllFrameTypesIdentifier.varassign),
            description: i18n.t("frame.varassign_desc") as string,
            shortcuts: ["="],
        }],
        "g": [{
            type: getFrameDefType(AllFrameTypesIdentifier.global),
            description: "global",
            shortcuts: ["g"],
        }],
        "i": [
            {
                type: getFrameDefType(AllFrameTypesIdentifier.if),
                description: "if",
                shortcuts: ["i"],
                index: 0,
            },
            {
                type: getFrameDefType(AllFrameTypesIdentifier.import),
                description: "import",
                shortcuts: ["i"],
                index:1,
            },
        ],
        "l": [
            {
                type: getFrameDefType(AllFrameTypesIdentifier.elif),
                description: "elif",
                shortcuts: ["l"],
                index:0,
            },
            {
                type: getFrameDefType(AllFrameTypesIdentifier.library),
                description: "library",
                shortcuts: ["l"],
                index:1,
            },
        ],
        "e": [{
            type: getFrameDefType(AllFrameTypesIdentifier.else),
            description: "else",
            shortcuts: ["e"],
        }],
        "f": [
            {
                type: getFrameDefType(AllFrameTypesIdentifier.for),
                description: "for",
                shortcuts: ["f"],
                index: 0,
            },
            {
                type: getFrameDefType(AllFrameTypesIdentifier.funcdef),
                description: i18n.t("frame.funcdef_desc") as string,
                shortcuts: ["f"],
                index: 1,
            },
            {
                type: getFrameDefType(AllFrameTypesIdentifier.fromimport),
                description: "from...import",
                shortcuts: ["f"],
                index:2,
            },
        ],
        "c": [{
            type: getFrameDefType(AllFrameTypesIdentifier.classdef),
            description: i18n.t("frame.classdef_desc") as string,
            shortcuts: ["c"],
        }],
        "w": [{
            type: getFrameDefType(AllFrameTypesIdentifier.while),
            description: "while",
            shortcuts: ["w"],
        }],
        "r": [{
            type: getFrameDefType(AllFrameTypesIdentifier.return),
            description: "return",
            shortcuts: ["r"],
        }],
        "b" : [{
            type: getFrameDefType(AllFrameTypesIdentifier.break),
            description: "break",
            shortcuts: ["b"],
        }],
        "u" : [{
            type: getFrameDefType(AllFrameTypesIdentifier.continue),
            description: "continue",
            shortcuts: ["u"],
        }],
        "#": [{
            type: getFrameDefType(AllFrameTypesIdentifier.comment),
            description: i18n.t("frame.comment_desc") as string,
            shortcuts: ["#"],
        }],
        "enter": [{
            type: getFrameDefType(AllFrameTypesIdentifier.blank),
            description: i18n.t("frame.blank_desc") as string,
            shortcuts: ["\x13"],
            symbol: "enter",
            isSVGIconSymbol: true,
        }],
        "t": [{
            type: getFrameDefType(AllFrameTypesIdentifier.try),
            description: "try",
            shortcuts: ["t"],
        }],
        "x": [{
            type: getFrameDefType(AllFrameTypesIdentifier.except),
            description: "except",
            shortcuts: ["x"],
        }],
        "n": [{
            type: getFrameDefType(AllFrameTypesIdentifier.finally),
            description: "finally",
            shortcuts: ["n"],
        }],
        "a" : [{
            type: getFrameDefType(AllFrameTypesIdentifier.raise),
            description: "raise",
            shortcuts: ["a"],
        }],
        "h": [{
            type: getFrameDefType(AllFrameTypesIdentifier.with),
            description: "with",
            shortcuts: ["h"],
        }],
    };

    // We need to "tell" the Vue component that hosts the frame commands (Commands.vue) to refresh as there is no reactivity
    // between the frame definitions here and the component's computed property.
    // We can do it via a custom event Commands.vue will be listening to.
    document.dispatchEvent(new Event(CustomEventTypes.editorAddFrameCommandsUpdated));
}

//Commands for Frame insertion, one command can match more than 1 frame ONLY when there is a TOTAL distinct context between the two
let allFrameCommandsDefs: {[id: string]: AddFrameCommandDef[]} | undefined = undefined;

export function getAddCommandsDefs(): {[id: string]: AddFrameCommandDef[]} { 
    if(allFrameCommandsDefs === undefined){
        generateAllFrameCommandsDefs();
    }
    return allFrameCommandsDefs as {[id: string]: AddFrameCommandDef[]};
}

export function findAddCommandFrameType(shortcut: string, index?: number): FramesDefinitions | null { 
    if(allFrameCommandsDefs === undefined){
        generateAllFrameCommandsDefs();
    }
    const shortcutCommands = Object.values(allFrameCommandsDefs as {[id: string]: AddFrameCommandDef[]}).flat().filter((command) => command.shortcuts[0] == shortcut);
    if(shortcutCommands.length > 0) {
        if(index) {
            if(index < shortcutCommands.length) {
                const shortcutCommandIndexed = shortcutCommands.find((command) => command?.index == index);
                if(shortcutCommandIndexed){
                    return shortcutCommandIndexed.type;
                }
            }
        }
        else{
            return shortcutCommands[0].type;
        }
    }

    // If we are here, it means the call to this method has been misused...
    return null;
}

// This shorthand frames are enhanced frames because they contain some default code value. 
// Therefore they are treated separately in the code and in the UI. They do not show in the frame command panel.
// IMPORTANT : make sure that the shortcut assigned to a frame IS NOT assigned to a normal frame (see generateAllFrameCommandsDefs()) 
// unless conflicts are clearly impossible. Shortcut is not shown, so we don't need to define it elsewhere than in the indexes.
export const hiddenShorthandFrames: {[id: string]: AddShorthandFrameCommandDef} = {
    "p": {
        codeContent:"print", // No need for the brackets: they're already included in the function call frame by default
        goNextSlot: true,
        type: getFrameDefType(AllFrameTypesIdentifier.funccall),
    },
};

export function getFunctionCallDefaultText(frameId: number): string {
    // This method checks what default text (for the slot placeholder) to use in a function call "function name" slot.
    // Note that if we are not in a situation of an empty function name slot (i.e. some operators exist in the first slot structure other than the brackets)
    // then we do not return any placeholder text.
    // Several case may happen:
    // - we have nothing ever put in the slots (i.e. frame has just been added) OR only the name part is empty --> we show a "method name" default text placeholder
    // - we have a function call frame without any brackets or operators (just a slot) --> we show "function()".
    const frameToCheck = useStore().frameObjects[frameId];
    if(frameToCheck.labelSlotsDict[0].slotStructures.operators.length == 0){
        return i18n.t("frame.defaultText.simpleFuncCall") as string;
    }
    else if(frameToCheck.labelSlotsDict[0].slotStructures.operators[0].code == "" 
        && isFieldBracketedSlot(frameToCheck.labelSlotsDict[0].slotStructures.fields[1])){
        return frameToCheck.frameType.labels[0].defaultText;
    }
    return "\u200b";
}

export function getHTML2CanvasFramesSelectionCropOptions(targetFrameId: number): {x: number, y: number, width: number, height: number} {
    // We look for the position of the first and last selected items to crop the image of the container to the selection
    const selectionParentFrameX = (document.getElementById(getFrameUID(targetFrameId))?.getBoundingClientRect().x)??0;
    const selectionParentFrameY = (document.getElementById(getFrameUID(targetFrameId))?.getBoundingClientRect().y)??0;
    const firstSelectedFrameX = (document.getElementById(getFrameUID(useStore().selectedFrames[0]))?.getBoundingClientRect().x)??0;
    const firstSelectedFrameY = (document.getElementById(getFrameUID(useStore().selectedFrames[0]))?.getBoundingClientRect().y)??0;
    const lastSelectedFrameRight = (document.getElementById(getFrameUID(useStore().selectedFrames.at(-1) as number))?.getBoundingClientRect().right)??0;
    const lastSelectedFrameBottom = (document.getElementById(getFrameUID(useStore().selectedFrames.at(-1) as number))?.getBoundingClientRect().bottom)??0;
    return {x: (firstSelectedFrameX - selectionParentFrameX),
        y: (firstSelectedFrameY - selectionParentFrameY), 
        width: (lastSelectedFrameRight - firstSelectedFrameX),
        height: (lastSelectedFrameBottom - firstSelectedFrameY)};
}

/**
 * Used for easing handling events for drag & drop of frames
 **/

const companionCanvasId = "StrypeFrameCompanionDnDCanvas";
export function getCompanionDndCanvasId(): string {
    return companionCanvasId;
}

// This variable keeps a reference of the single frame being dragged, if any.
// When a selection of frames is being dragged, this value is undefined. 
// This is a crucial variable allowing us to distinguish which situation mentioned above
// we are in -- we can't rely on the store property "selectedFrames" because it is possible
// that a frame selection exists, but the user drags a single frame that's not IN the selection.
let currentDraggedSingleFrameId: number | undefined = undefined;

// We keep a local variable representing the available caret positions so that we don't need
// to regenerate that list every time the mouse is moved... The list won't change during a DnD!
let currentCaretPositionsForDnD: NavigationPosition[] = [];
let currentCaretDropPosId = "", currentCaretDropPosFrameId: number, currentCaretDropPosCaretPos: CaretPosition, 
    newCaretDropPosFrameId: number, newCaretDropPosCaretPos: CaretPosition;

const companionImgScalingRatio = 0.75;

const bodyMouseMoveEventHandlerForFrameDnD = (mouseEvent: MouseEvent): void => {
    if(useStore().isDraggingFrame){
        const caretHeight = Number.parseInt(scssVars.caretHeightValue);
        // Update the companion "image" (canvas) near the mouse pointer
        const companionCanvas = document.getElementById(companionCanvasId);
        if(companionCanvas){
            companionCanvas.style.left = mouseEvent.clientX + "px";
            companionCanvas.style.top = mouseEvent.clientY + "px";
        }

        // If we are outside the bounds of viewport*, we scroll the editor to make sure users can access hidden parts.
        // (*) actually a vertical distance to the edges + frame caret height
        if(mouseEvent.clientY < caretHeight){
            // Scroll up
            document.getElementById(getEditorMiddleUID())?.scrollBy(0,-20);
        }
        else if(mouseEvent.clientY >  (document.getElementsByTagName("body")[0].clientHeight - caretHeight)){
            // Scroll down
            document.getElementById(getEditorMiddleUID())?.scrollBy(0,20);
        }

        // Check which caret position is the nearest to indicate drop position
        // (which can be allowed or not) on the vertical axis only.
        let closestCaretPositionIndex = -1, minVerticalDist = Number.MAX_VALUE;
        currentCaretPositionsForDnD.every((navigationPos, index) => {
            if(navigationPos.isInCollapsedFrameContainer){
                // A collapsed frame position is ignored until a prolonged hover triggered it to expand
                return true;
            }

            const caretEl = document.getElementById(getCaretUID(navigationPos.caretPosition as string, navigationPos.frameId));
            const caretBox = caretEl?.getBoundingClientRect() as DOMRect;
            const caretYTopPos = (caretBox.height > 0) ? caretBox.y : caretBox.y - Number.parseInt(scssVars.caretHeightValue) / 2;
            const caretYBottompPos = (caretBox.height > 0) ? caretBox.y + caretBox.height : caretBox.y + Number.parseInt(scssVars.caretHeightValue) / 2;
            const verticalDist = (mouseEvent.y <= caretYTopPos)
                ? caretYTopPos - mouseEvent.y
                : mouseEvent.y - caretYBottompPos;
            if(verticalDist < minVerticalDist){
                minVerticalDist = verticalDist;
                closestCaretPositionIndex = index;
                newCaretDropPosFrameId = navigationPos.frameId;
                newCaretDropPosCaretPos = navigationPos.caretPosition as CaretPosition;
            }
            if(verticalDist > minVerticalDist){
                // We've passed the closest caret, exit..
                return false;
            }
            return true;
        });
        if(closestCaretPositionIndex > -1 && (currentCaretDropPosFrameId != newCaretDropPosFrameId || currentCaretDropPosCaretPos != newCaretDropPosCaretPos)){
            const closestCaretEl = document.getElementById(getCaretUID(currentCaretPositionsForDnD[closestCaretPositionIndex].caretPosition as string, currentCaretPositionsForDnD[closestCaretPositionIndex].frameId));
            // First remove the drop indicator of the current drop position (if any)
            if(currentCaretDropPosId.length > 0){
                (vm.$refs[getCaretUID(currentCaretDropPosCaretPos, currentCaretDropPosFrameId)] as InstanceType<typeof CaretContainer>).areFramesDraggedOver = false;
                // Not really required but just better to reset things properly
                (vm.$refs[getCaretUID(currentCaretDropPosCaretPos, currentCaretDropPosFrameId)] as InstanceType<typeof CaretContainer>).areDropFramesAllowed = true;
                // We make sure that we remove the "drag and d&d" flag on this caret since it's no longer a candidate for dropping the frames at this position...
                removeDuplicateActionOnFramesDnD();
            }
            currentCaretDropPosId = closestCaretEl?.id??"";
            currentCaretDropPosFrameId = newCaretDropPosFrameId;
            currentCaretDropPosCaretPos = newCaretDropPosCaretPos;
            (vm.$refs[getCaretUID(newCaretDropPosCaretPos, newCaretDropPosFrameId)] as InstanceType<typeof CaretContainer>).areFramesDraggedOver = true;
            (vm.$refs[getCaretUID(newCaretDropPosCaretPos, newCaretDropPosFrameId)] as InstanceType<typeof CaretContainer>).areDropFramesAllowed = 
                isFrameDropAllowed(newCaretDropPosFrameId, newCaretDropPosCaretPos);
        }

        // Update the duplicate status based on whether they are holding ctrl/alt:
        if (mouseEvent.ctrlKey || mouseEvent.altKey) {
            addDuplicateActionOnFramesDnD();
        }
        else {
            removeDuplicateActionOnFramesDnD();
        }
    }
};

// Helpers for adding or removing the "duplicate" action on a drag an drop frames
export function addDuplicateActionOnFramesDnD(): void {
    // Add the "+" symbol
    if(currentCaretDropPosFrameId != 0){
        (vm.$refs[getCaretUID(currentCaretDropPosCaretPos, currentCaretDropPosFrameId)] as InstanceType<typeof CaretContainer>).isDuplicateDnDAction = true;
    }

    // Do not blur the source frame(s)
    const sourceFrameIds = (currentDraggedSingleFrameId) ?  [currentDraggedSingleFrameId] : [...useStore().selectedFrames];
    sourceFrameIds.forEach((frameId) => useStore().frameObjects[frameId].isBeingDragged = false);
}

export function removeDuplicateActionOnFramesDnD(): void {
    // Remove the "+" symbol on the destination caret
    if(currentCaretDropPosFrameId != 0){
        (vm.$refs[getCaretUID(currentCaretDropPosCaretPos, currentCaretDropPosFrameId)] as InstanceType<typeof CaretContainer>).isDuplicateDnDAction = false;
    }

    // Restore the blur on the source frame(s) only if we are still dragging 
    if(useStore().isDraggingFrame){
        const sourceFrameIds = (currentDraggedSingleFrameId) ?  [currentDraggedSingleFrameId] : [...useStore().selectedFrames];
        sourceFrameIds.forEach((frameId) => useStore().frameObjects[frameId].isBeingDragged = true);
    }
}

// We need to also look for the mouseup event during Drag and Drop as we only let the browser handling "dragstart",
// there is no "dragend" being raised by the browser consequently.
const bodyMouseUpEventHandlerForFrameDnD = (event: MouseEvent): void => {
    if(useStore().isDraggingFrame){
        const areDropFramesAllowed = (vm.$refs[getCaretUID(currentCaretDropPosCaretPos, currentCaretDropPosFrameId)] as InstanceType<typeof CaretContainer>).areDropFramesAllowed;
        // Notify the drag even is finished
        notifyDragEnded();

        // Make sure we remove the "duplicate" flag as it may have been used
        removeDuplicateActionOnFramesDnD();

        // Drop the frame at the current drop caret location only if drop is allowed
        if(areDropFramesAllowed){
            // We either reorder the frames (most commont drag and drop case) OR add a copy if the drop is made with the ctrl or option keys held.
            if(event.ctrlKey || event.altKey){
                if(currentDraggedSingleFrameId){
                    useStore().doCopyFrame(currentDraggedSingleFrameId);
                    useStore().pasteFrame({clickedFrameId: currentCaretDropPosFrameId, caretPosition: currentCaretDropPosCaretPos});
                }
                else{
                    useStore().doCopySelection();
                    useStore().pasteSelection({clickedFrameId: currentCaretDropPosFrameId, caretPosition: currentCaretDropPosCaretPos});
                }
            }
            else {
                useStore().updateDroppedFramesOrder(currentCaretDropPosFrameId, currentCaretDropPosCaretPos, currentDraggedSingleFrameId);
            }
        }

        // Reset the caret drop ID
        currentCaretDropPosId = "";
    }
};

function isFrameDropAllowed(destCaretFrameId: number, destCaretPos: CaretPosition): boolean {
    // We can drop frames at a given caret location if the frame or first level of frames being dragged are allowed at the given position:
    // if the caret is at body, that's relative to the containing frame, and if it's at below, it's relative to the parent.
    const topLevelDraggedFrameIds = (currentDraggedSingleFrameId) ? [currentDraggedSingleFrameId] : useStore().selectedFrames;
    const destinationFrameContainer = useStore().frameObjects[(destCaretPos == CaretPosition.body) ? destCaretFrameId : useStore().frameObjects[destCaretFrameId].parentId]; 
    return !topLevelDraggedFrameIds.some((topLevelDraggedFrameId) => destinationFrameContainer.frameType.forbiddenChildrenTypes.includes(useStore().frameObjects[topLevelDraggedFrameId].frameType.type));
}

const noCaretDropFrameIds: number[] = [];
function prepareDropPositionsForDnd() {
    currentCaretPositionsForDnD = getAvailableNavigationPositions(true)
        .filter((navigationPosition) => !navigationPosition.isSlotNavigationPosition 
            && !noCaretDropFrameIds.includes(navigationPosition.frameId));
}

// Register for an update of the drop positions (needed when a collapsed frame is expanded on hover, see onFrameContainerHover() in FrameContainer.vue)
document.addEventListener(CustomEventTypes.dropFramePositionsUpdated, () => {
    prepareDropPositionsForDnd();
});

export function notifyDragStarted(frameId?: number):void {
    const renderingCanvas = document.getElementById(companionCanvasId) as HTMLCanvasElement;
    let html2canvasOptions: Partial<Options> = {backgroundColor: null, canvas: renderingCanvas, scale: companionImgScalingRatio};
    // If we move a single frame, we keep a reference of it, and set undefinfed if not (see variable definition)
    currentDraggedSingleFrameId = frameId;
    if(frameId){
        const frameElRect = document.getElementById(getFrameUID(frameId))?.getBoundingClientRect();
        if(frameElRect){
            renderingCanvas.width = frameElRect.width * companionImgScalingRatio;
            renderingCanvas.height = frameElRect.height * companionImgScalingRatio;
        } 
        // Set the "being dragged flag" for this frame -- as the object property is option, we need to use 
        // Vue.set() to ensure reactivity works on frame objects where isBeingDragged is not definged
        Vue.set(useStore().frameObjects[frameId],"isBeingDragged",true);
        // If the we are dragging a single frame and that frame is a comment, there is a small issue with
        // the companion image: the background will be transparent (as the frame's) so to make it visually
        // easier to see, we retrieve the dragged frame parent's body background to set it in the companion image.
        if(useStore().frameObjects[frameId].frameType.type == AllFrameTypesIdentifier.comment){
            const parentId = useStore().frameObjects[frameId].parentId;
            const commentBackgroundColor = (parentId == useStore().getImportsFrameContainerId || parentId == useStore().getDefsFrameContainerId)
                ? scssVars.nonMainCodeContainerBackground
                : scssVars.mainCodeContainerBackground;
            html2canvasOptions.backgroundColor = commentBackgroundColor;
        }
    }
    else{
        // We move a selection, we need to generate a companion image of that selection.
        // However, there is no container in the DOM that contains the selection stricto sensu,
        // so we generate the image of the selection's containing frame cropped to the selection.
        html2canvasOptions = {...html2canvasOptions, ...getHTML2CanvasFramesSelectionCropOptions(useStore().frameObjects[useStore().selectedFrames[0]].parentId)};
        renderingCanvas.width = (html2canvasOptions.width as number) * companionImgScalingRatio;
        renderingCanvas.height = (html2canvasOptions.height as number) * companionImgScalingRatio;
        useStore().selectedFrames.forEach((selectedFrameId) => {
            Vue.set(useStore().frameObjects[selectedFrameId],"isBeingDragged", true);
        });
    }
    
    // Set the app-scoped flag that we are dragging a frame/selection of frames.
    useStore().isDraggingFrame = true;

    // Get the list of current available caret positions: all caret positions, 
    // except the positions within a selection or within inside the children of a frame that is dragged.
    // (The position below the dragged frame (or last selected frame) won't be a suggested drop position, which is not needed anyway.)
    // The positions are only updated if the custom event dropFramePositionsUpdated is received.
    noCaretDropFrameIds.splice(0);
    if(frameId){
        noCaretDropFrameIds.push(...getAllChildrenAndJointFramesIds(frameId), frameId);
    }
    else{
        useStore().selectedFrames.forEach((selectedFrameId) => noCaretDropFrameIds.push(...getAllChildrenAndJointFramesIds(selectedFrameId)));
        noCaretDropFrameIds.push(...useStore().selectedFrames);
    }
    
    // Set the drop positions
    prepareDropPositionsForDnd();

    // Change the mouse cursor for the whole app
    document.getElementsByTagName("body")[0]?.classList.add(scssVars.draggingFrameClassName);
    // And assign a mouse event event listen to allow companion "image" to follow cursor and detect when the drop is performed
    (document.getElementsByTagName("body")[0] as HTMLBodyElement).addEventListener("mousemove", bodyMouseMoveEventHandlerForFrameDnD);
    (document.getElementsByTagName("body")[0] as HTMLBodyElement).addEventListener("mouseup", bodyMouseUpEventHandlerForFrameDnD);

    // Add companion "image" (canvas) to the cursor - we use HTML2Canvas. 
    // The element to generate an image of is either the frame passed as argument
    // or the selected frame's parent which will be cropped.
    // HTML2Canvas has a few performance issues, we try to help the fluidity of the interaction during drag and drop by having a setTimeout
    // to let Javascript renderning the grey blank companion image first and force the generation of the actual companion image later.
    setTimeout(() => {
        const draggingEl = document.getElementById(getFrameUID(frameId??(useStore().frameObjects[useStore().selectedFrames[0]].parentId)));
        if(draggingEl){
            html2canvas(draggingEl, html2canvasOptions);
        }
    }, 10);
    
}

export function notifyDragEnded():void {
    // Update the dragging flag
    useStore().isDraggingFrame = false;
    // Update the "being dragged" frame flag -- as the information about which frames have been dragged 
    // is potentially already lost at this stage (see mouseup event above), we look for all frames having
    // the flag set to true and toggle it.
    Object.values(useStore().frameObjects)
        .filter((frame) => frame.isBeingDragged)
        .forEach((frame) => frame.isBeingDragged = false);

    // Remove the styling on body / companion "image" (that we needed to inferer with since we don't use the native Drag and Drop API)
    const canvas = (document.getElementById(companionCanvasId) as HTMLCanvasElement);
    (canvas.getContext("2d") as any).reset();
    (document.getElementsByTagName("body")[0] as HTMLBodyElement).removeEventListener("mousemove", bodyMouseMoveEventHandlerForFrameDnD);
    (document.getElementsByTagName("body")[0] as HTMLBodyElement).removeEventListener("mouseup", bodyMouseUpEventHandlerForFrameDnD);
    document.getElementsByTagName("body")[0]?.classList.remove(scssVars.draggingFrameClassName);
    if(currentCaretDropPosId.length > 0){
        (vm.$refs[getCaretUID(currentCaretDropPosCaretPos, currentCaretDropPosFrameId)] as InstanceType<typeof CaretContainer>).areFramesDraggedOver = false;
        // Not really required but just better to reset things properly
        (vm.$refs[getCaretUID(currentCaretDropPosCaretPos, currentCaretDropPosFrameId)] as InstanceType<typeof CaretContainer>).areDropFramesAllowed = true;
    }
    // Reset flags in the next tick to let UI update properly
    Vue.nextTick(() => {
        currentCaretDropPosId = "", currentCaretDropPosFrameId = 0, currentCaretDropPosCaretPos =  CaretPosition.none, 
        newCaretDropPosFrameId = 0, newCaretDropPosCaretPos = CaretPosition.none;
    });    
}

/**
 * Operator and brackets related content
 */
// For Strype, we ignore the following double/triple operators += -= /= *= %= //= **= &= |= ^= >>= <<= 
export const operators = [".","+","-","/","*","%",":","//","**","&","|","~","^",">>","<<",
    "==","=","!=",">=","<=","<",">",","];
// Note that for those textual operator keywords, we only have space surrounding the single words: double words don't need
// as they will always come from a combination of writing one word then the other (the first will be added as operator);
// "as" is added in the operator list for imports, but it will be discarded when not dealing with import frames.
// Important that the longer operators come before the shorter ones with the same prefix:
export const keywordOperatorsWithSurroundSpaces = [" and ", " in ", " is not ", " is ", " or ", " not in ", " not ", " as "];
export const trimmedKeywordOperators = keywordOperatorsWithSurroundSpaces.map((spacedOp) => spacedOp.trim());


// We construct the list of all operator with a specific order: first the spaced keyword operators, 
// then the double symbolic operators and lastly the unitary symbolic operators. We put double operators
// first so that they are found first in the search for operators.
interface OpDef {
    match: string; // The match to search for
    keywordOperator : boolean; // Whether the operator is a keyword operator
}
interface OpFound extends OpDef {
    pos: number; // The position of the match (0 = first character in string)
    length: number; // The length of the match in characters within the string
}

const allOperators: OpDef[] = [
    ...keywordOperatorsWithSurroundSpaces.map((opSpace) => {
        return {match: opSpace, keywordOperator: true} as OpDef;
    }),
    ...operators.sort((op1, op2) => (op2.length - op1.length)).map((o) => {
        return {match: o, keywordOperator: false} as OpDef;
    }),
];
    

// Brackets: order inside each array is important, keep matching opening and closing tokens
export const openBracketCharacters = ["(","{","["];
export const closeBracketCharacters = [")","}","]"];
export const getMatchingBracket = (bracketValue: string, isOpening: boolean): string => {
    const srcArray = (isOpening) ? openBracketCharacters : closeBracketCharacters;
    const targetArray = (isOpening) ? closeBracketCharacters : openBracketCharacters;
    const indexOfBracket = srcArray.indexOf(bracketValue);
    // Return the matching bracket or "" if we didn't find it (which should not happen, but just for safety...)
    if(indexOfBracket > -1){
        return targetArray[indexOfBracket];
    }
    return "";
};

// String quotes: Python allows both double and single quotes. We also keep an ordered list of "graphical" matching quotes
// Note: we ignore triple quotes for Python in Strype.
export const stringSingleQuoteChar = "'";
export const stringDoubleQuoteChar = "\"";
export const stringQuoteCharacters = [stringSingleQuoteChar, stringDoubleQuoteChar];
export const UIDoubleQuotesCharacters = ["\u201C", "\u201D"];
export const UISingleQuotesCharacters = ["\u2018", "\u2019"];
export const getUIQuote = (quoteValue: string, isOpening: boolean): string => {
    const UIArray = (quoteValue == stringSingleQuoteChar) ? UISingleQuotesCharacters : UIDoubleQuotesCharacters;
    // Return the matching UI quote
    return UIArray[(isOpening) ? 0 : 1];
};

export const getStringAllowedRawQuote = (stringQuote: string): string => {
    const indexOfStringQuote = stringQuoteCharacters.indexOf(stringQuote);
    // Return the quote symbol that do not need escape inside the string o "" if we didn't find it (which should not happen, but just for safety...)
    if(indexOfStringQuote > -1){
        return stringQuoteCharacters[(indexOfStringQuote + 1) % 2];
    }
    return "";
};

/* End operator and brackets related content*/

/**
 * Slot cursors infos related content
 * Note: the anchor and focus cursor infos, and associated mutator method, 
 * are held in the store to ease the reactivity. 
 */
export function getSelectionCursorsComparisonValue(): number | undefined {
    // Accesory method to check the relative position of the anchor and the focus cursors.
    // It returns usual comparison values: 0 for equality, <0 if anchor precedes focus and >0 otherwise.
    // Anchor and Focus cursors are supposed to be non null.
    // Note: we don't check if frames/labels are different since selection cannot be accross those levels
    const anchorCursorInfos = useStore().anchorSlotCursorInfos;
    const focusCursorInfos = useStore().focusSlotCursorInfos;
    
    if(anchorCursorInfos && focusCursorInfos){
        const {slotInfos: anchorSlotInfos, cursorPos: anchorCursorPos} = anchorCursorInfos;
        const {slotInfos: focusSlotInfos, cursorPos: focusCursorPos} = focusCursorInfos;
        // Check if same frame first
        if(anchorSlotInfos.frameId == focusSlotInfos.frameId){
            // Check if same label index
            if(anchorSlotInfos.labelSlotsIndex == focusSlotInfos.labelSlotsIndex){
                // check if same slot ID (we don't need to worry about the operators, brackets or quotes)
                if(anchorSlotInfos.slotId == focusSlotInfos.slotId){
                    // Check the cursors difference
                    return anchorCursorPos - focusCursorPos;
                }
                
                // Not in the same slot, we check the slots in relation to each other and their level in the hierarchy:
                // we compare the ancestor indexes of each slots until a difference in found, starting from the root.
                const anchorSlotIdIndexes = anchorCursorInfos.slotInfos.slotId.split(",");
                const focusSlotIdIndexes = focusCursorInfos.slotInfos.slotId.split(",");
                const minAncestorLevels = Math.min(anchorSlotIdIndexes.length + 1, focusSlotIdIndexes.length + 1);
                let ancestorLevelIndex = 0;
                let foundDiff = false;
                while(!foundDiff && ancestorLevelIndex < minAncestorLevels){
                    if(anchorSlotIdIndexes[ancestorLevelIndex] != focusSlotIdIndexes[ancestorLevelIndex]){
                        foundDiff = true;
                        return (parseInt(anchorSlotIdIndexes[ancestorLevelIndex]) - parseInt(focusSlotIdIndexes[ancestorLevelIndex]));
                    }
                    ancestorLevelIndex++;
                }
                if(!foundDiff){
                    // If we reach this bit, then it means we have one of the IDs totally contained at the start of the other (e.g. "1,2" and "1,2,3")
                    // So the slot that has the longest ID is by definition after the one with the shortest
                    return anchorSlotIdIndexes.length - focusSlotIdIndexes.length;
                }
            }

            // Not the same label index, we return the indexes difference
            return (anchorSlotInfos.labelSlotsIndex - focusSlotInfos.labelSlotsIndex);
        }

        // Not same frame, return the frame POSITION difference, we can't use ID as they are not indexes
        // We make it "easy" by checking the top position in the browser: frames can't be on a same level...
        const anchorElement = document.getElementById(getLabelSlotUID(anchorCursorInfos.slotInfos)) as HTMLSpanElement;
        const focusElement = document.getElementById(getLabelSlotUID(focusCursorInfos.slotInfos)) as HTMLSpanElement;
        return (anchorElement.clientTop - focusElement.clientTop);
    }
    
    // The method expects the anchor and focus cursors to be valid.
    return undefined; 
}

// Given a slot refered by slotID, this method looks up what is the slot index of the given slot's ancestor 
// at the level indicated by sameLevelThanSlotParentId. See example below. 
// The given slot is expected to be in a deeper level than the reference ancester.
export const getSameLevelAncestorIndex = (slotId: string, sameLevelThanSlotParentId: string): number => {
    // Example: the given slot ID is "0,6,2,3,7", and sameLevelThanSlotParentId is "4,1,8"
    // As sameLevelThanSlotParentId has 3 levels, the ancestor is at position 2, what we need to return is 6 because it is at the second position in the ID of the given slot.
    const ancestorLevels = sameLevelThanSlotParentId.split(",").length;
    return parseInt(slotId.split(",")[ancestorLevels -1]);
};

// We need to replace fields with placeholders to make parsing of brackets easier:
const FIELD_PLACEHOLDER_START = "$strype_field_placeholder";
const FIELD_PLACEHOLDER_END = "_strype_field_placeholder$";
function removePossibleFieldPlaceholderFromStart(s: string) : string {
    if (s.startsWith(FIELD_PLACEHOLDER_START)) {
        const end = s.indexOf(FIELD_PLACEHOLDER_END);
        return s.slice(end + FIELD_PLACEHOLDER_END.length);
    }
    else {
        return s;
    }
}
export function transformFieldPlaceholders(input: string) : string {
    input = input.replaceAll(STRING_SINGLEQUOTE_PLACERHOLDER, "'");
    input = input.replaceAll(STRING_DOUBLEQUOTE_PLACERHOLDER, "\"");
    
    const startIndex = input.indexOf(FIELD_PLACEHOLDER_START);
    if (startIndex === -1) {
        return input; // No more placeholders
    }
    const endIndex = input.indexOf(FIELD_PLACEHOLDER_END, startIndex + FIELD_PLACEHOLDER_START.length);
    if (endIndex === -1) {
        return input; // No matching end marker; treat as finished
    }
    const decoded = fromUnicodeEscapes(input.substring(startIndex + FIELD_PLACEHOLDER_START.length, endIndex));
    const newInput =
        input.substring(0, startIndex) +
        decoded +
        input.substring(endIndex + FIELD_PLACEHOLDER_END.length);

    // Recurse to handle more placeholders:
    return transformFieldPlaceholders(newInput);
}

function splitAtCommas<X>(operands: X[], operators: BaseSlot[]): { operands: X[], operators: string[] }[] {
    const result: { operands: X[], operators: string[] }[] = [];

    let currentOperands: X[] = [];
    let currentOperators: string[] = [];

    for (let i = 0; i < operators.length; i++) {
        currentOperands.push(operands[i]);

        if (operators[i].code === ",") {
            result.push({ operands: currentOperands, operators: currentOperators });

            // Reset for next chunk
            currentOperands = [];
            currentOperators = [];
        }
        else {
            currentOperators.push(operators[i].code);
        }
    }

    // Handle remaining expression (after last comma or if no comma at all)
    currentOperands.push(operands[operands.length - 1]);
    result.push({ operands: currentOperands, operators: currentOperators });

    return result;
}


export const IMAGE_PLACERHOLDER = "$strype_image_placeholder$";
// The placeholders for the string quotes when strings are extracted FROM THE EDITOR SLOTS,
// both placeholders need to have THE SAME LENGHT so sustitution operations are done with more ease
export const STRING_SINGLEQUOTE_PLACERHOLDER = "$strype_StrSgQuote_placeholder$";
export const STRING_DOUBLEQUOTE_PLACERHOLDER = "$strype_StrDbQuote_placeholder$";

// Each params item is the set of operands and operators that are before the next comma or end of bracket
// Each item in keyValues corresponds to the item in params
export function extractFormalParamsFromSlot(structOfBracket: SlotsStructure) : {params: { operands: FieldSlot[], operators: string[] }[], keyValues: ([string, string | null] | null)[]} {
    const params = splitAtCommas(structOfBracket.fields, structOfBracket.operators);
    const keyValues: ([string, string | null] | null)[] = params.map((p) => {
        if (p.operators.length >= 1 && p.operators[0] == "=") {
            const possName = p.operands[0];
            if (isFieldBaseSlot(possName)) {
                return [possName.code, slotStructureToString({operators: p.operators.slice(1).map((c) => ({code: c})), fields: p.operands.slice(1)})];
            }
        }
        else if (p.operands.length == 1) {
            const possName = p.operands[0];
            if (isFieldBaseSlot(possName)) {
                return [possName.code, null];
            }
        }
        return null;
    });
    return {params, keyValues};
}

export const parseCodeLiteral = (codeLiteral: string, flags?: {isInsideString?: boolean, cursorPos?: number, skipStringEscape?: boolean, frameType?: string, imageLiterals?: {code: string, mediaType: string}[]}): {slots: SlotsStructure, cursorOffset: number} => {
    const imageLiterals : { code: string, mediaType: string }[] = flags?.imageLiterals ?? [];
    // This method parse a code literal to generate the equivalent slot structure.
    // For example, if the code is <"hi" + "hello"> it will generate the following slot (simmplified)
    //  {fields: {"", s1, "", "", s2, ""}, operators: ["", "", "+", "", ""] }}
    //  where s1 = {fields: ["hi"], operator: [], quote: "\""} and s2 = {fields: ["hello"], operator: [], quote: "\""}
    // We use this method when we parse the content of a string literal to generate code (i.e. deletion of a string's quotes)
    // or when we need to regenerate some code
    // Returned value: an object including the slots and the text cursor offset as we may delete/add some elements in the code literal
    const resStructSlot: SlotsStructure = {fields: [], operators:[]};
    let cursorOffset = 0;       

    // If flag for checking escaped strings as string is set, we replace them
    // (this is for example when de-stringify a string content)
    if(flags && flags.isInsideString){
        const escapedQuote = "\\" + codeLiteral.charAt(0);
        codeLiteral = codeLiteral.substring(1, codeLiteral.length - 1).replaceAll(escapedQuote, (match) => match.charAt(1));
    }
    
    // Start by replacing image literals with placeholders to avoid them getting processed like normal code:
    imageLiterals.forEach((imageLiteral, i) => {
        codeLiteral = codeLiteral.replace(imageLiteral.code, IMAGE_PLACERHOLDER + i + "$");
    });

    // First we look for string literals, as their content should not generate "subslot":
    // We simply use an equivalent size placeholder so it wont interfere the parsing later.
    // Note that the regex expression will look for either a well-formed a string literal or a non terminated string literal (for example: "test)
    // and when non terminated string literal is found, we complete the quotes manually (it will necessarily be at the end of the code literal)
    // When we use the quotes placeholder, we arrange the blanked strings so that their size "include" the placeholders and still match with the codeLiteral length.
    // For example, if the code in the UI was <print("hello")>, the code literal in this method is:
    //                             <print($strype_StrDbQuote_placeholder$hello$strype_StrDbQuote_placeholder$)>
    // so we blank it like this --> print("                                                                 ")
    // in that way, everything is of the same length and we keep work character indexes properly. We only need to care about the real quotes when we create the string slots.   
    const quotesPlaceholdersRegex = "(" + STRING_SINGLEQUOTE_PLACERHOLDER.replaceAll("$","\\$") + "|" + STRING_DOUBLEQUOTE_PLACERHOLDER.replaceAll("$","\\$") + ")";
    const strRegEx = (flags?.skipStringEscape) ? new RegExp(quotesPlaceholdersRegex+"((?!\\1).)*\\1","g") : /(['"])(?:(?!(?:\\|\1)).|\\.)*\1?/g;
    let missingClosingQuote = "";
    const blankedStringCodeLiteral = codeLiteral.replace(strRegEx, (match) => {
        if(flags?.skipStringEscape){
            const codeStrQuotes = (match.startsWith(STRING_SINGLEQUOTE_PLACERHOLDER)) ? "'" : "\"";
            // The length of the blanked string is twice the length of the placeholers minus 2 (for the quotes) plus the inner content length (the actual string value)
            // in other words, the match length minus 2 (that accounts the quotes)
            return codeStrQuotes + " ".repeat(match.length - 2) + codeStrQuotes;
        }
        else {
            if(!match.endsWith(match[0]) || match.length == 1 || (match.endsWith("\\" + match[0]) && getNumPrecedingBackslashes(match, match.length - 1) % 2 == 1)){
                missingClosingQuote = match[0];
            }
            return match[0] + " ".repeat(match.length - ((missingClosingQuote.length == 1) ? 1 : 2)) + match[0];
        }
        
    });
    if(missingClosingQuote.length == 1){
        // The blanking above would have already terminate the string quote in blankedStringCodeLiteral if needed,
        // we need to update the original codeLiteral too
        codeLiteral += missingClosingQuote;
        cursorOffset -= 1;
    }     

    // 1- Look for a bracket structure
    // Look up what opening bracket we have by getting the indexes of all the possible opening brackets
    const openBracketPosList = openBracketCharacters.flatMap((openBracket) => blankedStringCodeLiteral.indexOf(openBracket));
    // ... and then starting off from the first of this brackets if we found one (index > -1)
    let firstOpenedBracketPos = -1;
    openBracketPosList.forEach((pos) => {
        if(pos > -1 && (pos < firstOpenedBracketPos || firstOpenedBracketPos == -1)){
            firstOpenedBracketPos = pos;
        }
    });
    const hasBracket = (firstOpenedBracketPos > -1);
    if(hasBracket) {
        const firstOpenedBracketIndexInList = openBracketPosList.indexOf(firstOpenedBracketPos);
        const openingBracketValue = openBracketCharacters[firstOpenedBracketIndexInList];
        const closingBracketValue = closeBracketCharacters[firstOpenedBracketIndexInList];
        // Now we look for where the bracket closes -- the last closing bracket matching the opening one
        let startLookingOtherOpeningBracketsPos = firstOpenedBracketPos + 1;
        let innerOpeningBracketCount = 1; // because we first decrement when finding a closing bracket
        let closingBracketPos = -1;
        // Look for inner brackets, iteration is NOT made on "closingBracketPos" so we can keep the latest value
        do {
            closingBracketPos = blankedStringCodeLiteral.indexOf(closingBracketValue, startLookingOtherOpeningBracketsPos);
            const nextOpen = blankedStringCodeLiteral.indexOf(openingBracketValue, startLookingOtherOpeningBracketsPos);
            if (closingBracketPos > -1) {
                if (nextOpen > -1 && nextOpen < closingBracketPos) {
                    innerOpeningBracketCount ++;
                    startLookingOtherOpeningBracketsPos = nextOpen + 1;
                }
                else {
                    innerOpeningBracketCount--;
                    startLookingOtherOpeningBracketsPos = closingBracketPos + 1;
                }
            }
            else {
                cursorOffset -= 1;
            }
        }
        while (innerOpeningBracketCount != 0 && closingBracketPos != -1);
       
        
        // Now that we have found the bracket boudary (if we didn't find a closing bracket match, we "manually" close after the whole content following opening bracket)
        // we can make a structure and parse the split code content as 
        //  - before the bracket
        //  - inside the bracket (so, we DO NOT include the bracket themselves)
        //  - after the bracket
        const beforeBracketCode = codeLiteral.substring(0, firstOpenedBracketPos);
        const innerBracketCode = codeLiteral.substring(firstOpenedBracketPos + 1, (closingBracketPos > -1) ? closingBracketPos : codeLiteral.length);
        // As a bracket structure is a field, following bits may depends on it. For example, for "(1+2)-3", the brackets is the LHS of the - following it,
        // so if we fed the parser only "-3", it would see it as an unitary sign and not an operator.
        // So for the parser to "see" the bracket part we will use a placeholder token that will be removed when aggrating the slots. 
        let afterBracketCode = (closingBracketPos > -1) ? codeLiteral.substring(closingBracketPos + 1) : "";
        const bracketPlaceholder = FIELD_PLACEHOLDER_START + toUnicodeEscapes(beforeBracketCode + openingBracketValue + innerBracketCode + closingBracketValue) + FIELD_PLACEHOLDER_END;
        if(afterBracketCode.length > 0){
            afterBracketCode = bracketPlaceholder + afterBracketCode;
        }
        // Note: we need to pass (all) imageLiterals to the recursive calls because they might reverse our replacement:
        const {slots: structBeforeBracket, cursorOffset: beforeBracketCursorOffset} = parseCodeLiteral(beforeBracketCode, {isInsideString:false, cursorPos: flags?.cursorPos, skipStringEscape: flags?.skipStringEscape, imageLiterals: imageLiterals});
        cursorOffset += beforeBracketCursorOffset;
        const {slots: structOfBracket, cursorOffset: bracketCursorOffset} = parseCodeLiteral(innerBracketCode, {isInsideString: false, cursorPos: (flags?.cursorPos) ? flags.cursorPos - (firstOpenedBracketPos + 1) : undefined, skipStringEscape: flags?.skipStringEscape, imageLiterals: imageLiterals});
        if (openingBracketValue === "(") {
            // First scan and find all the comma-separated parameters:
            const {params, keyValues} = extractFormalParamsFromSlot(structOfBracket);
            const context = getContentForACPrefix(structBeforeBracket, true);
            params.forEach((param, paramIndex) => {
                // We only apply placeholderSource info if the parameter is a single plain slot:
                if (param.operands.length == 1) {
                    const oneSlot = param.operands[0];
                    if (isFieldBaseSlot(oneSlot)) {
                        oneSlot.placeholderSource = {
                            token: (structBeforeBracket.fields.at(-1) as BaseSlot)?.code ?? "",
                            context: context,
                            paramIndex: paramIndex,
                            lastParam: paramIndex == params.length - 1,
                            prevKeywordNames: keyValues.slice(0, paramIndex).filter((s): s is [string, string] => s !== null && s[1] !== null).map((s) => s[0]),
                        };
                    }
                }
            });
        }
        const structOfBracketField = {...structOfBracket, openingBracketValue: openingBracketValue};
        cursorOffset += bracketCursorOffset;
        let actualCodeClosingBracketPos = closingBracketPos;
        const quotesPlaceholdersExp = "(" + STRING_SINGLEQUOTE_PLACERHOLDER.replaceAll("$","\\$") + "|" + STRING_DOUBLEQUOTE_PLACERHOLDER.replaceAll("$","\\$") + ")";
        innerBracketCode.match(new RegExp(quotesPlaceholdersExp, "g"))?.forEach((placeholder) => {
            // If the content of the brackets contained any string, the value of the closing bracket position is for a code WITH the string quotes placeholders.
            // Therefore, if we want to use that to check what is the new cursor position in the parsing of the code after the bracket, we need to do so without
            // the string placeholders, if any. When a placeholder is found, we remove its length - 1 to the positin, as it would match 1 quote.
            actualCodeClosingBracketPos -= (placeholder.length - 1);
        });

        const {slots: structAfterBracket, cursorOffset: afterBracketCursorOffset} = parseCodeLiteral(afterBracketCode, {isInsideString: false, cursorPos: (flags && flags.cursorPos && afterBracketCode.startsWith(bracketPlaceholder)) ? flags.cursorPos - (actualCodeClosingBracketPos + 1) + bracketPlaceholder.length : undefined, skipStringEscape: flags?.skipStringEscape, imageLiterals: imageLiterals});
        cursorOffset += afterBracketCursorOffset;
        // Remove the bracket field placeholder from structAfterBracket: we trim the placeholder value from the start of the first field of the structure.
        // (the conditional test may be overdoing it, but at least we are sure we won't get fooled by the user code...)
        (structAfterBracket.fields[0] as BaseSlot).code = removePossibleFieldPlaceholderFromStart((structAfterBracket.fields[0] as BaseSlot).code);
        resStructSlot.fields.push(...structBeforeBracket.fields, structOfBracketField, ...structAfterBracket.fields);
        resStructSlot.operators.push(...structBeforeBracket.operators, {code: ""}, {code: ""}, ...structAfterBracket.operators);
    } 
    else{
        // 2 - lookup for strings: we assume the code literal contains escaped quotes:
        const quotesMatchPattern = "[" + stringQuoteCharacters.join("") + "]";
        if(blankedStringCodeLiteral.match(quotesMatchPattern) != null){
            // Retrieve the start and end of the quotes (if no ending quote is found, we consider the termination is at the end of the code literal)
            const openingQuoteIndex = blankedStringCodeLiteral.match(quotesMatchPattern)?.index??0;
            const openingQuoteValue =  blankedStringCodeLiteral[openingQuoteIndex];
            const closingQuoteIndex = openingQuoteIndex + 1 + (blankedStringCodeLiteral.substring(openingQuoteIndex + 1).match(openingQuoteValue)?.index??blankedStringCodeLiteral.substring(openingQuoteIndex + 1).length);
            // Similar to brackets, we can now split the code by what is before the string, the string itself, and what is after
            // Note that if have known placeholders for the string quotes in the code, we need to take them into consideration at this stage
            const beforeStringCode = codeLiteral.substring(0, openingQuoteIndex);
            const quoteTokenLength = (flags?.skipStringEscape && codeLiteral.charAt(openingQuoteIndex) != openingQuoteValue) ? STRING_SINGLEQUOTE_PLACERHOLDER.length : 1;
            const parsingStringContentRes = getParsingStringContentAndFocusOffset(openingQuoteValue,codeLiteral.substring(openingQuoteIndex + quoteTokenLength, closingQuoteIndex - (quoteTokenLength - 1)));
            const stringContentCode = parsingStringContentRes.parsedContent;
            cursorOffset += parsingStringContentRes.cursorOffset;
            // same logic as brackets for subsequent code: cf. above
            let afterStringCode = codeLiteral.substring(closingQuoteIndex + 1);
            const stringPlaceholder = FIELD_PLACEHOLDER_START + toUnicodeEscapes("\"\"") + FIELD_PLACEHOLDER_END;
            if(afterStringCode.length > 0){
                afterStringCode = stringPlaceholder + afterStringCode;
            }
            // When we construct the parts before and after the string, we need to internally set the cursor "fake" position, that is, the cursor offset by the bits we are evaluating
            const {slots: structBeforeString, cursorOffset: beforeStringCursortOffset} = parseCodeLiteral(beforeStringCode, {isInsideString: false, cursorPos: flags?.cursorPos, skipStringEscape: flags?.skipStringEscape, imageLiterals: imageLiterals});
            cursorOffset += beforeStringCursortOffset;
            const structOfString: StringSlot = {code: stringContentCode, quote: openingQuoteValue};
            const {slots: structAfterString, cursorOffset: afterStringCursorOffset} = parseCodeLiteral(afterStringCode, {isInsideString: false, cursorPos: (flags?.cursorPos??0) - closingQuoteIndex + (2*(quoteTokenLength -1)) + stringPlaceholder.length, skipStringEscape: flags?.skipStringEscape, imageLiterals: imageLiterals});
            cursorOffset += afterStringCursorOffset;
            (structAfterString.fields[0] as BaseSlot).code = removePossibleFieldPlaceholderFromStart((structAfterString.fields[0] as BaseSlot).code);
            resStructSlot.fields.push(...structBeforeString.fields, structOfString, ...structAfterString.fields );
            resStructSlot.operators.push(...structBeforeString.operators, {code: ""}, {code: ""}, ...structAfterString.operators);
        }
        else{
            // 3 - break the code by operatorSlot
            const {slots: operatorSplitsStruct, cursorOffset: operatorCursorOffset} = getFirstOperatorPos(codeLiteral, blankedStringCodeLiteral, flags?.frameType??"", flags?.cursorPos);
            cursorOffset += operatorCursorOffset;
            resStructSlot.fields = operatorSplitsStruct.fields;
            resStructSlot.operators = operatorSplitsStruct.operators;
        }
    }
    
    // Reverse replacement of image literals:
    imageLiterals.forEach((imageLiteral, i) => {
        const target = IMAGE_PLACERHOLDER + i + "$";
        for (let j = 0; j < resStructSlot.fields.length; j++) {
            if (isFieldBaseSlot(resStructSlot.fields[j])) {
                const code = (resStructSlot.fields[j] as BaseSlot).code;
                const pos = code.indexOf(target);
                if (pos != -1) {
                    const before = code.substring(0, pos).trim();
                    const after = code.substring(pos + target.length).trim();
                    
                    // Replace field with image literal:
                    resStructSlot.fields[j] = {...resStructSlot.fields[j], code: imageLiteral.code, mediaType: imageLiteral.mediaType } as MediaSlot;
                    // Image literals must be surrounded by a plain field before and after, with blank operator, so that you can position
                    // the cursor next to them to edit (either adding content next to them, or deleting the literal itself)
                    // Without this, for example, if you put a media literal in a bracket, you can't put the cursor anywhere inside the
                    // bracket because there will be a single field (for the media literal) and no actual possible cursor positions.
                    if (before.length > 0 || j == 0 || !isFieldBaseSlot(resStructSlot.fields[j-1]) || resStructSlot.operators[j-1].code != "") {
                        // If there's no plain slot before or the operator isn't blank, we need to add a blank operator and blank field:
                        resStructSlot.operators.splice(j, 0, {code: ""});
                        resStructSlot.fields.splice(j, 0, {code: before} as BaseSlot);
                        // Need to compensate for what we just added:
                        j += 1;
                    }
                    if (after.length > 0 || j >= resStructSlot.fields.length - 1 || !isFieldBaseSlot(resStructSlot.fields[j+1]) || resStructSlot.operators[j].code != "") {
                        // If there's no plain slot after or the operator isn't blank, we need to add a blank operator and blank field:
                        resStructSlot.operators.splice(j, 0, {code: ""});
                        resStructSlot.fields.splice(j+1, 0, {code: after} as BaseSlot);
                        // No need to compensate because we're about to return from this whole code segment:
                    }
                    // Note: this returns the forEach part and looks for the next media literal
                    return;
                }
            }
        }
    });

    return {slots: resStructSlot, cursorOffset: cursorOffset};
};

const getFirstOperatorPos = (codeLiteral: string, blankedStringCodeLiteral: string, frameType: string, cursorPos?:number): {slots: SlotsStructure, cursorOffset: number} => {
    let cursorOffset = 0;

    // Before checking the operators, we need "blank" the exception we do not consider operators:
    // number sign and a decimal separator - which we replace in the blanked code by "0"
    const blankReplacer = (paramIndex: number, tokens: string[], ...params: any): string => {
        // Helper function to replace a portion of a match, from the paramater indexed in paramIndex.
        // Returns the replacement. For details about the arguments:
        // cf https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_function_as_the_replacement
        // we do not expect any groups here
        const innerSignIndex = Math.max(...tokens.flatMap((token) => params[paramIndex].indexOf(token)));
        const innerMatchIndex = params[0].indexOf(params[paramIndex]);
        const indexOfSign =  params.at(-2) + innerMatchIndex + innerSignIndex;
        return params.at(-1).substring(params.at(-2), indexOfSign) + "0" + params.at(-1).substring(indexOfSign + 1, params.at(-2) + (params[0] as string).length);
    };

    blankedStringCodeLiteral = blankedStringCodeLiteral
        // Replacing exponential sign operator first (ex "-.25e-5" --> replace "-" after "e")
        .replaceAll(/(^\s+|\b|[+\-*/%<>&|^=!,]\s*)((\d+(\.\d*)?|\.\d+)[eE][-+]\d+j?)($|(\s*[ +\-*/%<>&|^=!,:]))/g,
            (...params) => blankReplacer(2, ["+", "-"], ...params))
        // Replacing a preceding sign operator
        .replaceAll(/(^\s*|[+\-*/%<>&|^=!,]\s*)([+-]((0b[01]+)|(0x[0-9A-Fa-f]+)|((\d+(\.\d*)?|\.\d+)([eE]\d+)?j?)))(?=$|(\s*[ +\-*/%<>&|^=!,:]))/g,
            (...params) => blankReplacer(2, ["+", "-"], ...params))
        // Replacing the decimal separator (note: \b is a word boundary)
        .replaceAll(/(\s+|\b|[+\-*/%<>&|^=!,:]\s*)(((\d+(\.\d*))([eE][0]?\d+)?j?))($|(\s*[ +\-*/%<>&|^=!,:]))/g,
            (...params) => blankReplacer(3, ["."], ...params));

    const resStructSlot: SlotsStructure = {fields: [], operators:[]};
    let hasOperator = true;
    let lookOffset = 0;
    // "u" flag is necessary for unicode escapes
    const cannotPrecedeKeywordOps = /^(\p{Lu}|\p{Ll}|\p{Lt}|\p{Lm}|\p{Lo}|\p{Nl}|\p{Mn}|\p{Mc}|\p{Nd}|\p{Pc}|_)$/u;
    while(hasOperator){
        // When we look for operators, there is 2 exceptions:
        // - we discard "*" (and "**" why not) when are in a from import frame, we will treat it as text
        // - "as" is only relevant for import frames, we ignore it otherwise
        const isInFromImportFrame = (frameType == AllFrameTypesIdentifier.fromimport);
        const isInImportFrame = (frameType == AllFrameTypesIdentifier.import);
        const operatorPosList : OpFound[] = ((isInFromImportFrame) ? allOperators.filter((opDef) => !opDef.match.includes("*") && opDef.match != " as ") : allOperators.filter((opDef) => isInImportFrame || opDef.match != " as "))
            .flatMap((operator : OpDef) => {
                if (operator.keywordOperator) {
                    // "g" flag is necessary to make it obey the lastIndex item as a place to start:
                    const regex = new RegExp(operator.match.trim().replaceAll(" ", "\\s+") + " ", "g");
                    regex.lastIndex = lookOffset;
                    let result = regex.exec(blankedStringCodeLiteral);
                    while (result != null) {
                        // Only a valid result if preceded by non-text character:
                        if ((result.index == 0 || !cannotPrecedeKeywordOps.exec(blankedStringCodeLiteral.substring(result.index - 1, result.index)))) {
                            return {...operator, pos: result.index, length: result[0].length} as OpFound;
                        }
                        // Otherwise search again:
                        result = regex.exec(blankedStringCodeLiteral);
                    }
                    return {...operator, pos: -1, length: 0} as OpFound;
                }
                else {
                    return {...operator, pos: blankedStringCodeLiteral.indexOf(operator.match, lookOffset), length: operator.match.length} as OpFound;
                }
            });
        hasOperator = operatorPosList.some((operatorPos) => operatorPos.pos > -1);
        if(hasOperator){
            // Look for the first operator of the string inside the list
            let firstOperator : OpFound | null = null;
            for (const op of operatorPosList) {
                if(op.pos > -1 && (firstOperator == null || op.pos < firstOperator.pos)){
                    firstOperator = op;
                }
            }

            // Will always be true or else we wouldn't be in the outer if:
            if (firstOperator) {
                // Get the LHS as field and this operator as operator in the resulting structure
                // We perform a last step before returning the code unit: remove any remaining "dead" closing bracket
                let lhsCode = codeLiteral.substring(lookOffset, firstOperator.pos);
                closeBracketCharacters.forEach((closingBracket) => {
                    lhsCode = lhsCode.replaceAll(closingBracket, () => {
                        cursorOffset += -1;
                        return "";
                    });
                });
                const fieldContent = codeLiteral.substring(lookOffset, firstOperator.pos);
                if (cursorPos && cursorPos >= lookOffset && cursorPos < firstOperator.pos) {
                    resStructSlot.fields.push({code: fieldContent.substring(0, cursorPos - lookOffset) + fieldContent.substring(cursorPos - lookOffset).trimEnd(), focused: true});
                }
                else {
                    resStructSlot.fields.push({code: fieldContent.trim()});
                    // Update the cursor position as the LHS may have been trimmed
                    // (only the cursor is passed the position)
                    if((cursorPos??0)>firstOperator.pos) {
                        cursorOffset += (fieldContent.trim().length - fieldContent.length);
                    }
                }
                resStructSlot.operators.push({code: firstOperator.match.trim()});
                // If there was some spaces between the operator and the RHS, they will be removed so we need to account for them
                // (only the cursor is passed the position)
                if((cursorPos??0)>firstOperator.pos) {
                    const operatorTrimmedStart = firstOperator.match.trimStart();
                    cursorOffset += (operatorTrimmedStart.trim().length - operatorTrimmedStart.length);
                }
                lookOffset = firstOperator.pos + firstOperator.length;
            }
        }
    }
    // As we always have at least 1 field, and operators contained between fields, we need to add the trimming field 
    // (and we also need to remove "dead" closing brackets)
    let code = codeLiteral.substring(lookOffset).trimStart();
    closeBracketCharacters.forEach((closingBracket) => {
        code = code.replaceAll(closingBracket, "");
    });
    resStructSlot.fields.push({code: code, focused: cursorPos !== undefined && cursorPos >= lookOffset && cursorPos <= codeLiteral.length});
    return {slots: resStructSlot, cursorOffset: cursorOffset};
};

const getParsingStringContentAndFocusOffset = (quote: string, content: string): {parsedContent: string, cursorOffset: number} => {
    // This methods parsed the content of a string literal: it detects if there are some quotes placeholders within the content,
    // and replace them according to the string quote used to delimit this literal.
    // The situation of string quotes placeholders inside a string literal content can happen when the user has selected a string and wrap it with another type of quote:
    // the outer placeholders will be turned to the appropriate quotes, but the inner ones won't, so we do it here.
    // It also parses inner potential quotes.
    // Here is an example with all these cases happening
    // Initial string was : 
    //  "this is Strype's string"
    // User wrapped and we are at the stage of parsing the literal code, we have :
    //  ‘$strype_StrDbQuote_placeholder$this is Strype's string$strype_StrDbQuote_placeholder$’
    // We need to have:
    //  ‘"this is Strype\'s string"’
    const quotesPlaceholdersExp = "(" + STRING_SINGLEQUOTE_PLACERHOLDER.replaceAll("$","\\$") + "|" + STRING_DOUBLEQUOTE_PLACERHOLDER.replaceAll("$","\\$") + ")";
    let cursorOffset = 0;
    content = content.replaceAll(new RegExp(quotesPlaceholdersExp, "g"), (placeholder) => {
        return (placeholder == STRING_DOUBLEQUOTE_PLACERHOLDER) ? "\"" : "'";
    });
    
    // We look for UNESCAPTED quotes inside the string literal
    const unescaptedQuoteExp = "(?<!\\\\)(?:\\\\{2})*" + ((quote == "'") ? "'" : "\"");
    content = content.replaceAll(new RegExp(unescaptedQuoteExp,"g"), (unescQuote) => {
        cursorOffset++;
        return "\\" + unescQuote[unescQuote.length - 1];
    });

    return {parsedContent: content, cursorOffset: cursorOffset};
};

/**
 * Gets the number of backslashes that directly precede cursorPos without any other character intervening
 */
export function getNumPrecedingBackslashes(content: string, cursorPos : number) : number {
    let count = 0;
    while (cursorPos > 0) {
        cursorPos -= 1;
        if (content.at(cursorPos) == "\\") {
            count += 1;
        }
        else {
            break;
        }
    }
    return count;
}

/**
 * Turtle  related bits for the editor
 */
// #v-ifdef MODE == VITE_STANDARD_PYTHON_MODE
// This method acts the turtle module being imported or not in the editor's frame
export function actOnTurtleImport(): void {
    let hasTurtleImported = false;
   
    Object.values(useStore().frameObjects).forEach((frame) => {
        // If the frame is disabled, or is not an import/for...import frame, it definitely do not imports turtle.
        if(frame.isDisabled || (frame.frameType.type != AllFrameTypesIdentifier.import && frame.frameType.type != AllFrameTypesIdentifier.fromimport)) {
            return;
        }

        // Whichever "import..." or "from...import...", we look for "turtle" in the first label.
        // The module must be using the same case, and we don't accept "turtle.xxx"
        const importedModules = (frame.labelSlotsDict[0].slotStructures.fields as BaseSlot[])
            .map((slot)=>slot.code)
            // We add spaces around the modules so we can also extract "as" (aliases)
            .reduce((accModules, currentSlotVal,i) => (accModules + ((i > 0) ? " " + frame.labelSlotsDict[0].slotStructures.operators[i-1].code + " " : "") + currentSlotVal), "");
        hasTurtleImported ||= importedModules.split(" , ").some((module) => module.localeCompare("turtle") == 0 || module.startsWith("turtle as "));
    });

    // We notify the Python exec area about the presence or absence of the turtle module
    document.getElementById(getPEAComponentRefId())?.dispatchEvent(new CustomEvent(CustomEventTypes.notifyTurtleUsage, {detail: hasTurtleImported}));
}

// UI-related method to calculate and set the max height of the Python Execution Area tabs content.
// We need to "fix" the size of the tabs container so the elements of the Exec Area, when it's enlarged, are correctly flowing in the page
// and stay within the splitters (which are overlayed in App.vue).
let manuallyResizedEditorHeight: number | undefined; // Flag used below and by App.vue - do not store this in store, it's session-lived only.
export function setManuallyResizedEditorHeightFlag(value: number | undefined): void {
    manuallyResizedEditorHeight = value;
}
export function getManuallyResizedEditorHeightFlag(): number | undefined {
    return manuallyResizedEditorHeight;
}
export function setPythonExecutionAreaTabsContentMaxHeight(): void {
    const fullAppHeight= (document.getElementsByTagName("body")[0].clientHeight);
    // We will need to use the editor's max height in our calculation - if the user has ever manually resized the Python Exec Area, then we set flag
    // (defined above) with the correct value. If not, we use the default 50vh (50% of body) value directly.
    const editorNewMaxHeight = manuallyResizedEditorHeight ?? (fullAppHeight / 2);
    // For the tabs' height, we can't rely on the container as the tabs may stack on top of each other (small browser window)
    // so we get the first element of the tab section that is not having a 0 height (because tabs are hidden when we are in split layout)
    const pythonExecAreaTabsAreaHeight = [...document.querySelectorAll("#" + getPEAControlsDivId() + " li, ." + scssVars.peaNoTabsPlaceholderSpanClassName)]
        .find((element) => element.getBoundingClientRect().height != 0)
        ?.getBoundingClientRect().height;    
    (document.querySelector("#"+getPEATabContentContainerDivId()) as HTMLDivElement).style.maxHeight = ((fullAppHeight - editorNewMaxHeight - (pythonExecAreaTabsAreaHeight??0)) + "px");
}

// This method set the Python Execution Area layout buttons position based on the presence of scrollbars
// (It is put here as we need to call at different points in the code.)
export function setPythonExecAreaLayoutButtonPos(): void{
    // We need to know in which context we are : Python console, or Turtle.
    // The general idea is to override the CSS styling by directly applying style when needed (the case a scrollbar is present).
    // We find out the size of the scroll bar, add a margin of 2px, to displace the button by that size.
    // (To be sure the UI layout is correctly updated before computing, we wait a bit.)
    setTimeout(() => {
        const pythonConsoleTextArea = document.getElementById(getPEAConsoleId());
        const pythonTurtleContainerDiv = document.getElementById(getPEAGraphicsContainerDivId());
        const peaLayoutButtonsContainer = document.getElementsByClassName(scssVars.peaToggleLayoutButtonsContainerClassName)?.[0];
        const peaComponent = ((vm.$children[0].$refs[getStrypeCommandComponentRefId()] as any).$refs[getPEAComponentRefId()]);
        if(pythonConsoleTextArea && pythonTurtleContainerDiv && peaLayoutButtonsContainer && peaComponent){
            // First get the natural position offset of the button, so can compute the new position:
            const peaExpandButtonNaturalPosOffset = parseInt((scssVars.pythonExecutionAreaLayoutButtonsPosOffset as string).replace("px",""));
            // Then, look for the scrollbars
            if((peaComponent as InstanceType<typeof PythonExecutionArea>).isConsoleAreaShowing && !(peaComponent as InstanceType<typeof PythonExecutionArea>).isGraphicsAreaShowing){
                // In the Python console, we wrap the text, only the vertical scrollbar can appear.
                const scrollDiff = pythonConsoleTextArea.getBoundingClientRect().width - pythonConsoleTextArea.clientWidth;
                (peaLayoutButtonsContainer as HTMLDivElement).style.right = (pythonConsoleTextArea.scrollHeight > pythonConsoleTextArea.clientHeight) ? (peaExpandButtonNaturalPosOffset + scrollDiff + 2) + "px" : "";
                (peaLayoutButtonsContainer as HTMLDivElement).style.bottom = "";                
            }
            else{
                // In the Turtle container, any of the scrollbars can appear.
                const scrollDiffW = pythonTurtleContainerDiv.getBoundingClientRect().width - pythonTurtleContainerDiv.clientWidth,
                    scrollDiffH = pythonTurtleContainerDiv.getBoundingClientRect().height - pythonTurtleContainerDiv.clientHeight;
                (peaLayoutButtonsContainer as HTMLDivElement).style.right = (pythonTurtleContainerDiv.scrollHeight > pythonTurtleContainerDiv.clientHeight) ? (peaExpandButtonNaturalPosOffset + scrollDiffW + 2) + "px" : "";
                (peaLayoutButtonsContainer as HTMLDivElement).style.bottom = (pythonTurtleContainerDiv.scrollWidth > pythonTurtleContainerDiv.clientWidth) ? (peaExpandButtonNaturalPosOffset + scrollDiffH + 2) + "px" : "";
    
            }
        }
    }, 100);
}

/** 
 * These methods are used to control the height of the "Add frame" commands,
 * to allow the commands to be displayed in columns when they can't be shown as one column.
 * See Commands.vue for the HTML template logics.
 */
export const debounceComputeAddFrameCommandContainerSize = debounce(computeAddFrameCommandContainerSize, 100);

export function computeAddFrameCommandContainerSize(isExpandedPEA?: boolean): void{
    // Two situations can happen: being or not in expanded PEA view.
    // If we are in expanded PEA view, the height of the frame commands panel is aligned with the editor's "cropped" size.
    // If we are in collapsed PEA view, the height of the frame commands is aligned with the commands/PEA splitter pane's size.
    if(isExpandedPEA){
        const projectNameContainerH = (document.getElementsByClassName(scssVars.strypeProjectNameContainerClassName)[0] as HTMLDivElement).clientHeight;
        const croppedEditorH = (manuallyResizedEditorHeight) ? manuallyResizedEditorHeight : (document.getElementsByTagName("body")[0].clientHeight / 2);
        (document.querySelector("." + scssVars.addFrameCommandsContainerClassName + " p") as HTMLParagraphElement).style.height = (croppedEditorH - projectNameContainerH) + "px";
        // In expanded view, we need to set the frame commmands container to "position: absolute" for the content to overlay the commands/PEA splitter.
        // However, the width won't align properly, we need to set that width manually.
        const frameCmdsParagraphContainer =  document.querySelector("." + scssVars.addFrameCommandsContainerClassName) as HTMLDivElement;
        (document.querySelector("." + scssVars.addFrameCommandsContainerClassName + " p") as HTMLParagraphElement).style.width = frameCmdsParagraphContainer.clientWidth + "px";
    }
    else {
        // Reset the frame commands container's width to natural behaviour (see case above)
        (document.querySelector("." + scssVars.addFrameCommandsContainerClassName + " p") as HTMLParagraphElement).style.width = "";

        // When the container div overflows, we remove the overflow extra height to the p element containing the commands
        // so that we can shorten the p height to trigger the commands to be displayed in columns.
        const scrollContainerH = document.getElementsByClassName(scssVars.noPEACommandsClassName)[0].scrollHeight;
        const noPEACommandsH =  document.getElementsByClassName(scssVars.noPEACommandsClassName)[0].getBoundingClientRect().height;
        const addFrameCmdsPH = (document.querySelector("." + scssVars.addFrameCommandsContainerClassName + " p") as HTMLParagraphElement).getBoundingClientRect().height;
        const commandsFlexContainer = (document.querySelector("." + scssVars.addFrameCommandsContainerClassName + " p") as HTMLParagraphElement);
        if(noPEACommandsH < scrollContainerH){
            commandsFlexContainer.style.height = (addFrameCmdsPH - (scrollContainerH - noPEACommandsH)) + "px";
        }
        else{
            // The commands panel is not overflowing, but it could be because it is already collapsed (elements are wrapped) and now we have more space for it to expand:
            // in the case, we want to increase the commands panel size.
            if(commandsFlexContainer.childElementCount > 0){
                const firstCommandLeft = commandsFlexContainer.children[0].getBoundingClientRect().left;
                const lastCommandLeft =  commandsFlexContainer.children[commandsFlexContainer.childElementCount - 1].getBoundingClientRect().left;
                if(firstCommandLeft != lastCommandLeft){
                    const projectNameContainerH = document.getElementsByClassName(scssVars.strypeProjectNameContainerClassName)[0].getBoundingClientRect().height;
                    (document.querySelector("." + scssVars.addFrameCommandsContainerClassName + " p") as HTMLParagraphElement).style.height = (noPEACommandsH - projectNameContainerH) + "px";
                }
            }
        }
            
        // When we are done, we need to check again the min size of the commands/PEA splitter pane 1, since scroll bars
        // could have been added with the new change (need to wait for it to be effective though).
        setTimeout(() => {
            (vm.$children[0].$refs[getStrypeCommandComponentRefId()] as InstanceType<typeof CommandsComponent>).setPEACommandsSplitterPanesMinSize(true);    
        }, 100);    
    }
}
// #v-endif


export function getCurrentFrameSelectAllAction(): SelectAllFramesAction {
    // This method checks the current selection scope that we need to know when doing select-all (for function definitions).
    // If we are not in function definitions, we return wholeContainer
    if(getFrameSectionIdFromFrameId(useStore().currentFrame.id) != useStore().defsContainerId){
        return SelectAllFramesAction.wholeContainer;
    }
    // Now we know we are in the definitions section, and it's a matter of working out what to do

    const currentFrameSelection = useStore().selectedFrames;
    // No selection currently:
    if(currentFrameSelection.length == 0) {
        const {id: currentFrameId, caretPosition: currentFrameCaretPos} = useStore().currentFrame;
        // We are at top-level, select the whole container:
        if(currentFrameId == useStore().defsContainerId){
            // currentLevel and wholeContainer are the same here, really:
            return SelectAllFramesAction.wholeContainer;
        }

        const isClassOrFunc = useStore().frameObjects[currentFrameId].frameType.type == AllFrameTypesIdentifier.funcdef || useStore().frameObjects[currentFrameId].frameType.type == AllFrameTypesIdentifier.classdef;
        const isOtherInDefs = !isClassOrFunc && useStore().frameObjects[currentFrameId].parentId == useStore().defsContainerId;

        // If we are just below a function or class then we select everything at this level (which might be top level, or not):
        if((isClassOrFunc || isOtherInDefs) && currentFrameCaretPos == CaretPosition.below){
            return SelectAllFramesAction.currentLevel;
        }
        
        // If we are just inside an empty function or class, we select the parent as we have effectively
        // already selected the entire (empty) content
        if(isClassOrFunc
            && currentFrameCaretPos == CaretPosition.body
            && useStore().frameObjects[currentFrameId].childrenIds.length == 0){
            return SelectAllFramesAction.parent;
        }

        // Otherwise we select the whole enclosing function or class:
        return SelectAllFramesAction.functionOrClassContents;
    }

    // We must have a non-empty selection already, so look at the parent:
    const parentId = useStore().frameObjects[currentFrameSelection[0]].parentId;
    
    // If we are top level then select everything:
    if(parentId == useStore().defsContainerId) {
        return SelectAllFramesAction.wholeContainer;
    }

    // At this stage, there is a selection within a function definition but we need to check if that's ALL the frames of 
    // a function definition's body or just some of them, or a selection in a deeper level of the frame hierarchy. 
    const selectionParentFrame = useStore().frameObjects[parentId];
    if(selectionParentFrame.frameType.type != AllFrameTypesIdentifier.funcdef && selectionParentFrame.frameType.type != AllFrameTypesIdentifier.classdef){
        // We are somewhere inside a function definition or class, but not just at the top level:
        return SelectAllFramesAction.functionOrClassContents;
    }
    // We must be just inside a function or class; have we selected all of it?
    const functionChildren = selectionParentFrame.childrenIds;
    if(currentFrameSelection[0] == functionChildren[0] && currentFrameSelection.length == functionChildren.length){
        // All frames of a function's body are already selected, select the parent
        return SelectAllFramesAction.parent;
    }
    else {
        // Select all of the current level then:
        return SelectAllFramesAction.currentLevel;
    }
}


/**
 * Gets selected text from editable text nodes by traversing DOM from anchor to focus
 * Similar to document.getSelection().toString() but only including nodes where
 * isNodeSelectableText() returns true
 *
 * @returns {string} The concatenated text from all selected editable text nodes
 */
export function getEditableSelectionText() : string {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return "";
    }

    // Get the range covering the current selection
    const range = selection.getRangeAt(0);

    // If selection is within a single node.  Note that if it's within an element it might be in Firefox
    // where it's possible for the selection to be in the parent div 
    if (range.startContainer === range.endContainer && range.startContainer.nodeType != Node.ELEMENT_NODE) {
        if (range.startContainer.nodeType === Node.TEXT_NODE && isNodeSelectableText(range.startContainer)) {
            return range.startContainer.nodeValue?.substring(Math.min(range.startOffset, range.endOffset), Math.max(range.startOffset, range.endOffset)) ?? "";
        }
        return "";
    }
    
    // For multi-node selection
    const allNodes = [] as string[];
    const treeWalker = document.createTreeWalker(
        range.cloneContents(),
        // Need to show elements to find the media literal images:
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        null
    );

    for (let node = treeWalker.nextNode(); node; node = treeWalker.nextNode()) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.classList.contains(scssVars.labelSlotMediaClassName)) {
                const code = el.getAttribute("data-code");
                if (code) {
                    allNodes.push(code);
                }
            }
        }
        else {
            const selectableText = isNodeSelectableText(node);
            if (selectableText == "yes" || selectableText == "yes_quote") {
                let nodeContent = node.nodeValue ?? "";
                if (selectableText == "yes_quote") {
                    nodeContent = nodeContent.replaceAll(/[“”]/g, "\"").replaceAll(/[‘’]/g, "'");
                }
                allNodes.push(nodeContent);
            }
        }
    }

    return allNodes.join("").replace(/\u200B/g, "");
}

// Helper function to check if a node is inside a contenteditable element
function isNodeSelectableText(node: Node | null) : ("no" | "yes_quote" | "yes") {
    if (!node || node.nodeType !== Node.TEXT_NODE) {
        return "no";
    }

    // Check if the nearest element ancestors is contenteditable
    let current: Node | null = node;
    let editable = false;
    let quote = false;
    while (current) {
        if (current.nodeType === Node.ELEMENT_NODE) {
            const el = current as HTMLElement;
            if (el.classList.contains(scssVars.labelSlotInputClassName)){
                editable = true;
            }
            if (el.classList.contains(scssVars.frameStringSlotQuoteClassName)) {
                quote = true;
            }
        }
        current = current.parentNode;
    }
    if (editable && quote) {
        return "yes_quote";
    }
    else if (editable) {
        return "yes";
    }
    else {
        return "no";
    }
}

// Gets all the HTML elements which are part of the window text selection.
// The returned list may contain duplicates
export function getElementsInSelection() : Element[] {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
        return [];
    }

    const elements = [];

    for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        // Clone the selected content to be able to access the sub-elements:
        const fragment = range.cloneContents();
        elements.push(...fragment.querySelectorAll("*"));
    }

    return elements;
}

// Joins fields and operators, but ignores brackets, quotes, media:
export function simpleSlotStructureToString(ss: SlotsStructure) : string {
    const r : string[] = [];
    for (let i = 0; i < ss.fields.length; i++) {
        const field = ss.fields[i];
        if (isFieldBaseSlot(field)) {
            r.push(field.code);
        }
        if (i < ss.operators.length) {
            r.push(ss.operators[i].code);
        }
    }
    return r.join("");
}

export function slotStructureToString(ss: SlotsStructure) : string {
    const r : string[] = [];
    if (ss.openingBracketValue) {
        r.push(ss.openingBracketValue);
    }
    for (let i = 0; i < ss.fields.length; i++) {
        const field = ss.fields[i];
        if (isFieldMediaSlot(field)) {
            r.push("<img>");
        }
        else if (isFieldStringSlot(field)) {
            r.push(field.quote + field.code + field.quote);
        }
        else if (isFieldBaseSlot(field)) {
            r.push(field.code);
        }
        else {
            r.push(slotStructureToString(ss));
        }
        if (i < ss.operators.length) {
            r.push(ss.operators[i].code);
        }
    }
    if (ss.openingBracketValue) {
        r.push(getMatchingBracket(ss.openingBracketValue, true));
    }
    return r.join("");
}

// Method to get the length of a grapheme (a grapheme is a visual "character" of a string, for example an emoji)
// The callers should handle the case of boudaries, we only return -1 for those.
export function getGraphemeLength(content: string, currentCursorPos:number, lookAt: "current" | "before"): number {
    const graphemeIterator = new Intl.Segmenter("en", { granularity: "grapheme" }).segment(content);
    const graphemeIteratorArray = Array.from(graphemeIterator);
    const graphemePosAndLength = graphemeIteratorArray.map((grapheme, index) => {
        // We don't get the length directly from the iterator content (nor the grapheme itself)
        // so we need to find it out: we compute it by looking at the next grapheme and making the indexes diff.
        // If we're on the last grapheme, then the difference is between the all string length and the current index.
        const isLastGrapheme = index == (Array.from(graphemeIterator).length - 1);
        const nextGraphemePos = (isLastGrapheme) ? content.length : graphemeIteratorArray[index + 1].index; 
        return {pos: grapheme.index, length: nextGraphemePos - grapheme.index};
    });

    if(currentCursorPos == content.length){
        return (lookAt == "current") ? -1 : graphemePosAndLength[graphemePosAndLength.length - 1].length;
    }
    else{
        const currentPosGraphemeIndex = graphemePosAndLength.findIndex((g)=> g.pos==currentCursorPos);
        return (lookAt == "before" && currentCursorPos == 0) ? -1: graphemePosAndLength[currentPosGraphemeIndex + ((lookAt == "current") ? 0 : -1)].length;                    
    }
}
