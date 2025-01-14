import i18n from "@/i18n";
import { useStore } from "@/store/store";
import { AddFrameCommandDef, AddShorthandFrameCommandDef, AllFrameTypesIdentifier, areSlotCoreInfosEqual, BaseSlot, CaretPosition, FrameContextMenuActionName, FrameContextMenuShortcut, FramesDefinitions, getFrameDefType, isFieldBracketedSlot, isSlotBracketType, isSlotQuoteType, isSlotStringLiteralType, ModifierKeyCode, NavigationPosition, Position, SelectAllFramesFuncDefScope, SlotCoreInfos, SlotCursorInfos, SlotsStructure, SlotType, StringSlot } from "@/types/types";
import { getAllChildrenAndJointFramesIds, getAvailableNavigationPositions, getFrameSectionIdFromFrameId } from "./storeMethods";
import { strypeFileExtension } from "./common";
import {getContentForACPrefix} from "@/autocompletion/acManager";
import scssVars  from "@/assets/style/_export.module.scss";
import html2canvas, { Options } from "html2canvas";
import CaretContainer from "@/components/CaretContainer.vue";
import { vm } from "@/main";
import Vue from "vue";

export const undoMaxSteps = 200;
export const autoSaveFreqMins = 2; // The number of minutes between each autosave action.

export enum CustomEventTypes {
    contextMenuHovered = "contextMenuHovered",
    requestCaretContextMenuClose="requestCaretContextMenuClose",
    requestAppNotOnTop="requestAppNotOnTop",
    editorAddFrameCommandsUpdated = "frameCommandsUpdated",
    frameContentEdited = "frameContentEdited",
    editableSlotGotCaret= "slotGotCaret",
    editableSlotLostCaret = "slotLostCaret",
    editorContentPastedInSlot = "contentPastedInSlot",
    addFunctionToEditorAutoSave = "addToAutoSaveFunction",
    removeFunctionToEditorAutoSave = "rmToAutoSaveFunction",
    requestEditorAutoSaveNow = "requestAutoSaveNow",
    saveStrypeProjectDoneForLoad = "saveProjDoneForLoad",
    noneStrypeFilePicked = "nonStrypeFilePicked",
    acItemHovered="acItemHovered",
    /* IFTRUE_isPurePython */
    pythonExecAreaExpandCollapseChanged = "peaExpandCollapsChanged",
    pythonConsoleRequestFocus = "pythonConsoleReqFocus",
    pythonConsoleAfterInput = "pythonConsoleAfterInput",
    notifyTurtleUsage = "turtleUsage",
    pythonExecAreaSizeChanged = "peaSizeChanged",
    skulptMouseEventListenerOff = "skMouseEventsOff",
    skulptTimerEventListenerOff = "skTimerEventsOff",
    /* FITRUE_isPurePython */
}

export const frameContextMenuShortcuts: FrameContextMenuShortcut[] = [
    {actionName: FrameContextMenuActionName.copy, firstModifierKey: [ModifierKeyCode.ctrl, ModifierKeyCode.meta], mainKey: "c"},
    {actionName: FrameContextMenuActionName.cut, firstModifierKey: [ModifierKeyCode.ctrl, ModifierKeyCode.meta], mainKey: "x"},
    {actionName: FrameContextMenuActionName.paste, firstModifierKey: [ModifierKeyCode.ctrl, ModifierKeyCode.meta], mainKey: "v"},
    {actionName: FrameContextMenuActionName.delete, mainKey: "delete"},
];

