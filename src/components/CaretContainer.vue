<template>
    <div 
        :class="{[scssVars.caretContainerClassName]: true, 'static-caret-container': isStaticCaretContainer, [scssVars.draggingFrameClassName]: areFramesDraggedOver}"
        @click.exact.prevent.stop="toggleCaret()"
        @contextmenu.prevent.stop="handleClick($event)"
        :key="UID"
        :id="UID"
    >
        <ContextMenu 
            :contextMenuItemsDef="frameContextMenuItems"
            :showContextMenu="showContextMenu"
            :showAt="showContextMenuAtCoordPos"
            :onOpened="handleContextMenuOpened"           
            :onClosed="handleContextMenuClosed"
        />
        <Caret
            :class="scssVars.navigationPositionClassName + ' ' + scssVars.caretClassName"
            :id="caretUID"
            :isInvisible="isInvisible"
            v-blur="isCaretBlurred"
            :areFramesDraggedOver="areFramesDraggedOver"
            :areDropFramesAllowed="areDropFramesAllowed"
            :isDuplicateDnDAction="isDuplicateDnDAction"
        />
    </div>
</template>


<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import { defineComponent, PropType } from "vue";
import { useStore } from "@/store/store";
import Caret from"@/components/Caret.vue";
import { AllFrameTypesIdentifier, CaretPosition, Position, MessageDefinitions, PythonExecRunningState, FrameContextMenuActionName, CurrentFrame, CollapsedState, StrypeContextMenuItem, CoordPosition } from "@/types/types";
import { getCaretUID, setContextMenuEventClientXY, getAddFrameCmdElementUID, CustomEventTypes, getCaretContainerUID } from "@/helpers/editor";
import { mapStores } from "pinia";
import { cloneDeep } from "lodash";
import { getAboveFrameCaretPosition, getFrameSectionIdFromFrameId } from "@/helpers/storeMethods";
import { pasteMixedPython } from "@/helpers/pythonToFrames";
import scssVars  from "@/assets/style/_export.module.scss";
import {detectBrowser} from "@/helpers/browser";
import { vueComponentsAPIHandler } from "@/helpers/vueComponentAPI";
import { eventBus } from "@/helpers/appContext";
// #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
import { getFrameDefType, SlotType, MediaDataAndDim} from "@/types/types";
import { getFrameLabelSlotsStructureUID, getLabelSlotUID } from "@/helpers/editor";
import { preparePasteMediaData } from "@/helpers/media";
import { getParentOrJointParent } from "@/helpers/storeMethods";
// #v-endif

