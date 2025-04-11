<template>
    <div :id="'div_'+UID" :class="{[scssVars.labelSlotContainerClassName]: true, nohover: isDraggingFrame}" contenteditable="true">
        <span
            autocomplete="off"
            spellcheck="false"
            :disabled="isDisabled"
            :placeholder="defaultText"
            :empty-content="!code || code == '\u200B'"
            :contenteditable="isEditableSlot && !(isDisabled || isPythonExecuting)"
            @click.stop="onGetCaret"
            @slotGotCaret="onGetCaret"
            @slotLostCaret="onLoseCaret"
            @mouseenter="handleMouseEnterLeave(true)"
            @mouseleave="handleMouseEnterLeave(false)"
            @keydown.up="onUDKeyDown($event)"
            @keydown.down="onUDKeyDown($event)"
            @keydown.prevent.stop.esc
            @keyup.esc="onEscKeyUp($event)"
            @keydown.prevent.stop.enter
            @keyup.enter.prevent.stop="onEnterOrTabKeyUp($event)"
            @keydown.tab="onTabKeyDown($event)"
            @keyup.tab="onEnterOrTabKeyUp($event)"
            @keydown.backspace="onBackSpaceKeyDown"
            @keydown.delete="onDeleteKeyDown"
            @keyup.backspace="onBackSpaceKeyUp"
            @keydown="onKeyDown($event)"
            @contentPastedInSlot="onCodePaste"
            :class="{[scssVars.labelSlotInputClassName]: true, [scssVars.navigationPositionClassName]: isEditableSlot, [scssVars.errorSlotClassName]: erroneous(), [getSpanTypeClass]: true, bold: isEmphasised, readonly: (isPythonExecuting || isDisabled)}"
            :id="UID"
            :key="UID"
            :style="spanBackgroundStyle"
            @input="onInput"
            @compositionend="onCompositionEnd"
            @dragstart.prevent
            v-text="code"
        >
        </span>
               
        <b-popover
            v-if="erroneous()"
            ref="errorPopover"
            :target="UID"
            :title="errorHeader"
            triggers="hover"
            :content="errorMessage"
            custom-class="error-popover modified-title-popover"
            placement="bottom"
        >
        </b-popover>

        <AutoCompletion
            v-show="focused && showAC"
            :class="{ac: true, hidden: !acRequested}"
            :slotId="UID"
            ref="AC"
            :key="AC_UID"
            :id="AC_UID"
            :isImportFrame="isImportFrame()"
            @acItemClicked="acItemClicked"
        />
    </div>
</template>

<script lang="ts">
import Vue, { PropType } from "vue";
import { useStore } from "@/store/store";
import AutoCompletion from "@/components/AutoCompletion.vue";
import {getLabelSlotUID, CustomEventTypes, getFrameHeaderUID, closeBracketCharacters, getMatchingBracket, operators, openBracketCharacters, keywordOperatorsWithSurroundSpaces, stringQuoteCharacters, getFocusedEditableSlotTextSelectionStartEnd, parseCodeLiteral, getNumPrecedingBackslashes, setDocumentSelection, getFrameLabelSlotsStructureUID, parseLabelSlotUID, getFrameLabelSlotLiteralCodeAndFocus, stringDoubleQuoteChar, UISingleQuotesCharacters, UIDoubleQuotesCharacters, stringSingleQuoteChar, getSelectionCursorsComparisonValue, getTextStartCursorPositionOfHTMLElement, STRING_DOUBLEQUOTE_PLACERHOLDER, STRING_SINGLEQUOTE_PLACERHOLDER, checkCanReachAnotherCommentLine, getACLabelSlotUID, getFrameUID, getFrameComponent } from "@/helpers/editor";
import { CaretPosition, FrameObject, AllFrameTypesIdentifier, SlotType, SlotCoreInfos, isFieldBracketedSlot, SlotsStructure, BaseSlot, StringSlot, isFieldStringSlot, SlotCursorInfos, areSlotCoreInfosEqual, FieldSlot, PythonExecRunningState, MessageDefinitions, FormattedMessage, FormattedMessageArgKeyValuePlaceholders } from "@/types/types";
import { getCandidatesForAC } from "@/autocompletion/acManager";
import { mapStores } from "pinia";
import { checkCodeErrors, evaluateSlotType, getFlatNeighbourFieldSlotInfos, getOutmostDisabledAncestorFrameId, getSlotIdFromParentIdAndIndexSplit, getSlotParentIdAndIndexSplit, isFrameLabelSlotStructWithCodeContent, retrieveParentSlotFromSlotInfos, retrieveSlotFromSlotInfos } from "@/helpers/storeMethods";
import Parser from "@/parser/parser";
import { cloneDeep, debounce } from "lodash";
import LabelSlotsStructure from "./LabelSlotsStructure.vue";
import { BPopover } from "bootstrap-vue";
import Frame from "@/components/Frame.vue";
import scssVars from "@/assets/style/_export.module.scss";

