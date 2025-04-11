<template>
    <div 
        :id="labelSlotsStructDivId"
        :key="refactorCount"
        contenteditable="true"
        @keydown.left="onLRKeyDown($event)"
        @keydown.right="onLRKeyDown($event)"
        @beforeinput="beforeInput"
        @keydown="forwardKeyEvent($event)"
        @keyup="forwardKeyEvent($event)"
        @focus="onFocus"
        @blur="blurEditableSlot"
        @paste.prevent.stop="forwardPaste"
        @input="onInput"
        class="next-to-eachother label-slot-structure"
    >
            <!-- Note: the default text is only showing for new slots (1 subslot), we also use unicode zero width space character for empty slots for UI -->
            <LabelSlot
                v-for="(slotItem, slotIndex) in subSlots"
                :key="frameId + '_'  + labelIndex + '_' + slotIndex + '_' + refactorCount"
                :labelSlotsIndex="labelIndex"
                :slotId="slotItem.id"
                :slotType="slotItem.type"
                :isDisabled="isDisabled"
                :default-text="placeholderText[slotIndex]"
                :code="getSlotCode(slotItem)"
                :frameId="frameId"
                :isEditableSlot="isEditableSlot(slotItem.type)"
                :isEmphasised="isSlotEmphasised(slotItem)"
                v-on:[CustomEventTypes.requestSlotsRefactoring]="checkSlotRefactoring"
            /> 
    </div>
</template>

<script lang="ts">
import { AllFrameTypesIdentifier, areSlotCoreInfosEqual, BaseSlot, FieldSlot, FlatSlotBase, getFrameDefType, isSlotBracketType, isSlotQuoteType, LabelSlotsContent, PythonExecRunningState, SlotCoreInfos, SlotCursorInfos, SlotsStructure, SlotType } from "@/types/types";
import Vue from "vue";
import { useStore } from "@/store/store";
import { mapStores } from "pinia";
import LabelSlot from "@/components/LabelSlot.vue";
import {CustomEventTypes, getFrameLabelSlotsStructureUID, getLabelSlotUID, getSelectionCursorsComparisonValue, getUIQuote, isElementEditableLabelSlotInput, isLabelSlotEditable, setDocumentSelection, parseCodeLiteral, parseLabelSlotUID, getFrameLabelSlotLiteralCodeAndFocus, getFunctionCallDefaultText, getEditableSelectionText, openBracketCharacters, stringQuoteCharacters, getMatchingBracket, UIDoubleQuotesCharacters, STRING_DOUBLEQUOTE_PLACERHOLDER, UISingleQuotesCharacters, STRING_SINGLEQUOTE_PLACERHOLDER} from "@/helpers/editor";
import {checkCodeErrors, generateFlatSlotBases, getSlotIdFromParentIdAndIndexSplit, getSlotParentIdAndIndexSplit, retrieveSlotByPredicate, retrieveSlotFromSlotInfos} from "@/helpers/storeMethods";
import { cloneDeep } from "lodash";
import {calculateParamPrompt} from "@/autocompletion/acManager";
import scssVars from "@/assets/style/_export.module.scss";

