<template>
    <div 
        v-show="isVisible"
        :class="frameSelectedCssClass"
    >
        <!-- keep both mousedown & click events: we need mousedown to manage the caret rendering during drag & drop -->
        <!-- keep the tabIndex attribute, it is necessary to handle focus with Safari -->
        <div 
            :style="frameStyle" 
            :class="{[scssVars.frameDivClassName]: true, blockFrameDiv: isBlockFrame && !isJointFrame, statementFrameDiv: !isBlockFrame && !isJointFrame, [scssVars.errorClassName]: hasParsingError, disabled: isDisabled}"
            :id="UID"
            :data-frameType="frameType.type"
            @click="toggleCaret($event)"
            @contextmenu="handleClick($event)"
            tabindex="-1"
            draggable="true"
            @dragstart.self="handleFrameDragStart"
        >
            <ContextMenu 
                :contextMenuItemsDef="frameContextMenuItems"
                :showContextMenu="showContextMenu"
                :showAt="showContextMenuAtCoordPos"
                :onOpened="handleContextMenuOpened"
                :doAfterShownOnMenuItem="registerMouseEventsForDeleteOperations"
                :doAfterShownOnMenuItemKeyboardFocusAddedObs="registerOnKeyboardFocusAddedForDeleteOperations"
                :doAfterShownOnMenuItemKeyboardFocusRemovedObs="registerOnKeyboardFocusRemovedForDeleteOperations"
                :onClosed="handleContextMenuClosed"
            />
            <FrameHeader
                v-if="frameType.labels !== null"
                :id="frameHeaderId"
                :isDisabled="isDisabled"
                v-blur="isDisabled || isBeingDraggedComputed"
                :frameId="frameId"
                :frameType="frameType.type"
                :labels="frameType.labels"
                :class="{[scssVars.frameHeaderClassName]: true, [scssVars.errorClassName]: hasRuntimeError}"
                :style="frameMarginStyle['header']"
                :frameAllowChildren="allowChildren"
                :frameAllowedCollapsedStates="frameType.allowedCollapsedStates"
                :frameAllowedFrozenStates="frameType.allowedFrozenStates"
                :frameCollapsedState="collapsedState"
                :frameFrozenState="frozenState"
                :erroneous="hasRuntimeError"
                :wasLastRuntimeError="wasLastRuntimeError"
                :onFocus="showFrameParseErrorPopupOnHeaderFocus"
            />
            <BPopover
                v-if="hasRuntimeError || wasLastRuntimeError || hasParsingError"
                :id="errorPopoverUID"
                :target="frameHeaderId"
                :title="errorPopupTitle"
                hover
                :content="errorPopupContent"
                :title-class="{'title-popover': true, 'modified-title-popover': (hasRuntimeError || hasParsingError)}"
                body-class="error-popover"
                placement="right"
            >
            </BPopover>
            <FrameBody
                v-if="allowChildren && bodyVisible"
                :ref="getFrameBodyRef"
                :frameId="frameId"
                :isDisabled="isDisabled"
                :isBeingDragged="isBeingDraggedComputed"
                :caretVisibility="caretVisibility"
                :style="frameMarginStyle['body']"
            />
            <JointFrames 
                v-if="allowsJointChildren"
                :ref="getJointFramesRef"
                :jointParentId="frameId"
                :isDisabled="isDisabled"
                :isBeingDragged="isBeingDraggedComputed"
                :isParentSelected="isPartOfSelection"
            />
        </div>
        <div>
            <CaretContainer
                v-if="!isJointFrame && !isInnerDisabled"
                :frameId="frameId"
                :ref="getCaretContainerRef"
                :caretVisibility="caretVisibility"
                :caretAssignedPosition="caretPosition.below"
                :isFrameDisabled="isDisabled"
            />
        </div>
    </div>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import { defineComponent } from "vue";
import FrameHeader from "@/components/FrameHeader.vue";
import CaretContainer from "@/components/CaretContainer.vue";
import { useStore } from "@/store/store";
import FrameBody from "@/components/FrameBody.vue";
import JointFrames from "@/components/JointFrames.vue";
import { AllFrameTypesIdentifier, CaretPosition, CollapsedState, ContainerTypesIdentifiers, CoordPosition, CurrentFrame, DefaultFramesDefinition, FrameContextMenuActionName, FrozenState, NavigationPosition, Position, PythonExecRunningState, StrypeContextMenuItem } from "@/types/types";
import { calculateNextCollapseState, frameOrChildHasErrors, getAboveFrameCaretPosition, getAllChildrenAndJointFramesIds, getLastSibling, getNextSibling, getOutmostDisabledAncestorFrameId, getParentOrJointParent, isFramePartOfJointStructure, isLastInParent } from "@/helpers/storeMethods";
import { copyFramesToClipboard, copyFrameTextReadyForClipboard, CustomEventTypes, getCaretContainerRef, getFrameBodyRef, getFrameBodyUID, getFrameHeaderUID, getFrameLabelSlotsStructureUID, getFrameUID, getHTML2CanvasFramesSelectionCropOptions, getJointFramesRef, isIdAFrameId, notifyDragStarted, parseFrameUID, setContextMenuEventClientXY } from "@/helpers/editor";
import { pasteMixedPython } from "@/helpers/pythonToFrames";
import { mapStores } from "pinia";
import { BPopover, useToggle } from "bootstrap-vue-next";
import html2canvas from "html2canvas";
import { saveAs } from "file-saver";
import scssVars from "@/assets/style/_export.module.scss";
import {getDateTimeFormatted, isMacOSPlatform, removeIf} from "@/helpers/common";
import { vueComponentsAPIHandler } from "@/helpers/vueComponentAPI";
import { eventBus } from "@/helpers/appContext";