export default Vue.extend({
    name: "LabelSlot",

    components: {
        AutoCompletion,
    },

    props: {
        defaultText: String,
        code: String,
        labelSlotsIndex: Number,
        slotId: String,
        slotType: {
            type: Number as PropType<SlotType>,
        },
        frameId: Number,
        isDisabled: Boolean,
        isEditableSlot: Boolean,
        isEmphasised: Boolean,
    },

    mounted(){
        // To make sure the a/c component shows just below the spans, we set its top position here based on the span height.
        const spanH = document.getElementById(this.UID)?.clientHeight;
        const acElement = document.getElementById(this.AC_UID);
        if(spanH && acElement){
            acElement.style.top = (spanH + "px");
        }
    },

    beforeDestroy() {
        this.appStore.removePreCompileErrors(this.UID);
    },
    
    created() {
        // Stop updateAC firing until 500ms after last time it is requested.
        // More efficient than running on every keystroke:
        this.updateAC = debounce(this.updateAC, 500, {trailing: true});
    },

    data: function() {
        return {
            scssVars, // just to be able to use in template
            //this flags indicates if the content of editable slot has been already modified during a sequence of action
            //as we don't want to save each single change of the content, but the full content change itself.
            isFirstChange: true,
            showAC: false,
            acRequested: false,
            contextAC: "",
            // tokenAC can be null if code completion is invalid here
            tokenAC: "" as string | null,
            //used to force a text cursor position, for example after inserting an AC candidate
            textCursorPos: 0,    
            //flags to indicate whether the user has explicitly marked a pause when deleting text with backspace
            //or that the slot is initially empty
            canBackspaceDeleteFrame: true,
            requestDelayBackspaceFrameRemoval: false,
        };
    },
    
    computed: {
        ...mapStores(useStore),

        coreSlotInfo(): SlotCoreInfos{
            return {
                frameId: this.frameId,
                labelSlotsIndex: this.labelSlotsIndex,
                slotId: this.slotId,
                slotType: this.slotType,
            };
        },

        initCode(): string {
            return this.appStore.currentInitCodeValue;
        },

        stringQuote(): string {
            // Keep information of the quote for string slots (empty string for other types of slot)
            if(this.slotType == SlotType.string){
                return (retrieveSlotFromSlotInfos(this.coreSlotInfo) as StringSlot).quote;
            }
            return "";
        },
        
        frameType(): string{
            return this.appStore.frameObjects[this.frameId].frameType.type;
        },

        spanBackgroundStyle(): Record<string, string> {
            const isStructureSingleSlot = this.appStore.frameObjects[this.frameId].labelSlotsDict[this.labelSlotsIndex].slotStructures.fields.length == 1;
            const isSlotOptional = this.appStore.frameObjects[this.frameId].frameType.labels[this.labelSlotsIndex].optionalSlot;
            const isEmptyFunctionCallSlot = (this.appStore.frameObjects[this.frameId].frameType.type == AllFrameTypesIdentifier.funccall 
                && this.isFrameEmptyAndAtLabelSlotStart
                && (this.appStore.frameObjects[this.frameId].labelSlotsDict[0].slotStructures.operators.length == 0 
                    || isFieldBracketedSlot(this.appStore.frameObjects[this.frameId].labelSlotsDict[0].slotStructures.fields[1])));
            return {
                // Background: if the field has a value, it's set to a semi transparent background when focused, and transparent when not
                // if the field doesn't have a value, it's always set to a white background unless it is not the only field of the current structure 
                // and content isn't optional (then it's transparent) - that is to distinguish the fields that are used for cursors placeholders 
                // to those indicating there is no compulsory value
                "background-color": ((this.focused) 
                    ? ((this.getSlotContent().trim().length > 0) ? "rgba(255, 255, 255, 0.6)" : "#FFFFFF") 
                    : (((isStructureSingleSlot || isEmptyFunctionCallSlot) && !isSlotOptional && this.code.replace(/\u200B/g, "").trim().length == 0) ? "#FFFFFF" : "rgba(255, 255, 255, 0)")) 
                    + " !important", 
            };
        }, 

        getSpanTypeClass(): string {
            // Returns the class name for a span type (i.e. distinction between operators, string and the rest)
            // Comments are treated differently as they have their own specific colour
            let codeTypeCSS = "";
            let boldClass = "";               
            switch(this.slotType){
            case SlotType.operator:
                // For commas, we add a right margin:
                codeTypeCSS = scssVars.frameOperatorSlotClassName + ((this.code==",") ? " slot-right-margin" : "");
                break;
            case SlotType.string:
            case SlotType.openingQuote:
            case SlotType.closingQuote:
                codeTypeCSS = scssVars.frameStringSlotClassName;
                break;
            default:
                // Check comments here
                if(this.frameType === AllFrameTypesIdentifier.comment){
                    codeTypeCSS = scssVars.frameCommentSlotClassName;
                }
                else{
                    // Everything else is code, however, if we are in a function definition name slot, we want the text to show bold as well.
                    if(this.frameType === AllFrameTypesIdentifier.funcdef && this.coreSlotInfo.labelSlotsIndex == 0){
                        boldClass = " bold";
                    }
                    codeTypeCSS = scssVars.frameCodeSlotClassName + boldClass;
                }
                break;
            }
            return codeTypeCSS;
        },

        focused(): boolean {
            // We need to keep update of the label slots structure's "isFocused" flag, because using the keyboard to navigate will not
            // update this flag -- but we always end up here when the focus (for slots) is updated.
            const isSlotFocused = this.appStore.isEditableFocused(this.coreSlotInfo);
            (this.$parent as InstanceType<typeof LabelSlotsStructure>).isFocused = isSlotFocused;
            return isSlotFocused;
        },

        UID(): string {
            return getLabelSlotUID(this.coreSlotInfo);
        },

        AC_UID(): string {
            return getACLabelSlotUID(this.coreSlotInfo);
        },

        errorMessage(): string{
            return this.appStore.getErrorForSlot(this.coreSlotInfo);
        },

        errorHeader(): string{
            return this.appStore.getErrorHeaderForSlot(this.coreSlotInfo);
        },

        debugAC(): boolean{
            return this.appStore.debugAC;
        },

        isDraggingFrame(): boolean{
            return this.appStore.isDraggingFrame;
        },

        isFrameEmptyAndAtLabelSlotStart(): boolean {
            // This computed property checks that all the (visible) editable slots of a frame, and if applies, its body, are empty
            // (note that if we have nothing but operators, or empty quotes, that is considered as empty)
            if(!(this.frameId in this.appStore.frameObjects)){
                return false;
            }            
            let firstVisibleLabelSlotsIndex = -1;
            const isEmpty = !(Object.values(this.appStore.frameObjects[this.frameId].labelSlotsDict).some((labelSlotContent, index) => {
                if((labelSlotContent.shown??true) && firstVisibleLabelSlotsIndex < 0 ){
                    firstVisibleLabelSlotsIndex = index;
                }
                return ((labelSlotContent.shown??true) && isFrameLabelSlotStructWithCodeContent(labelSlotContent.slotStructures));
            })
                || this.appStore.frameObjects[this.frameId].childrenIds.length > 0);
            return this.labelSlotsIndex == firstVisibleLabelSlotsIndex && this.slotId == "0" && isEmpty;

        },

        isPythonExecuting(): boolean {
            return (this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning;
        },
    },

    methods: {
        getSlotContent(): string{
            // If the input span hasn't yet be created, we return an empty string
            if(document.getElementById(this.UID) == null) {
                return "";
            }            
            return (document.getElementById(this.UID) as HTMLSpanElement).textContent ?? "";
        },

        onInput(input: InputEvent){
            // Don't do this if we are mid-composition because it alters
            // the cursor position and prevents composition/IME working:
            if (!input.isComposing) {
                const toSchedule = this.processInput(input.data ?? "");
                if (toSchedule) {
                    this.$nextTick(toSchedule);
                    return;
                }
                // Important to do this after processInput, which might have changed the content:
                const inputSpanField = document.getElementById(this.UID) as HTMLSpanElement;
                const inputSpanFieldContent = inputSpanField.textContent ?? "";
                // The contenteditable spans have a zero-width space when they are empty, so that browsers
                // will focus into them correctly.  But this should be used when the slot is empty.  Once
                // it has any other content, such spaces should be removed:
                if (inputSpanFieldContent != "\u200B" && inputSpanFieldContent.includes("\u200B")) {
                    // It's not a single zero-width space, but there are some:
                    let cursorPos = getTextStartCursorPositionOfHTMLElement(inputSpanField);
                    // Count number of zero-widths before the cursor (should be none, but you never know)
                    // and adjust cursor pos accordingly:
                    cursorPos -= inputSpanFieldContent.substring(0, cursorPos).replace(/[^\u200B]/g, "").length;
                    inputSpanField.textContent = inputSpanFieldContent.replace(/\u200B/g, "");
                    this.updateStoreFromEditableContent(cursorPos);
                }
                else {
                    this.updateStoreFromEditableContent();
                }
                
                
            }
        },

        onCompositionEnd(input: CompositionEvent) {
            const toSchedule = this.processInput(input.data);
            if (toSchedule) {
                this.$nextTick(toSchedule);
            }
            else {
                this.updateStoreFromEditableContent();
            }
        },

        updateStoreFromEditableContent(overrideCursorPos = null as number | null) {            
            const spanElement = (document.getElementById(this.UID) as HTMLSpanElement);
            this.textCursorPos = overrideCursorPos ?? getTextStartCursorPositionOfHTMLElement(spanElement);

            // Send an event to the frame that need to know that an editable slot got focus (no extra information needed as args for the moment)
            document.getElementById(getFrameHeaderUID(this.frameId))?.dispatchEvent(new Event(CustomEventTypes.frameContentEdited));
            
            // Event will only get the unitary input rather than the resulting change, so we get the data from the element directly to pass it in the store
            this.appStore.setFrameEditableSlotContent(
                {
                    ...this.coreSlotInfo,
                    code: (spanElement.textContent??"").replace(/\u200B/g, ""),
                    initCode: this.initCode,
                    isFirstChange: this.isFirstChange,
                }
            );

            // The cursor position is not maintained because of the changes in the store and reactivity
            // so we reposition it correctly, at the next tick (because code needs to be updated first)
            this.$nextTick(() => {
                const slotCursorInfo: SlotCursorInfos = {slotInfos: this.coreSlotInfo, cursorPos: this.textCursorPos};
                setDocumentSelection(slotCursorInfo, slotCursorInfo);
                this.appStore.setSlotTextCursors(slotCursorInfo, slotCursorInfo);
            });

            this.isFirstChange = false;
        },

        erroneous(): boolean {
            // Only show the popup when there is an error and the code hasn't changed
            return this.isFirstChange && this.appStore.isErroneousSlot(this.coreSlotInfo);
        },

        // Event callback equivalent to what would happen for a focus event callback 
        // (the spans don't get focus anymore because the containg editable div grab it)
        onGetCaret(event: MouseEvent): void {
            // If the user's code is being executed, or if the frame is disabled, we don't focus any slot, but we make sure we show the adequate frame cursor instead.
            if(this.isPythonExecuting || this.isDisabled){
                event.stopImmediatePropagation();
                event.stopPropagation();
                event.preventDefault();
                // Call the method which handles a click on the frame instead, we need to find the associated frame object:
                // the corresponding frame div under that click in the general case, or the outmost disabled ancester frame if the frame is disabled.
                const outmostDisabledFrameAncestorId = getOutmostDisabledAncestorFrameId(this.frameId);
                const frameDiv = document.getElementById(getFrameUID((this.isDisabled) ? outmostDisabledFrameAncestorId : this.frameId)) as HTMLDivElement;
                if(frameDiv){
                    const frameComponent = getFrameComponent((this.isDisabled) ? outmostDisabledFrameAncestorId: this.frameId);
                    if(frameComponent){
                        // The frame component can only be a frame (and not a frame container) since we've clicked on a slot...
                        (frameComponent as InstanceType<typeof Frame>).changeToggledCaretPosition(event.clientY, frameDiv);
                        // Even if visually and logically in the app the slot doesn't have focus, the browser will see differently
                        // (a click happened on the span...) - to make sure no undesirable effect occur, we set the focus on the frame div
                        (document.getElementById(getFrameUID(frameComponent.frameId)))?.focus();
                    }
                }
                return;
            }
            
            this.isFirstChange = true;

            // If we arrive here by a click, and the slot is a bracket, a quote or an operator, we should get the focus to the nearest editable frame.
            // We should have neigbours because brackets, quotes and operators are always surronded by fields, but keep TS happy
            if(this.slotType != SlotType.code && this.slotType != SlotType.string){
                const clickXValue = event.x;
                const slotWidth = document.getElementById(getLabelSlotUID(this.coreSlotInfo))?.offsetWidth??0;
                const slotXPos = document.getElementById(getLabelSlotUID(this.coreSlotInfo))?.getBoundingClientRect().x??0; 

                // Get the spans of that frame label container
                const spans = document.querySelectorAll("#"+getFrameLabelSlotsStructureUID(this.frameId, this.labelSlotsIndex) + " span");
                let indexOfCurrentSpan = 0;
                spans.forEach((element, index) => {
                    if(element.id == getLabelSlotUID(this.coreSlotInfo)){
                        indexOfCurrentSpan = index;
                    }
                });

                // Get the neigbour spans
                const previousNeighbourSlotInfos = parseLabelSlotUID(spans[indexOfCurrentSpan - 1].id);
                const nextNeighbourSlotInfos = parseLabelSlotUID(spans[indexOfCurrentSpan + 1].id);
                if(slotWidth> 0){
                    // Set default neigbour as the next
                    let neighbourSlotInfos = nextNeighbourSlotInfos;
                    let cursorPos = 0;
                    if(clickXValue < (slotXPos + (slotWidth / 2))) {
                        neighbourSlotInfos = previousNeighbourSlotInfos; 
                        cursorPos = (document.getElementById(getLabelSlotUID(previousNeighbourSlotInfos))?.textContent??"").length;                       
                    }
                  
                    // Focus on the nearest neighbour to the click
                    event.preventDefault();
                    this.$nextTick(() => {
                        const neighbourCursorSlotInfos: SlotCursorInfos = {slotInfos: neighbourSlotInfos, cursorPos: cursorPos};
                        document.getElementById(getLabelSlotUID(neighbourSlotInfos))?.dispatchEvent(new Event(CustomEventTypes.editableSlotGotCaret));
                        setDocumentSelection(neighbourCursorSlotInfos, neighbourCursorSlotInfos);
                        this.appStore.setSlotTextCursors(neighbourCursorSlotInfos, neighbourCursorSlotInfos);
                    });
                    return;
                }
                else {
                    const inputSpanField = document.getElementById(this.UID) as HTMLSpanElement;
                    const inputSpanFieldContent = inputSpanField.textContent ?? "";
                    if (inputSpanFieldContent == "\u200B") {
                        const cursorPos = getTextStartCursorPositionOfHTMLElement(inputSpanField);
                        if (cursorPos > 0 && this.appStore.anchorSlotCursorInfos && this.appStore.focusSlotCursorInfos) {
                            // We maybe came here by moving left from the field after, need to set pos to before zero-width space:
                            const slotCursorInfo: SlotCursorInfos = {slotInfos: this.coreSlotInfo, cursorPos: 0};
                            const hasMultiSlotTextSelection = !areSlotCoreInfosEqual(this.appStore.anchorSlotCursorInfos.slotInfos, this.appStore.focusSlotCursorInfos.slotInfos);
                            setDocumentSelection(hasMultiSlotTextSelection ? this.appStore.anchorSlotCursorInfos : slotCursorInfo, slotCursorInfo);
                            this.appStore.setSlotTextCursors(hasMultiSlotTextSelection ? this.appStore.anchorSlotCursorInfos : slotCursorInfo, slotCursorInfo);
                        }
                    }
                }
            }
            
            this.appStore.setFocusEditableSlot(
                {
                    frameSlotInfos: this.coreSlotInfo,
                    caretPosition: (this.appStore.getAllowedChildren(this.frameId)) ? CaretPosition.body : CaretPosition.below,
                }
            );
            
            if (!this.code) {
                // If code is empty, on Firefox we need to force the focus because a click on the placeholder
                // text does not actually set the caret into this span:
                this.$nextTick(() => {
                    const slotCursorInfo: SlotCursorInfos = {slotInfos: this.coreSlotInfo, cursorPos: this.textCursorPos};
                    setDocumentSelection(useStore().anchorSlotCursorInfos ?? slotCursorInfo, slotCursorInfo);
                });
            }

            // Make sure we're visible in the viewport properly
            document.getElementById(getLabelSlotUID(this.coreSlotInfo))?.scrollIntoView({block: "nearest"});

            this.updateAC();

            // As we receive focus, we show the error popover if required. Note that we do it programmatically as it seems the focus trigger on popover isn't working in our configuration
            if(this.erroneous()){
                (this.$refs.errorPopover as InstanceType<typeof BPopover>).$emit("open");
            }
        },
        
        handleMouseEnterLeave(isEntering: boolean) {
            // There is a bug with how Firefox handles editable text HTML elements contained in a draggable div.
            // We need to detect when the mouse is entering/leaving the text element to disable/enable the div's
            // draggable attribute (disabled frames should show draggable since text can't be edited). 
            // Because the frames are nested, we need to do that for all the frames hierarchy up ot the frames container.
            // see https://stackoverflow.com/questions/21680363/prevent-drag-event-to-interfere-with-input-elements-in-firefox-using-html5-drag
            let frameId = this.frameId;
            do{
                (document.getElementById(getFrameUID(frameId)) as HTMLDivElement).draggable = this.isDisabled || (!isEntering && !this.isDisabled);
                frameId = this.appStore.frameObjects[frameId].parentId;
            } 
            while(frameId > 0);
        },
        
        updateAC() : void {
            // Note: code in created() debounces this function to stop it running too often
            // You cannot assume it has run just after you called it.
            
            const frame: FrameObject = this.appStore.frameObjects[this.frameId];
            const selectionStart = getFocusedEditableSlotTextSelectionStartEnd(this.UID).selectionStart;

            // If the slot accepts auto-complete, i.e. it is not a "free texting" slot
            // e.g. : comment, function definition name and args slots, variable assignment LHS slot.
            const labelDiv = document.getElementById(getFrameLabelSlotsStructureUID(this.frameId, this.labelSlotsIndex));
            if(labelDiv && ((frame.frameType.labels[this.labelSlotsIndex].acceptAC)??true)){
                // Get the autocompletion candidates, based on everything that is preceding the caret 
                // (in the slot AND in the other previous slots of the same STRUCTURE, that is the previous frames of the same level of slots hierarchy)
                const {parentId, slotIndex} = getSlotParentIdAndIndexSplit(this.slotId);
                const hasSameLevelPreviousSlots = (slotIndex > 0);
                const startSlotUID = getLabelSlotUID({...this.coreSlotInfo, slotId: getSlotIdFromParentIdAndIndexSplit(parentId, 0)});
                const textBeforeThisSlot = (hasSameLevelPreviousSlots) 
                    ? getFrameLabelSlotLiteralCodeAndFocus(labelDiv, this.UID, {startSlotUID: startSlotUID , stopSlotUID: this.UID}).uiLiteralCode
                    : "";
                const textBeforeCaret = textBeforeThisSlot + this.getSlotContent().substring(0,selectionStart??0);

                //workout the correct context if we are in a code editable slot
                const isImportFrame = (frame.frameType.type === AllFrameTypesIdentifier.import || frame.frameType.type === AllFrameTypesIdentifier.fromimport);
                if (isImportFrame) {
                    this.tokenAC = textBeforeCaret;
                    if (this.tokenAC.includes(",")) {
                        this.tokenAC = this.tokenAC.substring(this.tokenAC.lastIndexOf(",") + 1); 
                    }
                    this.showAC = true;
                    this.contextAC = "";
                    this.$nextTick(() => {
                        const ac = this.$refs.AC as InstanceType<typeof AutoCompletion>;
                        if (ac && this.tokenAC != null) {
                            if (this.labelSlotsIndex == 0) {
                                // If we are in first slot in the import frame, look for modules:
                                ac.updateACForModuleImport(this.tokenAC);
                            }
                            else {
                                // If we're in the second slot (of from...import...), look for items
                                // in the module that was specified in the first slot:
                                ac.updateACForImportFrom(this.tokenAC, (frame.labelSlotsDict[0].slotStructures.fields[0] as BaseSlot).code);
                            }
                        }
                    });
                }
                else {
                    const resultsAC = getCandidatesForAC(frame.labelSlotsDict[this.labelSlotsIndex].slotStructures, new RegExp("[0-9,]+$").exec(this.slotId)?.[0]?.trim()?.split(",")?.map((x) => parseInt(x)) ?? []);
                    this.showAC = true;
                    this.contextAC = resultsAC.contextAC;
                    this.tokenAC = resultsAC.tokenAC;
  
                    this.$nextTick(() => {
                        const ac = this.$refs.AC as InstanceType<typeof AutoCompletion>;
                        if (ac) {
                            ac.updateAC(this.frameId, this.tokenAC, this.contextAC);
                        }
                    });
                }
            }
        },


        // Event callback equivalent to what would happen for a blur event callback 
        // (the spans don't get focus anymore because the containg editable div grab it)
        onLoseCaret(keepIgnoreKeyEventFlagOn?: boolean): void {
            // Before anything, we make sure that the current frame still exists,
            // and that our slot still exists.  If we shouldn't exist any more, we should
            // just do nothing and exit quietly:
            if(this.appStore.frameObjects[this.frameId] != undefined && retrieveSlotFromSlotInfos(this.coreSlotInfo)){
                if(!this.debugAC) {
                    this.showAC = false;
                    this.acRequested = false;
                    if((this.appStore.bypassEditableSlotBlurErrorCheck && !keepIgnoreKeyEventFlagOn) || this.appStore.isSelectingMultiSlots){
                        this.appStore.setEditableFocus(
                            {
                                ...this.coreSlotInfo,
                                focused: false,
                            }
                        );
                    }
                    else{
                        this.appStore.validateSlot(
                            {
                                ...this.coreSlotInfo,
                                code: this.getSlotContent().replace(/\u200B/g, "").trim(),
                                initCode: this.initCode,
                                isFirstChange: this.isFirstChange,
                            }   
                        );
                    }
                    //reset the flag for first code change
                    this.isFirstChange = true;

                    // As we leave a slot, we reset the slot cursor infos EXCEPT when the keyboard event is ignored
                    // or when we are doing multislot selection
                    if(!this.appStore.ignoreKeyEvent && !this.appStore.isSelectingMultiSlots){
                        this.appStore.setSlotTextCursors(undefined, undefined);
                    }
                    
                    if(!keepIgnoreKeyEventFlagOn){
                        this.appStore.ignoreKeyEvent = false;
                    }

                    // And we hide the error popover. Note that we do it programmatically as it seems the focus trigger on popover isn't working in our configuration
                    (this.$refs.errorPopover as InstanceType<typeof BPopover>)?.$emit("close");
                }
            }
        },

        onUDKeyDown(event: KeyboardEvent) {
            // We may still have the focus even when not logically editing, so we want to
            // avoid handling the keypress in this case; let the code in Commands handle it
            // which moves the frame cursor up and down:
            if (!this.appStore.isEditing) {
                return;
            }
            
            this.appStore.isSelectingMultiSlots = false; // reset the flag
            const isArrowUp = (event.key == "ArrowUp");
           
            // Check if we can reach another VISUAL line in a comment (this method returns false if we're not in a comment frame)
            const canReachAnotherCommentLine = checkCanReachAnotherCommentLine((this.frameType == AllFrameTypesIdentifier.comment), isArrowUp, document.getElementById(getLabelSlotUID(this.coreSlotInfo)) as HTMLSpanElement); /*&& isCommentFrame && ((isArrowUp && slotContentToCursor.includes("\n")) || (!isArrowUp && slotContentAfterCursor.includes("\n")))*/
           
            // When no key modifier is hit, we either navigate in A/C or leave the frame or move to another line of text for comments, depending on the context
            // Everything is handled manually except when navigating within a comment.
            if(!(event.ctrlKey || event.shiftKey || event.metaKey)){
                // If the AutoCompletion is on we just browse through it's contents
                // The `results` check, prevents `changeSelection()` when there are no results matching this token
                // And instead, since there is no AC list to show, moves to the next slot
                if(this.showAC && this.acRequested && (this.$refs.AC as any)?.areResultsToShow()) {
                    event.stopImmediatePropagation();
                    event.stopPropagation();
                    event.preventDefault();
                    (this.$refs.AC as any).changeSelection((isArrowUp)?-1:1);
                }
                else if(canReachAnotherCommentLine){
                    // We are in a comment, and in a line that is VISUALLY (in the browser) not the first (if we go up) or not the last (if we go down):
                    // we let the browser handle the selection change nativately
                    return;
                }
                // Else we move the caret
                else {  
                    event.stopImmediatePropagation();
                    event.stopPropagation();
                    event.preventDefault();
                    // In any case the focus is lost, and the caret is shown (visually below by default)
                    this.onLoseCaret();
                    //If the up arrow is pressed you need to move the caret as well.
                    if(isArrowUp) {
                        this.appStore.changeCaretPosition(event.key);
                    }
                    else{
                        // Restore the caret visibility
                        this.appStore.frameObjects[this.appStore.currentFrame.id].caretVisibility = this.appStore.currentFrame.caretPosition;
                    }

                    // And check for precompiled errors on the frame, and TP errors on the whole code
                    checkCodeErrors(this.frameId);

                    // Make sure there is no longer a selection
                    this.appStore.setSlotTextCursors(undefined, undefined);
                    document.getSelection()?.removeAllRanges();
                }
            }
            else if(event.shiftKey && canReachAnotherCommentLine){
                // We are in a comment and do a selection using up or down keys that won't lead outside the comment, we leave the browser handle it natively
                return;
            }
        },
        
        onEscKeyUp(event: KeyboardEvent) {
            // If the AC is loaded we want to close it with an ESC and stay focused on the editableSlot
            if(this.showAC && this.acRequested) {
                event.preventDefault();
                event.stopPropagation();
                this.showAC = this.debugAC;
                this.acRequested = false;
                return;
            }

            // If AC is not loaded, we want to take the focus from the slot
            if(this.appStore.isEditing){
                (document.activeElement as HTMLElement).blur();
                this.appStore.isEditing = false;
            }
        },
        
        getSelectedACItem() : Element | null {
            // As commas are special tokens in HTML selectors syntax, we need to parse them so the selector matches the element id correctly (our slot IDs may have commas).
            return document.querySelector("#" + this.$el.id.replaceAll(",","\\,") + " ." + scssVars.acItemClassName + "." + scssVars.acItemSelectedClassName );
        },

        onTabKeyDown(event: KeyboardEvent){
            // We replicate the default browser behaviour when tab is pressed AND we're not having AC on, otherwise just do nothing
            // (the default behaviour doesn't work at least on Windows+Chrome)
            if(!(this.showAC && this.acRequested && this.getSelectedACItem())) {
                // First move the cursor to the correct end of the slot
                const goToNextSlot = !event.shiftKey;
                const newCursorPosition = (goToNextSlot) ? this.code.length : 0;
                const newSlotCursorInfos: SlotCursorInfos = {cursorPos: newCursorPosition, slotInfos: this.coreSlotInfo};
                this.appStore.setSlotTextCursors(newSlotCursorInfos, newSlotCursorInfos);
                setDocumentSelection(newSlotCursorInfos, newSlotCursorInfos);
                // Then trigger an arrow key event
                document.getElementById(getFrameLabelSlotsStructureUID(this.frameId, this.labelSlotsIndex))?.dispatchEvent(
                    new KeyboardEvent("keydown", {
                        key: (goToNextSlot) ? "ArrowRight" : "ArrowLeft",
                    })
                );
                this.appStore.ignoreKeyEvent = true;
            }
            event.preventDefault();
            event.stopPropagation();
        },

        onEnterOrTabKeyUp(event: KeyboardEvent){
            // Ignore tab events
            if(event.key === "Tab") {
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            // If the AC is loaded we want to select the AC suggestion the user chose and stay focused on the editableSlot
            if(this.showAC && this.acRequested && this.getSelectedACItem()) {
                event.preventDefault();
                event.stopPropagation();
                // We set the code to what it was up to the point before the token, and we replace the token with the selected Item
                this.acItemClicked(this.getSelectedACItem()?.id??"");
            }
            // For Enter, if AC is not loaded or no selection is available, we want to take the focus out the slot,
            // except for comment frame that will generate a line return when Control/Shift is combined with Enter
            else {
                if(this.frameType == AllFrameTypesIdentifier.comment && (event.shiftKey || event.ctrlKey)){
                    const isAnchorBeforeFocus = (getSelectionCursorsComparisonValue()??0) <= 0;
                    const focusSlotCursorInfos = this.appStore.focusSlotCursorInfos as SlotCursorInfos;
                    const startSlotCursorInfos = (isAnchorBeforeFocus) ? this.appStore.anchorSlotCursorInfos as SlotCursorInfos : focusSlotCursorInfos;
                    const endSlotCursorInfos = (isAnchorBeforeFocus) ? focusSlotCursorInfos : this.appStore.anchorSlotCursorInfos as SlotCursorInfos;
                    const inputSpanField = document.getElementById(getLabelSlotUID(focusSlotCursorInfos.slotInfos)) as HTMLSpanElement;
                    // When we add the line return, we check that if we are adding it at the end of the comment, we double that line return:
                    // span do not render a line break that isn't followed by something. So we use this workaround to visually show a line return.
                    // (The text cursor will never be able to be past that terminating line feed so it doesn't offset the navigation from the user's point of view)
                    const inputSpanFieldContent = (inputSpanField.textContent ?? "").substring(0, startSlotCursorInfos.cursorPos)
                        + "\n" 
                        + ((endSlotCursorInfos.cursorPos == (inputSpanField.textContent??"").length) ? "\n" : (inputSpanField.textContent ?? "").substring(endSlotCursorInfos.cursorPos));
                    this.appStore.setFrameEditableSlotContent(
                        {
                            ...focusSlotCursorInfos.slotInfos,
                            code: inputSpanFieldContent,
                            initCode: this.initCode,
                            isFirstChange: this.isFirstChange,
                        }
                    ).then(() => {
                        const slotCursorInfos = {...focusSlotCursorInfos, cursorPos: startSlotCursorInfos.cursorPos + 1};
                        setDocumentSelection(slotCursorInfos, slotCursorInfos);
                    }); 
                }
                else{
                    // Same as hitting arrow down
                    const slotCursorInfo: SlotCursorInfos = {slotInfos: this.coreSlotInfo, cursorPos: this.code.length};
                    this.appStore.setSlotTextCursors(slotCursorInfo, slotCursorInfo);
                    document.getElementById(getFrameLabelSlotsStructureUID(this.frameId, this.labelSlotsIndex))?.dispatchEvent(
                        new KeyboardEvent("keydown", {
                            key: "ArrowDown",
                        })
                    );
                }
            }
            this.showAC = this.debugAC;
            this.acRequested = false;
        },

        onKeyDown(event: KeyboardEvent){
            // Note: onKeyDown should only be for keyboard shortcuts,
            // like ctrl-space or arrow keys or tab, etc.
            // Any text input is now handled by the input event because that properly
            // handles behaviours such as IME and composition shortcuts (e.g. alt + keys).

            // We capture the key shortcut for opening the a/c
            if((event.metaKey || event.ctrlKey) && event.key == " "){
                this.acRequested = true;
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
            }

            // Manage the handling of home/end and page up/page down keys
            if(["PageUp", "PageDown", "Home", "End"].includes(event.key)){
                this.handleFastUDNavKeys(event);
                return;
            }

            // We already handle some keys separately, so no need to process any further (i.e. deletion)
            // We can just discard any keys with length > 0
            if(event.key.length > 1 || event.ctrlKey || event.metaKey || event.altKey){
                // Do not updated the a/c if arrows up/down, escape and enter keys are hit because it will mess with navigation of the a/c
                if(!["ArrowUp", "ArrowDown","Enter","Escape"].includes(event.key)) {
                    this.$nextTick(() => {
                        this.updateAC();
                    });
                }
                return;
            }
            
            // All other input events (i.e. typing, no modifiers) are handled by
            // processInput instead.
        },
        
        // Removes the given string which has just been entered as part of an input event,
        // and puts the cursor back before the added-then-removed string
        removeLastInput(toRemove: string) {
            // We need to find the input in the slot, remove it, and move the cursor back:
            const spanElement = (document.getElementById(this.UID) as HTMLSpanElement);
            // We need to know the current cursor pos, because inputString might appear in the slot
            // multiple times; the one we want to remove should be the one just before the cursor:
            const cursorPos = getTextStartCursorPositionOfHTMLElement(spanElement);
            let content = spanElement.textContent ?? "";
            // Check the content is present just before the cursor:
            if (content.length >= toRemove.length
                && content.length >= cursorPos
                && content.substring(cursorPos - toRemove.length, cursorPos) == toRemove) {
                // Remove the content and move the cursor backwards:
                spanElement.textContent = content.substring(0, cursorPos - toRemove.length) + content.substring(cursorPos);
                if (spanElement.textContent.length == 0) {
                    spanElement.textContent = "\u200B";
                }
                const newCursorInfo = {slotInfos: this.coreSlotInfo, cursorPos: cursorPos - toRemove.length};
                this.appStore.setSlotTextCursors(newCursorInfo, newCursorInfo);
                setDocumentSelection(newCursorInfo, newCursorInfo);
            }
            else {
                // Don't think this should ever happen; for now, log:
                console.trace("Didn't find \"" + toRemove + "\" before " + cursorPos + " within content: \"" + content + "\"");
            }
        },

        doArrowRightNextTick() {
            this.$nextTick(() => {
                document.getElementById(getFrameLabelSlotsStructureUID(this.frameId, this.labelSlotsIndex))?.dispatchEvent(
                    new KeyboardEvent("keydown", {
                        key: "ArrowRight",
                    })
                );
            });
        },
        
        // Returns a slot refactor call to schedule on nextTick after scheduling caret set 
        processInput(inputString: string) : undefined | (() => void) {
            // If the input string is empty then there is nothing we need to do:
            if (!inputString) {
                return;
            }
            // So in general, there's three different ways input occurs:
            // 1. One is a plain key press, e.g. they press "f" on UK layout.  This arrives as a single input event.
            // 2. Another is a one-off key combination, e.g. pressing alt-5 enters "[" on German layout.  This also arrives as a single input event.
            // 3. The last is IME; here, the user enters some text (like abc) but then they can select (potentially
            //    using a keypress) to substitute with a particular non-ASCII string like 啊不吃 if you press 1 after abc).
            // The browser generally has support for doing IME properly.  In a contenteditable span, it should
            // enter the original English (abc) and then substitute it for the non-ASCII at the right point.
            // So our plan here is as follows:
            // - If there is a multi-slot selection when an input event occurs, we must perform a delete first (TODO!).
            // - In general, we let the native input event process fully.
            // - Once input has occurred and finished, we check if we need to reprocess the slots.  This is especially
            //   with operators and brackets which can create new slots.
            // - Delete and backspace are not input events so they happen elsewhere.
            
            const stateBeforeChanges = cloneDeep(this.appStore.$state);
            
            const inputSpanField = document.getElementById(this.UID) as HTMLSpanElement;
            const inputSpanFieldContent = inputSpanField.textContent ?? "";
            const currentSlot = retrieveSlotFromSlotInfos(this.coreSlotInfo) as BaseSlot;
            const parentSlot = retrieveParentSlotFromSlotInfos(this.coreSlotInfo);
            const nextSlotInfos = getFlatNeighbourFieldSlotInfos(this.coreSlotInfo, true, true);
  
            // Note: this selection is remembered from before the input we are processing, so
            // will be different to where the cursor actually is, hence we generally add inputString.length
            // to selectionEnd, below.
            const hasTextSelection = !!this.appStore.mostRecentSelectedText;
            let refactorFocusSpanUID = this.UID; // by default the focus stays where we are
            const cursorPos = (getTextStartCursorPositionOfHTMLElement(inputSpanField) ?? inputString.length) - inputString.length;
            
            // Our position will no longer have a selection, it's just us at the given cursor pos:
            this.appStore.setSlotTextCursors({slotInfos: this.coreSlotInfo, cursorPos: cursorPos + inputString.length}, {slotInfos: this.coreSlotInfo, cursorPos: cursorPos + inputString.length});

            const isAtEndOfSlot = !hasTextSelection && cursorPos + inputString.length >= inputSpanFieldContent.length;
            const isAtEndOfLastSlot = nextSlotInfos == null && isAtEndOfSlot;


            // If the frame is a variable assignment frame and we are in a top level slot of the left hand side editable slot,
            // pressing "=" or space keys move to RHS editable slot (but we allow the a/c to be activated)
            // Note: because 1) key code value is deprecated and 2) "=" is coded a different value between Chrome and FF, 
            // we explicitly check the "key" property value check here as any other key could have been typed
            if(this.labelSlotsIndex === 0 && this.slotId.indexOf(",") == -1 && !hasTextSelection  &&
                (inputString === "=" || inputString === " ") && this.frameType === AllFrameTypesIdentifier.varassign){
                // Cancel the input anywhere in the slot:
                this.removeLastInput(inputString);
                // If at the end of the last slot on LHS, treat it as overtyping and move to RHS:
                if (isAtEndOfLastSlot) {
                    this.doArrowRightNextTick();
                }
                return;
            }
            // If the frame is a function definition and we are in the name slot,
            // pressing "(" or space keys move to the next slot (between the brackets)
            else if(this.labelSlotsIndex === 0 && !hasTextSelection  &&
                (inputString === "(" || inputString === " ") && this.frameType === AllFrameTypesIdentifier.funcdef){
                this.removeLastInput(inputString);
                if (isAtEndOfLastSlot) {
                    this.doArrowRightNextTick();
                }
                return;
            }
            // If the frame is an import frame, pressing space will automatically add the "as" operator when it makes sense to do so (see details below),
            // when we press space and we are just before  an "as", we go to the next slot.
            // In other cases and anywhere for "from... import" frames, pressing space will result in no action.
            // To simplify, if text is selected, pressing space does nothing.
            else if (inputString === " " && this.frameType === AllFrameTypesIdentifier.import){
                this.removeLastInput(inputString);
                
                // Case 1) we are in front of "as", we move to next editable slot (we can assume we have a flat structure, brackets and quotes are not allowed in imports...)
                if(!hasTextSelection && this.appStore.frameObjects[this.frameId].labelSlotsDict[0].slotStructures.operators.length > parseInt(this.slotId) && (this.appStore.frameObjects[this.frameId].labelSlotsDict[0].slotStructures.operators[parseInt(this.slotId)] as BaseSlot).code == "as"){
                    this.doArrowRightNextTick();
                }
                // Case 2) detect if we should add an "as" or do nothing. We can add an as when we are at the end of a slot that is not empty (just to avoid doing something when people 
                // wrongly press space thinking they want to mark a separation from a comma), and not preceded by "as"  (followed is tackled above),
                else if(isAtEndOfLastSlot && (this.slotId == "0" || ((this.appStore.frameObjects[this.frameId].labelSlotsDict[0].slotStructures.operators[parseInt(this.slotId) - 1] as BaseSlot).code != "as"))){
                    // Insert the operator and empty field
                    this.appStore.frameObjects[this.frameId].labelSlotsDict[0].slotStructures.operators.splice(parseInt(this.slotId), 0, {code:"as"});
                    this.appStore.frameObjects[this.frameId].labelSlotsDict[0].slotStructures.fields.splice(parseInt(this.slotId) + 1, 0, {code:""});
                    // Set focus in the next slot (move right)
                    this.$nextTick(() => {    
                        this.appStore.leftRightKey({key: "ArrowRight"})
                            // In order to get undo/redo dealing with the change of slot structure properly
                            .then(() => this.appStore.saveStateChanges(stateBeforeChanges));    
                    });
                }
                return;
            }
            else if (inputString === " " && this.frameType === AllFrameTypesIdentifier.fromimport){
                this.removeLastInput(inputString);
            }
            // We also prevent start trailing spaces on all slots except comments and string content, to avoid indentation errors
            else if(inputString === " " && this.frameType !== AllFrameTypesIdentifier.comment && this.slotType != SlotType.string && cursorPos == 0){
                this.removeLastInput(inputString);
            }
            // On comments, we do not need multislots and parsing any code, we just let any key go through
            else if(this.frameType == AllFrameTypesIdentifier.comment){
                // Do nothing
            }
            // Finally, we check the case an operator, bracket or quote has been typed and the slots within this frame need update
            // First we check closing brackets or quote as they have a specifc behaviour, then keep working out the other things
            else if((closeBracketCharacters.includes(inputString) && !isFieldStringSlot(currentSlot)) || (isFieldStringSlot(currentSlot) && stringQuoteCharacters.includes(inputString))){
                // Closing bracket / quote: key hits are ignored except for escaping a quote in a string or when making a multi-dimensional expression*
                // However, when no text is highlighted and we are just before that same closing bracket / quote (no text between text cursor and bracket)
                // we move the text cursor in the next slot, as we consider the user closed an existing already closed bracket / quote.
                //(*) see later in this method
                let shouldMoveToNextSlot : boolean;
                let checkMultidimBrackets = !hasTextSelection;
                // Checking if we are escaping the quote used for this string (i.e. we are after an escaping \, and there is no quote following the caret)
                const isEscapingString = isFieldStringSlot(currentSlot) && cursorPos > 0 && (getNumPrecedingBackslashes(inputSpanFieldContent, cursorPos) % 2) == 1
                    && ((cursorPos + inputString.length < inputSpanFieldContent.length && inputSpanFieldContent[cursorPos + inputString.length]!= inputString) || isAtEndOfSlot);
                if(isEscapingString){
                    // Just let the input occur:
                    return;
                }
                if(isFieldStringSlot(currentSlot)){
                    // Check for string quotes first, note that contrary to brackets, trailing spaces in a string are meaningful
                    shouldMoveToNextSlot = isAtEndOfSlot 
                        && (currentSlot as StringSlot).quote == inputString;
                    if(!shouldMoveToNextSlot){
                        if ((currentSlot as StringSlot).quote != inputString) {
                            // If a quote that is NOT the same as this slot's quote was typed, we can add it.
                            // So, we just don't do anything special in that situation.
                            return;
                        }
                    }
                    checkMultidimBrackets = false;
                }
                else{
                    // It's not a string, check for bracket
                    const parentBracketSlot = (parentSlot && isFieldBracketedSlot(parentSlot)) ? parentSlot as SlotsStructure : undefined;
                    shouldMoveToNextSlot = inputSpanFieldContent.substring(cursorPos).replace(/\u200B/g, "").trim() == inputString
                        // make sure we are inside a bracketed structure and that the opening bracket is the counterpart of the key value (closing bracket)
                        && parentBracketSlot != undefined && parentBracketSlot.openingBracketValue == getMatchingBracket(inputString, false)
                        && !hasTextSelection;
                    checkMultidimBrackets = !shouldMoveToNextSlot && !hasTextSelection;
                }
                
                // We definitely don't want to insert the closing bracket
                // whether we are in the middle or end of the slot:
                if (!checkMultidimBrackets) {
                    this.removeLastInput(inputString);
                }
                
                // If we are at the end, we treat it as overtyping:
                if(shouldMoveToNextSlot){
                    // focus the subslot following the closing bracket, in the next tick
                    this.doArrowRightNextTick();
                    return;
                }

                if(checkMultidimBrackets){
                    // Check the case of a multi-dimensional expression 
                    //(*) multi-dimensional expression case: say we have this expression: n[3] --> 
                    // case 1: typing "]" right after "n" will generate "[|]" (| is the text cursor)
                    // case 2: typing "]" right after "[" will generate "|][" (| is the text cursor)
                    // Note that if there is a text selection, we wrap the selection in the appropriate added brackets
                    if(inputSpanFieldContent.substring(cursorPos + inputString.length).trim().length == 0 && nextSlotInfos != undefined 
                        && isFieldBracketedSlot(retrieveSlotFromSlotInfos(nextSlotInfos) as FieldSlot) && (retrieveSlotFromSlotInfos(nextSlotInfos) as SlotsStructure).openingBracketValue == getMatchingBracket(inputString, false)){
                        // Case 1 (at the end of the slot, before a bracketed slot structure of the same bracket symbol opening counterpart than typed closing bracket)
                        inputSpanField.textContent = inputSpanFieldContent.substring(0, cursorPos) + getMatchingBracket(inputString, false) + this.appStore.mostRecentSelectedText + inputString;
                        //const newSlotCursorInfos: SlotCursorInfos = {slotInfos: this.coreSlotInfo, cursorPos: cursorPos + 1}; // We move past the first inserted opening bracket
                        //this.appStore.setSlotTextCursors(newSlotCursorInfos, newSlotCursorInfos);
                    }
                    else if(inputSpanFieldContent.substring(cursorPos + inputString.length).trim().length > 0 && this.coreSlotInfo.slotId.includes(",") &&
                        isFieldBracketedSlot(parentSlot as FieldSlot) && (parentSlot as SlotsStructure).openingBracketValue == getMatchingBracket(inputString, false)){
                        // Case 2 (in a bracketed structure, that is NOT empty, and of the same bracket symbol opening counterpart than typed closing bracket)
                        inputSpanField.textContent = inputSpanFieldContent.substring(0, cursorPos) + inputString + getMatchingBracket(inputString, false) + inputSpanFieldContent.substring(cursorPos + inputString.length);
                        const newSlotCursorInfos: SlotCursorInfos = {slotInfos: this.coreSlotInfo, cursorPos: cursorPos + 2}; // We move after the first inserted opening bracket
                        this.appStore.setSlotTextCursors(newSlotCursorInfos, newSlotCursorInfos);
                        setDocumentSelection(newSlotCursorInfos, newSlotCursorInfos);
                    }
                    else {
                        // We're not doing multidim brackets, just remove the input:
                        this.removeLastInput(inputString);
                        return;
                    }
                }
                else if (!isFieldStringSlot(currentSlot)) {
                    return;
                }
            }
            else{
                // Check that if we are in a string slot, all characters but the quote of that string are allowed
                // note: string quotes logic is already handled by checking the closing brackets/quotes above
                if(isFieldStringSlot(currentSlot)) {
                    if((currentSlot as StringSlot).quote == inputString){
                        this.removeLastInput(inputString);
                    }
                    return;
                }
                else{
                    // Brackets, quotes or operators have been typed. For operators:
                    // a symbol style operator is either one by itself or the second character of one operator (e.g. "=="),
                    // a text style operator is detected in the slot (eg " and "), we split the slot to insert that operator
                    // In Python, "!" is NOT an operator, but "!=" is. Therefore we need to deal with "!" here if it composes "!=".
                    let textualOperator  = ""; // we need this to be able to find out which textual operator we have found
                    let potentialOutput = inputSpanFieldContent.substring(0, cursorPos) + inputString + inputSpanFieldContent.substring(cursorPos);
                    const isSymbolicOperator = operators.includes(inputString);
                    const isBang = (inputString === "!");
                    const isBracket = openBracketCharacters.includes(inputString);
                    const isStringQuote = stringQuoteCharacters.includes(inputString);
                    if(isSymbolicOperator 
                    || isBang
                    || keywordOperatorsWithSurroundSpaces
                        // Remove "as" operator from the list, we can't add it textually in import and any other frames do not use this operator
                        .filter((operator) => operator != " as ")
                        .some((operator) => {
                            textualOperator = operator.trim();
                            return (potentialOutput.includes(operator) || potentialOutput.startsWith(textualOperator + " "));
                        })
                    || isBracket
                    || isStringQuote
                    ){
                        // If we are in the LHS of a function definition or of a for, then we just don't allow the operator, bracket or quotes.
                        // For a for though, we allow comma as we may have something as "for a,b in xxx".
                        // For imports, we only allow comma and * (comma in import frame, coma and * in RHS from (* isn't treated as operator in this case)).
                        let forbidOperator = [AllFrameTypesIdentifier.funcdef, AllFrameTypesIdentifier.for].includes(this.frameType)
                            && this.labelSlotsIndex == 0;
                        if(forbidOperator && this.frameType == AllFrameTypesIdentifier.for && inputString == ","){
                            forbidOperator = false;
                        }
                        let planningToInsertKey = !forbidOperator;
                        if(!forbidOperator && (this.frameType == AllFrameTypesIdentifier.fromimport || this.frameType == AllFrameTypesIdentifier.import)){
                            // If we're in some import frame, we check we match the rule mentioned above
                            planningToInsertKey = (this.frameType == AllFrameTypesIdentifier.fromimport && (inputString == "*" || inputString == "," || inputString == ".")) 
                                || (this.frameType == AllFrameTypesIdentifier.import && (inputString == "," || inputString == "."));
                        }
                        if(!forbidOperator && planningToInsertKey){
                            if(isBracket || isStringQuote){
                                // When an opening bracket is typed and there is no text highlighted, we check if we need to "skipped" that input: if we are at the end of an editable slot, and the next slot is a bracketed structure
                                // that starts with the same opening bracket that the typed one, we move to the next slot rather than adding a new bracketed structure.
                                // (at this point of the code, we know we're not in a String slot)
                                if(isBracket && nextSlotInfos && nextSlotInfos.slotType == SlotType.bracket && !hasTextSelection){
                                    const isAtEndOfSlot = inputSpanFieldContent.substring(cursorPos + inputString.length).replace(/\u200B/g, "").trim().length == 0;
                                    const areOpeningBracketsEqual = (retrieveSlotFromSlotInfos(nextSlotInfos) as SlotsStructure).openingBracketValue == inputString;
                                    if(isAtEndOfSlot && areOpeningBracketsEqual){
                                        this.removeLastInput(inputString);
                                        // Move to next slot, as it is a bracketed structure, we need to get into the first child slot of that structure
                                        this.doArrowRightNextTick();
                                        return;
                                    }
                                }
                                // We set the text and let the refactoring turn it into the right bracketed structure:
                                let sel = this.appStore.mostRecentSelectedText;
                                // This does have a slight disadvantage that any smart quotes the user meant to insert
                                // (e.g. inside a string literal) will get mangled, but I think we just live with that:
                                sel = sel.replace(new RegExp(`[${UIDoubleQuotesCharacters[0]}${UIDoubleQuotesCharacters[1]}]`, "g"), STRING_DOUBLEQUOTE_PLACERHOLDER);
                                sel = sel.replace(new RegExp(`[${UISingleQuotesCharacters[0]}${UISingleQuotesCharacters[1]}]`, "g"), STRING_SINGLEQUOTE_PLACERHOLDER);
                                
                                inputSpanField.textContent = (inputSpanField?.textContent?.substring(0, cursorPos) ?? "") +
                                    ((isStringQuote) ? ((inputString == "\"") ? STRING_DOUBLEQUOTE_PLACERHOLDER : STRING_SINGLEQUOTE_PLACERHOLDER) : inputString) +
                                    sel +
                                    ((isBracket) ? getMatchingBracket(inputString, true) : ((inputString == "\"") ? STRING_DOUBLEQUOTE_PLACERHOLDER : STRING_SINGLEQUOTE_PLACERHOLDER)) +
                                    (inputSpanField?.textContent?.substring(cursorPos + inputString.length) ?? "");
                                const newSlotCursorInfos: SlotCursorInfos = {slotInfos: this.coreSlotInfo, cursorPos: cursorPos + 1};
                                refactorFocusSpanUID = inputSpanField.id;
                                setDocumentSelection(newSlotCursorInfos, newSlotCursorInfos);
                                this.appStore.setSlotTextCursors(newSlotCursorInfos, newSlotCursorInfos);
                            }               
                        }
                    }
                }
            }
            // The logic is as such, we handle the insertion in the slot (with adequate adaptation if needed, see above)
            // let the parsing and slot factorisation do the checkup later
            // (we handle the insertion even if there is specific adapation because in the call to emit, the DOM has not updated)
            return () => this.$emit(CustomEventTypes.requestSlotsRefactoring, refactorFocusSpanUID, stateBeforeChanges);
        },

        handleFastUDNavKeys(event: KeyboardEvent){
            // If we are in a comment, we let the browser handling the key events.
            // Otherwise, the following rules apply:
            // Home/End move the text cursor to the start/end of the "block" unit of the code, for example the start of a slot bracketed structure
            // PageUp/PageDown: do nothing
            if(this.frameType == AllFrameTypesIdentifier.comment){
                return;
            }
            else if(event.key == "Home" || event.key == "End"){
                // Find which bounds we should target (which bound in the current level based on the key, and also the bound based on current text cursor position)
                const moveToHome = (event.key === "Home");
                const isSelecting = event.shiftKey;
                const parentSlotId = getSlotParentIdAndIndexSplit(this.coreSlotInfo.slotId).parentId;
                // First focus: it will change to one end of the current level depending on the direction we're going
                const newFocusSlotId = (moveToHome) 
                    ? ((parentSlotId.length > 0) ? (parentSlotId + ",0") : "0")
                    : ((parentSlotId.length > 0) ? (parentSlotId + "," + ((retrieveSlotFromSlotInfos({...this.coreSlotInfo, slotId: parentSlotId}) as SlotsStructure).fields.length -1)) : ("" + (this.appStore.frameObjects[this.frameId].labelSlotsDict[this.coreSlotInfo.labelSlotsIndex].slotStructures.fields.length - 1)));
                const newFocusSlotType = evaluateSlotType(retrieveSlotFromSlotInfos({...this.coreSlotInfo, slotId: newFocusSlotId}));
                const newFocusSlotCoreInfo =  {...this.coreSlotInfo, slotId: newFocusSlotId, slotType: newFocusSlotType};
                const newFocusCursorPos = (moveToHome) ? 0 : (retrieveSlotFromSlotInfos(newFocusSlotCoreInfo) as BaseSlot).code.length;
                // Then anchor: it will either keep the same if we are doing a selection, or change to the same as focus if we are not.
                const newAnchorSlotCursorInfo: SlotCursorInfos = (isSelecting) ? this.appStore.anchorSlotCursorInfos as SlotCursorInfos: {slotInfos: newFocusSlotCoreInfo, cursorPos: newFocusCursorPos}; 
                // Set the new bounds
                this.$nextTick(() => {
                    document.getElementById(getLabelSlotUID(this.appStore.focusSlotCursorInfos?.slotInfos as SlotCoreInfos))?.dispatchEvent(new Event(CustomEventTypes.editableSlotLostCaret));
                    document.getElementById(getLabelSlotUID(newFocusSlotCoreInfo))?.dispatchEvent(new Event(CustomEventTypes.editableSlotGotCaret));
                    setDocumentSelection(newAnchorSlotCursorInfo, {slotInfos: newFocusSlotCoreInfo, cursorPos: newFocusCursorPos});
                    this.appStore.setSlotTextCursors(newAnchorSlotCursorInfo, {slotInfos: newFocusSlotCoreInfo, cursorPos: newFocusCursorPos});
                });
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
            }
        },

        onCodePaste(event: CustomEvent) {
            this.onCodePasteImpl(event.detail);
        },
        
        onCodePasteImpl(content : string) {
            // Save the current state
            const stateBeforeChanges = cloneDeep(this.appStore.$state);

            // Pasted code is done in several steps:
            // 0) clean up the content
            // 1) correct the code literal if needed (for example pasting "(a" will result in pasting "(a)")
            // 2) add the corrected code at the current location 
            // 3) set the text cursor at the right location       
            // 4) check if the slots need to be refactorised
            // (note: we do not make text treatment for comment frames, except for transforming \r\n to \n)
            const isCommentFrame = (this.frameType == AllFrameTypesIdentifier.comment);
            const inputSpanField = document.getElementById(this.UID) as HTMLSpanElement;
            const {selectionStart, selectionEnd} = getFocusedEditableSlotTextSelectionStartEnd(this.UID);
            if(inputSpanField && inputSpanField.textContent != undefined){ //Keep TS happy
                // part 0 : the code copied from the interface contains unwanted CRLF added by the browser between the spans
                // We want to clear that, we replace them by spaces to avoid issues with keyword operators, except for
                // - before/after the content (we trime before doing anything)
                // - surrounding the string (between the styled quotes) where we replace them by empty to preseve the string content
                // we also then replace the styled quotes appropriately
                // TODO: Strype is too permissive at the moment with copy/paste: we can't detect the difference between what comes from us and outside
                // and if the line returns are line returns or coming from the UI (slots). For the moment, do as if we can only work from the UI.
                let cursorOffset = 0;
                let correctedPastedCode = "";
                if(isCommentFrame){
                    correctedPastedCode = content.replaceAll(/(\r\n)/g, "\n");
                }
                else{
                    content = content.trim();
                    content = content
                        .replaceAll(new RegExp(UIDoubleQuotesCharacters[0]+"\r?\n","g"), stringDoubleQuoteChar)
                        .replaceAll(new RegExp("(\r)?\n"+UIDoubleQuotesCharacters[1],"g"), stringDoubleQuoteChar)
                        .replaceAll(new RegExp(UISingleQuotesCharacters[0]+"\r?\n","g"), stringSingleQuoteChar)
                        .replaceAll(new RegExp("\r?\n"+UISingleQuotesCharacters[1],"g"), stringSingleQuoteChar)
                        .replaceAll(/\r?\n/g,"");
                
                    // part 1 - note that if we are in a string, we just copy as is except for the quotes that must be parsed
                    if(this.slotType == SlotType.string){
                        const regex = (this.stringQuote =="\"")
                            ? /(^|[^\\])(")/g
                            : /(^|[^\\])(')/g;
                        correctedPastedCode = content.replaceAll(regex, (match) => {
                            cursorOffset--;
                            return match[0]??"";
                        });
                    }
                    else{
                        const specifyFromImportFrame = (this.frameType == AllFrameTypesIdentifier.fromimport) ? AllFrameTypesIdentifier.fromimport : undefined;
                        const {slots: tempSlots, cursorOffset: tempcursorOffset} = parseCodeLiteral(content, {frameType: specifyFromImportFrame});
                        const parser = new Parser();
                        correctedPastedCode = parser.getSlotStartsLengthsAndCodeForFrameLabel(tempSlots, 0).code;
                        cursorOffset = tempcursorOffset;

                        // We do a small check here to avoid as much as we can invalid pasted code inside imports.
                        // If we are in an import or from...import frame, we do nothing upon the detection of a string, 
                        // a bracket structure or an operator different than "," and "." and, for import frame only, "as".
                        let pastedInvalidCode = false; 
                        if(this.frameType == AllFrameTypesIdentifier.import || this.frameType == AllFrameTypesIdentifier.fromimport){
                            if(tempSlots.fields.some((field) => isFieldStringSlot(field) || isFieldBracketedSlot(field))){
                                pastedInvalidCode = true;
                            }
                            else{
                                const isSimpleImport = (this.frameType == AllFrameTypesIdentifier.import);
                                if(tempSlots.operators.some((operator) => operator.code != "," && operator.code != "." && (!isSimpleImport || (isSimpleImport && operator.code != "as")))){
                                    pastedInvalidCode = true;
                                }
                            }
                        } 
                        if(pastedInvalidCode){
                            // Show an error message to the user, and do nothing else.
                            const msg = cloneDeep(MessageDefinitions.InvalidPythonParsePaste);
                            const msgObj = msg.message as FormattedMessage;
                            msgObj.args[FormattedMessageArgKeyValuePlaceholders.error.key] = msgObj.args.errorMsg.replace(FormattedMessageArgKeyValuePlaceholders.error.placeholderName, this.$i18n.t("errorMessage.unexpectedCharsPython") as string);

                            //don't leave the message for ever
                            this.appStore.showMessage(msg, 5000);
                            return;
                        }
                    }
                }
                // part 2
                inputSpanField.textContent = inputSpanField.textContent.substring(0, selectionStart)
                        + correctedPastedCode
                        + inputSpanField.textContent.substring(selectionEnd);
                // part 3: the orignal cursor position is at the end of the copied string, and we add the offset that is generated while parsing the code
                // so that for example when we copied a non terminated code, the cursor will stay inside the non terminated bit.
                const newPos = selectionStart + correctedPastedCode.length + cursorOffset;
                this.appStore.setSlotTextCursors({slotInfos: this.coreSlotInfo, cursorPos: newPos}, {slotInfos: this.coreSlotInfo, cursorPos: newPos});

                // part 4
                this.$emit(CustomEventTypes.requestSlotsRefactoring, this.UID, stateBeforeChanges);     
            }
        },

        deleteSlots(event: KeyboardEvent, chainedActionFunction?: VoidFunction){
            event.preventDefault();
            event.stopImmediatePropagation();

            // Save the current state only if we are NOT in a chained action workflow
            let stateBeforeChanges: any = null;
            if(chainedActionFunction == undefined) {
                stateBeforeChanges = cloneDeep(this.appStore.$state);
            }
               
            const focusSlotCursorInfos = this.appStore.focusSlotCursorInfos;
            const anchorSlotCursorInfos = this.appStore.anchorSlotCursorInfos;
            const isForwardDeletion = (event.key.toLowerCase() == "delete");
            const nextSlotInfos = getFlatNeighbourFieldSlotInfos(this.coreSlotInfo, true);
            const previousSlotInfos = getFlatNeighbourFieldSlotInfos(this.coreSlotInfo, false);
            const {selectionStart, selectionEnd} = getFocusedEditableSlotTextSelectionStartEnd(this.UID);

            if(focusSlotCursorInfos && anchorSlotCursorInfos){
                const isSelectingMultiSlots = !areSlotCoreInfosEqual(focusSlotCursorInfos.slotInfos, anchorSlotCursorInfos.slotInfos);

                // Without selection, a slot will be removed when the text caret is at the end of a slot and there is no text selection
                // we delete slots only when there is a single operator between the current slot, and the next flat (UI) slot.      
                if(!isSelectingMultiSlots && (selectionStart == selectionEnd) 
                    && ((isForwardDeletion && focusSlotCursorInfos.cursorPos == this.code.replace(/\u200B/g, "").length && nextSlotInfos) || (!isForwardDeletion && focusSlotCursorInfos.cursorPos == 0 && previousSlotInfos))){
                    this.appStore.bypassEditableSlotBlurErrorCheck = true;
                    
                    const isDeletingFromString = (this.slotType == SlotType.string);
                    // if we are deleting from a string, we start from a reference cursor position or code length of 0 and only use offset to reposition the cursor
                    const backDeletionCharactersToRetainCount = (isDeletingFromString) ? 0 : this.code.replace(/\u200B/g, "").length;
                    const referenceCursorPos = (isDeletingFromString) 
                        ? 0 
                        : focusSlotCursorInfos.cursorPos;

                    // Check whether we are deleting only 1 part of a double operator or the whole operator
                    const {parentId: currentSlotParentId, slotIndex: currentSlotIndex} = getSlotParentIdAndIndexSplit(this.coreSlotInfo.slotId);
                    const neighbourOperatorSlotIndex = (isForwardDeletion) ? currentSlotIndex : currentSlotIndex -1;
                    const neighbourOperatorSlot = retrieveSlotFromSlotInfos({...this.coreSlotInfo, slotId: getSlotIdFromParentIdAndIndexSplit(currentSlotParentId, neighbourOperatorSlotIndex), slotType: SlotType.operator});
                    const neighbourOperatorSlotContent = (neighbourOperatorSlot!= undefined) ? (neighbourOperatorSlot as BaseSlot).code : "s";
                    if(neighbourOperatorSlotContent.includes(" ") || operators.filter((operator) => operator.length == 2).includes(neighbourOperatorSlotContent)){
                        // We have a double operator: if we are in a keyword/symbolic operator, we remove the first or second word/symbol depending the direction of deletion
                        const newOperatorContent = (isForwardDeletion) 
                            ? ((neighbourOperatorSlotContent.includes(" ")) ? neighbourOperatorSlotContent.substring(neighbourOperatorSlotContent.indexOf(" ") + 1) : neighbourOperatorSlotContent[1])
                            : ((neighbourOperatorSlotContent.includes(" ")) ? neighbourOperatorSlotContent.substring(0, neighbourOperatorSlotContent.indexOf(" ")) : neighbourOperatorSlotContent[0]);
                        (neighbourOperatorSlot as BaseSlot).code = newOperatorContent.replace(/\u200B/g, "");
                        // We don't actually require slot to be regenerated, but we need to mark the action for undo/redo
                        this.$nextTick(() => {
                            this.appStore.bypassEditableSlotBlurErrorCheck = false;
                            (this.$parent as InstanceType<typeof LabelSlotsStructure>).checkSlotRefactoring(this.UID, stateBeforeChanges);
                        });
                    }
                    else{
                        const {newSlotId, cursorPosOffset} = this.appStore.deleteSlots(isForwardDeletion);
                        // Restore the text cursor position (need to wait for reactive changes)
                        this.$nextTick(() => {
                            const newCurrentSlotInfoNoType = {...this.coreSlotInfo, slotId: newSlotId};
                            const newCurrentSlotType = evaluateSlotType(retrieveSlotFromSlotInfos(newCurrentSlotInfoNoType));
                            let newSlotInfos = {...newCurrentSlotInfoNoType, slotType: newCurrentSlotType};
                            const slotUID = getLabelSlotUID(newSlotInfos); 
                            const inputSpanField = document.getElementById(slotUID) as HTMLSpanElement;
                            const newTextCursorPos = (isForwardDeletion) 
                                ? referenceCursorPos + cursorPosOffset 
                                : ((inputSpanField.textContent??"").replace(/\u200B/g, "").length - cursorPosOffset - backDeletionCharactersToRetainCount); 
                            const newCurrentSlotInfoWithType = {...newCurrentSlotInfoNoType, slotType: newCurrentSlotType};
                            const slotCursorInfos: SlotCursorInfos = {slotInfos: newCurrentSlotInfoWithType, cursorPos: newTextCursorPos};
                            document.getElementById(getLabelSlotUID(newCurrentSlotInfoWithType))?.dispatchEvent(new Event(CustomEventTypes.editableSlotGotCaret));
                            setDocumentSelection(slotCursorInfos, slotCursorInfos);
                            this.appStore.setSlotTextCursors(slotCursorInfos, slotCursorInfos);
                            this.appStore.bypassEditableSlotBlurErrorCheck = false;

                            // In any case, we check if the slots need to be refactorised (next tick required to account for the changed done when deleting brackets/strings)
                            // (in this scenario, we don't emit a "requestSlotsRefactoring" event, because if we delete using backspace, "this" component will actually not exist anymore
                            // and it looks like Vue will pick that up and not fire the listener.)
                            (this.$parent as InstanceType<typeof LabelSlotsStructure>).checkSlotRefactoring(slotUID, stateBeforeChanges);
                        });
                    }
                }
                else{
                    // We are deleting some code, several cases can happen:
                    // there is a selection of text (case A) or slots (case B) (i.e. within one slot / across slots)
                    // simply remove a character within a slot (case C)
                    // We are deleting text within one slot: we only need to update the slot content and the text cursor position
                    const inputSpanField = document.getElementById(this.UID) as HTMLSpanElement;
                    const inputSpanFieldContent = inputSpanField.textContent ?? "";
                    let newTextCursorPos = selectionStart;
                    let resultingSlotUID = this.UID;
                    if(selectionEnd != selectionStart || isSelectingMultiSlots){
                        // We are deleting a selection. We need to see if we are also deleting slots (case B) or just text within one slot (case A).
                        // It doesn't matter if we are using "del" or "backspace", the result is the same.
                        if(!isSelectingMultiSlots){
                            // Case A, simply delete the text selection within one slot
                            inputSpanField.textContent = inputSpanFieldContent.substring(0, selectionStart) + inputSpanFieldContent.substring(selectionEnd);
                            //The cursor position may change, so we update it in the store.
                            this.appStore.setSlotTextCursors({slotInfos: this.coreSlotInfo, cursorPos: selectionStart}, {slotInfos: this.coreSlotInfo, cursorPos: selectionStart});             
                        }
                        else{
                            // Case B: we are deleteing a selection spanning across several slots, we will get the selection where the leftmost position is:
                            // the anchor if the selection is going forward, the focus otherwise
                            const {newSlotId} = this.appStore.deleteSlots(isForwardDeletion);  
                            const newCursorPosition = ((getSelectionCursorsComparisonValue()??0) < 0) ? anchorSlotCursorInfos.cursorPos : focusSlotCursorInfos.cursorPos;  
                            // Restore the text cursor position (need to wait for reactive changes)
                            this.$nextTick(() => {
                                const newCurrentSlotInfoNoType = {...this.coreSlotInfo, slotId: newSlotId};
                                const newCurrentSlotType = evaluateSlotType(retrieveSlotFromSlotInfos(newCurrentSlotInfoNoType));
                                const newCurrentSlotInfoWithType = {...newCurrentSlotInfoNoType, slotType: newCurrentSlotType};
                                const slotCursorInfos: SlotCursorInfos = {slotInfos: newCurrentSlotInfoWithType, cursorPos: newCursorPosition};
                                resultingSlotUID = getLabelSlotUID(newCurrentSlotInfoWithType);
                                document.getElementById(resultingSlotUID)?.dispatchEvent(new Event(CustomEventTypes.editableSlotGotCaret));
                                setDocumentSelection(slotCursorInfos, slotCursorInfos);
                                this.appStore.setSlotTextCursors(slotCursorInfos, slotCursorInfos);
                            });
                        }
                    }
                    else if(!((isForwardDeletion && focusSlotCursorInfos?.cursorPos == this.code.replace(/\u200B/g, "").length) || (!isForwardDeletion && focusSlotCursorInfos?.cursorPos == 0))){
                        const deletionOffset = (isForwardDeletion) ? 0 : -1;
                        newTextCursorPos += deletionOffset;
                        inputSpanField.textContent = inputSpanFieldContent.substring(0, newTextCursorPos) + inputSpanFieldContent.substring(newTextCursorPos + 1);  
                        // The cursor position changes, so we updated it in the store. 
                        this.appStore.setSlotTextCursors({slotInfos: this.coreSlotInfo, cursorPos: newTextCursorPos}, {slotInfos: this.coreSlotInfo, cursorPos: newTextCursorPos});                                 
                    }
                    else{
                        // Do nothing if there is no actual change
                        return;
                    }

                    // In any case, except if we are in a chain of actions, we check if the slots need to be refactorised (next tick required to account for the changed done when deleting brackets/strings)
                    // As we deleted some slots, we need to call the refactoring on the resulting focused slot:
                    if(chainedActionFunction == undefined) {
                        this.$nextTick(() => (this.$parent as InstanceType<typeof LabelSlotsStructure>).checkSlotRefactoring(resultingSlotUID, stateBeforeChanges));
                    }
                    else{
                        // we continue doing the chained action if a function has been specified
                        this.$nextTick(() => chainedActionFunction());
                    }
                }
            }            
        },

        onDeleteKeyDown(event: KeyboardEvent){
            // We may still have the focus even when not logically editing, so we want to
            // avoid handling the keypress in this case; let the code in Commands handle it
            // which moves the frame cursor up and down:
            if (!this.appStore.isEditing) {
                return;
            }
            
            // Be careful: the event is triggered both by backspace & delete keys ! So we need to make a clear distinction here
            if(event.key.toLowerCase() == "delete"){
                return this.deleteSlots(event);
            }           
        },

        onBackSpaceKeyDown(event: KeyboardEvent){
            // We may still have the focus even when not logically editing, so we want to
            // avoid handling the keypress in this case; let the code in Commands handle it
            // which moves the frame cursor up and down:
            if (!this.appStore.isEditing) {
                return;
            }
            
            // When the backspace key is hit we delete the container frame when:
            //  1) there is no text in the slots
            //  2) we are in the first slot of a frame (*first that appears in the UI*) 
            // To avoid unwanted deletion, we "force" a delay before removing the frame.
            if(this.isFrameEmptyAndAtLabelSlotStart){
                event.stopPropagation();
                event.stopImmediatePropagation();
                event.preventDefault();

                this.appStore.bypassEditableSlotBlurErrorCheck = true;
                
                // If the user had already released the key up, no point waiting, we delete straight away
                if(this.canBackspaceDeleteFrame){
                    this.onLoseCaret(true);
                    this.appStore.deleteFrameFromSlot(this.frameId);
                }
                else{ 
                    if(!this.requestDelayBackspaceFrameRemoval){
                        this.requestDelayBackspaceFrameRemoval = true;
                    }       
                    setTimeout(() => {  
                        if(this.requestDelayBackspaceFrameRemoval){
                            this.onLoseCaret(true);
                            this.appStore.deleteFrameFromSlot(this.frameId);
                        }
                    }, 1000);
                }
                return;
            }
            else{
                // Delete a slot
                this.deleteSlots(event);
            }
        },

        onBackSpaceKeyUp(){
            this.canBackspaceDeleteFrame = this.isFrameEmptyAndAtLabelSlotStart;
            this.requestDelayBackspaceFrameRemoval = false;
        },

        acItemClicked(item: string) {
            // Get the content of the <li> element through the child node to avoid getting nested text elements (like the version)
            const selectedItem = (document.getElementById(item) as HTMLLIElement)?.firstChild?.nodeValue?.trim()??"";
            if(selectedItem === undefined) {
                return;
            }

            const currentTextCursorPos = getFocusedEditableSlotTextSelectionStartEnd(this.UID).selectionStart;
            let newCode = "";
            let isSelectedFunction = false;

            // We set the code to what it was up to the point before the token, and we replace the token with the selected Item.
            // We distinguish 2 cases: from..import.. or import.. frames that contains submodule notation (see below) and everything else.
            const labelSlotStructOperators = this.appStore.frameObjects[this.frameId].labelSlotsDict[0].slotStructures.operators;
            let isInSubModuleImportPathPart = ((this.frameType == AllFrameTypesIdentifier.import || this.frameType == AllFrameTypesIdentifier.fromimport) 
                && this.labelSlotsIndex == 0 && labelSlotStructOperators.length > 0);
            if(isInSubModuleImportPathPart){
                // We set that flag in 2 pass to make the test easier to read: first we check we're inside an import.. or from..import.. 1st slot (the above statement)
                // then we look if we're inside a path module: that is within a slot that is surrounded by the "." operator
                const slotIndex = parseInt(this.slotId);
                isInSubModuleImportPathPart = ((slotIndex > 0 && labelSlotStructOperators.length >= slotIndex && labelSlotStructOperators[slotIndex - 1].code == ".") 
                    || (slotIndex < labelSlotStructOperators.length && labelSlotStructOperators[slotIndex].code == "."));
            }
            if(isInSubModuleImportPathPart){
                // The case of a when are editing the modules of an import (import.. or from..import.. frames) is a bit specific:
                // we need to consider the whole scope of the module/submodule(s) path to generate a sensible output once the a/c item is selected.
                // That is, we need to take account of any existing path bits prior the current position.
                // (For ease of code edition in the app, we don't scrap things post current position, for example to let users insert a module somewhere within the imported module list)
                const slotIndex = parseInt(this.slotId);
                let firstModulePathPartSlotIndex = -1; // default value -1 indicates there are no other parts of the module path before the current position
                for(let opIndex = slotIndex - 1; opIndex >= 0; opIndex--){
                    // From the current location, we look up the preceding operators (if any) until we reach the start of the label slots or a comma 
                    // indicating the previous module in the import
                    if(labelSlotStructOperators[opIndex].code == "."){
                        firstModulePathPartSlotIndex = opIndex; // As we have Slot(i), Operator(i), Slot(i+1) the preceding slot before that operator has index "opIndex"
                        continue;
                    }
                    if(labelSlotStructOperators[opIndex].code == ",") {
                        break;
                    }
                }
                
                // Now that we know "how far" the module path spans, we delete any extra path bits following our position
                // and replace the current slot with the right content from the a/c (that is, taking consideration of the text before the caret in the slot,
                // and anything that preceeds the current slot with regards to the module path)
                newCode = (slotIndex > firstModulePathPartSlotIndex && firstModulePathPartSlotIndex > -1) 
                    ? selectedItem.split(".").slice(slotIndex).join(".")
                    : selectedItem;
            }
            else{
                // If the selected AC results is a method or a function we need to add parenthesis to the autocompleted text, unless there are brackets already in the next slot
                // (and in any case, we make sure we get into the slot structure)
                // Note that we can't add parenthesis if we are in a from...import... frame!
                const typeOfSelected: string  = (this.$refs.AC as any).getTypeOfSelected(item);
                const hasFollowingBracketSlot = (getFlatNeighbourFieldSlotInfos(this.coreSlotInfo, true, true)?.slotType == SlotType.bracket);
                isSelectedFunction =  (this.frameType.localeCompare(AllFrameTypesIdentifier.fromimport) != 0) && (typeOfSelected.includes("function") || typeOfSelected.includes("method"));
                newCode = this.getSlotContent().substr(0, currentTextCursorPos - (this.tokenAC?.length ?? 0)).replace(/\u200B/g, "")
                + selectedItem.replace(new RegExp("\\(.*"), "") 
                + ((isSelectedFunction && !hasFollowingBracketSlot)?"()":"");
            }

            // Remove content before the cursor (and put cursor at the beginning):
            (document.getElementById(this.UID) as HTMLSpanElement).textContent = this.getSlotContent().substring(currentTextCursorPos);
            this.updateStoreFromEditableContent();
            
            const slotCursorInfo: SlotCursorInfos = {slotInfos: this.coreSlotInfo, cursorPos: 0};
            this.appStore.setSlotTextCursors(slotCursorInfo, slotCursorInfo);
            setDocumentSelection(slotCursorInfo, slotCursorInfo);
            // Then "paste" in the completion:
            this.onCodePasteImpl(newCode);

            if(!isInSubModuleImportPathPart) {
                // Slight hack; if it ended in a bracket, go left one place to end up back in the bracket:
                if (newCode.endsWith(")")) {
                    this.$nextTick(() => {
                        document.getElementById(getFrameLabelSlotsStructureUID(this.frameId, this.labelSlotsIndex))?.dispatchEvent(
                            new KeyboardEvent("keydown", {
                                key: "ArrowLeft",
                            })
                        );
                    });
                }
                else if(isSelectedFunction){
                // And if we have added a function, but didn't have to insert the brackets with a/c, then we go right to get inside the existing brackets
                    this.$nextTick(() => {
                        document.getElementById(getFrameLabelSlotsStructureUID(this.frameId, this.labelSlotsIndex))?.dispatchEvent(
                            new KeyboardEvent("keydown", {
                                key: "ArrowRight",
                            })
                        );
                    });
                }
            }        
            
            this.showAC = this.debugAC;
            this.acRequested = false;
        },
   
        isImportFrame(): boolean {
            return this.appStore.isImportFrame(this.frameId);
        },
    },
});
</script>

<style lang="scss">
.#{$strype-classname-label-slot-container}{
    outline: none;
    max-width: 100%;
    flex-wrap: wrap;
    position: relative;
}

.#{$strype-classname-label-slot-input} {
    display: block; // to ensure that ctrl+arrow works fine in Chrome
    border-radius: 5px;
    border: 1px solid transparent;
    padding: 0px 0px;
    outline: none;
    cursor: text;
    white-space: pre-wrap;
    user-select: text;
    min-width: 3px;
}

// We can't use :empty because we use a zero-width space for the content
// when it is empty (at which point :empty is not applied).  So we use our own version:
    .#{$strype-classname-label-slot-input}[empty-content="true"]::after {
    content: attr(placeholder);
    font-style: italic;
    color: #bbb;
}

.#{$strype-classname-label-slot-input}.readonly {
    cursor: default;
    user-select: none;
}

.#{$strype-classname-error-slot} {
    display: inline-block;
    position:relative;
    background: url("~@/assets/images/wave.png") bottom repeat-x;
    min-width: 5px !important; // if a slot is empty, it is almost impossible to see the wave underline, so we get a minimum width set to erroneous slots
}

.bold {
    font-weight: 600;
    color: black !important;
}

// Classes related to the different slot types (cf type.ts)
.#{$strype-classname-frame-string-slot} {
    color: #006600 !important;
}

.#{$strype-classname-frame-operator-slot} {
    color: blue !important;
}

.#{$strype-classname-frame-code-slot}{
    color: black !important; 
}

.#{$strype-classname-frame-comment-slot}t {
    color: #97971E !important;
    margin-right: 2px;
}

.slot-right-margin {
    margin-right: 2px;
}
// end classes for slot type

.error-popover {
    // Nedded for the code to understand the formated errors which split multiple
    // errors with \n
    white-space: pre-line !important;
}

.ac {
    position: absolute;
    left: 0px;
    z-index: 10;
}
</style>