export default Vue.extend({
    name: "LabelSlotsStructure",

    components:{
        LabelSlot,
    },

    props: {
        frameId: Number,
        labelIndex: Number,
        defaultText: String,
        isDisabled: Boolean,
    },

    data: function() {
        return {
            CustomEventTypes, // just to be able to use in template
            ignoreBracketEmphasisCheck: false, // cf. isSlotEmphasised()
            isFocused: false,
            // Because the user edits the DOM directly, Vue can fail to realise it needs to update the DOM.
            // So we add a dummy counter variable that just increases every time we refactor (which includes all cases where
            // the user has edited things which might affect the slot structure) in order to nudge
            // Vue into re-rendering all items in our loop above.
            refactorCount : 0,
        };
    },

    created(){
        // Register this component on the root, to allow external calls for refactoring the slots
        this.$root.$refs[this.labelSlotsStructDivId] = this;
    },

    computed:{
        ...mapStores(useStore),

        labelSlotsStructDivId(): string {
            return getFrameLabelSlotsStructureUID(this.frameId, this.labelIndex);
        },

        subSlots(): FlatSlotBase[] {
            return this.appStore.getFlatSlotBases(this.frameId, this.labelIndex);  
        },   
        
        focusSlotCursorInfos(): SlotCursorInfos | undefined {
            return this.appStore.focusSlotCursorInfos;
        },

        placeholderText() : string[] {
            // Look for the placeholder (default) text to put in slots.
            // Special rules apply for the "function name" part of a function call frame cf getFunctionCallDefaultText() in editor.ts.
            const isFuncCallFrame = this.appStore.frameObjects[this.frameId].frameType.type == AllFrameTypesIdentifier.funccall;
            if (this.subSlots.length == 1) {
                // If we are on an optional label slots structure that doesn't contain anything yet, we only show the placeholder if we're focused
                const isOptionalEmpty = (this.appStore.frameObjects[this.frameId].frameType.labels[this.labelIndex].optionalSlot??false) && this.subSlots.length == 1 && this.subSlots[0].code.length == 0;
                if(isOptionalEmpty && !this.isFocused){
                    return [" "];
                }
                return [(isFuncCallFrame) ? getFunctionCallDefaultText(this.frameId) : this.defaultText];
            }
            else {
                return this.subSlots.map((slotItem, index) => slotItem.placeholderSource !== undefined 
                    ? calculateParamPrompt(slotItem.placeholderSource.context, slotItem.placeholderSource.token, slotItem.placeholderSource.paramIndex, slotItem.placeholderSource.lastParam) 
                    : ((this.appStore.frameObjects[this.frameId].frameType.type == AllFrameTypesIdentifier.funccall && index == 0) 
                        ? getFunctionCallDefaultText(this.frameId)
                        : "\u200b"));
            }
        },
    },

    watch: {
        // Whenever the focus changes, we update the flag to check the bracket emphasis
        focusSlotCursorInfos() {
            this.ignoreBracketEmphasisCheck = false;
        },
    },

    methods:{
        isEditableSlot(slotType: SlotType): boolean {
            // We check the slot is editable by its characterics; if the user's code is being executed, we just flag it as uneditable.
            return ((this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) == PythonExecRunningState.NotRunning) && isLabelSlotEditable(slotType);
        },

        getSlotCode(slot: FlatSlotBase): string {
            if(isSlotQuoteType(slot.type)){
                // We show quotes in the UI as textual opening or closing quotes
                return getUIQuote(slot.code, slot.type == SlotType.openingQuote);
            }
            // On Firefox there are problems typing into completely blank slots,
            // so we use a zero-width space if there is no code:
            return slot.code ? slot.code : "\u200B";
        },
        
        onInput(event: InputEvent) {
            // It is possible that the user has deleted the focus or anchor from the DOM, e.g. if they do a multi-slot
            // select then type.  But usually one of them should remain.  So we try focus first, and if that is gone, we try
            // anchor instead:
            const targetEl = (this.appStore.focusSlotCursorInfos ? document.getElementById(getLabelSlotUID(this.appStore.focusSlotCursorInfos.slotInfos)) : null)
                ?? (this.appStore.anchorSlotCursorInfos ? document.getElementById(getLabelSlotUID(this.appStore.anchorSlotCursorInfos.slotInfos)) : null);
            if (targetEl != null) {
                targetEl.dispatchEvent(new InputEvent(event.type, {
                    data: event.data,
                    isComposing: event.isComposing,
                }));
            }
            else {
                // So it seems that if you select from one empty slot to another
                // e.g. typing "+" in an empty slot then selecting around it, or
                //      selecting around a bracketed structure that has nothing directly adjacent
                // the browser behaviour in Firefox can be to delete all the involved spans
                // (despite the remaining zero-width space at the end of the last one)
                // and put the content in the parent div.  Which messes up our structure.
                // We know what this content is because it's the input string, and we know
                // the selection that was deleted because it's in mostRecentSelectedText,
                // but we must manually restore the selection if the input should have wrapped it,
                // because our usual mechanisms for detecting this will not work.
                // We call this a "bad delete".
                const closestDivId = this.appStore.focusSlotCursorInfos ? ("div_" + getLabelSlotUID(this.appStore.focusSlotCursorInfos.slotInfos)) : this.labelSlotsStructDivId;
                const closestDiv = document.getElementById(closestDivId);
                if (event.data) {
                    const openBracket = openBracketCharacters.includes(event.data);
                    if (openBracket || stringQuoteCharacters.includes(event.data)) {
                        // We make a fake element with the content we are restoring so that the rest of the code works properly:
                        const appendSel = document.createElement("div");
                        appendSel.classList.add(scssVars.labelSlotInputClassName);
                        const closing = openBracket ? getMatchingBracket(event.data, true) : event.data;
                        let sel = this.appStore.mostRecentSelectedText;
                        // This does have a slight disadvantage that any smart quotes the user meant to insert
                        // (e.g. inside a string literal) will get mangled, but I think we just live with that:
                        sel = sel.replace(new RegExp(`[${UIDoubleQuotesCharacters[0]}${UIDoubleQuotesCharacters[1]}]`, "g"), STRING_DOUBLEQUOTE_PLACERHOLDER);
                        sel = sel.replace(new RegExp(`[${UISingleQuotesCharacters[0]}${UISingleQuotesCharacters[1]}]`, "g"), STRING_SINGLEQUOTE_PLACERHOLDER);
                        appendSel.append(sel + closing);
                        closestDiv?.append(appendSel);
                    }
                }

                const stateBeforeChanges = cloneDeep(this.appStore.$state);
                // Must increment refactorCount in case the changed content doesn't trigger a noticeable refactor;
                // we definitely need to completely redo all the slots if Firefox has deleted a bunch of nodes
                this.refactorCount += 1;
                this.checkSlotRefactoring("", stateBeforeChanges);
            }
        },
        isSlotEmphasised(slot: FlatSlotBase): boolean{
            // In this method, if the flag to check a bracket emphasis (ignoreBracketEmphasisCheck) isn't set,
            // we check if the current slot bracket should be emphasised, and if so, emphasise its bracket counterpart.
            // The flag ignoreBracketEmphasisCheck is used to avoid cancelling the couterpart emphasise once set up.            
            const isEditing = this.appStore.isEditing;
            if(isEditing && isSlotBracketType(slot.type) && this.focusSlotCursorInfos && this.appStore.anchorSlotCursorInfos){            
                if(!this.ignoreBracketEmphasisCheck){
                    
                    // The slot for the bracket is emphasised if the text cursor is near it (preceding or following) or its counterpart.
                    const currentSlotCoreInfos: SlotCoreInfos= {frameId: this.frameId, labelSlotsIndex: this.labelIndex, slotId: slot.id, slotType: slot.type};
                    const isOpeningBracket = (slot.type == SlotType.openingBracket);
                    const parentIdSlotIndexSplit = getSlotParentIdAndIndexSplit(slot.id);
                    const previousSlotId = isOpeningBracket 
                        ? getSlotIdFromParentIdAndIndexSplit(parentIdSlotIndexSplit.parentId, parentIdSlotIndexSplit.slotIndex - 1)
                        : slot.id + "," + ((retrieveSlotFromSlotInfos(currentSlotCoreInfos) as SlotsStructure).fields.length - 1);
                    const nextSlotId = isOpeningBracket 
                        ? slot.id + "," + 0
                        : getSlotIdFromParentIdAndIndexSplit(parentIdSlotIndexSplit.parentId, parentIdSlotIndexSplit.slotIndex + 1);
                
                    const focusSlotInfos = this.focusSlotCursorInfos.slotInfos;
                    const focusSlotCursorPos = this.focusSlotCursorInfos.cursorPos;
                    const focusInputSpan = document.getElementById(getLabelSlotUID(focusSlotInfos)) as HTMLSpanElement;
                    // That's not just to keep TS happy: the focus span could here be null, when a change of slot type happens
                    if(focusInputSpan){
                        const focusInputSpanContent = focusInputSpan.textContent??"";
                        const focusCursorInPrevious = areSlotCoreInfosEqual({...currentSlotCoreInfos, slotId: previousSlotId, slotType: SlotType.code}, focusSlotInfos);
                        const focusCursorInNext = areSlotCoreInfosEqual({...currentSlotCoreInfos, slotId: nextSlotId, slotType: SlotType.code}, focusSlotInfos);
                        const selectionCursorsComparisonValue = getSelectionCursorsComparisonValue()??0;
                        let needEmphasis = false;

                        // Check the current bracket
                        if((focusCursorInPrevious && selectionCursorsComparisonValue <= 0) 
                            || (focusCursorInNext && selectionCursorsComparisonValue >= 0)){
                            needEmphasis = focusCursorInPrevious 
                                ? focusInputSpanContent.substring(focusSlotCursorPos).trim().length == 0 
                                : focusSlotCursorPos == 0; // a slot cannot start with spaces               
                        }
                        slot.isEmphasised = needEmphasis;
                        
                        // Then if this bracket can have emphasis we flag the counterpart
                        if(needEmphasis){
                            const counterpartType = (isOpeningBracket) ? SlotType.closingBracket : SlotType.openingBracket;
                            const counterpartSlot = this.subSlots.find((flatSlot) => flatSlot.id == slot.id && flatSlot.type == counterpartType);
                            if(counterpartSlot){
                                counterpartSlot.isEmphasised = true;
                            }
                            this.ignoreBracketEmphasisCheck = true;
                        }
                    }
                }
                return slot.isEmphasised??false;
            }

            // If we are not editing or the slot we checked is not a bracket, there is no emphasis
            return false;
        },


        beforeInput(e: InputEvent) {
            // beforeInput comes to us not the slot, so we must be responsible
            // for remembering the selection at this point:
            this.appStore.mostRecentSelectedText = getEditableSelectionText();
        },

        majorChange(before: SlotsStructure, after: SlotsStructure) : boolean {
            const beforeFlat = generateFlatSlotBases(before);
            const afterFlat = generateFlatSlotBases(after);
            // Our default behaviour is to discard all AC.  We only keep it if:
            //  - the flat length is the same, AND
            //  - at most one slot has changed
            if (beforeFlat.length == afterFlat.length) {
                let changes = [] as number[];
                for (let i = 0; i < afterFlat.length; i++) {
                    // A change of type is a major change
                    if (beforeFlat[i].type != afterFlat[i].type) {
                        return true;
                    }
                    // One change of code in a code or string slot is allowed: 
                    if (beforeFlat[i].code != afterFlat[i].code) {
                        if (afterFlat[i].type == SlotType.string || afterFlat[i].type == SlotType.code) {
                            changes.push(i);
                        }
                        else {
                            return true;
                        }
                    }
                }
                if (changes.length <= 1) {
                    return false;
                }
            }

            return true;
        },

        checkSlotRefactoring(slotUID: string, stateBeforeChanges: any) {
            // Comments do not need to be checked, so we do nothing special for them, but just enforce the caret to be placed at the right place and the code value to be updated
            const currentFocusSlotCursorInfos = this.appStore.focusSlotCursorInfos;
            if(this.appStore.frameObjects[this.frameId].frameType.type == AllFrameTypesIdentifier.comment && currentFocusSlotCursorInfos){
                (this.appStore.frameObjects[this.frameId].labelSlotsDict[this.labelIndex].slotStructures.fields[0] as BaseSlot).code = (document.getElementById(getLabelSlotUID(currentFocusSlotCursorInfos.slotInfos))?.textContent??"").replace(/\u200B/g, "");
                this.$nextTick(() => setDocumentSelection(currentFocusSlotCursorInfos, currentFocusSlotCursorInfos));
                return;
            }

            // When edition on a slot occurs, we need to check if the slots for this label need refactorisation (for example, adding operators, brackets etc will generate split slots).
            // We first retrieve the literal code if the frame label via the DOM (because we do not yet update the state) and parse it the code to slots
            const labelDiv = document.getElementById(this.labelSlotsStructDivId);
            if(labelDiv){ // keep TS happy
                // As we will need to reposition the cursor, we keep a reference to the "absolute" position in this label's slots,
                // so we find that out while getting through all the slots to get the literal code.
                let {uiLiteralCode, focusSpanPos: focusCursorAbsPos, hasStringSlots} = getFrameLabelSlotLiteralCodeAndFocus(labelDiv, slotUID);
                const parsedCodeRes = parseCodeLiteral(uiLiteralCode, {frameType: this.appStore.frameObjects[this.frameId].frameType.type, isInsideString: false, cursorPos: focusCursorAbsPos, skipStringEscape: hasStringSlots});
                const majorChange = this.majorChange(this.appStore.frameObjects[this.frameId].labelSlotsDict[this.labelIndex].slotStructures, parsedCodeRes.slots);
                Vue.set(this.appStore.frameObjects[this.frameId].labelSlotsDict[this.labelIndex], "slotStructures", parsedCodeRes.slots);
                // The parser can be return a different size "code" of the slots than the code literal
                // (that is for example the case with textual operators which requires spacing in typing, not in the UI)
                focusCursorAbsPos += parsedCodeRes.cursorOffset;
                if (majorChange) {
                    this.refactorCount += 1;
                }
                this.$forceUpdate();
                this.$nextTick(() => {
                    // If it was a major change, our entire old div element may have been removed
                    // from the tree and re-added, so it's crucial we refetch the new element in
                    // this next tick code:
                    const labelDiv = document.getElementById(this.labelSlotsStructDivId);
                    if (!labelDiv) {
                        // Shouldn't happen, but make Typescript happy:
                        return;
                    }
                    let newUICodeLiteralLength = 0;
                    let foundPos = false;
                    let setInsideNextSlot = false; // The case when the cursor follow a non editable slot (i.e. operator, bracket, quote)
                    // Reposition the cursor now
                    labelDiv.querySelectorAll("." + scssVars.labelSlotInputClassName).forEach((spanElement) => {
                        if(!foundPos){
                            const spanContentLength = (spanElement.textContent?.replace(/\u200B/g, "")?.length??0);
                            if(setInsideNextSlot || (focusCursorAbsPos <= (newUICodeLiteralLength + spanContentLength) && focusCursorAbsPos >= newUICodeLiteralLength)){
                                if(!setInsideNextSlot && !isElementEditableLabelSlotInput(spanElement)){
                                    setInsideNextSlot = true;
                                }
                                else{
                                    foundPos = true;
                                    (spanElement as HTMLSpanElement).dispatchEvent(new Event(CustomEventTypes.editableSlotGotCaret));
                                    const pos = (setInsideNextSlot) ? 0 : focusCursorAbsPos - newUICodeLiteralLength;
                                    const cursorInfos = {slotInfos: parseLabelSlotUID(spanElement.id), cursorPos: pos};

                                    // We also check here if the changes trigger the conversion of a function call frame to a varassign frame (i.e. a funccall frame contains a variable assignment).
                                    // If the parsed code slot structure results in having a first operator (except empty, dot and comma) equals to "=" then we convert, being in a label slot structure of index 0.
                                    // We do not allow a conversion if the focus isn't inside a slot of level 1.
                                    const isVarAssignSlotStructure = (parsedCodeRes.slots.operators.length > 0 && parsedCodeRes.slots.operators
                                        .find((opSlot, index) => (opSlot.code == "=" && parsedCodeRes.slots.operators.slice(0,index).every((opSlot) => ["", ".", ","].includes(opSlot.code)))));
                                    if(isVarAssignSlotStructure && this.labelIndex == 0 && !((this.appStore.focusSlotCursorInfos?.slotInfos.slotId??",").includes(",")) && this.appStore.frameObjects[this.frameId].frameType.type == AllFrameTypesIdentifier.funccall && uiLiteralCode.match(/(?<!=)=(?!=)/) != null){
                                        // We need to break at the slot preceding the first "=" operator.
                                        const breakAtSlotIndex = parsedCodeRes.slots.operators.findIndex((opSlot) => opSlot.code == "=");
                                        this.appStore.setSlotTextCursors(undefined, undefined);

                                        this.$nextTick(() => {
                                            // Remove the focus
                                            const focusedSlot = retrieveSlotByPredicate([this.appStore.frameObjects[this.frameId].labelSlotsDict[0].slotStructures], (slot: FieldSlot) => ((slot as BaseSlot).focused??false));
                                            if(focusedSlot){
                                                focusedSlot.focused = false;
                                            }
                        
                                            // Change the type of frame to varassign and adapt the content
                                            // (when we change the state in this next line, we need to COPY the FrameType object otherwise undo/redo makes weird changes in the commands)
                                            Vue.set(this.appStore.frameObjects[this.frameId],"frameType", cloneDeep(getFrameDefType(AllFrameTypesIdentifier.varassign)));   
                                            const newContent: { [index: number]: LabelSlotsContent} = {
                                                // LHS 
                                                0: {
                                                    slotStructures:{
                                                        fields: parsedCodeRes.slots.fields.slice(0,breakAtSlotIndex + 1),
                                                        operators: parsedCodeRes.slots.operators.slice(0,breakAtSlotIndex)},
                                                },
                                                //RHS are the other fields and operators
                                                1: {
                                                    slotStructures:{
                                                        fields: parsedCodeRes.slots.fields.slice(breakAtSlotIndex + 1),
                                                        operators: parsedCodeRes.slots.operators.slice(breakAtSlotIndex + 1),
                                                    },
                                                }, 
                                            };
                                            // Set focus to the right slot (first of RHS)
                                            (newContent[1].slotStructures.fields[0] as BaseSlot).focused = true;

                                            this.appStore.frameObjects[this.frameId].labelSlotsDict = newContent;

                                            // We need to reposition the cursor again, we shoud be in the SAME slot as we were, except that 
                                            // we are now in another frame label index (must be 1) and at the first of the slots
                                            const newCursorSlotInfos: SlotCursorInfos = {
                                                slotInfos: {...cursorInfos.slotInfos, labelSlotsIndex: 1, slotId: "0"},
                                                cursorPos: cursorInfos.cursorPos,
                                            };                                        
                                            this.$nextTick(() => this.$nextTick(() => {
                                                setDocumentSelection(newCursorSlotInfos, newCursorSlotInfos);
                                                this.appStore.setSlotTextCursors(newCursorSlotInfos, newCursorSlotInfos);
                                                // Save changes only when arrived here (for undo/redo)
                                                this.appStore.saveStateChanges(stateBeforeChanges);
                                            }));
                                        });                                        
                                    }
                                    else{
                                        setDocumentSelection(cursorInfos, cursorInfos);
                                        this.appStore.setSlotTextCursors(cursorInfos, cursorInfos);
                                        // Save changes only when arrived here (for undo/redo)
                                        this.appStore.saveStateChanges(stateBeforeChanges);
                                    }
                                }                            
                            }
                            else{
                                // We just increment the length by the span content length (spacing for operators should have been dealt with when parsing the code literal)
                                newUICodeLiteralLength += (spanContentLength);
                            }
                        }
                    });
                });

            }
        },

        forwardKeyEvent(event: KeyboardEvent) {
            // The container div of this LabelSlotsStructure is editable. Editable divs capture the key events. 
            // We need to forward the event to the currently "focused" (editable) slot.
            // ** LEFT/RIGHT ARROWS ARE TREATED SEPARATELY BY THIS COMPONENT, we don't forward related events **
            if(event.key == "ArrowLeft" || event.key == "ArrowRight"){
                return;
            }

            // Ignore context menu (we need to let it pass through to be handled by App)
            if(event.key.toLowerCase() == "contextmenu"){
                return;
            }

            // When some text is cut through *a selection*, we need to handle it fully: we want to handle the slot changes in the store to reflect the
            // text change, but also we need to handle the clipboard, as doing events here on keydown results the browser not being able to get the text
            // cut (since the slots have already disappear, and the action for cut seems to be done on the keyup event)
            if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() ==  "x" || event.key.toLowerCase() ==  "c")){
                // There is a selection already, we can directly set the text in the browser's clipboard here
                const selectionText = getEditableSelectionText();
                if (selectionText) {
                    navigator.clipboard.writeText(selectionText);
                    if (event.key.toLowerCase() == "x" && this.appStore.focusSlotCursorInfos) {
                        // Send fake delete key to delete the content:
                        document.getElementById(getLabelSlotUID(this.appStore.focusSlotCursorInfos.slotInfos))
                            ?.dispatchEvent(new KeyboardEvent(event.type, {
                                key: "Backspace",
                            }));
                    }
                }
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return;
            }
            
            if(this.appStore.focusSlotCursorInfos){
                document.getElementById(getLabelSlotUID(this.appStore.focusSlotCursorInfos.slotInfos))
                    ?.dispatchEvent(new KeyboardEvent(event.type, {
                        key: event.key,
                        altKey: event.altKey,
                        shiftKey: event.shiftKey,
                        ctrlKey: event.ctrlKey,
                        metaKey: event.metaKey,
                    }));
                if (event.key.toLowerCase() == "backspace"
                    || event.key.toLowerCase() == "delete"
                    || event.key.toLowerCase() == "enter"
                    || event.key == "ArrowUp"
                    || event.key == "ArrowDown"
                    || event.key == "Home"
                    || event.key == "End"
                    || (event.key == " " && (event.ctrlKey || event.metaKey))) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                }
            }
        },

        forwardPaste(event: ClipboardEvent){
            // Paste events need to be handled on the parent contenteditable div because FF will not accept
            // forwarded (untrusted) events to be hooked by the children spans. 
            this.appStore.ignoreKeyEvent = true;
            if (event.clipboardData && this.appStore.focusSlotCursorInfos) {
                // We create a new custom event with the clipboard data as payload, to avoid untrusted events issues
                const content = event.clipboardData.getData("Text");
                document.getElementById(getLabelSlotUID(this.appStore.focusSlotCursorInfos.slotInfos))
                    ?.dispatchEvent(new CustomEvent(CustomEventTypes.editorContentPastedInSlot, {detail: content}));
            }
        },        

        onLRKeyDown(event: KeyboardEvent) {
            // Because the event handling, it is easier to deal with the left/right arrow at this component level.
            if(this.appStore.focusSlotCursorInfos){
                const {slotInfos, cursorPos} = this.appStore.focusSlotCursorInfos;
                const spanInput = document.getElementById(getLabelSlotUID(slotInfos)) as HTMLSpanElement;
                const spanInputContent = spanInput.textContent ?? "";
                const isCommentFrame = (this.appStore.frameObjects[this.frameId].frameType.type == AllFrameTypesIdentifier.comment);

                // If we're trying to go off the bounds of this slot
                // For comments, if there is a terminating line return, we do not allow the cursor to be past it (cf LabelSlot.vue onEnterOrTabKeyUp() for why)
                if((cursorPos == 0 && event.key==="ArrowLeft") 
                        || (((cursorPos >= spanInputContent.replace(/\u200B/, "").length) || (isCommentFrame && spanInputContent.endsWith("\n") && cursorPos == spanInputContent.length - 1)) && event.key==="ArrowRight")) {
                    // DO NOT request a loss of focus here, because we need to be able to know which element of the UI has focus to find the neighbour in this.appStore.leftRightKey()
                    this.appStore.isSelectingMultiSlots = event.shiftKey;
                    this.appStore.leftRightKey({key: event.key, isShiftKeyHold: event.shiftKey}).then(() => {
                        // If we are doing a selection, we need to reflect this in the UI
                        if(event.shiftKey){
                            setDocumentSelection(this.appStore.anchorSlotCursorInfos as SlotCursorInfos, this.appStore.focusSlotCursorInfos as SlotCursorInfos);                     
                        }
                    });       
                    this.appStore.ignoreKeyEvent = false;                 
                }
                // If a key modifier (ctrl, shift, alt or meta) is pressed, we don't do anything special (browser handles it),
                else if(event.ctrlKey || event.shiftKey || event.metaKey || event.altKey){                    
                    return;
                }
                else {
                    //no specific action to take, we just move the cursor to the left or to the right
                    this.appStore.isSelectingMultiSlots = false; // reset flag
                    const incrementStep = (event.key==="ArrowLeft") ? -1 : 1;
                    const slotCursorInfo: SlotCursorInfos = {slotInfos: slotInfos, cursorPos: (cursorPos + incrementStep)};
                    setDocumentSelection(slotCursorInfo, slotCursorInfo);
                }
                event.preventDefault();
                event.stopImmediatePropagation();  
            }                      
        },

        onFocus(){
            this.isFocused = true;
            // When the application gains focus again, the browser might try to give the first span of a div the focus (because the div may have been focused)
            // even if we have the blue caret showing. We do not let this happen.
            if(this.appStore.ignoreFocusRequest && this.appStore.focusSlotCursorInfos == undefined){
                document.getElementById(this.labelSlotsStructDivId)?.blur();               
            }
            this.appStore.ignoreFocusRequest = false;
        },

        blurEditableSlot(){
            this.isFocused = false;
            // If a flag to ignore editable slot focus is set, we just revert it and do nothing else
            if(this.appStore.bypassEditableSlotBlurErrorCheck){
                this.appStore.bypassEditableSlotBlurErrorCheck = false;
                return;
            }
                   
            // When the div containing the slots loses focus, we need to also notify the currently focused slot inside *this* container
            // that the caret has been "lost" (since a contenteditable div won't let its children having/loosing focus)
            if(document.activeElement?.id === this.labelSlotsStructDivId){
                // We don't lose focus that's from an outside event (like when the browser itself loses focus)
                // cf https://stackoverflow.com/questions/24638129/javascript-dom-how-to-prevent-blur-event-if-focus-is-lost-to-another-window
                this.appStore.ignoreFocusRequest = true;
                return;

            }
            this.appStore.ignoreKeyEvent = false;
            if(this.appStore.focusSlotCursorInfos && this.appStore.focusSlotCursorInfos.slotInfos.frameId == this.frameId 
                && this.appStore.focusSlotCursorInfos.slotInfos.labelSlotsIndex == this.labelIndex){
                // This call is necessary for when the focus is lost in a slot to get back on non-edition mode (seeing the blue caret).
                // However, with Firefox, there is an issue* if we also call that to go from one frame's slot to another frame's slot directly.
                // We can know we are in this situation by comparing the current document selection and our focus infos: if they match,
                // we are leaving a slot to be in non-edition mode, if they don't we are going from one slot to another frame's slot.
                // In the case we don't have a selection (in an empty slot) we can still dispatch the event.
                // (*) it seems that with Firefox, the actual document selection is already changed before we blurred.
                const documentNodeSelectedId = (document.getSelection()?.focusNode?.parentElement?.id) ?? "";
                const documentNodeSelectedSlotInfos = (documentNodeSelectedId.length > 0) ? parseLabelSlotUID(documentNodeSelectedId) : null;
                const documentNodeSelectionFocusOffset = (document.getSelection()?.focusOffset) ?? -1;
                if(documentNodeSelectedSlotInfos == null || (documentNodeSelectedSlotInfos != null && documentNodeSelectionFocusOffset > -1 
                    && areSlotCoreInfosEqual(this.appStore.focusSlotCursorInfos.slotInfos, documentNodeSelectedSlotInfos) 
                    && this.appStore.focusSlotCursorInfos.cursorPos == documentNodeSelectionFocusOffset)){
                    document.getElementById(getLabelSlotUID(this.appStore.focusSlotCursorInfos.slotInfos))
                        ?.dispatchEvent(new CustomEvent(CustomEventTypes.editableSlotLostCaret));
                }
            }

            // When the label slots structure loses focus, we may need to check the errors. 
            // This happens when we move to anywhere BUT the same frame (so for example, in another label slots structure of that frame).
            // However, we do not know where we move at this stage, so we will keep trace of in which frame we were, and wait a bit to check who has focus: a slot, or anything else.
            // If it's a slot that has focus, then we check whether it belongs to the same frame or not than the frame we left.
            this.appStore.lastBlurredFrameId = this.frameId;
            setTimeout(() => {
                // Need to check if frame still exists because it may have been deleted after blurring:
                if(this.frameId != ((this.appStore.focusSlotCursorInfos?.slotInfos.frameId)??-1) && this.appStore.lastBlurredFrameId in this.appStore.frameObjects){
                    checkCodeErrors(this.appStore.lastBlurredFrameId);
                    this.appStore.lastAddedFrameIds = -1;
                }
            }, 200);
        },
    },
});
</script>

<style lang="scss">
.label-slot-structure{
    outline: none;
    max-width: 100%;
    flex-wrap: wrap;
}
</style>