//////////////////////
//     Component    //
//////////////////////
export default defineComponent({
    name: "Frame",

    setup(componentInstance){
        // Move the Options API style computed properties here if we need them setup:
        const errorPopoverUID = "errorPopover_frame_" + componentInstance.frameId;

        // Expose useToogle() of Bootstrap Vue Next inside setup (otherwise we get an error, even if it works)
        const toggleErrorPopover = useToggle(errorPopoverUID);
        return { errorPopoverUID, toggleErrorPopover };
    },

    created() {
        // Expose this component that other components might need.
        // Vue 3 has deprecated direct access to components.
        // (we don't set it in setup() because we want to have this accessible, and the component created!)
        const apiMethods = {
            changeToggledCaretPosition: this.changeToggledCaretPosition,
            handleClick: this.handleClick,
        };
        
        if(vueComponentsAPIHandler.frameComponentAPI == null){    
            vueComponentsAPIHandler.frameComponentAPI = {
                forInstance: {
                    [this.frameId]: apiMethods,
                },
            };
        }
        else{
            vueComponentsAPIHandler.frameComponentAPI.forInstance[this.frameId] = apiMethods;
        }
    },

    components: {
        FrameHeader,
        CaretContainer,
        BPopover,
        FrameBody,
        JointFrames,
    },

    props: {
        // NOTE that type declarations here start with a Capital Letter!!! (different to types.ts!)
        frameId: {type: Number, required: true}, // Unique Indentifier for each Frame
        isDisabled: Boolean,
        isBeingDragged: Boolean,
        frameType: {
            type: Object,
            default: () => DefaultFramesDefinition,
        }, //Type of the Frame
        isJointFrame: Boolean, //Flag indicating this frame is a joint frame or not
        caretVisibility: String,
        allowChildren: Boolean,
        isParentSelected: Boolean,
    },

    data: function () {
        return {
            scssVars, // just to be able to use in template
            // Flag used to trigger the context menu opening
            showContextMenu: false,
            // Prepare an empty version of the menu: it will be updated as required in handleClick()
            frameContextMenuItems: [] as StrypeContextMenuItem[],
            showContextMenuAtCoordPos: {x: 0, y: 0} as CoordPosition,
            // Flags for the context menu "delete" and "delete outer" states
            contextMenuAllCanBeDeleted: false,
            contextMenuCanDeleteOuter: false,
            // Flag to indicate a frame is selected via the context menu (differs from a user selection)
            contextMenuEnforcedSelect: false,
            // We keep a data property for frame run time error, even if that's a duplication, we need to keep it because
            // when the error in the frame is lifted, the error message disappear, and we need to use it in the popup
            runtimeErrorAtLastRunMsg: "",
        };
    },

    computed: {
        ...mapStores(useStore),

        frameHeaderId(): string {
            return getFrameHeaderUID(this.frameId);
        },

        allowsJointChildren(): boolean {
            return this.appStore.getAllowedJointChildren(this.frameId);
        },

        collapsedState(): number {
            return Number(this.appStore.frameObjects[this.frameId].collapsedState ?? CollapsedState.FULLY_VISIBLE);
        },

        frozenState(): number {
            return Number(this.appStore.frameObjects[this.frameId].frozenState ?? FrozenState.UNFROZEN);
        },
        
        bodyVisible(): boolean {
            return (this.appStore.frameObjects[this.frameId].collapsedState ?? CollapsedState.FULLY_VISIBLE) == CollapsedState.FULLY_VISIBLE;
        },

        frameStyle(): Record<string, string> {
            const isFrameInImportsOrDefsSection = [this.appStore.getImportsFrameContainerId, this.appStore.getDefsFrameContainerId].includes(this.appStore.frameObjects[this.frameId].parentId);
            const baseStylePart = {
                "background-color": `${this.getFrameBgColor()} !important`,
                "color": (this.frameType.type === AllFrameTypesIdentifier.comment) 
                    ? ((isFrameInImportsOrDefsSection) ? `${scssVars.frameCommentSlotBaseColour} !important` : `${scssVars.frameStatementCommentSlotBaseColour} !important`) 
                    : "#000 !important",
            };
            
            // We want to offset (non joint) block frames when they are stacking on top of each other,
            // to avoid the visual effect of a double border where they are stacked.
            // Note that function definition frames do not need to be included in the checkup, they are split in the UI
            if(this.frameType.allowChildren && !this.frameType.isJointFrame && this.frameType.type != AllFrameTypesIdentifier.funcdef){
                const parentFrameId = getParentOrJointParent(this.frameId);
                const parentChildrenIds = this.appStore.frameObjects[parentFrameId].childrenIds;
                const positionIndex = parentChildrenIds.indexOf(this.frameId);
                const isBlockFrameStacked = positionIndex > 0 && // there is something above
                        this.appStore.frameObjects[parentChildrenIds[positionIndex - 1]].frameType.allowChildren && // above is another block
                        !(this.appStore.currentFrame.id == parentChildrenIds[positionIndex - 1] && this.appStore.currentFrame.caretPosition == CaretPosition.below); // and there is no caret in between
                if(isBlockFrameStacked){
                    return {"margin-top": "-1px", ...baseStylePart};
                }
            }

            return baseStylePart;
        },

        frameMarginStyle(): Record<string, Record<string, string>> {
            // The rules for margin are generic, except for the match/case frames
            // where we specifically reduce the body indent to half the usual (so that the case content aligns with the body of the match frame's siblings).
            const genericBodyMargins = {...(this.isJointFrame)? {"margin-left": "28px"} : {"margin-left": "30px"}, "margin-right": "28px"}; 
            const matchOrCaseFrameBodyMargins = {"margin-left": "14px", "margin-right": "14px"};
            const bodyMargins = (this.frameType.type == AllFrameTypesIdentifier.match || this.frameType.type == AllFrameTypesIdentifier.case) 
                ? matchOrCaseFrameBodyMargins 
                : genericBodyMargins; 
            return {"header": (this.isJointFrame)? {"margin-left": "5px"} : {"margin-left": "6px"},
                "body": bodyMargins};
        },

        frameSelectedCssClass(): string {
            let frameClass = "";
            frameClass += (this.selectedPosition !== "unselected" || this.contextMenuEnforcedSelect)? "selected " : ""; 
            frameClass += (this.selectedPosition === "first")? "selectedTop " : ""; 
            frameClass += (this.selectedPosition === "last")? "selectedBottom " : ""; 
            frameClass += (this.selectedPosition === "first-and-last" || this.contextMenuEnforcedSelect)? "selectedTopBottom " : "";  
            return frameClass;
        },

        isBeingDraggedComputed(): boolean {
            // A Frame component should know it's being dragged either because it is itself being dragged
            // or its ancestor is, so this computer prop depends on the state prop and on the component prop.
            return this.isBeingDragged || !!this.appStore.frameObjects[this.frameId].isBeingDragged;
        },

        parsingErrorMessage(): string {
            return this.appStore.frameObjects[this.frameId].atParsingError ?? "";
        },

        hasParsingError(): boolean {
            return this.parsingErrorMessage.length > 0;
        },

        runTimeErrorMessage(): string {
            return this.appStore.frameObjects[this.frameId].runTimeError ?? "";
        },

        hasRuntimeError(): boolean {
            return (this.runTimeErrorMessage.length > 0);
        },

        wasLastRuntimeError(): boolean {
            return this.appStore.wasLastRuntimeErrorFrameId == this.frameId;
        },

        errorPopupTitle(): string {
            return this.$t((this.hasParsingError) ? "errorMessage.errorTitle" : ((this.hasRuntimeError) ? "PEA.runtimeErrorConsole" : "errorMessage.pastFrameErrTitle"));
        },

        errorPopupContent(): string {
            return (this.hasParsingError) ? this.parsingErrorMessage : ((this.hasRuntimeError) ? this.runTimeErrorMessage : this.runtimeErrorAtLastRunMsg);
        },

        deletableFrame(): boolean{
            return (this.appStore.potentialDeleteFrameIds?.includes(this.frameId)) ?? false;
        },

        // Needed in order to use the `CaretPosition` type in the v-show
        caretPosition(): typeof CaretPosition {
            return CaretPosition;
        },

        UID(): string {
            return getFrameUID(this.frameId);
        },

        allowContextMenu(): boolean {
            return this.appStore.contextMenuShownId === this.UID; 
        },

        isPythonExecuting(): boolean {
            return (this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning;
        },

        selectedPosition(): string {
            return this.appStore.getFrameSelectionPosition(this.frameId);
        },

        isBlockFrame(): boolean {
            return this.frameType.allowChildren;
        },

        // Joint frames can also be "selected" if their parent is selected
        isPartOfSelection(): boolean {
            return (this.selectedPosition !== "unselected") || (this.isParentSelected);
        },

        isVisible(): boolean {
            return this.appStore.isFrameVisible(this.frameId);
        },   

        isInFrameWithKeyboard(): boolean {            
            return (this.appStore.currentFrame.id == this.frameId && this.appStore.isEditing);
        },

        getFrameBodyUID(): string {
            return getFrameBodyUID(this.frameId);
        },
    
        getFrameBodyRef(): string {
            return getFrameBodyRef();
        },

        getJointFramesRef(): string {
            return getJointFramesRef();
        },

        getCaretContainerRef(): string {
            return getCaretContainerRef();
        },

        isInnerDisabled(): boolean {
            // This computed property indicates whether a frame is disabled as a descendant of a disabled frame.
            // When that's the case, the whole most outer frame acts as a unit and actions/caret are for that unit.
            return this.isDisabled && this.appStore.frameObjects[getParentOrJointParent(this.frameId)].isDisabled;
        },
    },

    watch:{
        runTimeErrorMessage(oldValue: string, newValue: string) {
            // As the error message will be cleared when the frame rror is cleared, we need to keep a backup of that message when
            // the error message is changed from some value to none.
            // We don't need to worry about the other changes because the error popup display logics uses other flags than the messages.
            if(oldValue.length > 0 && newValue.length == 0) {
                this.runtimeErrorAtLastRunMsg = oldValue;
            }
        },

        isInFrameWithKeyboard(isInFrame: boolean, wasInFrame: boolean) {
            // If we just got the text cursor, and there is/was a runtime error in the frame, we show the popup
            if(!wasInFrame && isInFrame && (this.hasRuntimeError || this.wasLastRuntimeError)){
                this.toggleErrorPopover.show();
            }

            // If we lost the text cursor, and there is/was a runtime error in the frame, we hide the popup (if it existed)
            if(wasInFrame && !isInFrame && document.getElementById(this.errorPopoverUID)?.classList.contains("show")){
                this.toggleErrorPopover.hide();
            }
        },
    },

    mounted() {
        eventBus.on(CustomEventTypes.cutFrameSelection, this.cutIfFirstInSelection);
        eventBus.on(CustomEventTypes.copyFrameSelection, this.copyIfFirstInSelection);
        eventBus.on(CustomEventTypes.duplicateFrameSelection, this.duplicateIfFirstInSelection);
        eventBus.on(CustomEventTypes.toggleFrameSelectionDisable, this.toggleDisableFirstInSelection);

        // The frame header can listen for events from the editable slots focus to manage header level error messages
        document.getElementById(this.frameHeaderId)?.addEventListener(CustomEventTypes.frameContentEdited, this.onFrameContentEdited);
    },

    unmounted() {
        // Same as above, not sure it is required to remove the event since anyway the event loop won't be raised
        // however, just to keep things tidy, let's clear the frame focus event listener when the frame is destroyed
        document.getElementById(this.frameHeaderId)?.removeEventListener(CustomEventTypes.frameContentEdited, this.onFrameContentEdited);

        // Remove any event bus listeners
        eventBus.off(CustomEventTypes.cutFrameSelection, this.cutIfFirstInSelection);
        eventBus.off(CustomEventTypes.copyFrameSelection, this.copyIfFirstInSelection);
        eventBus.off(CustomEventTypes.duplicateFrameSelection, this.duplicateIfFirstInSelection);
        eventBus.off(CustomEventTypes.toggleFrameSelectionDisable, this.toggleDisableFirstInSelection);
        
        // Remove the component's API instance
        if(vueComponentsAPIHandler.frameComponentAPI?.forInstance[this.frameId]){
            delete vueComponentsAPIHandler.frameComponentAPI?.forInstance[this.frameId];
        }
    },

    methods: {
        isMacOSPlatform,
        cutIfFirstInSelection() {
            // Cutting/copying by shortcut is only available for a frame selection*, and if the user's code isn't being executed.
            // To prevent the command to be called on all frames, but only once (first of a selection), we check that the current frame is a first of a selection.
            // * "this.isPartOfSelection" is necessary because it is only set at the right value in a subsequent call. 
            if(!this.isPythonExecuting && this.isPartOfSelection && (this.appStore.getFrameSelectionPosition(this.frameId) as string).startsWith("first")) {
                this.cut();
            }
        },

        copyIfFirstInSelection() {
            // Cutting/copying by shortcut is only available for a frame selection*, and if the user's code isn't being executed.
            // To prevent the command to be called on all frames, but only once (first of a selection), we check that the current frame is a first of a selection.
            // * "this.isPartOfSelection" is necessary because it is only set at the right value in a subsequent call. 
            if(!this.isPythonExecuting && this.isPartOfSelection && (this.appStore.getFrameSelectionPosition(this.frameId) as string).startsWith("first")) {
                this.copy();
            }
        },

        duplicateIfFirstInSelection() {
            // Duplicating by shortcut is only available for a frame selection*, and if the user's code isn't being executed.
            // To prevent the command to be called on all frames, but only once (first of a selection), we check that the current frame is a first of a selection.
            // * "this.isPartOfSelection" is necessary because it is only set at the right value in a subsequent call. 
            if(!this.isPythonExecuting && this.isPartOfSelection && (this.appStore.getFrameSelectionPosition(this.frameId) as string).startsWith("first")) {
                this.duplicate(true);
            }
        },

        toggleDisableFirstInSelection(){
            // Toggling the disable status of frames by shortcut is only available for a frame selection*, and if the user's code isn't being executed.
            // To prevent the command to be called on all frames, but only once (first of a selection), we check that the current frame is a first of a selection.
            // * "this.isPartOfSelection" is necessary because it is only set at the right value in a subsequent call. 
            if(!this.isPythonExecuting && this.isPartOfSelection && (this.appStore.getFrameSelectionPosition(this.frameId) as string).startsWith("first")) {
                this.toggleSelectedFrameDisable(true);
            }
        },

        getFrameBgColor(): string {
            // If we show the indicator background that a frame can be delete (hovering the delete / delete outer entry menus)
            // then we have a specific colour - to avoid colours to add up together when going deeper in the frames,
            // we only apply that colour to the frames that have not a parent set to deletable         
            if(this.deletableFrame && this.appStore.potentialDeleteFrameIds){
                const isParentDeletable = this.appStore.potentialDeleteFrameIds.includes(getParentOrJointParent(this.frameId));
                return (!isParentDeletable) ? "rgba(255,0,0,0.6)" : "transparent"; 
            }

            // In most cases, the background colour is the one defined in the frame types.
            // The exception is for comments and joint frames, which will take the same colour as their container.
            // For comments, we keep them transparent, for joints, we retrieve the parent's colour, so that it shows up when dragging them.
            if(this.frameType.type !== AllFrameTypesIdentifier.comment){
                if(this.isJointFrame){
                    return this.appStore.frameObjects[this.appStore.frameObjects[this.frameId].jointParentId].frameType.colour;
                }
                return this.frameType.colour;
            }
            else{
                return "transparent";
            }
        },

        onFrameContentEdited() {
            // When the frame content has been changed, we clear the potential runtime error
            this.appStore.frameObjects[this.frameId].runTimeError = "";
        },

        handleContextMenuOpened() {
            document.dispatchEvent(new CustomEvent(CustomEventTypes.requestAppNotOnTop, {detail: true}));
        },

        handleContextMenuClosed(){
            this.appStore.isContextMenuKeyboardShortcutUsed = false;
            this.showContextMenu = false;
            // Reset the enforced selection flag
            this.contextMenuEnforcedSelect = false;
            document.dispatchEvent(new CustomEvent(CustomEventTypes.requestAppNotOnTop, {detail: false}));
        },

        handleClick (event: MouseEvent, positionForMenu?: Position) {
            if(this.appStore.isContextMenuKeyboardShortcutUsed){
                // The logic for handling the context menu opened via a keyboard shortcut is handled by App
                return;
            }

            // In the case we've right-clicked on an *inner* disabled frame, the click should be related to the outmost disabled ancestor of that frame
            const frameParentId = getParentOrJointParent(this.frameId);
            if(this.appStore.frameObjects[frameParentId].isDisabled){
                // We don't need to look for the outmost disabled frame: the click event propagates to the containing frame already (we stop the propagation
                // ourself when showing the context menu) so it will already get back to the outmost disabled frame naturally.
                return;
            }

            // Remove all the potential deletable frames
            this.appStore.potentialDeleteFrameIds.splice(0);
            
            this.appStore.contextMenuShownId = this.UID;

            // only show the frame menu if we are not editing and not executing the user Python code
            if(this.appStore.isEditing || this.isPythonExecuting){
                return;
            }

            // Prepare the base content items for the context menu (vue3-context menu) - we extend the type of ContextMenuItem to add the helper property "actioName"
            this.frameContextMenuItems = [
                // Important these first three are in the same order as the enum CollapsedState:
                {label: this.$t("contextMenu.collapseHeader"), onClick: this.collapseToHeader, actionName: FrameContextMenuActionName.collapseToHeader, attrs: {"action-name": FrameContextMenuActionName.collapseToHeader}},
                {label: this.$t("contextMenu.collapseDocumentation"), onClick: this.collapseToDocumentation, actionName: FrameContextMenuActionName.collapseToDocumentation, attrs: {"action-name": FrameContextMenuActionName.collapseToDocumentation}},
                {label: this.$t("contextMenu.collapseFull"), onClick: this.collapseToFull, actionName: FrameContextMenuActionName.collapseToFull, attrs: {"action-name": FrameContextMenuActionName.collapseToFull}},
                {label: this.$t("contextMenu.freeze"), onClick: this.freeze, actionName: FrameContextMenuActionName.freeze, attrs: {"action-name": FrameContextMenuActionName.freeze}},
                {label: this.$t("contextMenu.unfreeze"), onClick: this.unfreeze, actionName: FrameContextMenuActionName.unfreeze, attrs: {"action-name": FrameContextMenuActionName.unfreeze}},
                {divided: "self"},
                {label: this.$t("contextMenu.cut"), onClick: this.cut, actionName: FrameContextMenuActionName.cut, attrs: {"action-name": FrameContextMenuActionName.cut}, shortcut: isMacOSPlatform() ? "⌘X" : this.$t("shortcut.ctrlPlus") + "X"},
                {label: this.$t("contextMenu.copy"), onClick: this.copy, actionName: FrameContextMenuActionName.copy, attrs: {"action-name": FrameContextMenuActionName.copy}, shortcut: isMacOSPlatform() ? "⌘C" : this.$t("shortcut.ctrlPlus") + "C"},
                {label: this.$t("contextMenu.downloadAsImg"), onClick: this.downloadAsImg},
                {label: this.$t("contextMenu.duplicate"), onClick: () => this.duplicate(false), attrs: {"action-name": FrameContextMenuActionName.duplicate}, shortcut: isMacOSPlatform() ? "⌘D" : this.$t("shortcut.ctrlPlus") + "D"},
                {divided: "self"},
                {label: this.$t("contextMenu.pasteAbove"), onClick: this.pasteAbove},
                {label: this.$t("contextMenu.pasteBelow"), onClick: this.pasteBelow},
                {divided: "self"},
                {label: this.$t("contextMenu.disable"), onClick: () => this.enableDisable({})},
                {divided: "self"},
                {label: this.$t("contextMenu.delete"), onClick: this.delete, actionName: FrameContextMenuActionName.delete, attrs: {"action-name": FrameContextMenuActionName.delete}, shortcut: this.$t("shortcut.delete")},
                {label: this.$t("contextMenu.deleteOuter"), onClick: this.deleteOuter, actionName: FrameContextMenuActionName.deleteOuter}];

            // Not all frames can be collapsed; only show menu items that are possible for at least one of the frames,
            // disable the item if all frames are already in that state, and show the dot shortcut next to whatever it would do:
            const collapseFrames = (this.isPartOfSelection ? this.appStore.selectedFrames : [this.frameId]).map((id) => this.appStore.frameObjects[id]);
            const combinedCollapse = collapseFrames.reduce(
                (acc, item) => {
                    acc.states.add(item.collapsedState ?? CollapsedState.FULLY_VISIBLE);
                    item.frameType.allowedCollapsedStates.forEach((s) => {
                        // Extra rule: frozen functions can't be fully expanded
                        if (item.frameType.type == AllFrameTypesIdentifier.funcdef && item.frozenState == FrozenState.FROZEN && s == CollapsedState.FULLY_VISIBLE) {
                            // Don't add this as a possibility
                        }
                        else {
                            acc.allowedStates.add(s);
                        }
                    });
                    return acc;
                },
                { states: new Set<CollapsedState>(), allowedStates: new Set<CollapsedState>() }
            );
            const ancestorIsFrozen = this.appStore.isEffectivelyFrozen(collapseFrames[0].parentId);
            let nextWouldBe;
            // Important to do this before next step as we might then remove some:
            if (combinedCollapse.states.size === 1) {
                const commonState = combinedCollapse.states.keys().next().value as CollapsedState;
                this.frameContextMenuItems[commonState as number].disabled = true;
                nextWouldBe = calculateNextCollapseState(collapseFrames, ancestorIsFrozen, "dryrun").overall;
            }
            else {
                nextWouldBe = calculateNextCollapseState(collapseFrames, ancestorIsFrozen, "dryrun").overall;
            }
            let someCollapseShowing = false;
            // Loops through all possible enum values, backwards so we can remove without upsetting the later-processed indexes:
            for (const c of Object.values(CollapsedState).filter((v) => typeof v === "number").map((v) => v as number).sort((a, b) => b - a)) {
                // If state is impossible for all frames, don't show it in the menu:
                // Also, if there's only one allowed state for all frames (which would be fully visible), remove all items:
                if (!combinedCollapse.allowedStates.has(c as CollapsedState) || combinedCollapse.allowedStates.size === 1
                    || (c as CollapsedState == CollapsedState.FULLY_VISIBLE && ancestorIsFrozen)) {
                    this.frameContextMenuItems.splice(c,1);
                }
                else {
                    someCollapseShowing = true;
                    if (nextWouldBe as number === c) {
                        this.frameContextMenuItems[c].shortcut = this.$t("shortcut.period");
                    }
                }
            }
            // For freezing, we don't show it for bulk operations:
            let someFrozenShowing = false;
            const errorsInFrameOrChild = frameOrChildHasErrors(this.frameId);
            // We take it out if the frame doesn't allow it or it's already in that state:
            removeIf(this.frameContextMenuItems, (x) => {
                if (x.actionName === FrameContextMenuActionName.freeze) {
                    // We don't allow freezing if it's not at the top-level in the container:
                    const remove = this.frozenState as FrozenState === FrozenState.FROZEN
                                        || !this.frameType.allowedFrozenStates.includes(FrozenState.FROZEN)
                                        || this.appStore.frameObjects[frameParentId].frameType.type != ContainerTypesIdentifiers.defsContainer;
                    someFrozenShowing = someFrozenShowing || !remove;
                    
                    // Check if there are precompile errors on any of our slots anywhere in the frame:
                    if (errorsInFrameOrChild) {
                        x.label = this.$t("contextMenu.cannotFreezeErrors");
                        x.disabled = true;
                    }
                    
                    return remove;
                }
                else if (x.actionName === FrameContextMenuActionName.unfreeze) {
                    const remove = this.frozenState as FrozenState === FrozenState.UNFROZEN || !this.frameType.allowedFrozenStates.includes(FrozenState.UNFROZEN);
                    someFrozenShowing = someFrozenShowing || !remove;
                    return remove;
                }
                else if (x.actionName === FrameContextMenuActionName.collapseToHeader || x.actionName === FrameContextMenuActionName.collapseToDocumentation) {
                    if (errorsInFrameOrChild) {
                        x.label = this.$t("contextMenu.cannotCollapseErrors");
                        x.disabled = true;
                    }
                    return false;
                }
                else {
                    return false; // Leave everything else untouched
                }
            });
            
            if (!someCollapseShowing && !someFrozenShowing) {
                // Remove the divider, which will now be position 0:
                this.frameContextMenuItems.splice(0,1);
            }
            
            // Not all frames should be duplicated (e.g. Else)
            // The target id, for a duplication, should be the same as the copied frame 
            // except if that frame has joint frames: the target is the last joint frame.
            const targetFrameJointFrames = this.appStore.getJointFramesForFrameId(this.frameId);
            const targetFrameId = (targetFrameJointFrames.length > 0) ? targetFrameJointFrames[targetFrameJointFrames.length-1].id : this.frameId;
            // Duplication allowance should be examined based on whether we are talking about a single frame or a selection frames
            const canDuplicate = (this.isPartOfSelection) ?
                this.appStore.isPositionAllowsSelectedFrames(targetFrameId, CaretPosition.below) : 
                this.appStore.isPositionAllowsFrame(targetFrameId, CaretPosition.below, false, this.frameId);
            // Note: frozen frames themselves can be duplicated, but children of frozen frames cannot:
            if(!canDuplicate || ancestorIsFrozen){
                const duplicateOptionContextMenuPos = this.frameContextMenuItems.findIndex((entry) => entry.onClick === this.duplicate);
                //We don't need the duplication option: remove it from the menu options if not present
                if(duplicateOptionContextMenuPos > -1){
                    this.frameContextMenuItems.splice(
                        duplicateOptionContextMenuPos,
                        1
                    );
                }
            }

            // We only show "delete outer" if the top level frame(s) to delete are all block frames and not function definitions
            this.contextMenuCanDeleteOuter = (this.isPartOfSelection) 
                ? this.appStore
                    .selectedFrames
                    .every((frameId) => this.appStore.frameObjects[frameId].frameType.allowChildren && this.appStore.frameObjects[frameId].frameType.type != AllFrameTypesIdentifier.funcdef && this.frameType.type != AllFrameTypesIdentifier.classdef)
                : this.isBlockFrame && this.frameType.type != AllFrameTypesIdentifier.funcdef && this.frameType.type != AllFrameTypesIdentifier.classdef;
            if(!this.contextMenuCanDeleteOuter){
                const deleteOuterOptionContextMenuPos = this.frameContextMenuItems.findIndex((entry) => entry.onClick === this.deleteOuter);
                // We don't need the delete outer option: remove it from the menu options if not present
                if(deleteOuterOptionContextMenuPos > -1){
                    this.frameContextMenuItems.splice(
                        deleteOuterOptionContextMenuPos,
                        1
                    );
                }
            }

            // Should we show any deleting options (Delete, Cut); requires all selected frames to be deleteable.
            // The only thing that prevents deletion is being frozen:
            let deleteMenuPos = this.frameContextMenuItems.findIndex((entry) => entry.actionName === FrameContextMenuActionName.delete);
            this.contextMenuAllCanBeDeleted = !ancestorIsFrozen && (this.isPartOfSelection
                ? this.appStore
                    .selectedFrames
                    .every((frameId) => this.appStore.frameObjects[frameId].frozenState != FrozenState.FROZEN)
                : this.frozenState != FrozenState.FROZEN);
            if (!this.contextMenuAllCanBeDeleted) {
                const cutMenuPos = this.frameContextMenuItems.findIndex((entry) => entry.actionName === FrameContextMenuActionName.cut);
                if(cutMenuPos > -1){
                    this.frameContextMenuItems.splice(cutMenuPos, 1);
                    // Cut is above "delete" so we should update the delete position index:
                    deleteMenuPos--;
                }
                if(deleteMenuPos > -1){
                    this.frameContextMenuItems.splice(deleteMenuPos, 1);
                }
            }

            // Remove the separator above the delete entries block if no entry is showing
            if(!this.contextMenuAllCanBeDeleted && !this.contextMenuCanDeleteOuter){
                this.frameContextMenuItems.splice(deleteMenuPos - 1, 1);
            }

            // The disable/enable logic depends primarily on the the frame(s) target:
            // - if the action is performed on a single frame, we toggle the current disable status and show "disable" or "enable" accordingly (if action is allowed); ctrl+/ is associated with this action
            // - if the action is performed on several frames at once, we can either disable them all, or enable them all, or toggle their disable status (if actions are allowed); ctrl+/ is associated with the toggling action
            // (see canEnableOrDisableFrame() for details when a disable change for a frame is not allowed)            
            const anyCanEnable = this.isPartOfSelection ? this.appStore.selectedFrames.some((frameId) => this.canEnableOrDisableFrame(frameId, true)) : this.canEnableOrDisableFrame(this.frameId, true);
            const anyCanDisable = this.isPartOfSelection ? this.appStore.selectedFrames.some((frameId) => this.canEnableOrDisableFrame(frameId, false)) : this.canEnableOrDisableFrame(this.frameId, false);            
            let disableInitPosIndex = this.frameContextMenuItems.findIndex((entry) => entry.label === this.$t("contextMenu.disable"));
            // Insert the 2 extra menus for frames selection case
            if(this.isPartOfSelection  && this.appStore.selectedFrames.length > 1){
                const enableDisableAllOptions = [{label: this.$t("contextMenu.enableAll"), onClick: () => this.enableDisable({isDisabling: false}), disabled: !anyCanEnable},
                    {label: this.$t("contextMenu.disableAll"), onClick: () => this.enableDisable({isDisabling: true}), disabled: !anyCanDisable}];
                this.frameContextMenuItems.splice(disableInitPosIndex, 0, ...enableDisableAllOptions);
                disableInitPosIndex += 2;
            }
            // Update the last "disable" related menu item based on the context
            const disableOrEnableOrToggleOption = (this.isPartOfSelection && this.appStore.selectedFrames.length > 1) 
                ?  {label: this.$t("contextMenu.toggleDisable"), onClick: () => this.toggleSelectedFrameDisable(), disabled: !anyCanDisable && !anyCanEnable} // toggle
                :  ((this.appStore.frameObjects[this.frameId].isDisabled) // either disable or enable, the menu entry is disabled if no corresponding action is possible
                    ? {label: this.$t("contextMenu.enable"), onClick: () => this.enableDisable({isDisabling: false}), disabled: !anyCanEnable} 
                    : {label: this.$t("contextMenu.disable"), onClick: () => this.enableDisable({isDisabling: true}), disabled: !anyCanDisable});
            // Set the keyboard shortcut indicator and the attribute "action-name" so the keyboard shorcut can be effective, only when the menu entry isn't disabled
            // (note: this is only relevant to handling the shortcut when the menu is showing, otherwise it is handled in a different manner)
            if(!disableOrEnableOrToggleOption.disabled){
                let actionName = FrameContextMenuActionName.disable; // default case: disable
                switch (disableOrEnableOrToggleOption.label){
                case this.$t("contextMenu.enable"):
                    actionName = FrameContextMenuActionName.enable;
                    break;
                case this.$t("contextMenu.toggleDisable"):
                    actionName = FrameContextMenuActionName.toggleDisable;
                    break;
                default: // disable
                    break;
                }
                (disableOrEnableOrToggleOption as StrypeContextMenuItem).shortcut = (isMacOSPlatform()) ? "⌘/" : this.$t("shortcut.ctrlPlus") + "/";
                (disableOrEnableOrToggleOption as StrypeContextMenuItem).attrs = {"action-name": actionName};
            }
            const enableDisableIndex = this.frameContextMenuItems.findIndex((entry) => entry.label === this.$t("contextMenu.enable") || entry.label === this.$t("contextMenu.disable") );
            this.frameContextMenuItems.splice(enableDisableIndex, 1, disableOrEnableOrToggleOption);
            
            // Overwrite readonly properties clientX and clientY (to position the menu if needed)
            setContextMenuEventClientXY(event, positionForMenu);             
       
            // When a frame context menu is opened by click, we also move the frame cursor below, if the current frame cursor isn't 
            // already part of the clicked selection
            if(this.appStore.selectedFrames.length == 0 || !this.isPartOfSelection) {
                if(this.frameType.isJointFrame) {
                    // For a joint frame, if there is a non disabled sibling after that frame we go in its body, if that's the last then we go below the root frame
                    const jointRootFrame = this.appStore.frameObjects[this.appStore.frameObjects[this.frameId].jointParentId];
                    const indexOfJointFrame = jointRootFrame.jointFrameIds.indexOf(this.frameId);
                    const isJointFrameLast = (indexOfJointFrame == (jointRootFrame.jointFrameIds.length - 1));
                    const nextEnabledJointSiblingFrameId = (isJointFrameLast) 
                        ? -1
                        : jointRootFrame.jointFrameIds.findIndex((jointFrameId, index) => index > indexOfJointFrame  && !this.appStore.frameObjects[jointFrameId].isDisabled);
                    const newFramePos = (isJointFrameLast || nextEnabledJointSiblingFrameId == -1)
                        ? {id: jointRootFrame.id, caretPosition: CaretPosition.below}
                        : {id: jointRootFrame.jointFrameIds[nextEnabledJointSiblingFrameId], caretPosition: CaretPosition.body};
                    this.appStore.setCurrentFrame(newFramePos, false);
                }
                else{
                    this.appStore.setCurrentFrame({id: this.frameId, caretPosition: CaretPosition.below}, false);
                }
            }

            // Prevent default menu to show
            event.preventDefault();
            event.stopPropagation();

            // Open the context menu
            this.showContextMenuAtCoordPos.x = event.x;
            this.showContextMenuAtCoordPos.y = event.y;
            this.showContextMenuAtCoordPos.pos = positionForMenu;
            this.showContextMenu = true;
        },

        canEnableOrDisableFrame(frameId: number, lookCanEnable: boolean): boolean {
            // Our logic for disable/enable is as follows:
            //   - On an individual frame level:
            //     - Frozen frames, or children of frozen frames, can't be changed either way
            //     - Blanks cannot directly be changed
            //   - If there is a selection:
            //     - If any are disabled and can be enabled, we show enable
            //     - If any are enabled and can be disabled, we show disable
            //     - Otherwise none can be changed, show Disable and grey it out
            const frameOrAncestorIsFrozen = this.appStore.isEffectivelyFrozen(frameId);
            if(lookCanEnable){
                const frame = this.appStore.frameObjects[frameId];
                return frame.isDisabled && !frameOrAncestorIsFrozen;
            }
            else{
                const frame = this.appStore.frameObjects[frameId];
                return !frame.isDisabled && !frameOrAncestorIsFrozen
                    && frame.frameType.type != AllFrameTypesIdentifier.blank;
            }
        },

        registerMouseEventsForDeleteOperations(ctxMenuItemDef: StrypeContextMenuItem, menuEntryWrapperElement: HTMLDivElement): void {
            // There are 2 ways we want to show the cues: when the menu entry (wrapper) is hovered (1), or keyboard-focused (2).
            // This adds the mouseover/out listeners for the delete/delete outer entries implementing (1).     
            const isDeleteEntry = this.contextMenuAllCanBeDeleted && ctxMenuItemDef.onClick == this.delete;
            const isDeleteOuterEntry = this.contextMenuCanDeleteOuter && ctxMenuItemDef.onClick == this.deleteOuter;
            if(isDeleteEntry || isDeleteOuterEntry){                           
                menuEntryWrapperElement.addEventListener("mouseover", () => this.onDeleteEntryContextMenuHover(true, isDeleteOuterEntry));
                menuEntryWrapperElement.addEventListener("mouseout", () => this.onDeleteEntryContextMenuHover(false, isDeleteOuterEntry));

                // Also, because we do not use focusin/focusout anymore compared to the Vue 2 context menu,
                // we may end up with the styling maintained on the frame when the frame is recreated by a undo after the delete action.
                // To prevent that, we make sure we always clear off the styling before we actually delete the frame.
                const currentOnClick = ctxMenuItemDef.onClick;
                if(currentOnClick) {
                    // Should be defined, but keep TS happy.
                    ctxMenuItemDef.onClick =  (event) => {
                        this.onDeleteEntryContextMenuHover(false, isDeleteOuterEntry);
                        currentOnClick(event);
                    };   
                }
            }
            
            // If there are no frame(s) selected by the user already in a multi selection
            // then we select this frame when the context menu opens.
            // Since it is only for presentation, we don't actually register the selected frame as a selection
            if(!this.isPartOfSelection){
                this.contextMenuEnforcedSelect = true;
                // Other items may however be selected so we deselect them
                this.appStore.unselectAllFrames();
            }
        },

        registerOnKeyboardFocusAddedForDeleteOperations(ctxMenuItemDef: StrypeContextMenuItem){
            this.handleOnKeyboardFocusChangeForDeleteOperations(ctxMenuItemDef, true);
        },

        registerOnKeyboardFocusRemovedForDeleteOperations(ctxMenuItemDef: StrypeContextMenuItem){
            this.handleOnKeyboardFocusChangeForDeleteOperations(ctxMenuItemDef, false);
        },

        handleOnKeyboardFocusChangeForDeleteOperations(ctxMenuItemDef: StrypeContextMenuItem, toSet: boolean){
            // There are 2 ways we want to show the cues: when the menu entry (wrapper) is hovered (1), or keyboard-focused (2).
            // This adds class observer callback for the delete/delete outer entries implementing (2) or remove it, depending on toSet.     
            const isDeleteEntry = this.contextMenuAllCanBeDeleted && ctxMenuItemDef.actionName == FrameContextMenuActionName.delete;
            const isDeleteOuterEntry = this.contextMenuCanDeleteOuter && ctxMenuItemDef.actionName == FrameContextMenuActionName.deleteOuter;
            if(isDeleteEntry || isDeleteOuterEntry){
                this.onDeleteEntryContextMenuHover(toSet, isDeleteOuterEntry);
            }
        },

        onDeleteEntryContextMenuHover(entering: boolean, isOuterDelete: boolean): void {
            // For compatibility with the tool previous versions, set the property in the store if not existing before
            if(!this.appStore.potentialDeleteFrameIds){
                this.appStore.potentialDeleteFrameIds = [];
                this.appStore.potentialDeleteIsOuter = false;
            }

            // Set the frame flag indicating we want to show in the UI that a frame could be deleted
            if(!entering){
                this.appStore.potentialDeleteFrameIds.splice(0);
            }
            else{
                // Add the target frames Ids in the flag array - they will always be shown no matter it's a single or outer delete
                // As we are modifying the potentialDeleteFrameIds while iterating through it, we need to make a copy on which we iterate
                const potentialDeleteFrameIDs = (this.appStore.selectedFrames.length > 0) ? [...this.appStore.selectedFrames] : [this.frameId];
                [...potentialDeleteFrameIDs].forEach((targetFrameId) => {
                    if(isOuterDelete){
                        // Add the joint frames (if any) in the flag array if we are in an outer delete
                        potentialDeleteFrameIDs.push(...this.appStore.frameObjects[targetFrameId].jointFrameIds);
                    }
                    else{
                        // Add all the children and joints of the targets in the flag array if we are in a single delete
                        potentialDeleteFrameIDs.push(...getAllChildrenAndJointFramesIds(targetFrameId));
                    }
                });
                this.appStore.potentialDeleteFrameIds.push(...potentialDeleteFrameIDs);
                this.appStore.potentialDeleteIsOuter = isOuterDelete;
            }
        },
        
        handleFrameDragStart(event: DragEvent) {
            // In order to control how the cursor looks, we handle the event ourselves...
            // drawback --> we also need to control what to show for the code snippet
            // being dragged with the cursor, and all consequent mouse events.
            // We don't perform a drag and drop if some code is exectued
            event.preventDefault();
            if(!this.isPythonExecuting) { 
                // The value to give to frameId in notifyDragStarted() depends on the situation:
                // when it's a selection of frames, we don't provide it, when it's a frame itself,
                // the value is the id of that dragged frame unless A) it's a joint frame: we use the
                // while frame structure and therefore us the id of the structure's root - or B) it's
                // a disabled frame: we need to check the outmost disabled ancestor to that frame ("unit")
                notifyDragStarted((this.isPartOfSelection)
                    ? undefined 
                    : ((this.isJointFrame) 
                        ? getParentOrJointParent(this.frameId) 
                        : ((this.isDisabled)
                            ? getOutmostDisabledAncestorFrameId(this.frameId)
                            : this.frameId)));

                // If the frame is being dragged (i.e. NOT part of a selection) then we should reposition the frame caret below.
                if(!this.isPartOfSelection){
                    this.appStore.toggleCaret({id: (this.isJointFrame) ? (getParentOrJointParent(this.frameId)) : this.frameId, caretPosition: CaretPosition.below});
                }
            }  
        },

        toggleCaret(event: MouseEvent): void {
            // When a mouseup event happens during drag and drop, we ignore the caret change, we handle with the D&D mechanism.
            if(event.type == "mouseup" && this.appStore.isDraggingFrame){
                return;
            }

            const clickedDiv: HTMLDivElement = event.target as HTMLDivElement;
            if(clickedDiv.classList.contains("prepend-self-only") || clickedDiv.classList.contains("prepend-self-comma")){
                // This call should not get throught when the "self" part of class functions is clicked upon.
                // The focus is already set in App.vue properly, and with the right frame caret position.
                // We don't want this method to mess up the state.
                // However, since no actual slot is clicked, the change from "self" to "self," isn't triggered.
                // We can retrieve the LabelSlotsStructure component because its ref is in the root object, and 
                // call updatePrependText() which will now notice the right context and do its work.
                vueComponentsAPIHandler.labelSlotsStructureComponentAPI?.forInstance[getFrameLabelSlotsStructureUID(this.frameId, 1)]
                    ?.updatePrependText();                
                return;
            }

            // This checks the propagated click events, and prevents the parent frame to handle the event as well, EXCEPT in the case of disabled frames:
            // if the clicked frame is disabled AND it is inside a disabled ancestor, we want to consider that ancestor instead, as the disabled block works as an unit.
            // Stop and Prevent do not work in this case, as the event needs to be propagated 
            // (for the context menu to close) but it does not need to trigger always a caret change.
            // Note: previous version checked the id, but that's not reliable as the div triggering the click may not have an id (or as formatted for the frame div)
            // therefore, another approach is to check that the clicked object is either the frame object (as done before) or find what it's nearest parent and get its ID.
            let frameDivParent = clickedDiv;
            while(!isIdAFrameId(frameDivParent.id)){
                frameDivParent = frameDivParent.parentElement as HTMLDivElement;
            }
            // Check the case of an inner disabled frame here:
            const clickedFrameId = parseFrameUID(frameDivParent.id);
            const isClickedFrameDisabled = this.appStore.frameObjects[clickedFrameId].isDisabled;
            const handleClickForFrameUID = (isClickedFrameDisabled) ? getFrameUID(getOutmostDisabledAncestorFrameId(clickedFrameId)) : this.UID;            
            
            // Now check we can call the rest of the method for the frame we want to trigger the caret toggle for.
            if((!isClickedFrameDisabled && frameDivParent.id !== this.UID) || (isClickedFrameDisabled && handleClickForFrameUID !== this.UID)){
                return;
            }

            // When we come from a text slot, we need to leave time for the text slot blur to be done, so we delay a bit this event
            setTimeout(() => this.changeToggledCaretPosition(event.clientY, frameDivParent, event.shiftKey), 100);
        },

        changeToggledCaretPosition(clickY: number, frameClickedDiv: HTMLDivElement, selectClick?: boolean): void{
            // We distinguish 2 cases: when the frame is enabled, and when the frame is disabled.
            // Disabled frames behaves as "unit": if a frame is disabled all inner positions aren't accessible (no caret),
            // therefore, a click inside a disabled block frame should place the frame caret either before or after, but not inside.
            const frameRect = (this.isDisabled) ? document.getElementById(this.UID)?.getBoundingClientRect() : frameClickedDiv.getBoundingClientRect();
            const headerRect = document.querySelector("#" + this.UID + " ." + scssVars.frameHeaderClassName)?.getBoundingClientRect();
            if(frameRect && headerRect){            
                let newCaretPosition: NavigationPosition = {frameId: this.frameId, caretPosition: CaretPosition.none, isSlotNavigationPosition: false}; 
                // The following logic applies to select a caret position based on the frame and the location of the click:
                // if a click occurs between the top of a frame and *its header top mid half (for enabled frames) or *the middle of the frame (for disabled frames)
                //    --> get the cursor visually above the frame
                // for enabled frames: if a click occurs within the frame header bottom mid half
                //    --> get the cursor below the frame (if statement) or top of body (if block)
                // if a click occurs below the header mid half (enabled frames) OR below the middle of the frame (disabled frames)
                //    --> get the cursor below the frame (if statement or disabled frame) or at the nearest above/below position (if block)
                //Note: joint frames overlap their root parent, they get the click as a standalone frame
                if(clickY <= (frameRect.top + ((this.isDisabled) ? frameRect.height : headerRect.height)/2)){
                    // For disabled joint frames: we won't be able to get the caret position above directly using getAboveFrameCaretPosition(), because disabled
                    // joint frame do not have any available position for the frame cursor, so we need to look for it manually.
                    const jointParentId = this.appStore.frameObjects[this.frameId].jointParentId;
                    if(jointParentId > 0 && this.isDisabled){
                        // We need to find the nearest enabled sibling of this joint frame. 
                        // If we found one, we place the caret below the last of that sibling's children, or inside its body if it has no child,
                        // if we didn't find, we place the caret below the last of the root's children, or inside its body if it has no child.
                        const thisJointChildPos = this.appStore.frameObjects[jointParentId].jointFrameIds.indexOf(this.frameId);
                        const lastEnabledJointPrecedingSibling = this.appStore.frameObjects[jointParentId].jointFrameIds
                            .find((jointFrameId, index) => (index < thisJointChildPos && !this.appStore.frameObjects[jointFrameId].isDisabled));
                        const previousFrameSiblingOrRoot = lastEnabledJointPrecedingSibling ?? jointParentId;         
                        const prevFrameSiblingLastChildFrameId = this.appStore.frameObjects[previousFrameSiblingOrRoot].childrenIds.at(-1);
                        newCaretPosition.caretPosition = (prevFrameSiblingLastChildFrameId) ? CaretPosition.below : CaretPosition.body;
                        newCaretPosition.frameId = prevFrameSiblingLastChildFrameId ?? previousFrameSiblingOrRoot;
                    }
                    else{
                        newCaretPosition = getAboveFrameCaretPosition(this.frameId);
                    }
                }
                else{
                    if(!this.isDisabled && this.isBlockFrame){
                        // When we are here, we try to find the nearest above or below position of the block's child (if any)
                        // We get all the mid frame positions that will decided whether we are targetting above or below a frame.
                        // We traverse each positions until we found where the click (vertically) occured, if nothing is found, we
                        // then assume the click is vertically beyond the children and therefore toggle the caret below the current frame
                        const midFramePositions = this.getBodyMidFramePositions();
                        let hasPassedPosition = false;
                        let previousThreshold = 0;
                        for(const midFrameThresholdPos of midFramePositions){
                            hasPassedPosition = (clickY >= previousThreshold && clickY < midFrameThresholdPos.midYThreshold);
                            previousThreshold = midFrameThresholdPos.midYThreshold;
                            if(hasPassedPosition){
                                newCaretPosition.frameId = midFrameThresholdPos.caretPos.id;
                                newCaretPosition.caretPosition = midFrameThresholdPos.caretPos.caretPosition;
                                break;
                            }
                        }
                        if(!hasPassedPosition){
                            // If we have passed the mid frame vertical threshold of the last body's child
                            // the caret position would be the bottom of that containing frame, except in
                            // the case of a joint structure when in between joints: since the below positions
                            // in between joints are disabled, the caret will be still be at the last child's bottom.
                            // If that joint has no children, we keep in its body.
                            // If the joint frame is the last of the structure, then we need to show the caret below for the root parent.
                            if(isFramePartOfJointStructure(this.frameId)){
                                if(this.appStore.frameObjects[this.frameId].jointParentId > 0 && isLastInParent(this.frameId)){
                                    // Case of a joint frame which is last of of the joint structure
                                    newCaretPosition.frameId = this.appStore.frameObjects[this.frameId].jointParentId;
                                    newCaretPosition.caretPosition = CaretPosition.below;
                                }
                                else{
                                    // Case of root joint frame or  joint frame which is not last of the joint structure
                                    if(this.appStore.frameObjects[this.frameId].childrenIds.length > 0){
                                        newCaretPosition.frameId = [...this.appStore.frameObjects[this.frameId].childrenIds].pop() as number;// get the last joint child frame id
                                        newCaretPosition.caretPosition = CaretPosition.below;
                                    }
                                    else{
                                        newCaretPosition.caretPosition = CaretPosition.body;
                                    }    
                                }                                                
                            } 
                            else{
                                newCaretPosition.caretPosition = CaretPosition.below;   
                            }
                        }
                    }
                    else{
                        // If we have clicked a disabled joint frame, we need to get "below", which does not exist for joint frames.
                        // Therefore, it will be either in the body of the next enabled joint frame of this structure, or below the root.
                        const jointParentId = this.appStore.frameObjects[this.frameId].jointParentId;
                        if(jointParentId > 0) {
                            const thisJointChildPos = this.appStore.frameObjects[jointParentId].jointFrameIds.indexOf(this.frameId);
                            const firstEnabledJointFollowingSibling = this.appStore.frameObjects[jointParentId].jointFrameIds
                                .find((jointFrameId, index) => (index > thisJointChildPos && !this.appStore.frameObjects[jointFrameId].isDisabled));
                            newCaretPosition.caretPosition = (firstEnabledJointFollowingSibling) ? CaretPosition.body : CaretPosition.below;
                            newCaretPosition.frameId = firstEnabledJointFollowingSibling ?? jointParentId;
                        }
                        else{
                            newCaretPosition.caretPosition = CaretPosition.below;
                        }
                    }
                }

                // Before we toggle the caret, there is on last check to make: if we are doing a shift-click selection,
                // we need to make sure the selection is valid, and if it is, also have the selection rendered in the UI.
                // A selection of frames with shift+click is valid if those frames have the same parent (same level frames).
                if(selectClick){
                    const originFrameParentId = (this.appStore.currentFrame.caretPosition == CaretPosition.body)
                        ? this.appStore.currentFrame.id
                        : this.appStore.frameObjects[this.appStore.currentFrame.id].parentId;
                    const targetFrameParentId = (newCaretPosition.caretPosition == CaretPosition.body)
                        ? newCaretPosition.frameId
                        : this.appStore.frameObjects[newCaretPosition.frameId].parentId;
                    // The selection is valid we can put this selection in effect, otherwise we get back to the initial position..
                    if(originFrameParentId == targetFrameParentId && (this.appStore.currentFrame.id != newCaretPosition.frameId)){
                        this.appStore.shiftClickSelection(
                            {clickedFrameId:newCaretPosition.frameId, clickedCaretPosition: newCaretPosition.caretPosition as CaretPosition}
                        );
                    }
                    else{
                        this.appStore.toggleCaret({id: this.appStore.currentFrame.id, caretPosition: this.appStore.currentFrame.caretPosition});
                    }
                    return;
                }
                this.appStore.toggleCaret({id: newCaretPosition.frameId, caretPosition: newCaretPosition.caretPosition as CaretPosition});
            }
        },

        getBodyMidFramePositions(): {caretPos: CurrentFrame, midYThreshold: number}[] {
            if ((this.appStore.frameObjects[this.frameId].collapsedState ?? CollapsedState.FULLY_VISIBLE) != CollapsedState.FULLY_VISIBLE) {
                return [];
            }
            
            // The mid frame positions for the "body" part of a block frames have at least 1 entity:
            // - A) the parent's body position (top of the body) that would be selected 
            //    when the click vertical position is above the middle of the first child (when there are children) or above the middle of the empty body space (if no children)
            // If there are frames in the body, we have B) all the mid frame positions of the children
            const midFramePosArray: {caretPos: CurrentFrame, midYThreshold: number}[] = [];
            const frameBodyRect = document.getElementById(getFrameBodyUID(this.frameId))?.getBoundingClientRect() as DOMRect;
                        
            const bodyFrameIds = this.appStore.frameObjects[this.frameId].childrenIds;
            if(bodyFrameIds.length > 0){
                // A) + B)
                bodyFrameIds.forEach((childFrameId) => {
                    const childFrameDivRect = document.getElementById(getFrameUID(childFrameId))?.getBoundingClientRect() as DOMRect;
                    const prevPos = getAboveFrameCaretPosition(childFrameId);
                    midFramePosArray.push({caretPos: {id: prevPos.frameId, caretPosition: prevPos.caretPosition as CaretPosition},
                        midYThreshold: childFrameDivRect.top + childFrameDivRect.height/2 });
                });

                // Add the last part (after the last frame) of B)
                const lastChildFrameId = bodyFrameIds[bodyFrameIds.length - 1];
                const lastChildFrameDivRect = document.getElementById(getFrameUID(lastChildFrameId))?.getBoundingClientRect() as DOMRect;
                midFramePosArray.push({caretPos: {id: lastChildFrameId, caretPosition: CaretPosition.below},
                    midYThreshold: lastChildFrameDivRect.bottom + (frameBodyRect.bottom - lastChildFrameDivRect.bottom)/2});
            } 
            else{
                // Add A) for no children body: the mid frame position is then taken as the 3/4 frame of the containing frame
                // because we want to have a bit more space for clicking within the empty body to get the caret inside the body
                midFramePosArray.push({caretPos: {id: this.frameId, caretPosition: CaretPosition.body},
                    midYThreshold: frameBodyRect.top + frameBodyRect.height*0.75});
            }

            return midFramePosArray;
        },

        duplicate(keepSelection?: boolean): void {
            // Essentially: copy, then paste:
            const text = copyFrameTextReadyForClipboard(this.isPartOfSelection ? this.appStore.selectedFrames : [this.frameId]);
            // We need to remember the selection in order to restore it:
            pasteMixedPython(text, {id: this.isPartOfSelection ? this.appStore.selectedFrames.at(-1) as number : this.frameId, caretPosition: CaretPosition.below}, false, keepSelection ?? false);

        },

        cut(): void {
            // Cut prepares a copy, then we delete the selection / frame copied
            this.copy();
            if(this.isPartOfSelection){
                //for deleting a selection, we don't care if we simulate "delete" or "backspace" as they behave the same
                this.appStore.deleteFrames("Delete");
            }
            else{
                // When deleting the specific frame, we usually place the caret below and simulate "backspace".
                // In the situation of a whole joint frame structure (like an if/elif/else), we need to repeat the deletion
                // for each joint of the structure (otherwise, it will only delete the last one).
                // In the case of a joint frame (like the else part), the frame "below" doesn't exist: we need to get the right position
                const numberOfJoints = this.appStore.frameObjects[this.frameId].jointFrameIds.length;
                let deletionCommand = "Backspace";
                if(this.isJointFrame){
                    // If we are cutting the joint of a joit frame structure, we need to position the caret properly:
                    // if we are cutting the last joint, then we position the caret below the root of the structure (and do the backspace deletion);
                    // if we are cutting a non terminating joint frame, we need to get inside the previous joint part (or the root) and make the 
                    // deletion with a "delete" comment instead.
                    const rootJointFrameId = this.appStore.frameObjects[this.frameId].jointParentId;
                    const indexOfJoint = this.appStore.frameObjects[rootJointFrameId].jointFrameIds.findIndex((fId) => fId == this.frameId);
                    const isLastJoint = (this.appStore.frameObjects[rootJointFrameId].jointFrameIds.length == indexOfJoint + 1);
                    if(isLastJoint){
                        this.appStore.setCurrentFrame({id: rootJointFrameId, caretPosition: CaretPosition.below} as CurrentFrame);
                    }
                    else{
                        deletionCommand = "Delete";
                        const aboveFrameIdToGetTo = (indexOfJoint > 0) ? getLastSibling(this.frameId) : rootJointFrameId;
                        const previousJointLastChildFrameId = this.appStore.frameObjects[aboveFrameIdToGetTo]
                            .childrenIds.at(-1);
                        this.appStore.setCurrentFrame({id: (previousJointLastChildFrameId != undefined) ? previousJointLastChildFrameId : aboveFrameIdToGetTo,
                            caretPosition: (previousJointLastChildFrameId != undefined) ? CaretPosition.below : CaretPosition.body} as CurrentFrame);
                    }
                }
                else{
                    this.appStore.setCurrentFrame({id: this.frameId, caretPosition: CaretPosition.below} as CurrentFrame);
                }
                this.appStore.deleteFrames(deletionCommand);
                for(let i = 0; i < numberOfJoints; i++){
                    this.appStore.deleteFrames(deletionCommand);
                }
            }                    
        },

        copy(): void {
            copyFramesToClipboard(this.isPartOfSelection ? this.appStore.selectedFrames : [this.frameId]);
        },

        downloadAsImg(): void {
            // We use HTML2Canvas to produce "screenshots" of elements, and our own rendering container canvas to
            // allow a background surrouding by 2px the screenshots, and get a final image.
            // There are two situations: the copy is request on a particular frame OR a selection of frames.
            // So to make things easier, we follow this approach, when a frame is in a selection, we don't use HTML2Canvas
            // to copy each frame of the selection, but we copy the containing frame instead and crop to the selection.  
            // In all cases, we use the same background colour as the container of those frames.   
            // Note: initially doing a "copy as image" to the clipboard, we changed this functionality to downloading the image
            // because of the delay incurred by waiting for the promise fulfillment with html2canvas.                                   "          
            const containingRenderingCanvas = document.createElement("canvas");
            const containingRenderingCanvasCtxt = containingRenderingCanvas.getContext("2d", {willReadFrequently: true});
            if(containingRenderingCanvasCtxt) {
                // Wait a bit before retrieving the first image as the UI may still show the context menu.
                const targetContainerFrameId = this.appStore.frameObjects[(this.isPartOfSelection) ? this.appStore.selectedFrames[0] : this.frameId].parentId;
                const targetFrameId = (this.isPartOfSelection) ? targetContainerFrameId : this.frameId;
                setTimeout(() => {
                    const targetFrameElement = document.getElementById(getFrameUID(targetFrameId));
                    if(targetFrameElement) {    
                        // The background is the parent's body's background. That means if the parent is the import container or
                        // the function defs container, the background will be the same as these containers, and every other parent
                        // type will have the normal "body" content yellow background.
                        const backgroundColor = (targetContainerFrameId == this.appStore.getImportsFrameContainerId || targetContainerFrameId == this.appStore.getDefsFrameContainerId)
                            ? scssVars.nonMainCodeContainerBackground
                            : scssVars.mainCodeContainerBackground;
                        let h2cOptions = {backgroundColor: backgroundColor, removeContainer: false} as {[key: string]: any};
                        if(this.isPartOfSelection){
                            // Get the crop options for getting only the selection of frames
                            h2cOptions = {...h2cOptions, ...getHTML2CanvasFramesSelectionCropOptions(targetFrameId)};
                        }
                        html2canvas(targetFrameElement, h2cOptions)
                            .then((html2canvasEl) => {
                                const targetFrameImg = new Image();
                                targetFrameImg.onload = () => {
                                    // Now that we have our images loaded, we can work on the placing them in our own containing canvas.
                                    // 1) let's put a background first (with a padding of 4 px)
                                    containingRenderingCanvas.width = targetFrameImg.width + 4;
                                    containingRenderingCanvas.height = targetFrameImg.height + 4;
                                    containingRenderingCanvasCtxt.fillStyle = backgroundColor;
                                    containingRenderingCanvasCtxt.fillRect(0, 0, containingRenderingCanvas.width, containingRenderingCanvas.height);
                                    // 2) let's add the frame(s) image (starting off at 5px away)
                                    containingRenderingCanvasCtxt.drawImage(targetFrameImg, 2, 2);
                                    // 3) Download the resulting image
                                    containingRenderingCanvas.toBlob((blob) => {
                                        if(blob){
                                            saveAs(blob, `strype_code_${getDateTimeFormatted(new Date(Date.now()))}.png`);
                                        }
                                    });
                                };
                                targetFrameImg.src = html2canvasEl.toDataURL("image/png");
                            });
                    }
                }, 10);
            }
        },

        pasteAbove(): void {
            // Perform a paste above this frame
            // We look for the position above. The reference however depends whether the currently clicked frame is disabled: inside a disabled structure, a frame won't
            // be always be listed in available positions because the disabled structure is like an unit. In that case, we need to find what is the next available frame.
            // We first find the outmost disabled frame of the disabled structure (call it MO). If that frame MO is joint frame, the next available frame is inside the next enabled sibling
            // (that is, its body) OR the joint root frame when there is no next enabled sibling.
            // If the frame MO is not a joint frame, the next available frame is MO itself.
            let frameIdToLookAbove = this.frameId;
            if(this.isDisabled){
                const outmostDisabledFrameId = getOutmostDisabledAncestorFrameId(this.frameId);
                if(this.appStore.frameObjects[outmostDisabledFrameId].frameType.isJointFrame){
                    const rootFrameId = this.appStore.frameObjects[outmostDisabledFrameId].jointParentId;
                    const jointFrameIndex = this.appStore.frameObjects[rootFrameId].jointFrameIds.indexOf(outmostDisabledFrameId);
                    const nextEnabledSiblingId = this.appStore.frameObjects[rootFrameId].jointFrameIds.find((aJointFrameId, index) => index > jointFrameIndex && !this.appStore.frameObjects[aJointFrameId].isDisabled)??-1;
                    if(nextEnabledSiblingId > -1){
                        frameIdToLookAbove = nextEnabledSiblingId; 
                    }
                    else{
                        frameIdToLookAbove = rootFrameId;                            
                    }
                }
                else{
                    frameIdToLookAbove = outmostDisabledFrameId;
                }
            }
            const caretNavigationPositionAbove = getAboveFrameCaretPosition(frameIdToLookAbove);
            navigator.clipboard.readText().then((text) => pasteMixedPython(text, {id: caretNavigationPositionAbove.frameId, caretPosition: caretNavigationPositionAbove.caretPosition ?? CaretPosition.below}));
        },

        pasteBelow(): void {
            // Perform a paste below this frame
            const targetPasteBelow = this.getTargetPasteBelow();
            navigator.clipboard.readText().then((text) => pasteMixedPython(text, targetPasteBelow));
        },

        getTargetPasteBelow(): CurrentFrame {
            // Because of joint frames, pasting below isn't as straight forward as using the clicked (target) frame and caret below position:
            // if we are pasting a non joint frame below the last joint child, then we need to paste as if it was the joint root parent below,
            // if we are pasting a joint frame below another joint frame, then we need to paste as if it was below the last child of target joint
            //    or in the target joint frame body if there are no children.
            const targetFrameId = (isFramePartOfJointStructure(this.frameId)) 
                ? ([...this.appStore.frameObjects[this.frameId].childrenIds].pop())??this.frameId 
                : this.frameId;
            const caretPosition = (isFramePartOfJointStructure(this.frameId) 
                && this.appStore.frameObjects[this.frameId].childrenIds.length == 0)
                ? CaretPosition.body
                : CaretPosition.below;
            return  {id: targetFrameId, caretPosition: caretPosition};
         
        },

        enableDisable(options: {isDisabling?: boolean, keepSelection?: boolean}): void {
            const {isDisabling, keepSelection} = options;
            if(this.isPartOfSelection){
                this.appStore.changeDisableSelection({isDisabling, keepSelection});
            }
            else {
                this.appStore.changeDisableFrame(
                    {
                        frameId: this.frameId,
                        isDisabling: !!isDisabling, // must be a valid value in this case
                    }
                );
            }
        },

        delete(): void {
            if(this.isPartOfSelection){
                // For deleting a selection, we don't care if we simulate "delete" or "backspace" as they behave the same
                this.appStore.deleteFrames("Delete");
            }
            else{
                // When deleting the specific frame, we place the caret below and simulate "backspace"
                // (special case for joint frames: we go inside the body's next joint sibling, or below root if no next joint sibling)
                const newCurrentFrame = {id: this.frameId, caretPosition: CaretPosition.below};
                if(this.isJointFrame) {
                    if(isLastInParent(this.frameId)){
                        newCurrentFrame.id = getParentOrJointParent(this.frameId);
                    }
                    else{
                        newCurrentFrame.id = getNextSibling(this.frameId);
                        newCurrentFrame.caretPosition = CaretPosition.body;
                    }
                }
                this.appStore.setCurrentFrame(newCurrentFrame);
                this.appStore.deleteFrames("Backspace");
            }       
        },

        toggleSelectedFrameDisable(keepSelection?: boolean){
            // Enable/disable each selected frames based on their status.
            this.enableDisable({keepSelection});
        },

        deleteOuter(): void {
            this.appStore.deleteOuterFrames(this.frameId);
        },

        setCollapse(collapsedState: CollapsedState) {
            const frames = this.isPartOfSelection ? this.appStore.selectedFrames : [this.frameId];
            for (let frameId of frames) {
                const frame = this.appStore.frameObjects[frameId];
                if (frame.frameType.allowedCollapsedStates.includes(collapsedState)) {
                    // Extra rule: frozen functions can't be fully expanded
                    if (frame.frameType.type == AllFrameTypesIdentifier.funcdef && frame.frozenState == FrozenState.FROZEN && collapsedState == CollapsedState.FULLY_VISIBLE) {
                        // Do nothing
                    }
                    else {
                        this.appStore.setCollapseStatuses({[frameId]: collapsedState});
                    }
                }
            }
        },

        setFreeze(frozenState: FrozenState) {
            const frames = this.isPartOfSelection ? this.appStore.selectedFrames : [this.frameId];
            for (let frameId of frames) {
                let frame = this.appStore.frameObjects[frameId];
                let frameType = frame.frameType;
                if (frameType.allowedFrozenStates.includes(frozenState)) {
                    this.appStore.setFrozenStatus({frameId: frameId, frozen: frozenState});
                    if (frameType.type === AllFrameTypesIdentifier.funcdef) {
                        // If we freeze a function it can't be fully visible:
                        if (frozenState == FrozenState.FROZEN && (frame.collapsedState ?? CollapsedState.FULLY_VISIBLE) == CollapsedState.FULLY_VISIBLE) {
                            this.appStore.cycleFrameCollapsedState(frameId);
                        }
                    }
                    // We also need to adjust all the children to not be fully visible:
                    for (let childId of frame.childrenIds) {
                        const child = this.appStore.frameObjects[childId];
                        if (frozenState == FrozenState.FROZEN && (child.collapsedState ?? CollapsedState.FULLY_VISIBLE) == CollapsedState.FULLY_VISIBLE && child.frameType.allowedCollapsedStates.length > 1) {
                            // We cycle it to the next one:
                            this.appStore.cycleFrameCollapsedState(childId);
                        }
                    }
                }
            }
        },
        
        collapseToHeader() : void {
            this.setCollapse(CollapsedState.ONLY_HEADER_VISIBLE); 
        },

        collapseToDocumentation() : void {
            this.setCollapse(CollapsedState.HEADER_AND_DOC_VISIBLE);
        },

        collapseToFull() : void {
            this.setCollapse(CollapsedState.FULLY_VISIBLE);
        },
        
        freeze() : void {
            this.setFreeze(FrozenState.FROZEN);
        },
        
        unfreeze() : void {
            this.setFreeze(FrozenState.UNFROZEN);
        },

        showFrameParseErrorPopupOnHeaderFocus(isFocusing: boolean): void{
            // We need to be able to show the frame error popup programmatically
            // (if applies) when we navigate to the error - we make sure the frame still exists.
            if(this.appStore.frameObjects[this.frameId] && (this.hasParsingError || this.hasRuntimeError || this.wasLastRuntimeError)){
                if(isFocusing){
                    this.toggleErrorPopover.show();
                }
                else{
                    this.toggleErrorPopover.hide();
                }
            }
        },
    },
});
</script>

<style lang="scss">
.#{$strype-classname-frame-div} {    
    padding-top: 1px;
    padding-bottom: 1px;
    border-radius: 8px;
    border: 1px solid transparent;
    min-height: $frame-container-min-height;
    outline: none;
}

.#{$strype-classname-frame-header} {
    border-radius: 5px;
    justify-content: space-between;
}

.error {
    border: 2px solid #d66 !important;
}

// modification of default bootstrap popover classes
.title-popover {
    font-weight: 500;
    background-color: #F7F7F7 !important;
    line-height: 1.2;
    --bs-popover-header-padding-x: 0.75rem;
    --bs-popover-header-padding-y: 0.5rem;
}

.modified-title-popover {
    color: #d66 !important;
}

.blockFrameDiv {
    border-color: #8e8e8e;
}

.statementFrameDiv:not(.disabled):hover {
    border-color: #d6d6d6;
}

.selected {
    border-left: 3px solid #000000 !important;
    border-right: 3px solid #000000 !important;
}

.selectedTop {
    border-top: 3px solid #000000 !important;
}

.selectedBottom {
    border-bottom: 3px solid #000000 !important;
}

.selectedTopBottom{
    border-top: 3px solid #000000 !important;
    border-bottom: 3px solid #000000 !important;
}
</style>