//////////////////////
//     Component    //
//////////////////////
export default defineComponent({
    name: "CaretContainer",

    components: {
        Caret,
    },

    created(){
        // Expose this component that other components might need.
        // Vue 3 has deprecated direct access to components.
        // (we don't set it in setup() because we want to have this accessible, and the component created!)
        const apiMethods = {
            setAreFramesDraggedOver: (value: boolean) => {
                this.areFramesDraggedOver = value;
            },
            getAreDropFramesAllowed: () => {
                return this.areDropFramesAllowed;
            },
            setAreDropFramesAllowed: (value: boolean) => {
                this.areDropFramesAllowed = value;
            },
            setIsDuplicateDnDAction: (value: boolean) => {
                this.isDuplicateDnDAction = value;
            },
            handleClick: this.handleClick,
            doPaste: this.doPaste,
        };
        
        if(vueComponentsAPIHandler.caretContainerComponentAPI == null){    
            vueComponentsAPIHandler.caretContainerComponentAPI = {
                forInstance: {
                    [this.UID]: apiMethods,
                },
            };
        }
        else{
            vueComponentsAPIHandler.caretContainerComponentAPI.forInstance[this.UID] = apiMethods;
        }
    },

    props: {
        frameId: {type: Number, required: true},
        caretVisibility: String, //Flag indicating this caret is visible or not
        caretAssignedPosition: {
            type: String as PropType<CaretPosition>,
            required: true,
        },
        isFrameDisabled: Boolean,
    },

    computed: {
        ...mapStores(useStore),
        
        isEditing(): boolean {
            return this.appStore.isEditing;
        },

        isInvisible(): boolean {
            // The caret is only visible when editing is off, 
            // and either one frame is currently selected 
            // OR when a frame or a frame selection is dragged over.
            return !(!this.isEditing && this.caretVisibility === this.caretAssignedPosition || this.areFramesDraggedOver); 
        },

        isStaticCaretContainer(): boolean {
            // Function definition frames are spaced, so we keep the caret container static (with the caret height) 
            // for such frames (meaning if there are more than 1 frame, all but last caret container should be static)
            const frameType = this.appStore.frameObjects[this.frameId].frameType.type;
            const parentFrame = this.appStore.frameObjects[this.appStore.frameObjects[this.frameId].parentId];
            return (
                // We are a class or function:
                (frameType == AllFrameTypesIdentifier.funcdef || frameType == AllFrameTypesIdentifier.classdef)
                // We're below a frame (i.e. not the top caret position in the container:
                && this.caretAssignedPosition == CaretPosition.below
                // We are one of multiple children, and not the last one:
                && parentFrame.childrenIds.length > 1 && parentFrame.childrenIds.at(-1) != this.frameId
                // And we and our neighbour following us are not both folded in (i.e. at least one of us is unfolded)
                && (((this.appStore.frameObjects[this.frameId].collapsedState ?? CollapsedState.FULLY_VISIBLE) != CollapsedState.ONLY_HEADER_VISIBLE)
                    // We know there is a frame after us because of the check we just did:
                    || ((this.appStore.frameObjects[parentFrame.childrenIds[parentFrame.childrenIds.indexOf(this.frameId) + 1]].collapsedState ?? CollapsedState.FULLY_VISIBLE) != CollapsedState.ONLY_HEADER_VISIBLE))
            );
        },

        // Needed in order to use the `CaretPosition` type in the v-show
        caretPosition(): typeof CaretPosition {
            return CaretPosition;
        },

        UID(): string {
            return getCaretContainerUID(this.caretAssignedPosition,this.frameId);
        },

        caretUID(): string {
            return getCaretUID(this.caretAssignedPosition, this.frameId);
        },

        isPythonExecuting(): boolean {
            return (this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning;
        },

        pasteAvailable(): boolean {
            return this.appStore.isCopiedAvailable;
        },

        pasteMenuActionName(): FrameContextMenuActionName {
            return FrameContextMenuActionName.paste;
        },

        isCaretBlurred(): boolean {
            //if the frame isn't disabled, we never blur the caret. If the frame is disabled, then we check if frames can be added to decide if we blur or not.
            return this.isFrameDisabled && ((this.caretAssignedPosition ===  CaretPosition.below) ? !this.appStore.canAddFrameBelowDisabled(this.frameId) : true);
        },
        
        isFocusedForPaste(): boolean {
            return !this.isPythonExecuting && !this.appStore.isModalDlgShown && !this.isEditing && this.caretVisibility !== CaretPosition.none && (this.caretVisibility === this.caretAssignedPosition);
        },
    },

    data: function () {
        return {
            CustomEventTypes, // just for using in template
            scssVars, // just to be able to use in template
            showPasteMenuItem: false,
            insertFrameMenuItems: [] as StrypeContextMenuItem[],
            areFramesDraggedOver: false,
            areDropFramesAllowed: true,
            isDuplicateDnDAction: false,
            // Flag used to trigger the context menu opening
            showContextMenu: false,
            // Prepare an empty version of the menu: it will be updated as required in handleClick()
            frameContextMenuItems: [] as StrypeContextMenuItem[],
            showContextMenuAtCoordPos: {x: 0, y: 0} as CoordPosition,
        };
    },

    mounted() {
        window.addEventListener("paste", this.pasteIfFocused);
        window.addEventListener("keydown", this.keydownForSafariPaste);
        document.addEventListener(CustomEventTypes.scrollCaretIntoView, this.putCaretContainerInView);
        // When a frame is added, we need to make sure it will be visible in the view port. This is particularly true
        // when a paste or duplicate action is performed.
        this.putCaretContainerInView();
    },

    unmounted() {
        window.removeEventListener("paste", this.pasteIfFocused);
        window.removeEventListener("keydown", this.keydownForSafariPaste);
        document.removeEventListener(CustomEventTypes.scrollCaretIntoView, this.putCaretContainerInView);
        // Remove the component's API instance
        if(vueComponentsAPIHandler.caretContainerComponentAPI?.forInstance[this.UID]){
            delete vueComponentsAPIHandler.caretContainerComponentAPI?.forInstance[this.UID];
        }
    },
    
    methods: {
        putCaretContainerInView(){
            if(this.caretVisibility !== CaretPosition.none && this.caretVisibility === this.caretAssignedPosition) {
                const caretContainerElement = document.getElementById(getCaretContainerUID(this.caretAssignedPosition, this.frameId));
                const caretContainerEltRect = caretContainerElement?.getBoundingClientRect();
                //is caret outside the viewport? if so, scroll into view (we need to wait a bit for the UI to be ready before we can perform the scroll)
                if(caretContainerEltRect && (caretContainerEltRect.bottom + caretContainerEltRect.height < 0 || caretContainerEltRect.top + caretContainerEltRect.height > document.documentElement.clientHeight)){
                    setTimeout(() => caretContainerElement?.scrollIntoView({block:"nearest"}), 100);
                }
            }  
        },
        
        keydownForSafariPaste(event: KeyboardEvent) {
            // Safari-specific code.  Safari doesn't turn Cmd-V into a paste if it believes the paste
            // is not applicable.  This can happen to us at frame cursors.  So we manually turn it into
            // paste if we believe Safari won't turn it into paste:
            // Note: Safari also won't paste if the clipboard is empty, which it is when frames are on the clipboard
            // So this solves both issues.
            if (this.isFocusedForPaste && detectBrowser() === "safari" && event.metaKey && event.key.toLowerCase() === "v") {
                navigator.clipboard.readText().catch((err) => {
                    // This can happen during Playwright testing:
                    console.error("Failed to read clipboard during frame paste", err);
                    return "";
                }).then((text) => {
                    this.pasteIfFocused(event, text);
                });
                
                event.stopPropagation();
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        },

        pasteIfFocused(event: Event, overrideText?: string) {
            // A paste via shortcut cannot get the verification that would be done via a click
            // so we check that 1) we are on the caret position that is currently selected and 2) that paste is allowed here.
            // We should know the action is about pasting frames or text if some text is present in the clipboard (we clear it when copying frames)
            if (this.isFocusedForPaste) {
                // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
                const inFrameType = this.appStore.frameObjects[(this.appStore.currentFrame.caretPosition == CaretPosition.body) ? this.frameId : getParentOrJointParent(this.frameId)].frameType;
                if(!inFrameType.forbiddenChildrenTypes.includes(AllFrameTypesIdentifier.funccall) && Object.values((event as ClipboardEvent).clipboardData?.items??[]).some((dataTransferItem: DataTransferItem) => dataTransferItem.kind == "file" && /^(image)|(audio)\//.test(dataTransferItem.type))){
                    // For the special case of image media, we want to simulate the addition of a method call with that media.
                    // Therefore, we will need to "wrap" around the media literal value with our usual wrappers.
                    // We don't rely on the frame authorised children rules for that, because we don't have a copied frame in the state.
                    // We know a media frame cannot be inside an import section, nor directly inside a definition section, nor directly inside a class or function frame
                    // (this test is done first in the condition above).
                    preparePasteMediaData(event as ClipboardEvent, (code: string, dataAndDim: MediaDataAndDim) => {
                        // We create a new function call frame with the media-adapated code content
                        const stateBeforeChanges = cloneDeep(this.appStore.$state);
                        this.appStore.ignoreStateSavingActionsForUndoRedo = true;
                        this.appStore.addFrameWithCommand(getFrameDefType(AllFrameTypesIdentifier.funccall), undefined, true).then((frameId) => {
                            this.appStore.setFrameEditableSlotContent(
                                {
                                    frameId: frameId,
                                    labelSlotsIndex: 0,
                                    slotId: "0",
                                    slotType: SlotType.media,
                                    code: code,
                                    mediaType: dataAndDim.itemType,
                                    initCode: "",
                                    isFirstChange: true,
                                }
                            )
                                .then(()=>{
                                    // The slot has not yet been refactored to reflect that it has media in it with multiple slots, and placing the cursor is a bit fragile.
                                    // So what we do is remain at the preceding frame cursor,  then after refactoring, we move right twice (once to go in to the frame, once to go past the image): 
                                    
                                    // Refactor the slots, we call the refactorisation on the LabelSlotsStructure   
                                    // Since that's our last action, we can revert the flag to allow the registration of the state for undo/redo
                                    this.appStore.ignoreStateSavingActionsForUndoRedo = false;                                   
                                    vueComponentsAPIHandler.labelSlotsStructureComponentAPI?.forInstance[getFrameLabelSlotsStructureUID(frameId, 0)]
                                        .checkSlotRefactoring(getLabelSlotUID({frameId: frameId, labelSlotsIndex: 0, slotId: "0", slotType: SlotType.code}), stateBeforeChanges, {doAfterCursorSet: () => {
                                            this.appStore.leftRightKey({key: "ArrowRight"}).then(() => this.appStore.leftRightKey({key: "ArrowRight"}));
                                        }});                                        
                                });
                        });                        
                    });
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    event.stopPropagation();
                    return;
                }
                // #v-endif
                const pythonCode = overrideText ?? (event as ClipboardEvent).clipboardData?.getData("text");
                if (this.pasteAvailable && (pythonCode == undefined || pythonCode.trim().length == 0)) {
                    // We check if pasting frames is possible here, if not, show a message.
                    //we need to update the context menu as if it had been shown
                    const isPasteAllowedAtFrame = this.appStore.isPasteAllowedAtFrame(this.frameId, this.caretAssignedPosition);
                    if(isPasteAllowedAtFrame){
                        this.appStore.contextMenuShownId = this.UID;
                        this.doPaste("caret");
                    }
                    else{
                        this.appStore.showMessage(MessageDefinitions.ForbiddenFramePaste, 3000);
                        return;
                    }
                }
                else {
                    // Note we don't permanently trim the code because we need to preserve leading indent.
                    // But we trim for the purposes of checking if there's any content at all:
                    if (pythonCode != undefined && pythonCode?.trim()) {
                        pasteMixedPython(pythonCode.trimEnd(), false);
                    }
                    // Must take ourselves off the clipboard after:
                    useStore().copiedFrames = {};
                    useStore().copiedSelectionFrameIds = [];
                }
            }
        },

        handleContextMenuOpened() {
            document.dispatchEvent(new CustomEvent(CustomEventTypes.requestAppNotOnTop, {detail: true}));
        },

        handleContextMenuClosed(){
            this.appStore.isContextMenuKeyboardShortcutUsed=false;
            this.showContextMenu = false;
            document.dispatchEvent(new CustomEvent(CustomEventTypes.requestAppNotOnTop, {detail: false}));
        },

        handleClick (event: MouseEvent, positionForMenu?: Position): void {
            // Do not show any menu if the user's code is being executed
            if(this.isPythonExecuting){
                return;
            }
            
            if(this.appStore.isContextMenuKeyboardShortcutUsed){
                // The logic for handling the context menu opened via a keyboard shortcut is handled by App
                return;
            }

            this.appStore.contextMenuShownId = this.UID;

            this.showPasteMenuItem = this.pasteAvailable && this.appStore.isPasteAllowedAtFrame(this.frameId, this.caretAssignedPosition);
            this.prepareInsertFrameSubMenu();

            // Overwrite readonly properties clientX and clientY (to position the menu if needed)
            setContextMenuEventClientXY(event, positionForMenu);

            // Create the menu content here and open it
            this.frameContextMenuItems.splice(0);
            if(this.showPasteMenuItem){
                this.frameContextMenuItems.push({label: this.$t("contextMenu.paste"), onClick: this.paste}, {divided: "self"});
            }
            this.frameContextMenuItems.push({label: this.$t("contextMenu.insert"), children: this.insertFrameMenuItems});                                    
            this.showContextMenuAtCoordPos.x = event.x;
            this.showContextMenuAtCoordPos.y = event.y;
            this.showContextMenuAtCoordPos.pos = positionForMenu;
            this.showContextMenu = true;
        },

        toggleCaret(): void {
            this.appStore.toggleCaret(
                {id:this.frameId, caretPosition: this.caretAssignedPosition}
            );
        },

        paste(): void {
            // We check upon the context menu informations because a click could be generated on a hovered caret and we can't distinguish 
            // by any other mean which caret is the one the user clicked on.
            const currentShownContextMenuUID: string = this.appStore.contextMenuShownId;
            if(currentShownContextMenuUID === this.UID){
                this.doPaste();
            }
        },

        doPaste(pasteAt: "start" | "end" | "caret" = "start") : void {
            let pasteDestination: CurrentFrame;
            let restoreCaretTo: CurrentFrame | null = {... useStore().currentFrame};
            const stateBeforeChanges = cloneDeep(this.appStore.$state);
            
            const sectionId = getFrameSectionIdFromFrameId(this.frameId);
            const isSectionEmpty = (this.appStore.frameObjects[sectionId].childrenIds.length == 0);
            
            if (pasteAt == "end" && !isSectionEmpty) {
                const newCaretId = this.appStore.frameObjects[sectionId].childrenIds.at(-1) as number;
                pasteDestination = {id: newCaretId, caretPosition: CaretPosition.below};
            }
            else if (pasteAt == "caret") {
                pasteDestination = {... useStore().currentFrame};
                // Don't restore caret:
                restoreCaretTo = null;
            }
            else {
                pasteDestination = {id: this.frameId, caretPosition: this.caretAssignedPosition};
            }

            // If we currently have a selection of frames, the pasted frame should replace the selection, so we delete that selection.
            // (it should be fine regarding the grammar check because the caret will be at the same level whether it's before or after the selection)
            if(this.appStore.selectedFrames.length > 0){
                // The key doesn't actually matter here, the method handles it already by doing a backspace deletion.
                // However, we need to know where was the caret with regards to the selection:
                // if it was below the selection, it means the deletion will change the current caret
                // and therefore we need to amend this as a new paste destination (i.e. top of selection).
                if(pasteDestination.id == this.appStore.selectedFrames.at(-1) as number){
                    const topOfSelectionPos = getAboveFrameCaretPosition(this.appStore.selectedFrames[0]);
                    pasteDestination.id = topOfSelectionPos.frameId;
                    pasteDestination.caretPosition = topOfSelectionPos.caretPosition as CaretPosition;
                }
                this.appStore.deleteFrames("backspace", true);
            }   
            
            // To find all new frames added (including at lower levels), we record all frame ids before the paste:
            const frameIdsBeforePaste = new Set(Object.keys(this.appStore.frameObjects).map((key) => Number(key)));

            if(this.appStore.isSelectionCopied){
                this.appStore.pasteSelection(
                    {
                        clickedFrameId: pasteDestination.id,
                        caretPosition: pasteDestination.caretPosition,
                        ignoreStateBackup: true,
                    }
                );
            }
            else {
                this.appStore.pasteFrame(
                    {
                        clickedFrameId: pasteDestination.id,
                        caretPosition: pasteDestination.caretPosition,
                        ignoreStateBackup: true,
                    }                
                );
            }

            const frameIdsAfterPaste = Object.keys(this.appStore.frameObjects).map((key) => Number(key));
            
            if (restoreCaretTo != null && (this.appStore.currentFrame?.id != restoreCaretTo.id || this.appStore.currentFrame?.caretPosition != restoreCaretTo.caretPosition)) {
                this.appStore.setCurrentFrame(restoreCaretTo);
            }

            this.appStore.saveStateChanges(stateBeforeChanges);

            const framesAdded = frameIdsAfterPaste.filter((frameId) => !frameIdsBeforePaste.has(frameId));
            // Then after nextTick tell all the new frames to update their prompts:
            this.$nextTick(() => {
                eventBus.emit(CustomEventTypes.updateParamPrompts, framesAdded);
            });
        },
    
        prepareInsertFrameSubMenu(): void {
            // The list of frames we can insert depends on the current position, therefore, the submenu options are constructed dynamically
            // for that specific position we're at.
            this.insertFrameMenuItems = [];
            const addFrameCommands = this.appStore.generateAvailableFrameCommands(this.appStore.currentFrame.id, this.appStore.currentFrame.caretPosition);
            Object.values(addFrameCommands).forEach((addFrameCmdDef) => {
                this.insertFrameMenuItems.push({label: addFrameCmdDef[0].description, onClick: () => {
                    // This method is called by the submenu and it triggers a click on the AddFrameCommand component,
                    // but we delay it enough so the chain of key events (if applicable) related to the menu terminates,
                    // because otherwise that chain and the key event chain from adding a frame interfer.
                    setTimeout(() => document.getElementById(getAddFrameCmdElementUID(addFrameCmdDef[0].type.type))?.click(), 250);
                }});
            });
        },
    },
});
</script>

<style lang="scss">
.#{$strype-classname-caret-container} {
    padding-top: 0px;
    padding-bottom: 0px;
    scroll-margin-top: 50px;
    scroll-margin-bottom: 50px;
}

.static-caret-container{
    // Put cursor in middle of the reserved gap, and still add height (i.e. use padding not height) to avoid later 
    // sections moving up and down by the caret height as the caret moves in and out of a reserved gap.
    padding-top: calc($caret-height-value/2) + px !important;
    padding-bottom: calc($caret-height-value/2) + px !important;
}

.#{$strype-classname-caret-container}:not(.#{$strype-classname-dragging-frame}):hover{
    cursor: pointer;
}
</style>
