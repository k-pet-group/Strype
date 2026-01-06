<template>
    <div 
        :id="labelSlotsStructDivId"
        :key="refactorCount"
        :contenteditable="!isFrozen"
        @keydown.left="onLRKeyDown($event)"
        @keydown.right="onLRKeyDown($event)"
        @keydown.up="slotUpDown($event)"
        @keydown.down="slotUpDown($event)"
        @beforeinput="beforeInput"
        @keydown="forwardKeyEvent($event)"
        @keyup="forwardKeyEvent($event)"
        @focus="onFocus"
        @blur="blurEditableSlot"
        @paste.prevent.stop="forwardPaste"
        @input="onInput"
        @compositionend="onCompositionEnd"
        :class="{'next-to-eachother': true, [scssVars.labelSlotStructClassName]:true, 'prepend-self-only': prependText === 'self', 'prepend-self-comma': prependText === 'self,'}"
    >
            <!-- Note: the default text is only showing for new slots (1 subslot), we also use unicode zero width space character for empty slots for UI -->
            <LabelSlot
                v-for="(slotItem, slotIndex) in subSlots"
                :key="frameId + '_'  + labelIndex + '_' + slotIndex + '_' + refactorCount"
                ref="labelSlots"
                :labelSlotsIndex="labelIndex"
                :slotId="slotItem.id"
                :slotType="slotItem.type"
                :isDisabled="isDisabled"
                :default-text="placeholderText == null ? '' : placeholderText[slotIndex]"
                :code="getSlotCode(slotItem)"
                :frameId="frameId"
                :isEditableSlot="isEditableSlot(slotItem.type)"
                :isFrozen="isFrozen"
                :isEmphasised="isSlotEmphasised(slotItem)"
                @requestSlotsRefactoring="checkSlotRefactoring"
                @slotLostCaret="updatePrependText"
            />
    </div>
</template>