export function getFrameContainerUID(frameId: number): string {
    return "FrameContainer_" + frameId;
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

export function isIdAFrameId(id: string): boolean {
    return id.match(/^frame_id_\d+$/) !== null;
}

const labelSlotUIDRegex = /^input_frame_(\d+)_label_(\d+)_slot_([0-7]{4})_(\d+(,\d+)*)$/;
export function getLabelSlotUID(slotCoreInfos: SlotCoreInfos): string {
    // If a change is done in this method, also update isElementLabelSlotInput() and parseLabelSlotUID()
    // For explanation about the slotID format, see generateFlatSlotBases() in storeMethods.ts
    // note: slotype is an enum value, which is rendered as an octal 4 digits value (eg "0010")
    const intermediateFormattedType = "000" + slotCoreInfos.slotType.toString(8);
    const formattedTypeValue = intermediateFormattedType.substring(intermediateFormattedType.length - 4, intermediateFormattedType.length);
    return "input_frame_" + slotCoreInfos.frameId + "_label_" + slotCoreInfos.labelSlotsIndex + "_slot_" + formattedTypeValue + "_" + slotCoreInfos.slotId;
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

export function isElementLabelSlotInput(element: EventTarget | null): boolean{
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
    const regexMatch = (element as HTMLSpanElement).id.match("^input_frame_\\d+_label_\\d+_slot_000(\\d)_\\d+(,\\d+)*$");
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

export function getTextStartCursorPositionOfHTMLElement(htmlElement: HTMLSpanElement): number {
    // For (editable) spans, it is not straight forward to retrieve the text cursor position, we do it via the selection API
    // if the text in the element is selected, we show the start of the selection.
    let caretPos = 0;
    const sel = document.getSelection();
    if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        if (range.commonAncestorContainer.parentNode == htmlElement) {
            caretPos = range.startOffset;
        }
    }
    return caretPos;
}

export function getFocusedEditableSlotTextSelectionStartEnd(labelSlotUID: string): {selectionStart: number, selectionEnd: number} {
    // A helper function to get the selection relative to a *focused* slot: if the selection spans across several slots, we get the right boudary values for the given slot
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
                return {selectionStart: focusCursorInfos.cursorPos, selectionEnd: (document.getElementById(labelSlotUID) as HTMLSpanElement).textContent?.length??0};
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
export function getFrameLabelSlotLiteralCodeAndFocus(frameLabelStruct: HTMLElement, currentSlotUID: string, delimiters?: {startSlotUID: string, stopSlotUID: string}): {uiLiteralCode: string, focusSpanPos: number, hasStringSlots: boolean}{
    let focusSpanPos = 0;
    let uiLiteralCode = "";
    let foundFocusSpan = false;
    let ignoreSpan = !!delimiters;
    let hasStringSlots = false;
    frameLabelStruct.querySelectorAll(".labelSlot-input").forEach((spanElement) => {
        if(delimiters && (delimiters.startSlotUID == spanElement.id || delimiters.stopSlotUID == spanElement.id)){
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
                uiLiteralCode += (spanElement.textContent);
            }
        
            if(spanElement.id === currentSlotUID){
                focusSpanPos += (useStore().focusSlotCursorInfos?.cursorPos??0);     
                foundFocusSpan = true;
            }
            else{
                // In most cases, we just increment the length by the span content length,
                // BUT there are 2 exceptions: textual operators require surrounding spaces to be inserted, and those spaces do not appear on the UI
                // therefore we need to account for them when dealing with such operators;
                // and if we parse the string quotes, we need to set the position value as if the quotes were still here (because they are in the UI)
                let spacesOffset = 0;
                const spanElementContentLength = (spanElement.textContent?.length??0);
                const ignoreAsKW = (spanElement.textContent == "as" && useStore().frameObjects[parseLabelSlotUID(spanElement.id).frameId].frameType.type != AllFrameTypesIdentifier.import);
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
    return {uiLiteralCode: uiLiteralCode, focusSpanPos: focusSpanPos, hasStringSlots: hasStringSlots};
}


// We want to know if the cursor position in a comment frame will still allow for moving that cursor up/down within the frame or need to be interpreted as an "exit" out the frame.
// A naive way of approaching this would be to check the line returns (\n) before/after the cursor, but this is not reliable because the text content associated with the span
// element will not necessarily be represented exactly in the same way on the browser (because of text wrapping) -- and there is no easy way to retrieve the text AS IT IS PRESENTED.
// However, we can check the bounds of the current selection to help us find where we are in the span, and therefore know if we're in the top/last VISUALLY SHOWING line of the text
// Based on https://www.bennadel.com/blog/4310-detecting-rendered-line-breaks-in-a-text-node-in-javascript.htm
export function checkCanReachAnotherCommentLine(isCommentFrame: boolean, isArrowUp: boolean, commentSpanElement: HTMLSpanElement): boolean{
    // If we're not in a comment, just don't check
    const currentDocSelection = document.getSelection();
    if(isCommentFrame && currentDocSelection){
        const commentSpanRect = commentSpanElement.getClientRects()[0];
        const commentSelectionRects = currentDocSelection.getRangeAt(0).getClientRects();
        // When there is nothing in the comment, the range may have no rectangles, then we clearly can return false
        if(commentSelectionRects[0]){
            const lineheight = commentSelectionRects[0].height;
            // The weird case when we are below an empty line
            const firstRect = (commentSelectionRects.length == 2 && currentDocSelection.getRangeAt(0).collapsed) ? commentSelectionRects[1] : commentSelectionRects[0];
            const isInFirstVisualLine = (firstRect.top - commentSpanRect.top) < lineheight;
            const isInLastVisualLine = (commentSpanRect.bottom - commentSelectionRects[commentSelectionRects.length - 1].bottom) < lineheight;
            return ((isArrowUp) ? !isInFirstVisualLine : !isInLastVisualLine);
        }
    }
    return false;
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

export function getCaretContainerRef(): string {
    return "caretContainer";
}

export function getCommandsContainerUID(): string {
    return "editorCommands";
}

export function getEditorMenuUID(): string {
    return "showHideMenu";
} 

export function getMenuLeftPaneUID(): string {
    return "menu-bar";
}

export function getStrypeCommandComponentRefId(): string {
    return "strypeCommands";
}

export function getStrypePEAComponentRefId(): string {
    return "strypePEA";
}

export function getSaveAsProjectModalDlg():string {
    return "save-strype-project-modal-dlg";
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
    const erroneousHTMLElements = [...document.getElementsByClassName("error"), ...document.getElementsByClassName("errorSlot")];
    if(erroneousHTMLElements.length > 0){
        for(const erroneousHTMLElement of erroneousHTMLElements) {
            if(erroneousHTMLElement.classList.contains("labelSlot-input") || erroneousHTMLElement.classList.contains("frame-header")){
                errorHTMLElements.push(erroneousHTMLElement as HTMLElement);
            }
        }
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

// This methods checks for the relative positions of the current position (which can be a focused slot or a blue caret) towards the positions of the errors (slots or 1st slot an frame header)
// We return the "full" index (of the error list) if the current position is ON an error, otherwise "semi" indexes that will allow navigating the errors properly:
// for example if the current position is before the first error, the index is -0.5 so we can still go down and reach error indexed 0
export function getNearestErrorIndex(): number {
    if(errorHTMLElements == null){
        // If we never checked errors, we do it at this stage
        checkEditorCodeErrors();
    }
    
    const errorsElmtIds = (errorHTMLElements as HTMLElement[]).flatMap((elmt) => elmt.id);
    const isEditing = useStore().isEditing;

    // Get the slot currently being edited: we check first if that's one of the error so it would be a "real" index of the error array
    // if it's not, then we'll find in between which 2 errors we're in and use a "semi" index
    const currentFocusedElementId = (isEditing && useStore().focusSlotCursorInfos != undefined) 
        ? getLabelSlotUID(useStore().focusSlotCursorInfos?.slotInfos as SlotCoreInfos) 
        : getCaretUID(useStore().currentFrame.caretPosition, useStore().currentFrame.id);
    // Case 1: we are in a slot that is erroneous, or in a slot of an erroneous frame
    if(errorsElmtIds.includes(currentFocusedElementId) || (isEditing && errorsElmtIds.includes(getFrameHeaderUID(useStore().focusSlotCursorInfos?.slotInfos.frameId as number)))){
        return errorsElmtIds.indexOf((errorsElmtIds.includes(currentFocusedElementId)) ? currentFocusedElementId : getFrameHeaderUID(useStore().focusSlotCursorInfos?.slotInfos.frameId as number));
    }
    else{
        // Case 2: not in an error, we find out our relative position to the list of errors
        const allCaretPositions = getAvailableNavigationPositions();
        // Get all position indexes (we use one single array for simplication, the current slot or frame caret is put AT THE END of the array)
        const allPosIndexes:number[] = [];
        [...errorsElmtIds, currentFocusedElementId].forEach((elementId) => {
            const isElementEditableSlot = isElementEditableLabelSlotInput(document.getElementById(elementId));
            const isElementFrameHeader = isElementUIDFrameHeader(elementId);
            // Look the position of a slot (an error or the currently focused slot, or the first slot of an erroneous frame)
            if(isElementEditableSlot || isElementFrameHeader){
                const slotInfos: SlotCoreInfos = (isElementEditableSlot) 
                    ? parseLabelSlotUID(elementId)
                    : {frameId: parseFrameHeaderUID(elementId), slotId: "0", labelSlotsIndex: 0, slotType: SlotType.code};
                allPosIndexes.push(allCaretPositions.findIndex((navPos) => navPos.isSlotNavigationPosition && navPos.frameId == slotInfos.frameId 
                && navPos.labelSlotsIndex == slotInfos.labelSlotsIndex && navPos.slotId == slotInfos.slotId 
                && navPos.slotType == slotInfos.slotType));
            }
            // Look for the position of the current focused blue caret (because if we have an element that is the caret it can only be the current blue caret, there is no errors on a blue caret...)
            else{
                allPosIndexes.push(allCaretPositions.findIndex((navPos) => !navPos.isSlotNavigationPosition && navPos.frameId == useStore().currentFrame.id && navPos.caretPosition == useStore().currentFrame.caretPosition));
            }
        });
        
        // If we are not editing, we add the position of the caret at the end of the array (since we would have skipped pushing a value as currentFocusedElementId would be empty)
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
        "i": [
            {
                type: getFrameDefType(AllFrameTypesIdentifier.if),
                description: "if",
                shortcuts: ["i"],
                tooltip:i18n.t("frame.if_detail") as string,
                index: 0,
            },
            {
                type: getFrameDefType(AllFrameTypesIdentifier.import),
                description: "import",
                shortcuts: ["i"],
                tooltip:i18n.t("frame.import_detail") as string,
                index:1,
            },
        ],
        "l": [{
            type: getFrameDefType(AllFrameTypesIdentifier.elif),
            description: "elif",
            tooltip:i18n.t("frame.elif_detail") as string,
            shortcuts: ["l"],
        }],
        "e": [{
            type: getFrameDefType(AllFrameTypesIdentifier.else),
            description: "else",
            tooltip:i18n.t("frame.else_detail") as string,
            shortcuts: ["e"],
        }],
        "f": [
            {
                type: getFrameDefType(AllFrameTypesIdentifier.for),
                description: "for",
                shortcuts: ["f"],
                tooltip:i18n.t("frame.for_detail") as string,
                index: 0,
            },
            {
                type: getFrameDefType(AllFrameTypesIdentifier.funcdef),
                description: i18n.t("frame.funcdef_desc") as string,
                shortcuts: ["f"],
                tooltip:i18n.t("frame.funcdef_detail") as string,
                index: 1,
            },
            {
                type: getFrameDefType(AllFrameTypesIdentifier.fromimport),
                description: "from...import",
                tooltip:i18n.t("frame.fromimport_detail") as string,
                shortcuts: ["f"],
                index:2,
            },
        ],
        "w": [{
            type: getFrameDefType(AllFrameTypesIdentifier.while),
            description: "while",
            tooltip:i18n.t("frame.while_detail") as string,
            shortcuts: ["w"],
        }],
        "b" : [{
            type: getFrameDefType(AllFrameTypesIdentifier.break),
            description: "break",
            tooltip:i18n.t("frame.break_detail") as string,
            shortcuts: ["b"],
        }],
        "u" : [{
            type: getFrameDefType(AllFrameTypesIdentifier.continue),
            description: "continue",
            tooltip:i18n.t("frame.continue_detail") as string,
            shortcuts: ["u"],
        }],
        "=": [{
            type: getFrameDefType(AllFrameTypesIdentifier.varassign),
            description: i18n.t("frame.varassign_desc") as string,
            tooltip:i18n.t("frame.varassign_detail") as string,
            shortcuts: ["="],
        }],
        " ": [{
            type: getFrameDefType(AllFrameTypesIdentifier.funccall),
            description: i18n.t("frame.funccall_desc") as string,
            shortcuts: [" "],
            tooltip:i18n.t("frame.funccall_detail") as string,
            symbol: "⌴",//"␣"
        }],
        "enter": [{
            type: getFrameDefType(AllFrameTypesIdentifier.blank),
            description: i18n.t("frame.blank_desc") as string,
            shortcuts: ["\x13"],
            tooltip:i18n.t("frame.blank_detail") as string,
            symbol: "↵",
        }],
        "r": [{
            type: getFrameDefType(AllFrameTypesIdentifier.return),
            description: "return",
            tooltip:i18n.t("frame.return_detail") as string,
            shortcuts: ["r"],
        }],
        "c": [{
            type: getFrameDefType(AllFrameTypesIdentifier.comment),
            description: i18n.t("frame.comment_desc") as string,
            tooltip:i18n.t("frame.comment_detail") as string,
            shortcuts: ["c", "#"],
        }],
        "t": [{
            type: getFrameDefType(AllFrameTypesIdentifier.try),
            description: "try",
            tooltip:i18n.t("frame.try_detail") as string,
            shortcuts: ["t"],
        }],
        "a" : [{
            type: getFrameDefType(AllFrameTypesIdentifier.raise),
            description: "raise",
            tooltip:i18n.t("frame.raise_detail") as string,
            shortcuts: ["a"],
        }],
        "x": [{
            type: getFrameDefType(AllFrameTypesIdentifier.except),
            description: "except",
            tooltip:i18n.t("frame.except_detail") as string,
            shortcuts: ["x"],
        }],
        "n": [{
            type: getFrameDefType(AllFrameTypesIdentifier.finally),
            description: "finally",
            tooltip:i18n.t("frame.finally_detail") as string,
            shortcuts: ["n"],
        }],
        "h": [{
            type: getFrameDefType(AllFrameTypesIdentifier.with),
            description: "with",
            tooltip:i18n.t("frame.with_detail") as string,
            shortcuts: ["h"],
        }],
        "g": [{
            type: getFrameDefType(AllFrameTypesIdentifier.global),
            description: "global",
            tooltip: i18n.t("frame.global_detail") as string,
            shortcuts: ["g"],
        }],
        "q": [{
            type: getFrameDefType(AllFrameTypesIdentifier.list),
            description: i18n.t("frame.list_desc") as string,
            tooltip:i18n.t("frame.list_detail") as string,
            shortcuts: ["q"],
        }],
        "s": [{
            type: getFrameDefType(AllFrameTypesIdentifier.set),
            description: i18n.t("frame.set_desc") as string,
            tooltip:i18n.t("frame.set_detail") as string,
            shortcuts: ["s"],
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
            const caretEl = document.getElementById(getCaretUID(navigationPos.caretPosition as string, navigationPos.frameId));
            const caretBox = caretEl?.getBoundingClientRect() as DOMRect;
            const caretYTopPos = (caretBox.height > 0) ? caretBox.y : caretBox.y - Number.parseInt(scssVars.caretHeightValue) / 2;
            const caretYBottompPos = (caretBox.height > 0) ? caretBox.y + caretBox.height : caretBox.y + Number.parseInt(scssVars.caretHeightValue) / 2;
            const verticalDist = (mouseEvent.y <= caretYTopPos)
                ?   caretYTopPos - mouseEvent.y
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
            }
            currentCaretDropPosId = closestCaretEl?.id??"";
            currentCaretDropPosFrameId = newCaretDropPosFrameId;
            currentCaretDropPosCaretPos = newCaretDropPosCaretPos;
            (vm.$refs[getCaretUID(newCaretDropPosCaretPos, newCaretDropPosFrameId)] as InstanceType<typeof CaretContainer>).areFramesDraggedOver = true;
            (vm.$refs[getCaretUID(newCaretDropPosCaretPos, newCaretDropPosFrameId)] as InstanceType<typeof CaretContainer>).areDropFramesAllowed = 
                isFrameDropAllowed(newCaretDropPosFrameId, newCaretDropPosCaretPos);
        }
    }
};

// We need to also look for the mouseup event during Drag and Drop as we only let the browser handling "dragstart",
// there is no "dragend" being raised by the browser consequently.
const bodyMouseUpEventHandlerForFrameDnD = (): void => {
    if(useStore().isDraggingFrame){
        const areDropFramesAllowed = (vm.$refs[getCaretUID(currentCaretDropPosCaretPos, currentCaretDropPosFrameId)] as InstanceType<typeof CaretContainer>).areDropFramesAllowed;
        // Notify the drag even is finished
        notifyDragEnded();

        // Drop the frame at the current drop caret location only if drop is allowed
        if(areDropFramesAllowed){
            useStore().updateDroppedFramesOrder(currentCaretDropPosFrameId, currentCaretDropPosCaretPos, currentDraggedSingleFrameId);
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
            const commentBackgroundColor = (parentId == useStore().getImportsFrameContainerId || parentId == useStore().getFuncDefsFrameContainerId)
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
    // (The position below the dragged frame (or last selected frame) won't a suggested drop position, which is not needed anyway.)
    const noCaretDropFrameIds: number[] = [];
    if(frameId){
        noCaretDropFrameIds.push(...getAllChildrenAndJointFramesIds(frameId), frameId);
    }
    else{
        useStore().selectedFrames.forEach((selectedFrameId) => noCaretDropFrameIds.push(...getAllChildrenAndJointFramesIds(selectedFrameId)));
        noCaretDropFrameIds.push(...useStore().selectedFrames);
    }
    currentCaretPositionsForDnD = getAvailableNavigationPositions()
        .filter((navigationPosition) => !navigationPosition.isSlotNavigationPosition 
            && !noCaretDropFrameIds.includes(navigationPosition.frameId));
    // Change the mouse cursor for the whole app
    document.getElementsByTagName("body")[0]?.classList.add("dragging-frame");
    // And assign a mouse event event listen to allow companion "image" to follow cursor and detect when the drop is performed
    (document.getElementsByTagName("body")[0] as HTMLBodyElement).addEventListener("mousemove", bodyMouseMoveEventHandlerForFrameDnD);
    (document.getElementsByTagName("body")[0] as HTMLBodyElement).addEventListener("mouseup", bodyMouseUpEventHandlerForFrameDnD);

    // Add companion "image" (canvas) to the cursor - we use HTML2Canvas. 
    // The element to generate an image of is either the frame passed as argument
    // or the shadow element containing the current selection.
    const draggingEl = document.getElementById(getFrameUID(frameId??(useStore().frameObjects[useStore().selectedFrames[0]].parentId)));
    if(draggingEl){
        html2canvas(draggingEl, html2canvasOptions);
    }
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
    document.getElementsByTagName("body")[0]?.classList.remove("dragging-frame");
    if(currentCaretDropPosId.length > 0){
        (vm.$refs[getCaretUID(currentCaretDropPosCaretPos, currentCaretDropPosFrameId)] as InstanceType<typeof CaretContainer>).areFramesDraggedOver = false;
        // Not really required but just better to reset things properly
        (vm.$refs[getCaretUID(currentCaretDropPosCaretPos, currentCaretDropPosFrameId)] as InstanceType<typeof CaretContainer>).areDropFramesAllowed = true;
    }
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

const FIELD_PLACERHOLDER = "$strype_field_placeholder$";
// The placeholders for the string quotes when strings are extracted FROM THE EDITOR SLOTS,
// both placeholders need to have THE SAME LENGHT so sustitution operations are done with more ease
export const STRING_SINGLEQUOTE_PLACERHOLDER = "$strype_StrSgQuote_placeholder$";
export const STRING_DOUBLEQUOTE_PLACERHOLDER = "$strype_StrDbQuote_placeholder$";
export const parseCodeLiteral = (codeLiteral: string, flags?: {isInsideString?: boolean, cursorPos?: number, skipStringEscape?: boolean, frameType?: string,}): {slots: SlotsStructure, cursorOffset: number} => {
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
            if(!match.endsWith(match[0]) || (match.endsWith("\\" + match[0]) && getNumPrecedingBackslashes(match, match.length - 1) % 2 == 1)){
                missingClosingQuote = match[0];
            }
            return match[0] + " ".repeat(match.length - ((missingClosingQuote.length == 1) ? 1 : 2)) + match[0];
        }
        
    });
    if(missingClosingQuote.length == 1){
        // The blanking above would have already terminate the string quote in blankedStringCodeLiteral if needed,
        // we need to update the original codeLiteral too
        codeLiteral += missingClosingQuote;
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
        if(afterBracketCode.length > 0){
            afterBracketCode = FIELD_PLACERHOLDER + afterBracketCode;
        }
        const {slots: structBeforeBracket, cursorOffset: beforeBracketCursorOffset} = parseCodeLiteral(beforeBracketCode, {isInsideString:false, cursorPos: flags?.cursorPos, skipStringEscape: flags?.skipStringEscape});
        cursorOffset += beforeBracketCursorOffset;
        const {slots: structOfBracket, cursorOffset: bracketCursorOffset} = parseCodeLiteral(innerBracketCode, {isInsideString: false, cursorPos: (flags?.cursorPos) ? flags.cursorPos - (firstOpenedBracketPos + 1) : undefined, skipStringEscape: flags?.skipStringEscape});
        if (openingBracketValue === "(") {
            // First scan and find all the comma-separated parameters that are a single field:
            let lastParamStart = -1;
            let curParam = 0;
            const singleFieldParams : Record<number, BaseSlot> = {};
            for (let i = 0; i < structOfBracket.fields.length; i++) {
                if (i == structOfBracket.operators.length || structOfBracket.operators[i].code === ",") {
                    if (i - lastParamStart == 1 && "code" in structOfBracket.fields[i] && !("quote" in structOfBracket.fields[i])) {
                        singleFieldParams[curParam] = structOfBracket.fields[i] as BaseSlot;
                    }
                    curParam += 1;
                    lastParamStart = i;
                }
            }
            (Object.entries(singleFieldParams) as unknown as [number, BaseSlot][]).forEach(([paramIndex, slot] : [number, BaseSlot]) => {
                const context = getContentForACPrefix(structBeforeBracket, true);
                slot.placeholderSource = {
                    token: (structBeforeBracket.fields.at(-1) as BaseSlot)?.code ?? "",
                    context: context,
                    paramIndex: paramIndex,
                    lastParam: paramIndex == curParam - 1,
                };
            });
        }
        const structOfBracketField = {...structOfBracket, openingBracketValue: openingBracketValue};
        cursorOffset += bracketCursorOffset;
        let actualCodeClosingBracketPos = closingBracketPos;
        const quotesPlaceholdersExp = "(" + STRING_SINGLEQUOTE_PLACERHOLDER.replaceAll("$","\\$") + "|" + STRING_DOUBLEQUOTE_PLACERHOLDER.replaceAll("$","\\$") + ")";
        codeLiteral.match(new RegExp(quotesPlaceholdersExp, "g"))?.forEach((placeholder) => {
            // If the content of the brackets contained any string, the value of the closing bracket position is for a code WITH the string quotes placeholders.
            // Therefore, if we want to use that to check what is the new cursor position in the parsing of the code after the bracket, we need to do so without
            // the string placeholders, if any. When a placeholder is found, we remove its length - 1 to the positin, as it would match 1 quote.
            actualCodeClosingBracketPos -= (placeholder.length - 1);
        });

        const {slots: structAfterBracket, cursorOffset: afterBracketCursorOffset} = parseCodeLiteral(afterBracketCode, {isInsideString: false, cursorPos: (flags && flags.cursorPos && afterBracketCode.startsWith(FIELD_PLACERHOLDER)) ? flags.cursorPos - (actualCodeClosingBracketPos + 1) + FIELD_PLACERHOLDER.length : undefined, skipStringEscape: flags?.skipStringEscape});
        cursorOffset += afterBracketCursorOffset;
        // Remove the bracket field placeholder from structAfterBracket: we trim the placeholder value from the start of the first field of the structure.
        // (the conditional test may be overdoing it, but at least we are sure we won't get fooled by the user code...)
        if((structAfterBracket.fields[0] as BaseSlot).code.startsWith(FIELD_PLACERHOLDER)){
            (structAfterBracket.fields[0] as BaseSlot).code = (structAfterBracket.fields[0] as BaseSlot).code.substring(FIELD_PLACERHOLDER.length);
        }
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
            if(afterStringCode.length > 0){
                afterStringCode = FIELD_PLACERHOLDER + afterStringCode;
            }
            // When we construct the parts before and after the string, we need to internally set the cursor "fake" position, that is, the cursor offset by the bits we are evaluating
            const {slots: structBeforeString, cursorOffset: beforeStringCursortOffset} = parseCodeLiteral(beforeStringCode, {isInsideString: false, cursorPos: flags?.cursorPos, skipStringEscape: flags?.skipStringEscape});
            cursorOffset += beforeStringCursortOffset;
            const structOfString: StringSlot = {code: stringContentCode, quote: openingQuoteValue};
            const {slots: structAfterString, cursorOffset: afterStringCursorOffset} = parseCodeLiteral(afterStringCode, {isInsideString: false, cursorPos: (flags?.cursorPos??0) - closingQuoteIndex + (2*(quoteTokenLength -1)) + FIELD_PLACERHOLDER.length, skipStringEscape: flags?.skipStringEscape});
            cursorOffset += afterStringCursorOffset;
            if((structAfterString.fields[0] as BaseSlot).code.startsWith(FIELD_PLACERHOLDER)){
                (structAfterString.fields[0] as BaseSlot).code = (structAfterString.fields[0] as BaseSlot).code.substring(FIELD_PLACERHOLDER.length);
            }
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
        .replaceAll(/(^\s+|\b|[+\-*/%<>&|^=!,]\s*)((\d+(\.\d*)?|\.\d+)[eE][-+]\d+j?)($|(\s*[ +\-*/%<>&|^=!,]))/g,
            (...params) => blankReplacer(2, ["+", "-"], ...params))
        // Replacing a preceding sign operator
        .replaceAll(/(^\s*|[+\-*/%<>&|^=!,]\s*)([+-]((0b[01]+)|(0x[0-9A-Fa-f]+)|((\d+(\.\d*)?|\.\d+)([eE]\d+)?j?)))(?=$|(\s*[ +\-*/%<>&|^=!,]))/g,
            (...params) => blankReplacer(2, ["+", "-"], ...params))
        // Replacing the decimal separator (note: \b is a word boundary)
        .replaceAll(/(\s+|\b|[+\-*/%<>&|^=!,]\s*)(((\d+(\.\d*))([eE][0]?\d+)?j?))($|(\s*[ +\-*/%<>&|^=!,]))/g,
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
                    resStructSlot.fields.push({code: fieldContent.substring(0, cursorPos - lookOffset) + fieldContent.substring(cursorPos - lookOffset).trimEnd()});
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
        code = code.replaceAll(closingBracket, () => {
            cursorOffset += -1;
            return "";
        });
    });
    resStructSlot.fields.push({code: code});
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
    document.getElementById("peaComponent")?.dispatchEvent(new CustomEvent(CustomEventTypes.notifyTurtleUsage, {detail: hasTurtleImported}));
}

// UI-related method to calculate and set the max height of the Python Execution Area tabs content.
// We need to "fix" the size of the tabs container so the elements of the Exec Area, when it's enlarged, are correctly flowing in the page
// and stay within the splitters (which are overlayed in App.vue).
let manuallyResizedEditorHeight: number | undefined; // Flag used below and by App.vue - do not store this in store, it's session-lived only.
export function setManuallyResizedEditorHeightFlag(value: number): void {
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
    const pythonExecAreaTabsAreaHeight = (document.querySelector("#peaControlsDiv li") as HTMLLIElement).getBoundingClientRect().height;
    (document.querySelector("#tabContentContainerDiv") as HTMLDivElement).style.maxHeight = ((fullAppHeight - editorNewMaxHeight - pythonExecAreaTabsAreaHeight) + "px");
}

// This method set the Python Execution Area expand/collapse button position based on the presence of scrollbars
// (It is put here as we need to call at different points in the code.)
export function setPythonExecAreaExpandButtonPos(): void{
    // We need to know in which context we are : Python console, or Turtle.
    // The general idea is to override the CSS styling by directly applying style when needed (the case a scrollbar is present).
    // We find out the size of the scroll bar, add a margin of 2px, to displace the button by that size.
    // (To be sure the UI layout is correctly updated before computing, we wait a bit.)
    setTimeout(() => {
        const pythonConsoleTextArea = document.getElementById("pythonConsole");
        const pythonTurtleContainerDiv = document.getElementById("pythonTurtleContainerDiv");
        const peaExpandButton = document.getElementsByClassName("pea-toggle-size-button")[0] as HTMLDivElement;
        if(pythonConsoleTextArea && pythonTurtleContainerDiv){
            // First get the natural position offset of the button, so can compute the new position:
            const peaExpandButtonNaturalPosOffset = parseInt((scssVars.pythonExecutionAreaExpandButtonPosOffset as string).replace("px",""));
    
            // Then, look for the scrollbars
            if(pythonConsoleTextArea.style.display != "none"){
                // In the Python console, we wrap the text, only the vertical scrollbar can appear.
                const scrollDiff = pythonConsoleTextArea.getBoundingClientRect().width - pythonConsoleTextArea.clientWidth;
                peaExpandButton.style.right = (pythonConsoleTextArea.scrollHeight > pythonConsoleTextArea.clientHeight) ? (peaExpandButtonNaturalPosOffset + scrollDiff + 2) + "px" : "";
                peaExpandButton.style.bottom = "";
            }
            else{
                // In the Turtle container, any of the scrollbars can appear.
                const scrollDiffW = pythonTurtleContainerDiv.getBoundingClientRect().width - pythonTurtleContainerDiv.clientWidth,
                    scrollDiffH = pythonTurtleContainerDiv.getBoundingClientRect().height - pythonTurtleContainerDiv.clientHeight;
                peaExpandButton.style.right = (pythonTurtleContainerDiv.scrollHeight > pythonTurtleContainerDiv.clientHeight) ? (peaExpandButtonNaturalPosOffset + scrollDiffW + 2) + "px" : "";
                peaExpandButton.style.bottom = (pythonTurtleContainerDiv.scrollWidth > pythonTurtleContainerDiv.clientWidth) ? (peaExpandButtonNaturalPosOffset + scrollDiffH + 2) + "px" : "";
            }
        }
    }, 100);
}

/** 
 * These methods are used to control the height of the "Add frame" commands,
 * to allow the commands to be displayed in columns when they can't be shown as one column.
 * See Commands.vue for the HTML template logics.
 */
export function resetAddFrameCommandContainerHeight(): void{
    (document.querySelector(".frameCommands p") as HTMLParagraphElement).style.height = "";
}

export function computeAddFrameCommandContainerHeight(): void{
    // When the container div overflows, we remove the overflow extra height to the p element containing the commands
    // so that we can shorten the p height to trigger the commands to be displayed in columns.  
    const scrollContainerH = document.getElementsByClassName("no-PEA-commands")[0].scrollHeight;
    const noPEACommandsH =  Math.round(document.getElementsByClassName("no-PEA-commands")[0].getBoundingClientRect().height);
    if(noPEACommandsH < scrollContainerH){
        const addFrameCmdsPH = (document.querySelector(".frameCommands p") as HTMLParagraphElement).getBoundingClientRect().height;
        (document.querySelector(".frameCommands p") as HTMLParagraphElement).style.height = (addFrameCmdsPH - (scrollContainerH - noPEACommandsH)) + "px";
    }
}

export function getCurrentFrameSelectionScope(): SelectAllFramesFuncDefScope {
    // This method checks the current selection scope that we need to know when doing select-all (for function definitions).
    // If we are not in function definitions, for commodity, we return SelectAllFramesFuncDefScope.frame as it will the same
    // logics for the other sections (selecting all the frames in the section)
    if(getFrameSectionIdFromFrameId(useStore().currentFrame.id) != useStore().functionDefContainerId){
        return SelectAllFramesFuncDefScope.frame;
    }

    const currentFrameSelection = useStore().selectedFrames;
    // No selection *for somewhere non empty inside a function* then we are in the scope "none",
    // No selection *and inside empty function* then we are in the scope "function body",
    // No selection *for somewhere inside the function definition container, then it depends where we are (see details below),
    // (no selection *and inside empty container* doesn't need to be considered, because it won't have any effect in the selection loops)
    if(currentFrameSelection.length == 0) {
        const {id: currentFrameId, caretPosition: currentFrameCaretPos} = useStore().currentFrame;
        if(currentFrameId == useStore().functionDefContainerId){
            return SelectAllFramesFuncDefScope.functionsContainerBody;
        }
    
        if(useStore().frameObjects[currentFrameId].frameType.type == AllFrameTypesIdentifier.funcdef && currentFrameCaretPos == CaretPosition.below){
            return SelectAllFramesFuncDefScope.belowFunc;
        }

        if(useStore().frameObjects[currentFrameId].frameType.type == AllFrameTypesIdentifier.funcdef && currentFrameCaretPos == CaretPosition.body
            && useStore().frameObjects[currentFrameId].childrenIds.length == 0){
            return SelectAllFramesFuncDefScope.wholeFunctionBody;
        }

        return SelectAllFramesFuncDefScope.none;
    }
    
    // If there is a selection and the first selected frame is a function definition, then we are in the "frame" scope
    // (it doesn't matter to know if all functions are alreadys selected or not, the result is the same)
    if(useStore().frameObjects[currentFrameSelection[0]].frameType.type == AllFrameTypesIdentifier.funcdef){
        return SelectAllFramesFuncDefScope.frame;
    }

    // At this stage, there is a selection within a function definition but we need to check if that's ALL the frames of 
    // a function definition's body or just some of them, or a selection in a deeper level of the frame hierarchy. 
    const selectionParentFrame = useStore().frameObjects[useStore().frameObjects[currentFrameSelection[0]].parentId];
    if(selectionParentFrame.frameType.type != AllFrameTypesIdentifier.funcdef){
        // We are somewhere inside a function definition, but not just at the function's body level
        return SelectAllFramesFuncDefScope.none;
    }
    const functionChildren = selectionParentFrame.childrenIds;
    if(currentFrameSelection[0] == functionChildren[0] && currentFrameSelection.length == functionChildren.length){
        // All frames of a function's body are already selected
        return SelectAllFramesFuncDefScope.wholeFunctionBody;
    }
    return SelectAllFramesFuncDefScope.none;
}