<script lang="ts">
import { AllFrameTypesIdentifier, AllowedSlotContent, areSlotCoreInfosEqual, BaseSlot, CaretPosition, FieldSlot, FlatSlotBase, getFrameDefType, isSlotBracketType, isSlotQuoteType, LabelSlotsContent, MediaDataAndDim, OptionalSlotType, PythonExecRunningState, SlotCoreInfos, SlotCursorInfos, SlotsStructure, SlotType } from "@/types/types";
import Vue from "vue";
import { useStore } from "@/store/store";
import { mapStores } from "pinia";
import FrameHeaderComponent from "@/components/FrameHeader.vue";
import LabelSlot from "@/components/LabelSlot.vue";
import { CustomEventTypes, getEditableSelectionText, getFrameLabelSlotLiteralCodeAndFocus, getFrameLabelSlotsStructureUID, getFunctionCallDefaultText, getLabelSlotUID, getMatchingBracket, getSelectionCursorsComparisonValue, getUIQuote, isElementEditableLabelSlotInput, isLabelSlotEditable, openBracketCharacters, parseCodeLiteral, parseLabelSlotUID, setDocumentSelection, STRING_DOUBLEQUOTE_PLACERHOLDER, STRING_SINGLEQUOTE_PLACERHOLDER, stringQuoteCharacters, UIDoubleQuotesCharacters, UISingleQuotesCharacters, getGraphemeLength, getFrameHeaderUID } from "@/helpers/editor";
import { checkCodeErrors, evaluateSlotType, generateFlatSlotBases, getFlatNeighbourFieldSlotInfos, getFrameParentSlotsLength, getSlotDefFromInfos, getSlotIdFromParentIdAndIndexSplit, getSlotParentIdAndIndexSplit, retrieveSlotByPredicate, retrieveSlotFromSlotInfos, getParentId} from "@/helpers/storeMethods";
import { cloneDeep } from "lodash";
import { calculateParamPrompt } from "@/autocompletion/acManager";
import scssVars from "@/assets/style/_export.module.scss";
import { isMacOSPlatform, splitByRegexMatches } from "@/helpers/common";
import { detectBrowser } from "@/helpers/browser";
import { handleVerticalCaretMove } from "@/helpers/spans";
import { preparePasteMediaData } from "@/helpers/media";

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
        isFrozen: Boolean,
        prependSelfWhenInClass: Boolean,
    },

    data: function() {
        return {
            CustomEventTypes, // just to be able to use in template
            ignoreBracketEmphasisCheck: false, // cf. isSlotEmphasised()
            // Because the user edits the DOM directly, Vue can fail to realise it needs to update the DOM.
            // So we add a dummy counter variable that just increases every time we refactor (which includes all cases where
            // the user has edited things which might affect the slot structure) in order to nudge
            // Vue into re-rendering all items in our loop above.
            refactorCount : 0,
            prependText: "", // This is updated properly in updatePrependText()
        };
    },

    created(){
        // Register this component on the root, to allow external calls for refactoring the slots
        this.$root.$refs[this.labelSlotsStructDivId] = this;
    },
    
    mounted() {
        this.$nextTick(() => {
            this.updatePrependText();
        });
        this.$root.$on(CustomEventTypes.updateParamPrompts, this.updateParamPromptsIfInList);
    },

    computed:{
        ...mapStores(useStore),

        scssVars() {
            // just to be able to use in template
            return scssVars;
        },

        labelSlotsStructDivId(): string {
            return getFrameLabelSlotsStructureUID(this.frameId, this.labelIndex);
        },

        subSlots(): FlatSlotBase[] {
            return this.appStore.getFlatSlotBases(this.frameId, this.labelIndex);  
        },   
        
        focusSlotCursorInfos(): SlotCursorInfos | undefined {
            return this.appStore.focusSlotCursorInfos;
        },
    },

    asyncComputed: {
        placeholderText() : Promise<string[]> {
            // Look for the placeholder (default) text to put in slots.
            // Special rules apply for the "function name" part of a function call frame cf getFunctionCallDefaultText() in editor.ts.
            const isFuncCallFrame = this.appStore.frameObjects[this.frameId].frameType.type == AllFrameTypesIdentifier.funccall;
            if (this.subSlots.length == 1) {
                // If we are on an optional label slots structure that doesn't contain anything yet, we only show the placeholder if we're focused
                const isOptionalEmpty = (this.appStore.frameObjects[this.frameId].frameType.labels[this.labelIndex].optionalSlot??OptionalSlotType.REQUIRED) == OptionalSlotType.HIDDEN_WHEN_UNFOCUSED_AND_BLANK && this.subSlots.length == 1 && this.subSlots[0].code.length == 0;
                if(isOptionalEmpty && !this.isFocused()){
                    return Promise.resolve([" "]);
                }
                return Promise.resolve([(isFuncCallFrame) ? getFunctionCallDefaultText(this.frameId) : this.defaultText]);
            }
            else {
                return Promise.all(this.subSlots.map((slotItem, index) => slotItem.placeholderSource !== undefined 
                    ? calculateParamPrompt(this.frameId, slotItem.placeholderSource, slotItem.focused ?? false) 
                    : Promise.resolve((this.appStore.frameObjects[this.frameId].frameType.type == AllFrameTypesIdentifier.funccall && index == 0) 
                        ? getFunctionCallDefaultText(this.frameId)
                        : "\u200b")));
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

        updateParamPromptsIfInList(frameIds: number[]) {
            if (frameIds.includes(this.frameId)) {
                // The refactor doesn't actually update the state (we're only updating param prompts)
                // so this param shouldn't matter but supply valid one just in case:
                const stateBeforeChanges = cloneDeep(this.appStore.$state);
                this.checkSlotRefactoring("", stateBeforeChanges, {useFlatMediaDataCode: true, skipCursorSetAndStateSave: true});
            }
        },
        
        onCompositionEnd(event: CompositionEvent) {
            // On Chrome and Safari, the final input event (with composing: false) doesn't seem to fire.
            // So we have to forward the earlier onCompositionEnd event instead.  We don't want to do this
            // on Firefox because otherwise we'll get a double input when it does fire input with composing:false.
            if (["chrome", "safari", "webkit"].includes(detectBrowser())) {
                const targetEl = (this.appStore.focusSlotCursorInfos ? document.getElementById(getLabelSlotUID(this.appStore.focusSlotCursorInfos.slotInfos)) : null)
                    ?? (this.appStore.anchorSlotCursorInfos ? document.getElementById(getLabelSlotUID(this.appStore.anchorSlotCursorInfos.slotInfos)) : null);
                if (targetEl != null) {
                    targetEl.dispatchEvent(new CompositionEvent(event.type, {
                        data: event.data,
                    }));
                }
            }
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
                    else if (closestDiv && closestDiv?.classList?.contains(scssVars.labelSlotContainerClassName) && event.data.charCodeAt(0) >= 128 && closestDiv?.textContent?.startsWith(event.data)) {
                        // Firefox has a weird behaviour when you do the input of holding down a character on Mac followed by a number
                        // to get a vowel variant (e.g. ö by holding o and pressing 4).  It puts the new character in the outer div,
                        // and removes the CSS class from the inner span.  If we put the CSS class back, we get the right result:
                        const firstDirectSpan = Array.from(closestDiv.children).find((child) => child.tagName.toLowerCase() === "span") as HTMLSpanElement | undefined || null;
                        firstDirectSpan?.classList.add(scssVars.labelSlotInputClassName);
                    }
                }

                const stateBeforeChanges = cloneDeep(this.appStore.$state);
                // Must increment refactorCount in case the changed content doesn't trigger a noticeable refactor
                // (i.e. in case it doesn't change the number/type of slots);
                // we definitely need to completely redo all the slots if Firefox has deleted a bunch of nodes
                this.refactorCount += 1;
                this.checkSlotRefactoring("", stateBeforeChanges, {useFlatMediaDataCode: true});
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
            const slotDef = getSlotDefFromInfos({frameId: this.frameId, labelSlotsIndex: this.labelIndex});
            const beforeFlat = generateFlatSlotBases(slotDef, before);
            const afterFlat = generateFlatSlotBases(slotDef, after);
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

        checkSlotRefactoring(slotUID: string, stateBeforeChanges: any, options?: {skipCursorSetAndStateSave?: boolean, doAfterCursorSet?: VoidFunction, useFlatMediaDataCode?: boolean}) {
            // Slot errors will be check later again. We clear off the notification on the parent (frame header) for slot errors so it can reset the triangle error indicator
            (this.$parent as InstanceType<typeof FrameHeaderComponent>).$data.hasErroneousSlot = false;
            // Comments do not need to be checked, so we do nothing special for them, but just enforce the caret to be placed at the right place and the code value to be updated
            const currentFocusSlotCursorInfos = this.appStore.focusSlotCursorInfos;
            const allowed = this.appStore.frameObjects[this.frameId].frameType.labels[this.labelIndex].allowedSlotContent;
            if (allowed !== undefined && [AllowedSlotContent.FREE_TEXT_DOCUMENTATION, AllowedSlotContent.LIBRARY_ADDRESS].includes(allowed) && (currentFocusSlotCursorInfos || options?.skipCursorSetAndStateSave)) {
                if (currentFocusSlotCursorInfos) {
                    (this.appStore.frameObjects[this.frameId].labelSlotsDict[this.labelIndex].slotStructures.fields[0] as BaseSlot).code = (document.getElementById(getLabelSlotUID(currentFocusSlotCursorInfos.slotInfos))?.textContent ?? "").replace(/\u200B/g, "");
                    this.$nextTick(() => {
                        if (!options?.skipCursorSetAndStateSave) {
                            setDocumentSelection(currentFocusSlotCursorInfos, currentFocusSlotCursorInfos);
                            options?.doAfterCursorSet?.();
                            this.appStore.saveStateChanges(stateBeforeChanges);
                        }
                    });
                }
                return;
            }

            // When edition on a slot occurs, we need to check if the slots for this label need refactorisation (for example, adding operators, brackets etc will generate split slots).
            // We first retrieve the literal code if the frame label via the DOM (because we do not yet update the state) and parse it the code to slots
            const labelDiv = document.getElementById(this.labelSlotsStructDivId);
            if(labelDiv){ // keep TS happy
                // As we will need to reposition the cursor, we keep a reference to the "absolute" position in this label's slots,
                // so we find that out while getting through all the slots to get the literal code.
                let {uiLiteralCode, focusSpanPos: focusCursorAbsPos, hasStringSlots, mediaLiterals} = getFrameLabelSlotLiteralCodeAndFocus(labelDiv, slotUID, {useFlatMediaDataCode: options?.useFlatMediaDataCode});
                const parsedCodeRes = parseCodeLiteral(uiLiteralCode, {frameType: this.appStore.frameObjects[this.frameId].frameType.type, isInsideString: false, cursorPos: options?.skipCursorSetAndStateSave ? undefined : focusCursorAbsPos, skipStringEscape: hasStringSlots, imageLiterals: mediaLiterals});
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
                    labelDiv.querySelectorAll("." + scssVars.labelSlotInputClassName + ",." + scssVars.labelSlotMediaClassName).forEach((spanElement) => {
                        if(!foundPos){
                            if (spanElement.classList.contains(scssVars.labelSlotMediaClassName)) {
                                // Media literals are considered to be one character wide:
                                newUICodeLiteralLength += 1;
                                // Go on to the next selector item:
                                return;
                            }
                            const spanContentLength = (spanElement.textContent?.replace(/\u200B/g, "")?.length??0);
                            if(setInsideNextSlot || (focusCursorAbsPos <= (newUICodeLiteralLength + spanContentLength) && focusCursorAbsPos >= newUICodeLiteralLength)){
                                if(!setInsideNextSlot && !isElementEditableLabelSlotInput(spanElement)){
                                    setInsideNextSlot = true;
                                }
                                else{
                                    foundPos = true;
                                    if (!options?.skipCursorSetAndStateSave) {
                                        (spanElement as HTMLSpanElement).dispatchEvent(new Event(CustomEventTypes.editableSlotGotCaret));
                                    }
                                    const pos = (setInsideNextSlot) ? 0 : focusCursorAbsPos - newUICodeLiteralLength;
                                    const cursorInfos = {slotInfos: parseLabelSlotUID(spanElement.id), cursorPos: pos};

                                    // We also check here if the changes trigger the conversion of a function call frame to a varassign frame (i.e. a funccall frame contains a variable assignment).
                                    // If the parsed code slot structure results in having a first operator (except empty, dot and comma) equals to "=" then we convert, being in a label slot structure of index 0.
                                    // We do not allow a conversion if the focus isn't inside a slot of level 1.
                                    const isVarAssignSlotStructure = (parsedCodeRes.slots.operators.length > 0 && parsedCodeRes.slots.operators
                                        .find((opSlot, index) => (opSlot.code == "=" && parsedCodeRes.slots.operators.slice(0,index).every((opSlot) => ["", ".", ","].includes(opSlot.code)))));
                                    if(isVarAssignSlotStructure && this.labelIndex == 0 && !((currentFocusSlotCursorInfos?.slotInfos.slotId??",").includes(",")) && this.appStore.frameObjects[this.frameId].frameType.type == AllFrameTypesIdentifier.funccall && uiLiteralCode.match(/(?<!=)=(?!=)/) != null){
                                        // We need to break at the slot preceding the first "=" operator.
                                        const breakAtSlotIndex = parsedCodeRes.slots.operators.findIndex((opSlot) => opSlot.code == "=");
                                        if (!options?.skipCursorSetAndStateSave) {
                                            this.appStore.setSlotTextCursors(undefined, undefined);
                                        }

                                        setTimeout(() => {
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
                                                if (!options?.skipCursorSetAndStateSave) {
                                                    setDocumentSelection(newCursorSlotInfos, newCursorSlotInfos);
                                                    this.appStore.setSlotTextCursors(newCursorSlotInfos, newCursorSlotInfos);
                                                    options?.doAfterCursorSet?.();
                                                    // Save changes only when arrived here (for undo/redo)
                                                    this.appStore.saveStateChanges(stateBeforeChanges);
                                                }
                                            }));
                                        }, 300);                                         
                                    }
                                    else{
                                        if (!options?.skipCursorSetAndStateSave) {
                                            setDocumentSelection(cursorInfos, cursorInfos);
                                            this.appStore.setSlotTextCursors(cursorInfos, cursorInfos);
                                            options?.doAfterCursorSet?.();
                                            // Save changes only when arrived here (for undo/redo)
                                            this.appStore.saveStateChanges(stateBeforeChanges);
                                        }
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
            // ** LEFT/RIGHT AND UP/DOWN ARROWS (without the meta key pressed for macOS) ARE TREATED SEPARATELY
            // BY THIS COMPONENT, we don't forward related events **
            if(!(isMacOSPlatform() && event.metaKey) && (event.key == "ArrowLeft" || event.key == "ArrowRight"
                || event.key == "ArrowUp" || event.key == "ArrowDown")){
                return;
            }

            // Ignore context menu (we need to let it pass through to be handled by App)
            if(event.key.toLowerCase() == "contextmenu"){
                return;
            }

            if(this.appStore.focusSlotCursorInfos && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() == "a") {
                if (event.type === "keydown") {
                    // On Firefox Ctrl-A doesn't work correctly when processed natively in slots.
                    // So we have to manually implement it.  It selects the entire slot, no matter how deep we were in what kind of slot
                    let slotFields = this.appStore.frameObjects[this.frameId].labelSlotsDict[this.labelIndex].slotStructures.fields;
                    const newFocusSlotId = ("" + (slotFields.length - 1));
                    // We only look for the new type and slot core infos for non-string current location to save unnecessary function calls
                    const newFocusSlotType = evaluateSlotType(getSlotDefFromInfos({frameId: this.frameId, labelSlotsIndex: this.labelIndex}), slotFields.at(-1) as FieldSlot);
                    const newFocusSlotCoreInfo = {frameId: this.frameId, labelSlotsIndex: this.labelIndex, slotId: newFocusSlotId, slotType: newFocusSlotType};
                    const newFocusCursorPos = (retrieveSlotFromSlotInfos(newFocusSlotCoreInfo) as BaseSlot).code.length;
                    // Then anchor: it will either keep the same if we are doing a selection, or change to the same as focus if we are not.
                    const newAnchorSlotId = "0";
                    const newAnchorSlotCoreInfo = {...newFocusSlotCoreInfo, slotId: newAnchorSlotId, slotType: evaluateSlotType(getSlotDefFromInfos({frameId: this.frameId, labelSlotsIndex: this.labelIndex}), slotFields[0])};
                    const newAnchorSlotCursorInfo: SlotCursorInfos = {slotInfos: newAnchorSlotCoreInfo, cursorPos: 0};
                    // Set the new bounds
                    this.$nextTick(() => {
                        document.getElementById(getLabelSlotUID(this.appStore.focusSlotCursorInfos?.slotInfos as SlotCoreInfos))?.dispatchEvent(new Event(CustomEventTypes.editableSlotLostCaret));
                        document.getElementById(getLabelSlotUID(newFocusSlotCoreInfo))?.dispatchEvent(new Event(CustomEventTypes.editableSlotGotCaret));
                        setDocumentSelection(newAnchorSlotCursorInfo, {slotInfos: newFocusSlotCoreInfo, cursorPos: newFocusCursorPos});
                        this.appStore.setSlotTextCursors(newAnchorSlotCursorInfo, {slotInfos: newFocusSlotCoreInfo, cursorPos: newFocusCursorPos});
                    });
                }
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return;
            }

            // When some text is cut through *a selection*, we need to handle it fully: we want to handle the slot changes in the store to reflect the
            // text change, but also we need to handle the clipboard, as doing events here on keydown results the browser not being able to get the text
            // cut (since the slots have already disappear, and the action for cut seems to be done on the keyup event)
            if (this.appStore.focusSlotCursorInfos && (event.ctrlKey || event.metaKey) && (event.key.toLowerCase() ==  "x" || event.key.toLowerCase() ==  "c")){
                if (event.type === "keydown") {
                    // There is a selection already, we can directly set the text in the browser's clipboard here
                    const selectionText = getEditableSelectionText();
                    if (selectionText) {
                        // If it's a media literal, we copy the literal content and text to the clipboard:
                        const litMatch = selectionText.match(/^load_(image|sound)\("data:([^;]+);base64,([^"]+)"\)$/);
                        if (litMatch) {
                            const mimeType = litMatch[2];
    
                            // Convert base64 to binary data:
                            const binary = atob(litMatch[3]);
                            const bytes = new Uint8Array(binary.length);
                            for (let i = 0; i < binary.length; i++) {
                                bytes[i] = binary.charCodeAt(i);
                            }
                            const blob = new Blob([bytes], { type: mimeType });
                            const mediaAndTextItem = new ClipboardItem({ [mimeType]: blob });
                            navigator.clipboard.write([mediaAndTextItem])
                                .catch((err) => {
                                    console.error("Clipboard write failed:", err);
                                });
                        }
                        else {
                            // Otherwise we just copy the text:
                            navigator.clipboard.writeText(selectionText)
                                .catch((err) => {
                                    console.error("Clipboard write failed:", err);
                                });
                        }
                        if (event.key.toLowerCase() == "x" && this.appStore.focusSlotCursorInfos) {
                            // Send fake delete key to delete the content:
                            document.getElementById(getLabelSlotUID(this.appStore.focusSlotCursorInfos.slotInfos))
                                ?.dispatchEvent(new KeyboardEvent(event.type, {
                                    key: "Backspace",
                                }));
                        }
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
                
                // We want to prevent some events to be handled wrongly twice or at all by the browser and our code.
                // However, for comments (e.g. frame or documentation slot) and string literals, we need to let some navigation event go through otherwise they're blocked as we rely on the browser for them.
                // For macOS we have a specific behaviour to consider: see LabelSlot.vue handleFastUDNavKeys for explanations
                const textHomeEndBehaviourKeys = (isMacOSPlatform() && event.metaKey) ? ["ArrowLeft", "ArrowRight"] : ((!isMacOSPlatform()) ? ["Home", "End"] : []);
                if(this.appStore.allowsKeyEventThroughInLabelSlotStructure || 
                    (textHomeEndBehaviourKeys.includes(event.key) && (this.appStore.frameObjects[this.frameId].frameType.type == AllFrameTypesIdentifier.comment || this.focusSlotCursorInfos?.slotInfos.slotType == SlotType.comment || this.focusSlotCursorInfos?.slotInfos.slotType == SlotType.string))){
                    // A few events need to be handled by the brower solely.
                    // That is, for comments: "PageUp", "PageDown", "Home", "End" (these last 2 for Windows only)
                    // and anytime we set allowsKeyUpThroughInLabelSlotStructure (which we need to reset):
                    this.appStore.allowsKeyEventThroughInLabelSlotStructure = false;
                    return;
                }
                else if (event.key.toLowerCase() == "backspace"
                    || event.key.toLowerCase() == "delete"
                    || event.key.toLowerCase() == "enter"
                    || event.key == "ArrowUp"
                    || event.key == "ArrowDown"
                    || event.key == "Home"
                    || event.key == "End"
                    || event.key == "PageUp"
                    || event.key == "PageDown"
                    || event.key == "Tab"
                    || (isMacOSPlatform() && event.metaKey && textHomeEndBehaviourKeys.includes(event.key))
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
            const focusSlotCursorInfos = this.appStore.focusSlotCursorInfos;
            if (event.clipboardData && focusSlotCursorInfos) {
                // First we need to check if it's a media item on the clipboard, because that needs
                // to become a media literal rather than plain text:
                /* IFTRUE_isPython */
                if (preparePasteMediaData(event, (code: string, dataAndDim : MediaDataAndDim) => {
                    // The code is the code to load the literal from its base64 string representation:                    
                    document.getElementById(getLabelSlotUID(focusSlotCursorInfos.slotInfos))
                        ?.dispatchEvent(new CustomEvent(CustomEventTypes.editorContentPastedInSlot, {detail: {type: dataAndDim.itemType, content: code, width: dataAndDim.width, height: dataAndDim.height}}));
                })) {
                    // If pasting image, don't also paste text:
                    return;
                }
                /* FITRUE_isPython */

                interface PastedItem {
                    type: string;
                    content: string;
                }
                const pastedItems : PastedItem[] = [];

                const content = event.clipboardData.getData("Text").trim();
                if (content) {
                    const ms = splitByRegexMatches(content, /(?:load_image|load_sound)\("data:(?:image|audio)[^;]*;base64,[^"]+"\)/);
                    for (let i = 0; i < ms.length; i++) {
                        // We know even values (0, 2) are the plain string parts inbetween regex matches,
                        // and odd values (1, 3) are the parts which matched the regex:
                        if ((i % 2) == 0) {
                            pastedItems.push({type: "text/plain", content: ms[i]});
                        }
                        else {
                            // fish out the details:
                            const details = /data:([^;]+);base64,[^"']+/.exec(ms[i]);
                            if (details) {
                                const dataAndBase64 = details[0];
                                const code = (details[1].startsWith("image") ? "load_image" : "load_sound") + "(\"" + dataAndBase64 + "\")";
                                pastedItems.push({type: details[1], content: code});
                            }
                        }
                    }
                }
                
                // This recurses through the list pasting in order, but adds a double
                // nextTick inbetween each paste event.  The reason we double is that the pasting
                // sometimes uses one nextTick to take effect, so we need an extra one beyond that
                // before we are then readyto paste the next part:
                const pasteIndexThenFollowing = (i : number) => {
                    if (i < pastedItems.length) {
                        // We create a new custom event with the clipboard data as payload, to avoid untrusted events issues
                        if (this.appStore.focusSlotCursorInfos) {
                            document.getElementById(getLabelSlotUID(this.appStore.focusSlotCursorInfos.slotInfos))
                                ?.dispatchEvent(new CustomEvent(CustomEventTypes.editorContentPastedInSlot, { detail: { type: pastedItems[i].type, content: pastedItems[i].content }}));
                            this.$nextTick(() => {
                                this.$nextTick(() => {
                                    pasteIndexThenFollowing(i + 1);
                                });
                            });
                        }
                    }
                };
                pasteIndexThenFollowing(0);
            }
        },        

        onLRKeyDown(event: KeyboardEvent) {
            // We ignore calls from macOS when the meta key is also pressed (we treat this equivalent to home, see LabelSlot.vue handleFastUDNavKeys())
            if(isMacOSPlatform() && event.metaKey){
                return;
            }

            // Because the event handling, it is easier to deal with the left/right arrow at this component level.
            if(this.appStore.focusSlotCursorInfos){
                const {slotInfos, cursorPos} = this.appStore.focusSlotCursorInfos;
                const spanInput = document.getElementById(getLabelSlotUID(slotInfos)) as HTMLSpanElement;
                const spanInputContent = spanInput.textContent ?? "";
                const allowed = this.appStore.frameObjects[this.frameId].frameType.labels[this.labelIndex].allowedSlotContent;

                // If we're trying to go off the bounds of this slot
                // For comments, if there is a terminating line return, we do not allow the cursor to be past it (cf LabelSlot.vue onEnterOrTabKeyUp() for why)
                // We can "push" one half a bracket pair only with "Alt" (or Ctrl on macOS) + arrow within the same level.                
                if((cursorPos == 0 && event.key==="ArrowLeft") 
                        || (((cursorPos >= spanInputContent.replaceAll(/\u200B/g, "").length) || (allowed == AllowedSlotContent.FREE_TEXT_DOCUMENTATION && spanInputContent.endsWith("\n") && cursorPos == spanInputContent.length - 1)) && event.key==="ArrowRight")) {
                    // DO NOT request a loss of focus here, because we need to be able to know which element of the UI has focus to find the neighbour in this.appStore.leftRightKey()
                    if((event.altKey && !isMacOSPlatform()) || (event.ctrlKey && isMacOSPlatform())){
                        this.checkAndDoPushBracket(this.appStore.focusSlotCursorInfos, event.key==="ArrowLeft");
                    }
                    else{
                        this.appStore.isSelectingMultiSlots = event.shiftKey;
                        this.appStore.leftRightKey({key: event.key, isShiftKeyHold: event.shiftKey}).then(() => {
                        // If we are doing a selection, we need to reflect this in the UI
                            if(event.shiftKey){
                                setDocumentSelection(this.appStore.anchorSlotCursorInfos as SlotCursorInfos, this.appStore.focusSlotCursorInfos as SlotCursorInfos);                     
                            }
                        });       
                    }
                    this.appStore.ignoreKeyEvent = false;                 
                }
                // If a key modifier (ctrl, shift or meta) is pressed, we don't do anything special (browser handles it),
                // note that alt is handled separately and because of Chrome and FF are using alt+arrows for browser's navigation, we blocked it.
                else if(event.ctrlKey || event.shiftKey || event.metaKey || event.altKey){      
                    if((event.altKey && !isMacOSPlatform()) || (event.ctrlKey && isMacOSPlatform())){
                        event.preventDefault();
                        event.stopImmediatePropagation();
                    }              
                    return;
                }
                else {
                    //no specific action to take, we just move the cursor to the left or to the right
                    this.appStore.isSelectingMultiSlots = false; // reset flag
                    // Note that moving the cursor doesn't always mean move by 1: it depends on the characters' encoding.
                    // If we move forward, we bypass the current grapheme, if we move backwards, we bypass the grapheme before the current one.
                    // (We don't need to worry about goint outbounds since that's already taken care of by other methods, but still need a particular
                    // case for when we're at the end of the slot and we go left, there is no "current" grapheme at this position.)
                    const newCursorPos = (event.key == "ArrowRight")
                        ? cursorPos + getGraphemeLength(spanInputContent, cursorPos, "current")
                        : cursorPos - getGraphemeLength(spanInputContent, cursorPos, "before" );
                    const slotCursorInfo: SlotCursorInfos = {slotInfos: slotInfos, cursorPos: (newCursorPos)};
                    setDocumentSelection(slotCursorInfo, slotCursorInfo);
                }
                event.preventDefault();
                event.stopImmediatePropagation();  
            }                      
        },
        
        slotUpDown(event: KeyboardEvent) {
            if (!this.isFocused || !this.appStore.isEditing) {
                return;
            }
            event.stopPropagation();
            event.stopImmediatePropagation();
            event.preventDefault();
            
            if (!(event.shiftKey || event.metaKey || event.altKey || event.ctrlKey)) {
                const subSlots = this.$refs.labelSlots as InstanceType<typeof LabelSlot>[];
                for (const subSlot of subSlots) {
                    if (subSlot.handleUpDown(event)) {
                        // Consumed by focused slot which is showing autocomplete:
                        return;
                    }
                }
            }
            
            if (!(event.metaKey || event.altKey || event.ctrlKey)) {
                // Try to move up/down within this item, if we have wrapped:
                const spans = document.getElementById(getFrameHeaderUID(this.frameId))?.querySelectorAll("span." + scssVars.labelSlotInputClassName + "[contenteditable=\"true\"]") as NodeListOf<HTMLSpanElement>;
                if (spans.length > 0) {
                    const dest = handleVerticalCaretMove(Array.from(spans), event.key == "ArrowUp" ? "up" : "down");
                    if (dest) {
                        const infos = {slotInfos: parseLabelSlotUID(dest.span.id), cursorPos: dest.offset};
                        const anchor = (event.shiftKey ? this.appStore.anchorSlotCursorInfos : undefined) ?? infos; 
                        this.appStore.setSlotTextCursors(anchor, infos);
                        setDocumentSelection(anchor, infos);
                        this.appStore.setFocusEditableSlot({
                            frameSlotInfos: infos.slotInfos,
                            caretPosition: (this.appStore.getAllowedChildren(this.frameId)) ? CaretPosition.body : CaretPosition.below,
                        });
                        return;
                    }
                }
                
                if (event.shiftKey) {
                    // If shift is pressed, we don't leave for a frame cursor:
                    return;
                }
            }
            // Otherwise we move to an adjacent frame cursor.
            // Special case: if we are the project doc frame, up doesn't do anything and down has to not go beneath us, but rather into the imports
            let isProjectDoc = this.appStore.frameObjects[this.frameId].frameType.type == AllFrameTypesIdentifier.projectDocumentation;
            if (isProjectDoc && event.key == "ArrowUp") {
                // Do nothing further; up can't go anywhere:
                return;
            }
            
            this.appStore.isEditing = false;
            this.blurEditableSlot(true);
            document.getSelection()?.removeAllRanges();
            
            //If the up arrow is pressed you need to move the caret as well.
            if(event.key == "ArrowUp") {
                this.appStore.changeCaretPosition(event.key);
            }
            else{
                if (isProjectDoc) {
                    // We want the section after the project doc:
                    const newCaretId = this.appStore.frameObjects[0].childrenIds[1];
                    const newCaretPosition = CaretPosition.body;
                    this.appStore.toggleCaret({id: newCaretId, caretPosition: newCaretPosition});
                }
                else if (this.appStore.isCurrentFrameCollapsedClassOrFunction){
                    // If we are leaving the content of a class or function def frame, and that frame is *fully collapsed*, we need to go below.
                    this.appStore.toggleCaret({id: this.frameId, caretPosition: CaretPosition.below});
                }
                else {
                    // Restore the caret visibility
                    Vue.set(this.appStore.frameObjects[this.appStore.currentFrame.id], "caretVisibility", this.appStore.currentFrame.caretPosition);
                }
            }
        },

        checkAndDoPushBracket(focusSlotCursorInfos: SlotCursorInfos, isToPushLeft: boolean): void {
            // We can "push" only one half a bracket pair with "Alt" (or Ctrl on macOS) + arrow 
            // so the bracket is moved past or after its neigbouring "token".
            // A token can be: an operator, a bracketed structure, a string, a slot code, a media slot.
            // At this stage, the key modifier is already validated: we need to make sure 
            // we are actually near a bracket, and that it can be pushed.
            let pushBracket = false, bracketSlotSpanId = "";
            const slotInfos = focusSlotCursorInfos.slotInfos;
  
            const {parentId, slotIndex} = getSlotParentIdAndIndexSplit(slotInfos.slotId);
            const parentSlot = retrieveSlotFromSlotInfos({...slotInfos, slotId: parentId, slotType: SlotType.code});                    
            let isNextToBracket = false, skipFirstNeighbour = false;
            let neighbourSlotInfosToCheck = {...slotInfos};
            let bracketToPush = "";

            // The case we are at the beginning [resp. at the end] of a slot and we want to push left [resp. right]:
            // 1) is the token on our left [resp. right] a bracket, there are 2 cases to distinguish:   
            // 1.a) are we after a closing bracket [resp. before an opening bracket] ? (i.e. our immediate neighbour is a bracketed structure)
            // 1.b) are we after an opening bracket [resp. before a closing bracket] ? (i.e. we are in the first [resp. last] slot of a bracketed structure)
            const immediatePrevNeighbourSlotInfo = getFlatNeighbourFieldSlotInfos(slotInfos, !isToPushLeft, true);
            const isNextToExternalStructBracket = (immediatePrevNeighbourSlotInfo != null && immediatePrevNeighbourSlotInfo.slotType == SlotType.bracket);
            const isNextToInternalStructBracket =  !isNextToExternalStructBracket && slotInfos.slotId.includes(",") && evaluateSlotType(getSlotDefFromInfos(slotInfos), parentSlot) == SlotType.bracket && ((isToPushLeft) ? slotIndex == 0 : slotIndex == (parentSlot as SlotsStructure).fields.length - 1);
            isNextToBracket = isNextToExternalStructBracket || isNextToInternalStructBracket;
            if(isNextToBracket) {
                // Set the slot infos of the neighbour slot to check: that is the slot just preceding [resp. following] the bracketed structure we are in now
                neighbourSlotInfosToCheck = getFlatNeighbourFieldSlotInfos(slotInfos, !isToPushLeft) as SlotCoreInfos;
                const firstNeighbourSlotLevel = neighbourSlotInfosToCheck.slotId.split(",").length;
                // If the neighbour is empty and separated from the bracket by an empty operator, we should look beyond 
                // (because that push wouldn't be effective, it would render the same expression).
                // Also, we cannot push the bracket inside an inner bracketed/string structure, otherwise pair nesting would be broken: we bypass it
                skipFirstNeighbour = ((isToPushLeft && getSlotParentIdAndIndexSplit(neighbourSlotInfosToCheck.slotId).slotIndex > 0) 
                                || (!isToPushLeft && getSlotParentIdAndIndexSplit(neighbourSlotInfosToCheck.slotId).slotIndex < getFrameParentSlotsLength(neighbourSlotInfosToCheck) - 1))
                            && (retrieveSlotFromSlotInfos(neighbourSlotInfosToCheck) as BaseSlot).code.length == 0
                            && getFlatNeighbourFieldSlotInfos(neighbourSlotInfosToCheck, !isToPushLeft) != null; // there is more to check beyond
                            
                if(skipFirstNeighbour) {
                    neighbourSlotInfosToCheck = getFlatNeighbourFieldSlotInfos({...slotInfos, slotId: neighbourSlotInfosToCheck.slotId}, !isToPushLeft) as SlotCoreInfos;
                    // If we now end up inside a structure, a string, a media slot, we need to go before [resp. after] that structure
                    if(neighbourSlotInfosToCheck.slotId.split(",").length > firstNeighbourSlotLevel || neighbourSlotInfosToCheck.slotType == SlotType.string || neighbourSlotInfosToCheck?.slotType == SlotType.media){
                        const {parentId: grandParentId,slotIndex: grandParentIndex} = (isNextToExternalStructBracket) 
                            ? ((neighbourSlotInfosToCheck.slotType == SlotType.string || neighbourSlotInfosToCheck.slotType == SlotType.media) 
                                ? getSlotParentIdAndIndexSplit(neighbourSlotInfosToCheck.slotId) 
                                : getSlotParentIdAndIndexSplit(getSlotParentIdAndIndexSplit(neighbourSlotInfosToCheck.slotId).parentId))
                            : getSlotParentIdAndIndexSplit(parentId);
                        const skipStructreOffset = (isNextToExternalStructBracket) ? 1 : 3;
                        neighbourSlotInfosToCheck.slotId = getSlotIdFromParentIdAndIndexSplit(grandParentId, grandParentIndex + ((isToPushLeft) ? skipStructreOffset * -1 : skipStructreOffset));
                    }
                }
                bracketSlotSpanId = getLabelSlotUID((isNextToExternalStructBracket)
                    ? {...(immediatePrevNeighbourSlotInfo as SlotCoreInfos), slotType: (isToPushLeft) ? SlotType.closingBracket : SlotType.openingBracket}
                    : {...slotInfos, slotId: parentId, slotType: (isToPushLeft) ? SlotType.openingBracket :  SlotType.closingBracket});
                bracketToPush = document.getElementById(bracketSlotSpanId)?.textContent??"";
            }

            // 2) if we are after [resp. before] a bracket, now we check if we can push that bracket to the left [resp. right]:
            // it is possible if the neighbour slot of the bracket is not empty AND not first [resp. last] of its level
            // OR if we have skipped the first neighbour
            if(isNextToBracket){
                if(skipFirstNeighbour){
                    pushBracket = true;
                }
                else {
                    const neighbourSlot = retrieveSlotFromSlotInfos(neighbourSlotInfosToCheck);
                    // When we push right, we need to know the neighbour's parent last slot child.
                    // If the neighbour's slot index isn't showing a bracketed structure, we look directly inside the label slot structure,
                    // if not, we check with the parent slot (that is then by definition a bracketed structure itself).
                    const neighbourContainerSlotLastChildIndex  = (neighbourSlotInfosToCheck.slotId.includes(","))
                        ? (retrieveSlotFromSlotInfos({...neighbourSlotInfosToCheck, slotId: getSlotParentIdAndIndexSplit(neighbourSlotInfosToCheck.slotId).parentId}) as SlotsStructure).fields.length - 1
                        : this.appStore.frameObjects[neighbourSlotInfosToCheck.frameId].labelSlotsDict[neighbourSlotInfosToCheck.labelSlotsIndex].slotStructures.fields.length - 1; 
                    const neighbourContainerSlotIndexToCheck = (isToPushLeft) ? 0 : neighbourContainerSlotLastChildIndex;
                    pushBracket = (neighbourSlot as BaseSlot).code.length > 0 || !new RegExp("^" + neighbourContainerSlotIndexToCheck + "$|," + neighbourContainerSlotIndexToCheck + "$").test(neighbourSlotInfosToCheck.slotId);
                }
            }
            
            if(pushBracket){
                // To faciliate the code refactoring, we follow this approach: we clear off the full label slot structure, put the amended content in a new single slot,
                // and refactor the slots to let our refactoring splitting up operators, brackets etc as normal.
                let resultingCode = "", newCursorPosition = 0;
                const neighbourToPushInSlotSpanId = getLabelSlotUID({...slotInfos, slotId: neighbourSlotInfosToCheck.slotId});
                const mediaSlotsPosAndValue: {pos: number, code: string}[] = [];
                document.getElementById(this.labelSlotsStructDivId)?.querySelectorAll("." + scssVars.labelSlotInputClassName + ",." + scssVars.labelSlotMediaClassName).forEach((slotHTMLElement) => {
                    // We concatenate the slots's content of this label slot structure (bar the zero-width spaces),
                    // but when we find the bracket we need to push, we ignore that slot and 
                    // - change the currently-being-built resultCode to reflect a "push to the left "
                    // - or flag we passed the bracket, then add the bracket in the next slot to reflect a "push to the right".
                    // NOTE FOR STRING LITERALS: we need to carefully parse the string literal quotes slots.
                    // NOTE FOR MEDIA SLOTS: they should be kept in the code, we only insert their code equivalent back into resultingCode when we are done with parsing.
                    // In the meantime, we keep a list of the media, their expected positions (with the 1 char wide system), and use that also for knowing how many 1 char wide cursor offset we need to 
                    // account for (because resultingCode won't include anything for the media slot during the parsing)
                    if (slotHTMLElement.classList.contains(scssVars.labelSlotMediaClassName)) {
                        // When we encounter a media slot, we ignore it for the time being in the resultingCode, 
                        // but we save its code equivalent and its position in mediaSlotsPosAndValue, which will be used later
                        // to account for the media slot 1 char width when we check the new text cursor position, and to insert
                        // the media slots' code back in resultingCode at their position when we are done with parsing the slots struct.
                        // When getting the position, we also need to add up +1 for every previously found media slots, since each takes
                        // 1 char width and will make an offset when added back in the resultingCode...
                        mediaSlotsPosAndValue.push({pos: resultingCode.length + mediaSlotsPosAndValue.length, code: (slotHTMLElement as HTMLImageElement).dataset.code as string});
                        // Go on to the next selector item:
                        return;
                    }
                    if(slotHTMLElement.id !== bracketSlotSpanId){
                        if(isToPushLeft && slotHTMLElement.id == neighbourToPushInSlotSpanId){
                            // We are pushing left: if we are now at the neighbour slot we wanted to push the slot in, 
                            // we need to append the pushed bracket to the span content here (the actual bracket span will be ignored)
                            const spanText = (slotHTMLElement.textContent??"").replace("\u200b","");
                            //newCursorPosition = resultingCode.length + ((skipFirstNeighbour) ? spanText.length + 1 : spanText.length);
                            newCursorPosition = resultingCode.length + ((skipFirstNeighbour) ? spanText.length + 1 : 1);
                            resultingCode += (((skipFirstNeighbour) ? spanText :  "") + bracketToPush + ((skipFirstNeighbour) ? "" : spanText));
                        }
                        else if(!isToPushLeft && slotHTMLElement.id == neighbourToPushInSlotSpanId){
                            // We are pushing right: if we are now at the neighbour slot we wanted to push the slot in, 
                            // we need to prepend the pushed bracket to the span content here (the actual bracket span was ignored)
                            const spanText = (slotHTMLElement.textContent??"").replace("\u200b","");
                            newCursorPosition = resultingCode.length + ((skipFirstNeighbour) ? 0 : spanText.length);
                            resultingCode += (((skipFirstNeighbour) ? "" : spanText) + bracketToPush + ((skipFirstNeighbour) ? spanText : ""));
                        }
                        else{
                            let spanText = slotHTMLElement.textContent??"";
                            const spanSlotType = parseLabelSlotUID(slotHTMLElement.id).slotType;
                            if(spanSlotType == SlotType.openingQuote || spanSlotType == SlotType.closingQuote) {
                                // We take care of the string literal quotes: they need to be in the Python raw format to be showing fine when the code is parsed
                                const quote = (UIDoubleQuotesCharacters.includes(spanText)) ? "\"" : "'";
                                spanText = quote;
                            }
                            resultingCode += spanText.replace("\u200b","");
                        }
                    }                
                });

                // Now we deal with the media slots: update the new cursor position to account for the media slots, and update the resutingCode with the media slots
                // data code value (Strype will be able to interpret this properly).
                // If we have listed any media slots positions *before* the new cursor position computed above, we need to account them:
                // each media slot is equivalent to 1 character width, so we should add them up to the new cursor position.
                newCursorPosition += (mediaSlotsPosAndValue.filter((mediaSlotPosAndValueObj) => mediaSlotPosAndValueObj.pos < (newCursorPosition + ((isToPushLeft) ? 0 : 1))).length);
                let mediaSlotDataCodeOffset = 0;
                mediaSlotsPosAndValue.forEach((mediaSlotPosAndValueObj) => {
                    resultingCode = resultingCode.substring(0, mediaSlotPosAndValueObj.pos + mediaSlotDataCodeOffset)
                        + mediaSlotPosAndValueObj.code 
                        + resultingCode.substring(mediaSlotPosAndValueObj.pos + mediaSlotDataCodeOffset);
                    // Since we have treated the media slots position as a 1 character width content, we need to deduct 1 to
                    // the media slot data code length so we can align the positions with the actual content in resultingCode properly
                    mediaSlotDataCodeOffset += (mediaSlotPosAndValueObj.code.length - 1);
                });    

                const stateBeforeChanges = cloneDeep(this.appStore.$state);
                // Since we redo *all* the slots of the current labelSlots structure, we need to 1) only keep 1 slot in the structure, remove all operators
                // and insert the resultingCode in the slot we kept. The slot structure will be refactored again in the next tick.
                this.appStore.frameObjects[slotInfos.frameId].labelSlotsDict[slotInfos.labelSlotsIndex].slotStructures.fields.splice(1);
                (this.appStore.frameObjects[slotInfos.frameId].labelSlotsDict[slotInfos.labelSlotsIndex].slotStructures.fields[0] as BaseSlot).code = resultingCode;
                this.appStore.frameObjects[slotInfos.frameId].labelSlotsDict[slotInfos.labelSlotsIndex].slotStructures.operators.splice(0);
                this.appStore.focusSlotCursorInfos = {slotInfos: {...slotInfos, slotId: "0", slotType: SlotType.code}, cursorPos: newCursorPosition};
                this.$nextTick(() => this.checkSlotRefactoring(getLabelSlotUID(this.appStore.focusSlotCursorInfos?.slotInfos as SlotCoreInfos), stateBeforeChanges, {useFlatMediaDataCode: true}));
                
            }
        },

        onFocus(){
            this.updatePrependText();
            // When the application gains focus again, the browser might try to give the first span of a div the focus (because the div may have been focused)
            // even if we have the blue caret showing. We do not let this happen.
            if(this.appStore.ignoreFocusRequest && this.appStore.focusSlotCursorInfos == undefined){
                document.getElementById(this.labelSlotsStructDivId)?.blur();               
            }
            this.appStore.ignoreFocusRequest = false;
        },

        blurEditableSlot(force?: boolean){
            // If a request to ignore the loss of focus has been made, we return right away but reset the flag
            if(this.appStore.ignoreBlurEditableSlot) {
                this.appStore.ignoreBlurEditableSlot = false;
                return;
            }
            
            this.updatePrependText();
            // If a flag to ignore editable slot focus is set, we just revert it and do nothing else
            if(this.appStore.bypassEditableSlotBlurErrorCheck){
                this.appStore.bypassEditableSlotBlurErrorCheck = false;
                return;
            }
                   
            // When the div containing the slots loses focus, we need to also notify the currently focused slot inside *this* container
            // that the caret has been "lost" (since a contenteditable div won't let its children having/loosing focus)
            if(force !== true && document.activeElement?.id === this.labelSlotsStructDivId){
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
        
        isFocused() {
            // We check if we are the parent of the currently focused element, as it may be a contenteditable item within us:
            var selectedElement = window.getSelection()?.focusNode;
            while (selectedElement != null) {
                if (selectedElement instanceof Element && selectedElement.id === this.labelSlotsStructDivId) {
                    return true;
                }
                selectedElement = selectedElement.parentNode;
            }
            return false;
        },
        
        updatePrependText() {
            if (this.prependSelfWhenInClass) {
                const isInClass = useStore().frameObjects[getParentId(useStore().frameObjects[this.frameId])]?.frameType.type == AllFrameTypesIdentifier.classdef;
                if (!isInClass) {
                    this.prependText = "";
                }
                else {
                    const empty = this.subSlots.length == 0 || !this.subSlots.some((s) => s.code !== "");
                    this.prependText = (this.isFocused() || !empty) ? "self," : "self";
                }
            }
            else {
                this.prependText = "";
            }
        },
    },
});
</script>

<style lang="scss">
.#{$strype-classname-label-slot-struct} {
    outline: none;
    max-width: 100%;
    flex-wrap: wrap;
}

.label-slot-structure.prepend-self-only::before, .label-slot-structure.prepend-self-comma::before {
    color: rgb(2, 33, 168);
    font-weight: 600;
    margin-right: 4px;
    display: inline-block;
    border: 1px solid transparent; /* For alignment with following slots */
}
.label-slot-structure.prepend-self-only::before {
    content: "self";
}
.label-slot-structure.prepend-self-comma::before {
    content: "self,";
}
</style>
