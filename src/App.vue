<template>
    <div id="app" class="container-fluid print-full-height">
        <div v-if="showAppProgress || setAppNotOnTop" :class="{'app-overlay-pane': true, 'app-progress-pane': showAppProgress}" @contextmenu="handleOverlayRightClick">
            <div v-if="showAppProgress" class="app-progress-container">
                <div class="progress">
                    <div 
                        class="progress-bar progress-bar-striped bg-info progress-bar-animated" 
                        role="progressbar"
                        style="width: 100%"
                        aria-valuenow="100"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        >
                        <span class="progress-bar-text">{{progressbarMessage}}</span>
                    </div>
                </div>
            </div>
        </div>
        /* IFTRUE_isPython
        <Splitpanes class="expanded-PEA-splitter-overlay strype-split-theme" v-show="isExpandedPythonExecArea" horizontal @resize=onExpandedPythonExecAreaSplitPaneResize>
            <pane key="1" :size="100 - expandedPEAOverlaySplitterPane2Size">
            </pane>
            <pane ref="overlayExpandedPEAPane2Ref" key="2" :size="expandedPEAOverlaySplitterPane2Size" :min-size="peaOverlayPane2MinSize" :max-size="peaOverlayPane2MaxSize">
            </pane>
        </Splitpanes>
        FITRUE_isPython */
        <!-- Keep the style position of the row div to get proper z order layout of the app -->
        <div class="row" style="position: relative;">
            <Splitpanes class="strype-split-theme" @resize=onStrypeCommandsSplitPaneResize>
                <Pane key="1" :size="100 - editorCommandsSplitterPane2Size" min-size="33" max-size="90">
                    <!-- These data items are to enable testing: -->
                    <div :id="editorId" :data-slot-focus-id="slotFocusId" :data-slot-cursor="slotCursorPos" class="print-full-height">
                        <div class="top no-print">
                            <MessageBanner 
                                v-if="showMessage"
                            />
                        </div>
                        <div class="row no-gutters" >
                            <Menu 
                                :id="menuUID" 
                                :ref="menuUID"
                                v-on:[CustomEventTypes.appShowProgressOverlay]="applyShowAppProgress"
                                v-on:[CustomEventTypes.appResetProject]="resetStrypeProject"
                                class="noselect no-print"
                            />
                            <div class="col">
                                <div 
                                    :id="editorUID" 
                                    :class="{'editor-code-div noselect print-full-height':true/* IFTRUE_isPython , 'full-height-editor-code-div':!isExpandedPythonExecArea, [scssVars.croppedEditorDivClassName]: isExpandedPythonExecArea FITRUE_isPython */}"
                                    @mousedown="handleWholeEditorMouseDown"
                                >
                                    <FrameHeader
                                        :labels="projectDocLabels"
                                        :frameId="-10"
                                        :frameType="projectDocFrameType"
                                        :isDisabled="false"
                                        :frameAllowChildren="false"
                                        :erroneous="false"
                                        :wasLastRuntimeError="false"
                                        :frameAllowedCollapsedStates="[]"
                                        :frameAllowedFrozenStates="[]"
                                        :onFocus="() => {}"/>
                                    <FrameContainer
                                        v-for="container in containerFrames"
                                        :key="container.frameType.type + '-id:' + container.id"
                                        :id="getFrameContainerUID(container.id)"
                                        :ref="getFrameContainerUID(container.id)"
                                        :frameId="container.id"
                                        :containerLabel="container.frameType.labels[0].label"
                                        :caretVisibility="container.caretVisibility"
                                        :frameType="container.frameType"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </Pane>
                <Pane key="2" ref="editorCommandsSplitterPane2" :size="editorCommandsSplitterPane2Size" class="no-print">
                    <Commands :id="commandsContainerId" class="noselect" :ref="strypeCommandsRefId" />
                </Pane>
            </SplitPanes>
        </div>
        <SimpleMsgModalDlg :dlgId="simpleMsgModalDlgId"/>
        <ModalDlg :dlgId="importDiffVersionModalDlgId" :useYesNo="true">
            <span v-t="'appMessage.editorFileUploadWrongVersion'" />                
        </ModalDlg>
        <ModalDlg :dlgId="resyncToCloudDriveAtStartupModalDlgId" :useYesNo="true" :okCustomTitle="$t('buttonLabel.yesSign')" :cancelCustomTitle="$t('buttonLabel.noContinueWithout')">
            <span style="white-space:pre-wrap" v-html="resyncToCloudDriveAtStartupDetailsMessage"></span>
        </ModalDlg>
        <MediaPreviewPopup ref="mediaPreviewPopup" />
        <EditImageDlg dlgId="editImageDlg" ref="editImageDlg" :imgToEdit="imgToEditInDialog" :showImgPreview="showImgPreview" />
        <EditSoundDlg dlgId="editSoundDlg" ref="editSoundDlg" :soundToEdit="soundToEditInDialog" />
        <div :id="getSkulptBackendTurtleDivId" class="hidden"></div>
        <canvas v-show="appStore.isDraggingFrame" :id="getCompanionDndCanvasId" class="companion-canvas-dnd"/>
        <ModalDlg :dlgId="confirmResetLSOnShareProjectLoadDlgId" :autoFocusButton="'ok'" :okCustomTitle="$t('buttonLabel.continue')" :cancelCustomTitle="$t('buttonLabel.cancelLoadSharedProject')" >
            <div>
                <span v-html="$t('appMessage.LSOnShareProjectLoad')"/>
                <br/>
            </div>
        </ModalDlg>
        <ModalDlg :dlgId="confirmNewProjectModalDlgId" :useYesNo="true">
            <span style="white-space:pre-wrap" v-html="$t('appMessage.newProjectConfirmation')"></span>
        </ModalDlg>
    </div>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import Vue from "vue";
import MessageBanner from "@/components/MessageBanner.vue";
import FrameContainer from "@/components/FrameContainer.vue";
import Frame from "@/components/Frame.vue";
import Commands from "@/components/Commands.vue";
import Menu from "@/components/Menu.vue";
import ModalDlg from "@/components/ModalDlg.vue";
import SimpleMsgModalDlg from "@/components/SimpleMsgModalDlg.vue";
import {Splitpanes, Pane, PaneData} from "splitpanes";
import { useStore, settingsStore } from "@/store/store";
import { AppEvent, ProjectSaveFunction, BaseSlot, CaretPosition, FrameObject, FrozenState, MessageTypes, ModifierKeyCode, Position, PythonExecRunningState, SaveRequestReason, SlotCursorInfos, SlotsStructure, SlotType, StringSlot, StrypeSyncTarget, StrypePEALayoutMode, defaultEmptyStrypeLayoutDividerSettings, EditImageInDialogFunction, EditSoundInDialogFunction, areSlotCoreInfosEqual, SlotCoreInfos, ProjectDocumentationDefinition, CollapsedState } from "@/types/types";
import { CloudDriveAPIState, isSyncTargetCloudDrive } from "@/types/cloud-drive-types";
import { getFrameContainerUID, getCloudDriveHandlerComponentRefId, getMenuLeftPaneUID, getEditorMiddleUID, getCommandsRightPaneContainerId, isElementLabelSlotInput, CustomEventTypes, getFrameUID, parseLabelSlotUID, getLabelSlotUID, getFrameLabelSlotsStructureUID, getSelectionCursorsComparisonValue, setDocumentSelection, getSameLevelAncestorIndex, autoSaveFreqMins, getImportDiffVersionModalDlgId, getAppSimpleMsgDlgId, getFrameContextMenuUID, getActiveContextMenu, actOnTurtleImport, setPythonExecutionAreaTabsContentMaxHeight, setManuallyResizedEditorHeightFlag, setPythonExecAreaLayoutButtonPos, isContextMenuItemSelected, getStrypeCommandComponentRefId, frameContextMenuShortcuts, getCompanionDndCanvasId, addDuplicateActionOnFramesDnD, removeDuplicateActionOnFramesDnD, getFrameComponent, getCaretContainerComponent, sharedStrypeProjectTargetKey, sharedStrypeProjectIdKey, getCaretContainerUID, getEditorID, getLoadProjectLinkId, AutoSaveKeyNames } from "./helpers/editor";
import { AllFrameTypesIdentifier} from "@/types/types";
/* IFTRUE_isPython */
import { debounceComputeAddFrameCommandContainerSize, getPEATabContentContainerDivId, getPEAComponentRefId } from "@/helpers/editor";
/* FITRUE_isPython */
/* IFTRUE_isMicrobit */
import { getAPIItemTextualDescriptions } from "./helpers/microbitAPIDiscovery";
import { DAPWrapper } from "./helpers/partial-flashing";
/* FITRUE_isMicrobit */
import { mapStores } from "pinia";
import { getFlatNeighbourFieldSlotInfos, getSlotIdFromParentIdAndIndexSplit, getSlotParentIdAndIndexSplit, retrieveParentSlotFromSlotInfos, retrieveSlotFromSlotInfos, getFrameBelowCaretPosition, checkCodeErrors, calculateNextCollapseState } from "./helpers/storeMethods";
import { cloneDeep } from "lodash";
import { VueContextConstructor } from "vue-context";
import { BACKEND_SKULPT_DIV_ID } from "@/autocompletion/ac-skulpt";
import {pasteMixedPython} from "@/helpers/pythonToFrames";
import CloudDriveHandlerComponent from "@/components/CloudDriveHandler.vue";
import { BvEvent, BvModalEvent } from "bootstrap-vue";
import MediaPreviewPopup from "@/components/MediaPreviewPopup.vue";
import EditImageDlg from "@/components/EditImageDlg.vue";
import EditSoundDlg from "@/components/EditSoundDlg.vue";
import axios from "axios";
import scssVars from "@/assets/style/_export.module.scss";
import {loadDivider} from "@/helpers/load-save";
import FrameHeader from "@/components/FrameHeader.vue";
import { projectDocumentationFrameId } from "./main";
import {inflateRaw} from "pako";
import { Base64 } from "js-base64";

let autoSaveTimerId = -1;
let projectSaveFunctionsState : ProjectSaveFunction[] = [];

//////////////////////
//     Component    //
//////////////////////
export default Vue.extend({
    name: "App",
    
    components: {
        FrameHeader,
        MessageBanner,
        FrameContainer,
        Commands,
        EditImageDlg,
        EditSoundDlg,
        MediaPreviewPopup,
        Menu,
        ModalDlg,
        SimpleMsgModalDlg,
        Splitpanes,
        Pane,
    },

    data: function() {
        return {
            CustomEventTypes, // just for using in template
            scssVars, // just for using in template
            showAppProgress: false,
            setAppNotOnTop: false,
            progressbarMessage: "",
            cloudDriveName: "",
            /* IFTRUE_isPython */
            isExpandedPythonExecArea: false,
            /* FITRUE_isPython */
            imgToEditInDialog: "",
            soundToEditInDialog: null as AudioBuffer | null,
            showImgPreview: (() => {}) as (dataURL: string) => void,
        };
    },

    computed: {       
        ...mapStores(useStore, settingsStore),

        editorId(): string {
            return getEditorID();
        },
             
        // gets the container frames objects which are in the root
        containerFrames(): FrameObject[] {
            return this.appStore.getFramesForParentId(0).filter((f) => f.frameType.type != AllFrameTypesIdentifier.projectDocumentation);
        },

        slotFocusId() : string {
            const slotCoreInfos = useStore().focusSlotCursorInfos?.slotInfos;
            return slotCoreInfos ? getLabelSlotUID(slotCoreInfos) : "";
        },
        
        slotCursorPos() : number {
            return useStore().focusSlotCursorInfos?.cursorPos ?? -1;
        },

        showMessage(): boolean {
            return this.appStore.isMessageBannerOn;
        },

        menuUID(): string {
            return getMenuLeftPaneUID();
        },

        editorUID(): string {
            return getEditorMiddleUID();
        },

        strypeCommandsRefId(): string {
            return getStrypeCommandComponentRefId();
        },
        
        projectDocLabels() {
            return ProjectDocumentationDefinition.labels;
        },
        
        projectDocFrameType() {
            return AllFrameTypesIdentifier.projectDocumentation;
        },

        editorCommandsSplitterPane2Size: {
            get(): number {
                let value = (this.appStore.editorCommandsSplitterPane2Size != undefined && this.appStore.editorCommandsSplitterPane2Size[StrypePEALayoutMode.tabsCollapsed] != undefined) 
                    ? this.appStore.editorCommandsSplitterPane2Size[StrypePEALayoutMode.tabsCollapsed] 
                    : parseFloat(scssVars.editorCommandsSplitterPane2SizePercentValue);
                /* IFTRUE_isPython */
                value = (this.appStore.peaLayoutMode != undefined && this.appStore.editorCommandsSplitterPane2Size != undefined && this.appStore.editorCommandsSplitterPane2Size[this.appStore.peaLayoutMode] != undefined) 
                    ? this.appStore.editorCommandsSplitterPane2Size[this.appStore.peaLayoutMode] as number
                    // When there is no set value for a given layout mode,
                    // whe check that any change in another layout has ever been made: if yes we just keep the divider as it is, if not, we use the default value.
                    : ((this.appStore.editorCommandsSplitterPane2Size != undefined)
                        ? parseFloat(((this.$refs.editorCommandsSplitterPane2 as InstanceType<typeof Pane>).$data as PaneData).style.width.replace("%",""))
                        : parseFloat(scssVars.editorCommandsSplitterPane2SizePercentValue));
                /* FITRUE_isPython */
                return value;
                
            },
            set(value: number) {
                this.onStrypeCommandsSplitPaneResize({1: {size: value}});
            },
        },

        commandsContainerId(): string {
            return getCommandsRightPaneContainerId();
        },

        confirmResetLSOnShareProjectLoadDlgId(): string {
            return "confirmResetLSOnShareProjectLoadDlg";
        },

        localStorageAutosaveEditorKey(): string {
            let storageString = AutoSaveKeyNames.pythonEditorState;
            /* IFTRUE_isMicrobit */
            storageString = AutoSaveKeyNames.mbEditor;
            /*FITRUE_isMicrobit */
            return storageString;
        },

        simpleMsgModalDlgId(): string{
            return getAppSimpleMsgDlgId();
        },

        importDiffVersionModalDlgId(): string {
            return getImportDiffVersionModalDlgId();
        },

        resyncToCloudDriveAtStartupModalDlgId(): string {
            return "resyncToCloudAtStartupModalDlg";
        },

        resyncToCloudDriveAtStartupDetailsMessage(): string {
            return this.$i18n.t("appMessage.resyncToCloudDriveAtStartup", {drivename: this.cloudDriveName}) as string;
        },

        confirmNewProjectModalDlgId(): string {
            return "confirmNewProjectModalDlg";
        },

        getSkulptBackendTurtleDivId(): string {
            return BACKEND_SKULPT_DIV_ID;
        },

        isPythonExecuting(): boolean {
            return (this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning;
        },
        
        /* IFTRUE_isPython */
        expandedPEAOverlaySplitterPane2Size: {
            get(): number {
                const value = (this.appStore.peaExpandedSplitterPane2Size != undefined && this.appStore.peaLayoutMode != undefined && this.appStore.peaExpandedSplitterPane2Size[this.appStore.peaLayoutMode] != undefined)
                    ? this.appStore.peaExpandedSplitterPane2Size[this.appStore.peaLayoutMode] as number
                    // When there is no set value for a given layout mode,
                    // whe check that any change in another layout has ever been made: if yes we just keep the divider as it is, if not, we use the default value.
                    : ((this.appStore.peaExpandedSplitterPane2Size != undefined)
                        ? parseFloat(((this.$refs.overlayExpandedPEAPane2Ref as InstanceType<typeof Pane>).$data as PaneData).style.height.replace("%",""))
                        :  parseFloat(scssVars.peaExpandedOverlaySplitterPane2SizePercentValue));
                // The PEA needs to react to the change of value when we are in an expanded mode
                if(this.appStore.peaLayoutMode == StrypePEALayoutMode.tabsExpanded || this.appStore.peaLayoutMode == StrypePEALayoutMode.splitExpanded){
                    this.$nextTick(() => this.onExpandedPythonExecAreaSplitPaneResize({1: {size: value}}));
                }
                return value;
            },
            set(value: number) {
                this.onExpandedPythonExecAreaSplitPaneResize({1: {size: value}});                    
            },
        },

        peaOverlayPane2MinSize(): number {
            return 10;
        },

        peaOverlayPane2MaxSize(): number {
            return 95;
        },
        /* FITRUE_isPython */

        getCompanionDndCanvasId(): string {
            return getCompanionDndCanvasId();
        },
    },

    created() {
        // The very first action we want to do is trying to restore the Strype settings:
        // Strype locale:
        this.setStrypeLocale();

        projectSaveFunctionsState[0] = {syncTarget: StrypeSyncTarget.ws, function: (reason: SaveRequestReason) => this.autoSaveStateToWebLocalStorage(reason)};
        window.addEventListener("beforeunload", this.beforeUnloadHandler);

        // By means of protection against browser crashes or anything that could prevent auto-backup, we do a backup every 2 minutes
        this.setAutoSaveState();

        // Prevent the native context menu to be shown at some places we don't want it to be shown (basically everywhere but editable slots)
        // We can't know if that is called because of a click or because of the keyboard shortcut - and it's important to know because we need to process
        // things differently based on one or the other. That's why we have a flag on the keyboard shortcut (in keydown even registration) to make the distinction.
        window.addEventListener(
            "contextmenu", (event) => this.handleContextMenu(event)
        );

        window.addEventListener("keydown", (event: KeyboardEvent) => {
            this.appStore.updateKeyModifiers(event);
            const activeContextMenu = getActiveContextMenu();
            if(activeContextMenu != null){
                // All key hits in the context menu should result in the menu closing.
                // If a keyboard shortcut of the menu has been used, we process it.
                // (Enter is already handled when a menu item is selected, so we don't worry about it.)
                const activeModifierKeys = {[ModifierKeyCode.ctrl]: event.ctrlKey, [ModifierKeyCode.meta]: event.metaKey, [ModifierKeyCode.shift]: event.shiftKey, [ModifierKeyCode.alt]: event.altKey};
                const menuItemForKBShortcut = Array.from(activeContextMenu.children).find((menuItemEl) => {
                    const menuItemActionName = menuItemEl.getAttribute("action-name");
                    if(menuItemActionName){
                        const menuItemShortcut = frameContextMenuShortcuts.find((frameCtxtMenuShorcut) => frameCtxtMenuShorcut.actionName.toString() == menuItemActionName);
                        if(menuItemShortcut) {
                            // Look up keys, if no modifier is defined at all, then the match for modifier is true.
                            let modifiersKeyMatch = (menuItemShortcut?.firstModifierKey == undefined);
                            let modifierKeyIndex = 0;

                            // Check first key modifier
                            const otherModifierKeys = [] as ModifierKeyCode[];
                            for(;modifierKeyIndex < ((menuItemShortcut?.firstModifierKey?.length) ?? 0); modifierKeyIndex++){
                                const firstModifierKBValue = (menuItemShortcut.firstModifierKey as ModifierKeyCode[])[modifierKeyIndex];
                                modifiersKeyMatch = activeModifierKeys[firstModifierKBValue];
                                Object.values(ModifierKeyCode).forEach((modif) => {
                                    if(modif != firstModifierKBValue){
                                        otherModifierKeys.push(modif);
                                    }
                                });
                                if(modifiersKeyMatch) {
                                    break;
                                }
                                else{
                                    otherModifierKeys.splice(0);
                                }
                            }

                            // Check the second key modifier: if there was a first key modifier, we need to that if a second modifier is defined, 
                            // the key combination matches both modifiers - and that if there is no second modifier then no extra combination is hit.
                            const secondModifierKBValue = menuItemShortcut.secondModifierKey?.[modifierKeyIndex];
                            if(secondModifierKBValue){
                                modifiersKeyMatch = activeModifierKeys[secondModifierKBValue]
                                    && !otherModifierKeys.some((modif) => modif != secondModifierKBValue && activeModifierKeys[modif]);
                            }
                            else{
                                //That is no second modifier, we cannot have any other modifier than the first; or no modifier at all;
                                modifiersKeyMatch = (otherModifierKeys.length > 0) ? !otherModifierKeys.some((modif) => activeModifierKeys[modif]) : modifiersKeyMatch;
                            }             

                            // Now we know if modifiers are correct, we can return if the shortcut matches the keys hit
                            return modifiersKeyMatch && menuItemShortcut.mainKey == event.key.toLowerCase();
                        }
                        
                        // This menu entry has no shortcut, so definitely can't be matched
                        return false;
                    }                    
                    else {
                        return false;
                    }
                });

                if(menuItemForKBShortcut){
                    // We found one menu entry matching the hit keyboard shortcut, we simulate a click (which will close the menu) on the underlying <a>
                    ((menuItemForKBShortcut as HTMLLIElement).children[0] as HTMLAnchorElement)?.click();
                }
                else if((!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) && (event.key != "Enter" || (event.key == "Enter" && !isContextMenuItemSelected()))){
                    // Note: that's not an ideal way of using the Keyboard Event, but the source code for VueContext uses keycodes...
                    activeContextMenu.dispatchEvent(new KeyboardEvent("keydown", {keyCode: 27}));
                }
                else{
                    // An element from the menu is activated via "Enter", or a modifier key is pressed alone, we don't interfere.
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return;
            }
            
            // We need to register if the keyboard shortcut has been used to get the context menu
            // so we set the flag here. It will be reset when the context menu actions are consumed.
            // Case for allowing macOS to have a context menu shortcut:
            if(this.appStore.selectedFrames.length > 0 &&  (event.key == " " || event.key.toLowerCase() == "enter") && !isContextMenuItemSelected()){
                // Wait a bit to process keys before showing the context menu
                setTimeout(() => {
                    this.appStore.isContextMenuKeyboardShortcutUsed = true;
                    this.handleContextMenu(new MouseEvent(""));
                }, 200);
            }
            // Case for Windows context menu key   
            if(event.key.toLowerCase() == "contextmenu"){
                this.appStore.isContextMenuKeyboardShortcutUsed  = true;
            }

            // Handling the notification for doing duplication with drag and drop.
            // We don't really care if another key is hit along ctrl/option, we only look that
            // we are currently in a drag and drop action, and notify the current caret candidate for drop that
            // the action requires frame duplication.
            if(this.appStore.isDraggingFrame && (event.ctrlKey || event.altKey)){
                addDuplicateActionOnFramesDnD();
                event.preventDefault();
                event.stopImmediatePropagation();
                event.stopPropagation();
                return;
            }
            
            // If we are at a frame cursor and they hit ctrl-x/ctrl-c then we do cut/copy:
            if(!this.appStore.isEditing && !this.isPythonExecuting && (event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "c" || event.key.toLowerCase() === "x")) {
                // We emit an event to be picked up by the first frame in the current selection:
                // The frames themselves decide whether to act based on whether they are the first frame in the selection:
                this.$root.$emit(event.key.toLowerCase() === "c" ? CustomEventTypes.copyFrameSelection : CustomEventTypes.cutFrameSelection);
                event.preventDefault();
                event.stopImmediatePropagation();
                event.stopPropagation();
                return;
            }
            
            if (!this.appStore.isEditing && !this.isPythonExecuting && !event.ctrlKey && !event.metaKey && event.key === ".") {
                // The relevant frames are the selection, or otherwise the frame *after* the caret:
                let frameIds: number[] = [];
                if (this.appStore.selectedFrames.length > 0) {
                    frameIds = this.appStore.selectedFrames;
                }
                else {
                    let nextSibling = getFrameBelowCaretPosition({frameId: this.appStore.currentFrame.id, isSlotNavigationPosition: false, caretPosition: this.appStore.currentFrame.caretPosition});
                    if (nextSibling != null && nextSibling >= 0) {
                        frameIds = [nextSibling];
                    }
                }
                if (frameIds.length > 0) {
                    const frames = frameIds.map((f) => this.appStore.frameObjects[f]);
                    const parentIsFrozen = this.appStore.frameObjects[this.appStore.frameObjects[frameIds[0]].parentId].frozenState == FrozenState.FROZEN;
                    const nextStates = calculateNextCollapseState(frames, parentIsFrozen).individual;
                    this.appStore.setCollapseStatuses(nextStates);
                }
                event.preventDefault();
                event.stopImmediatePropagation();
                event.stopPropagation();
                return;
            }
        });

        // There are only a few cases when we need to handle key up events
        window.addEventListener("keyup", (event) => {
            this.appStore.updateKeyModifiers(event);
            // Handling the notification for not doing duplication anymore with drag and drop.
            // We don't really care if another key is hit along ctrl/option, we only look that
            // we are currently in a drag and drop action, and notify the current caret candidate for drop that
            // the action doesn't require frame duplication.
            if(this.appStore.isDraggingFrame && (event.key == "Control" || event.key == "Alt")){
                removeDuplicateActionOnFramesDnD();
                event.preventDefault();
                event.stopImmediatePropagation();
                event.stopPropagation();
                return;
            }

            // Listen to the project sharing shortcut "keyup" event that needs to consume for Safari (handling of the shorcut is in Menu.vue)
            if(event.type == "keyup" && event.key.toLowerCase() == "l" && event.metaKey && event.shiftKey){
                event.preventDefault();
                event.stopImmediatePropagation();
                event.stopPropagation();
                return;
            }

            // Handle "escape" on error popover: if an error popover is showing, escape should discard the popup.
            if(event.key == "Escape" && !this.appStore.isAppMenuOpened && !this.isPythonExecuting && !this.appStore.isDraggingFrame){
                [...document.getElementsByClassName("popover b-popover error-popover")].forEach((popup) => (popup as HTMLDivElement).style.display = "none");
            }
        });

        /* IFTRUE_isPython */
        // Listen to the Python execution area size change events (as the editor needs to be resized too)
        document.addEventListener(CustomEventTypes.pythonExecAreaExpandCollapseChanged, (event) => {
            this.isExpandedPythonExecArea = (event as CustomEvent).detail;
            (this.$refs[this.strypeCommandsRefId] as InstanceType<typeof Commands>).isExpandedPEA = (event as CustomEvent).detail;
            (this.$refs[this.strypeCommandsRefId] as InstanceType<typeof Commands>).hasPEAExpanded ||= (event as CustomEvent).detail;
            setTimeout(() => {
                debounceComputeAddFrameCommandContainerSize((event as CustomEvent).detail);
                if((event as CustomEvent).detail){
                    this.onExpandedPythonExecAreaSplitPaneResize({1: {size: this.expandedPEAOverlaySplitterPane2Size}});
                }
                else{
                    const croppedEditor = document.getElementsByClassName(scssVars.croppedEditorDivClassName);
                    if(croppedEditor.length > 0){
                        // The "cropped editor", that is when the PEA is expanded may not exist if the PEA wasn't expanded before..
                        (croppedEditor[0] as HTMLDivElement).style.maxHeight = "";                           
                    }
                    setManuallyResizedEditorHeightFlag(undefined);
                    (document.getElementsByClassName(scssVars.noPEACommandsClassName)[0] as HTMLDivElement).style.maxHeight = "";
                    const peaWithExpandedClass = document.querySelector("." + scssVars.peaContainerClassName + "." + scssVars.expandedPEAClassName);
                    if(peaWithExpandedClass){
                        // The "expanded PEA" may not exist if the PEA wasn't expanded before..
                        (peaWithExpandedClass as HTMLDivElement).style.top = "";
                    }              
                }
            }, 200);
           
        });
        /* FITRUE_isPython */

        /* IFTRUE_isMicrobit */
        // Register an event for WebUSB to detect when the micro:bit has been disconnected. We only do that once, and if WebUSB is available...
        if (navigator.usb) {
            navigator.usb.addEventListener("disconnect", () => this.appStore.previousDAPWrapper = {} as DAPWrapper);
        }
        
        // As the application starts up, we compile the microbit library with the appropriate language setting.
        getAPIItemTextualDescriptions(true);
        /* FITRUE_isMicrobit */

        // Add an event listener for text selection changes. It will be used for changes of text selection and text cursors (start/end).
        document.addEventListener("selectionchange", this.handleDocumentSelectionChange);

        // Add en event listener for the mouse up events, it will be used for detecting the end of a drag in the context of slots/text selection.
        document.addEventListener("mouseup", this.checkMouseSelection);

        // Add a listener for the mouse scroll events. We do not want to allow scrolling when the context menu is shown
        document.addEventListener("wheel", this.blockScrollOnContextMenu, {passive:false});

        /* IFTRUE_isPython */
        // Add a listener for the whole window resize.
        window.addEventListener("resize",() => {
            // When the window is resized, the overlay expanded PEA splitter is properly updated. However, the underlying UI is not updated
            // properly (because it isn't inside that splitter) so we need to manually update things.
            if(this.isExpandedPythonExecArea) {
                this.onExpandedPythonExecAreaSplitPaneResize({1: {size: ((this.$refs.overlayExpandedPEAPane2Ref as InstanceType<typeof Pane>).$data as PaneData).style.height.replace("%","")}}, true);
            }

            // Re-scale the Turtle canvas.
            document.getElementById(getPEATabContentContainerDivId())?.dispatchEvent(new CustomEvent(CustomEventTypes.pythonExecAreaSizeChanged));
        });
        /* FITRUE_isPython */

        // When the page is loaded, we might load an existing code for which the caret is not visible, so we get it into view.
        setTimeout(() => {
            const htmlElementToShowId = (this.appStore.focusSlotCursorInfos) ? getLabelSlotUID(this.appStore.focusSlotCursorInfos.slotInfos) : getCaretContainerUID(this.appStore.currentFrame.caretPosition, this.appStore.currentFrame.id);
            document.getElementById(htmlElementToShowId)?.scrollIntoView({block:"nearest"});
        }, 1000);

        // Add an event listener to put the app not on top (for an element to be modal) or reset it to normal
        document.addEventListener(CustomEventTypes.requestAppNotOnTop, (event) => {
            this.setAppNotOnTop = (event as CustomEvent).detail;
        });

        // The events from Bootstrap modal are registered to the root app element.
        this.$root.$on("bv::modal::hide", this.onHideModalDlg);  
    },

    destroyed() {
        // Removes the listeners
        document.removeEventListener("selectionchange", this.handleDocumentSelectionChange);
        document.removeEventListener("mouseup", this.checkMouseSelection);
        document.removeEventListener("wheel", this.blockScrollOnContextMenu);
        this.$root.$off("bv::modal::hide", this.onHideModalDlg);  
    },

    mounted() {
        // When the App is ready, we want to either open a project present in the local storage,
        // or open a shared project that is given by the URL (this takes priority over local storage).
        // If we need to open a shared project, when Google Drive is deteced, we may need to wait for the Google API (GAPI) to be loaded before doing anything.

        // Check whether Strype is opening a shared project.
        // We check the type of sharing (for now it's only a Cloud Drive we support or generic) and get the retrieve path from the query parameters.
        const queryParams = new URLSearchParams(window.location.search);
        const sharedProjectTarget= queryParams.get(sharedStrypeProjectTargetKey); // if provided, appears like the numbered value of the SyncTarget enum
        const shareProjectId = queryParams.get(sharedStrypeProjectIdKey);
        // When there is a shared project shared within a Cloud Drive, we do like if we were opening that Cloud Drive project BUT we use a special
        // mode that does not ask for the target selection (which shows with "open" in the menu) and breaks links to the Cloud Drive
        // (it's only a retrieval of the code)
        if(shareProjectId && sharedProjectTarget && isSyncTargetCloudDrive(parseInt(sharedProjectTarget))) {
            const loadCloudSharedProject = () => {
                const cloudTarget = parseInt(sharedProjectTarget) as StrypeSyncTarget;
                (this.$refs[getMenuLeftPaneUID()] as InstanceType<typeof Menu>).openSharedProjectTarget = cloudTarget;
                (this.$refs[getMenuLeftPaneUID()] as InstanceType<typeof Menu>).openSharedProjectId = shareProjectId;
                const afterAPILoaded = () => {
                    document.getElementById(getLoadProjectLinkId())?.click();
                };
                const cloudDriveHandlerComponent = (this.$refs[this.menuUID] as InstanceType<typeof Menu>).$refs[getCloudDriveHandlerComponentRefId()] as InstanceType<typeof CloudDriveHandlerComponent>;
                // For Google API, we wait a bit as it must have been loaded first.
                const specifcDriveComponent = cloudDriveHandlerComponent.getSpecificCloudDriveComponent(cloudTarget);
                if(cloudTarget == StrypeSyncTarget.gd){                    
                    cloudDriveHandlerComponent.getCloudAPIStatusWhenLoadedOrFailed(StrypeSyncTarget.gd)
                        ?.then((gapiState) =>{
                            // Only open the project is the GAPI is loaded, and show a message of error if it hasn't.
                            if(gapiState == CloudDriveAPIState.LOADED){
                                afterAPILoaded();
                            }
                            else{
                                this.finaliseOpenShareProject({key: "errorMessage.retrievedSharedGenericProject", param: this.$i18n.t("errorMessage.cloudAPIFailed",{apiname: specifcDriveComponent?.driveAPIName}) as string});
                            }
                        });
                }
                else {
                    // We don't use a client OneDrive API so we can request the file right away.
                    afterAPILoaded();
                }
            };

            this.checkLocalStorageHasProject().then(() => {
                // A project exists in the local storage, we ask the user if they want to keep it (and cancel the load of the shared project)
                this.confirmResetLSOnShareProjectLoad().then((continueLoadingSharedProject) => (continueLoadingSharedProject) ? loadCloudSharedProject() : this.loadLocalStorageProjectOnStart());
            },
            // No project in the local storage, we can continue loading the shared project
            () => loadCloudSharedProject());            
        }        
        // Generic opening
        else if(shareProjectId && shareProjectId.match(/^https?:\/\/.*$/g) != null){
            // The "fall out" case of a generic share: we don't care about the source target, it is only a URL to get to and retrive the Strype file.
            // We just do a small sanity check that it is a HTTP(S) link.
            // IMPORTANT: it is custom to the source to expose the file as such or not. So the generic share does NOT guarantee we can get the Strype file.
            const loadPublicSharedProject = () => {
                const googleDrivePublicURLPreamble = "https://drive.google.com/file/d/";
                const isPublicShareFromGD = shareProjectId.startsWith(googleDrivePublicURLPreamble);
                let alertMsgKey = "";
                let alertParams = "";
                if(isPublicShareFromGD){
                    // Google Drive will not expose the file directly, so we can *try* to extract the file ID and then get the data with the API (without authentication).
                    // Extract the file ID and attempt a retrieving of the file with the Google Drive API (it waits a bit for the API to be loaded)
                    const sharedFileID = shareProjectId.substring(googleDrivePublicURLPreamble.length).match(/^([^/]+)\/.*$/)?.[1];
                    ((this.$refs[this.menuUID] as InstanceType<typeof Menu>).$refs[getCloudDriveHandlerComponentRefId()] as InstanceType<typeof CloudDriveHandlerComponent>)
                        ?.getPublicSharedProjectContent(StrypeSyncTarget.gd, sharedFileID??"");
                
                }
                else{
                    axios.get<string>(shareProjectId)
                        .then((resp) => {
                            if(resp.status == 200){
                                // Find the filename from the URL:
                                const cleaned = shareProjectId.replace(/\/+$/, "");
                                const lastSlash = cleaned.lastIndexOf("/");
                                const filename = lastSlash !== -1 ? cleaned.substring(lastSlash + 1) : cleaned;
                            
                                return (resp.data.startsWith("{") ?
                                    this.appStore.setStateFromJSONStr({
                                        stateJSONStr: resp.data,
                                        showMessage: false,
                                    }) :
                                    this.setStateFromPythonFile(resp.data, filename, 0, false)
                                ).then(() => {
                                    alertMsgKey = "appMessage.retrievedSharedGenericProject";
                                    alertParams = this.appStore.projectName;
                                    // A generic project is saved in memory, so we must make sure there is no target destination saved.
                                    (this.$refs[this.menuUID] as InstanceType<typeof Menu>).saveTargetChoice(StrypeSyncTarget.none);
                                },
                                (reason) => {
                                    alertMsgKey = "errorMessage.retrievedSharedGenericProject";
                                    alertParams = reason;
                                });
                            }
                            else{
                                alertMsgKey = "errorMessage.retrievedSharedGenericProject";
                                alertParams = resp.status.toString();
                            }
                        })
                        .catch((error) => {
                            alertMsgKey = "errorMessage.retrievedSharedGenericProject";
                            alertParams = `${error?.message??error.toString()}<br/><br/><b>${this.$i18n.t("appMessage.publicSharedProjectUserDownloadAttempt")}`;
                            setTimeout(() => {
                                window.open(shareProjectId, "_blank");
                            }, 3000);                            
                        })
                        .finally(() => {
                            this.finaliseOpenShareProject({key: alertMsgKey, param: alertParams});
                        });
                }
            };
            this.checkLocalStorageHasProject().then(() => {
                // A project exists in the local storage, we ask the user if they want to keep it (and cancel the load of the shared project)
                this.confirmResetLSOnShareProjectLoad().then((continueLoadingSharedProject) => (continueLoadingSharedProject) ? loadPublicSharedProject() : this.loadLocalStorageProjectOnStart());
            },
            // No project in the local storage, we can continue loading the shared project
            () => loadPublicSharedProject());
        }
        // Load source code encoded in URL:
        else if(shareProjectId && shareProjectId.match(/^spy:.*$/) != null) {
            const m = shareProjectId.match(/^spy:(.*)$/);
            // Must be non-null given the above condition but satisfy Typescript:
            if (m) {
                const param = m[1];
                // Base64 uses A-Za-z0-9+/, but the latter two are meaningful in URLs
                // so we have to replace them (with - and _ respectively).
                // That is handled automatically on decode by the js-base64 package: 
                const binary = Base64.toUint8Array(param);
                const spyContent = inflateRaw(binary, { to: "string" });

                const loadSpy = () => this.setStateFromPythonFile(spyContent, this.$i18n.t("defaultProjName") as string, 0, false);
                
                this.checkLocalStorageHasProject().then(() => {
                    // A project exists in the local storage, we ask the user if they want to keep it (and cancel the load of the shared project)
                    this.confirmResetLSOnShareProjectLoad().then((continueLoadingSharedProject) => (continueLoadingSharedProject) ? loadSpy() : this.loadLocalStorageProjectOnStart());
                },
                // No project in the local storage, we can continue loading the shared project
                loadSpy)
                    .finally(() => {
                        // In any case, we want to clear the query parameters of the URL.
                        this.finaliseOpenShareProject();
                    });
            }
        }
        else{
            // The default opening of Strype (either brand new project or retrieving from local storage -- not opening a shared project)
            this.loadLocalStorageProjectOnStart();
        }

        // Register a listener to handle the context menu hovers (cf onContextMenuHover())
        this.$root.$on(CustomEventTypes.contextMenuHovered, (menuElement: HTMLElement) => this.onContextMenuHover(menuElement));

        // Register a listener for a request to close a caret context menu (used by Frame.vue)
        this.$root.$on(CustomEventTypes.requestCaretContextMenuClose, () => {
            // We find the CaretContainer component currently active to properly close the menu using the component close() method.
            const currentFrameComponent = getFrameComponent(this.appStore.currentFrame.id);
            if(currentFrameComponent){
                const currentCaretContainerComponent = getCaretContainerComponent(currentFrameComponent);
                ((currentCaretContainerComponent.$refs.menu as unknown) as VueContextConstructor).close();
            }
        });

        this.$root.$on(CustomEventTypes.addFunctionToEditorProjectSave, (psf: ProjectSaveFunction) => {
            // Before adding a new function to execute in the autosave mechanism, we stop the current time, and will restart it again once the function is added.
            // That is because, if the new function is added just before the next tick of the timer is due, we don't want to excecuted actions just yet to give
            // time to the user to sign in to Google Drive first, then load a potential project without saving the project that is in the editor in between.
            window.clearInterval(autoSaveTimerId);
            const psfEntry = projectSaveFunctionsState.find((psfEntry) => (psfEntry.syncTarget == psf.syncTarget));
            if(psfEntry){
                // There is already some function set for that type of project save, we just update the function
                psfEntry.function = psf.function;
            }
            else{
                // Nothing yet set for this type of project save, we add the entry in projectSaveFunctionsState
                projectSaveFunctionsState.push(psf);
            }
            this.setAutoSaveState();
        });

        this.$root.$on(CustomEventTypes.removeFunctionToEditorProjectSave, (psfSyncTarget: StrypeSyncTarget) => {
            const toDeleteIndex = projectSaveFunctionsState.findIndex((psf) => psf.syncTarget == psfSyncTarget);
            if(toDeleteIndex > -1){
                window.clearInterval(autoSaveTimerId);
                projectSaveFunctionsState.splice(toDeleteIndex, 1);
                this.setAutoSaveState();
            }            
        });

        // Listen to event for requesting the project save now
        this.$root.$on(CustomEventTypes.requestEditorProjectSaveNow, (saveReason: SaveRequestReason) => {
            // The usual behaviour is to trigger the saving functions for localStorage + any potential target (FS or GD).
            // However, if we are in a situation of requesting a save to open a new project, AND the project wasn't coming
            // from any source (FS or GD) we need to let the user perform a standard save.
            if(saveReason == SaveRequestReason.loadProject && this.appStore.syncTarget == StrypeSyncTarget.none){
                (this.$refs[this.menuUID] as InstanceType<typeof Menu>).handleSaveMenuClick(saveReason);
            }
            else {
                projectSaveFunctionsState.forEach((psf) => psf.function(saveReason));
            }
        });

        /* IFTRUE_isPython */
        // This case may not happen, but if we had a Strype version that contains a default initial state working with Turtle,
        // the UI should reflect it (showing the Turtle tab) so we look for Turtle in any case.
        actOnTurtleImport();
        /* FITRUE_isPython */
    },

    methods: {
        setAutoSaveState() {
            // The autosave is only performed on the webstore
            autoSaveTimerId = window.setInterval(() => {
                projectSaveFunctionsState.forEach((psf) => {
                    if(psf.syncTarget == StrypeSyncTarget.ws) {
                        psf.function(SaveRequestReason.autosave);
                    }
                });
            }, autoSaveFreqMins * 60000);
        },
        
        autoSaveStateToWebLocalStorage(reason: SaveRequestReason) : void {
            // save the project to the localStorage (WebStorage)
            if (!this.appStore.debugging && typeof(Storage) !== "undefined") {
                if(reason == SaveRequestReason.saveSettings){
                    // Save the settings
                    localStorage.setItem(AutoSaveKeyNames.settingsState, JSON.stringify(this.settingsStore.$state));
                }
                else{
                    this.appStore.generateStateJSONStrWithCheckpoint(true).then((stateJSONStrWithCheckpoint) => {
                        localStorage.setItem(this.localStorageAutosaveEditorKey, stateJSONStrWithCheckpoint);
                        // If that's the only element of the auto save functions, then we can notify we're done when we save for loading
                        if(reason==SaveRequestReason.loadProject && projectSaveFunctionsState.length == 1){
                            this.$root.$emit(CustomEventTypes.saveStrypeProjectDoneForLoad);
                        }
                    });
                }
            }
        },

        beforeUnloadHandler(event: BeforeUnloadEvent) {
            // No matter the choice the user will make on saving the page, and because it is not straight forward to know what action has been done,
            // we systematically exit any slot being edited to have a state showing the blue caret.
            // We do so by simulating a key down event (which exits the current slot)
            const focusCursorInfos = useStore().focusSlotCursorInfos;
            if(useStore().isEditing && focusCursorInfos){
                useStore().ignoreFocusRequest = false;
                document.getElementById(getFrameLabelSlotsStructureUID(focusCursorInfos.slotInfos.frameId, focusCursorInfos.slotInfos.labelSlotsIndex))?.dispatchEvent(
                    new KeyboardEvent("keydown", {
                        key: "ArrowDown",
                    })
                );
            }

            // Browsers won't display a customised message, and can detect when to prompt the user,
            // so we don't need to do anything special.
            event.returnValue = true;

            // Save the state before exiting            
            this.autoSaveStateToWebLocalStorage(SaveRequestReason.unloadPage);            

            // We clear the session storage as well. This is notably used to clear MSAL authentication data (when using OneDrive).
            sessionStorage.clear();
        },

        setStrypeLocale() {
            // We need to retrieve Strype's language (session) if it exists in the localStorage.
            // If we didn't retrieve it, we try to infer the browser's language and ask the user
            // if they want to use the detected (supported) language. 
            // If they refused or if we can't retrieve anything at all, we use English as default.
            let strypeSessionLocale = "en"; // default locale
            let checkBrowserLocale = false;
            if(typeof Storage !== "undefined") {
                const savedSettingsState: typeof this.settingsStore = JSON.parse(localStorage.getItem(AutoSaveKeyNames.settingsState)??"{}");
                if(savedSettingsState.locale) {
                    strypeSessionLocale = savedSettingsState.locale;
                }
                else {
                    // There is no locale saved. Maybe the user wants to use the default English, but maybe
                    // they would like to use another language and their working environment won't save it,
                    // so we can ask them based on the browser's locale if they want to switch.
                    checkBrowserLocale = true;
                }
            }
            else{
                checkBrowserLocale = true;
            }

            if(checkBrowserLocale){
                // We didn't retrieve a locale, but we can check if the browser's locale isn't English
                // and use it for Strype if we provide that locale
                const foundLanguange = navigator.language?.toLowerCase();
                const languageCode = (foundLanguange && foundLanguange.length > 1) ? foundLanguange.substring(0,2) : "en";
                if(languageCode != "en" && this.$i18n.availableLocales.includes(languageCode)) {
                    strypeSessionLocale = languageCode;
                }
            }

            // Now update the UI
            this.settingsStore.setAppLang(strypeSessionLocale);
        },

        checkLocalStorageHasProject(): Promise<string> {
            // Check if a local storage project exists.
            // The promise returns the local storage content on fulfillment.
            return new Promise<string>((resolve, reject) => {
                if (typeof(Storage) !== "undefined") {
                    const savedState = localStorage.getItem(this.localStorageAutosaveEditorKey);
                    if(savedState != null) {
                        resolve(savedState);
                    }  
                    else{
                        reject("No saved Strype project in local storage.");
                    }
                }
                else{
                    reject("Browser's local storage not available.");
                }
            });
        },

        confirmResetLSOnShareProjectLoad(): Promise<boolean> {
            // A method to handle a confirmation from the user when a local storage project exists in the browser and a shared project is requested
            return new Promise<boolean>((resolve) => {
                const handleConfirmationFromDlg = (event: Event) => {
                    document.removeEventListener(CustomEventTypes.resetLSOnShareProjectLoadConfirmed, handleConfirmationFromDlg);
                    resolve((event as CustomEvent).detail as boolean);
                };
                document.addEventListener(CustomEventTypes.resetLSOnShareProjectLoadConfirmed, handleConfirmationFromDlg);
                this.$root.$emit("bv::show::modal", this.confirmResetLSOnShareProjectLoadDlgId);
            });
        },

        onHideModalDlg(event: BvEvent, dlgId: string) {
            if(dlgId == this.confirmResetLSOnShareProjectLoadDlgId) {
                document.dispatchEvent(new CustomEvent(CustomEventTypes.resetLSOnShareProjectLoadConfirmed, {detail: (event.trigger == "ok")}));
            }
            else if(dlgId == this.confirmNewProjectModalDlgId){
                if(event.trigger == "ok"){
                    // If the user confirmed: delete the WebStorage key that refers to the current autosaved project
                    if (typeof(Storage) !== "undefined") {
                        localStorage.removeItem(this.localStorageAutosaveEditorKey);
                    }
                    // ... and reload the page to reload the Strype default project (removing potential query parameters)
                    window.location.href = window.location.pathname;
                }
                else{
                    // If the user declined: restore the autosave timer and the registration to the "beforeunload" event
                    window.addEventListener("beforeunload", this.beforeUnloadHandler);
                    this.setAutoSaveState();
                }
            }
        },

        loadLocalStorageProjectOnStart() {
            // Check the local storage (WebStorage) to see if there is a saved project from the previous time the user entered the system
            // if browser supports localstorage
            this.checkLocalStorageHasProject().then((savedState) => {
                // Just to make sure when reaching this path from a cancelled shared project load,
                // we remove the query parameters in the URL (it won't change if we came in normal case so no problem)
                window.history.replaceState({}, document.title, window.location.pathname);
                this.appStore.setStateFromJSONStr( 
                    {
                        stateJSONStr: savedState,
                        showMessage: false,
                        readCompressed: true,
                    }
                ).then(() => {
                    // When a file had been reloaded and it was previously synced with a Cloud Drive, we want to ask the user
                    // about reloading the project from that Cloud Drive again (only if we were not attempting to open a shared project via the URL)
                    if(this.appStore.currentCloudSaveFileId) {
                        // We need to have the specific Cloud Drive component loaded for getting its name and register the generic signin callback, so we do that now...
                        const cloudHandlerVueComponent = ((this.$refs[this.menuUID] as InstanceType<typeof Menu>).$refs[getCloudDriveHandlerComponentRefId()] as InstanceType<typeof CloudDriveHandlerComponent>);
                        cloudHandlerVueComponent.setGenericSignInCallBack(this.appStore.syncTarget, () => cloudHandlerVueComponent.saveFile(this.appStore.syncTarget, SaveRequestReason.reloadBrowser));       
                        this.cloudDriveName = cloudHandlerVueComponent.getDriveName();
                        const execGetCloudDriveFileFunction = (event: BvModalEvent, dlgId: string) => {
                            if(dlgId == this.resyncToCloudDriveAtStartupModalDlgId){
                                if(event.trigger == "ok" || event.trigger=="event"){
                                    // Initiate a connection to the Cloud Drive (for updating the Cloud Drive with local changes)
                                    cloudHandlerVueComponent.signInFn();                                
                                    this.$root.$off("bv::modal::hide", execGetCloudDriveFileFunction); 
                                }
                                else{
                                    // We make sure we do not keep a wrong sync target!
                                    (this.$refs[this.menuUID] as InstanceType<typeof Menu>).saveTargetChoice(StrypeSyncTarget.none);                      
                                }
                            }
                        };
                        this.$root.$on("bv::modal::hide", execGetCloudDriveFileFunction);   
                        this.$root.$emit("bv::show::modal", this.resyncToCloudDriveAtStartupModalDlgId);
                    }
                    // When a file has been reloaded and it was previously saved the File System, we want to clear off any references to that file
                    else if(this.appStore.syncTarget == StrypeSyncTarget.fs){
                        (this.$refs[this.menuUID] as InstanceType<typeof Menu>).saveTargetChoice(StrypeSyncTarget.none);
                    }
                }, () => {});
            }, () => {});
        },

        applyShowAppProgress(event: AppEvent) {
            // If the progress bar is shown, we block the width of the application to the viewport
            // and revert it otherwise
            this.showAppProgress = event.requestAttention;
            if(event.requestAttention) {
                this.progressbarMessage = event.message ?? "";   
            }
            const heightVal = (this.showAppProgress) ? " 100vh": "100%";
            const overflowVal = (this.showAppProgress) ? "hidden" : "auto";
            (document.getElementsByTagName("html")[0] as HTMLHtmlElement).style.height = heightVal;
            (document.getElementsByTagName("body")[0] as HTMLBodyElement).style.height = heightVal;
            (document.getElementById("app") as HTMLDivElement).style.height = heightVal;
            (document.getElementById("app") as HTMLDivElement).style.overflow = overflowVal;
        },

        resetStrypeProject(){
            // To reset the project we:
            // 1) stop the autosave timer
            window.clearInterval(autoSaveTimerId);
            // 2) De-register the "beforeunload" event so we can handle the "continue/cancel" process ourselves if needed
            window.removeEventListener("beforeunload", this.beforeUnloadHandler);
            // 3) 2 situations: Strype knows we are in a saved state* --> just do like if we confirmed the project update (see below)
            //                  otherwise --> show the modal dialog for user confirmation
            const isSavedProject = this.appStore.syncTarget != StrypeSyncTarget.none && !this.appStore.isEditorContentModified;
            if(isSavedProject){
                // (*) project is saved (to the cloud or FS) without modifications
                this.onHideModalDlg({trigger: "ok"} as BvModalEvent, this.confirmNewProjectModalDlgId);
            }
            else {
                this.$root.$emit("bv::show::modal", this.confirmNewProjectModalDlgId);
            }            
        },

        finaliseOpenShareProject(message?: {key: string, param: string}) {
            // Show a message to the user that the project has (not) been loaded, if requested
            if(message){
                this.appStore.simpleModalDlgMsg = this.$i18n.t(message.key, {param1: message.param}) as string;
                this.$root.$emit("bv::show::modal", getAppSimpleMsgDlgId());
            }
            // And also remove the query parameters in the URL
            window.history.replaceState({}, document.title, window.location.pathname);
        },

        getFrameContainerUID(frameId: number){
            return getFrameContainerUID(frameId);
        },

        messageTop(): boolean {
            return this.appStore.currentMessage.type !== MessageTypes.imageDisplay;
        },

        handleWholeEditorMouseDown(){
            // Force the Strype menu to close in case it was opened
            (this.$refs[getMenuLeftPaneUID()] as InstanceType<typeof Menu>).toggleMenuOnOff(null);
        },

        handleDocumentSelectionChange(){
            // When the selection has changed, we update the cursor infos in the store.
            const docSelection = document.getSelection();
            if(docSelection){
                // If we have an application overlay (masking the UI) we shouldn't do anything
                if(docSelection.anchorNode?.nodeName == "DIV" && (docSelection.anchorNode as HTMLDivElement).className.includes("app-overlay-pane")){
                    return;
                }

                let anchorSpanElement = docSelection?.anchorNode?.parentElement;
                let focusSpanElement =  docSelection?.focusNode?.parentElement;
                // When the editable slots are empty, the span doesn't get the focus, but the container div does.
                // So we need to retrieve the right HTML component by hand.      
                // (usually, the first level div container gets the selection, but with FF, the second level container can also get it,
                // and still with FF, a select-all will select the slot wrapper div)   
                const classCheckerRegex = new RegExp("(^| )" + scssVars.labelSlotContainerClassName + "($| )");
                if(anchorSpanElement?.tagName.toLowerCase() == "div"){
                    if(anchorSpanElement.className.match(classCheckerRegex) != null){
                        // The most common case
                        anchorSpanElement = anchorSpanElement.firstElementChild as HTMLSpanElement;
                    }
                    else if(anchorSpanElement.firstElementChild?.className.match(classCheckerRegex) != null){
                        // The odd case in FF (level 2)
                        anchorSpanElement = anchorSpanElement.firstElementChild.firstElementChild as HTMLSpanElement;
                    }
                    else{
                        // The odd case in FF of select-all: here we need to find out the span that starts the structure.
                        const firstStructSpan = anchorSpanElement.getElementsByClassName(scssVars.labelSlotStructClassName).item(0)?.firstChild?.firstChild;
                        if(firstStructSpan){
                            anchorSpanElement = firstStructSpan as HTMLSpanElement;
                        }
                    }
                }
                if(focusSpanElement?.tagName.toLowerCase() == "div"){
                    if(focusSpanElement.className.match(classCheckerRegex) != null){
                        // The most common case
                        focusSpanElement = focusSpanElement.firstElementChild as HTMLSpanElement;
                    }
                    else if(focusSpanElement.firstElementChild?.className.match(classCheckerRegex) != null){
                        // The odd case in FF (level 2)
                        focusSpanElement = focusSpanElement.firstElementChild.firstElementChild as HTMLSpanElement;
                    }
                    else{
                        // The odd case in FF of select-all: here we need to find out the span that ends the structure.
                        const divFocusChildren = focusSpanElement.getElementsByClassName(scssVars.labelSlotStructClassName);
                        const lastStructSpan = divFocusChildren.item(0)?.lastChild?.firstChild;
                        if(lastStructSpan){
                            focusSpanElement = lastStructSpan as HTMLSpanElement;                        
                        }
                    }
                }
                if(anchorSpanElement && focusSpanElement && isElementLabelSlotInput(anchorSpanElement) && isElementLabelSlotInput(focusSpanElement)
                    && anchorSpanElement.isContentEditable && focusSpanElement.isContentEditable){
                    const anchorSlotInfo = parseLabelSlotUID(anchorSpanElement.id);
                    let focusSlotInfo = parseLabelSlotUID(focusSpanElement.id);
                    let focusOffset= docSelection.focusOffset;
                    
                    // Check the weird string literal selection case that brings up the quotes (see inside the if)
                    if(anchorSlotInfo.slotType != SlotType.closingQuote && focusSlotInfo.slotType == SlotType.closingQuote){
                        // It seems that when triple clicking a string literal content, the focus also includes the closing quote.
                        // We don't want to have this as part of the selection, so we make sure that we select the literal until its end and not the quote.
                        // So we change the focusSlotInfo to make it coherent with the selection and update focusOffset to reflects the string literal length.
                        focusSlotInfo.slotType = SlotType.string;
                        focusOffset = anchorSpanElement.textContent?.length??0;
                    }
                    
                    this.appStore.setSlotTextCursors({slotInfos: anchorSlotInfo, cursorPos: docSelection.anchorOffset},
                        {slotInfos: focusSlotInfo, cursorPos: focusOffset});
                }
            }
        },

        handleOverlayRightClick(){
            // When a right click occur on the overlay and the frame context menu is opened, we remove the menu and modality
            const currrentFrameContextMenu = getActiveContextMenu();
            if(currrentFrameContextMenu){
                // Generate an "escape" hit to remove the menu, see (window "keydown" listener)
                currrentFrameContextMenu.dispatchEvent(new KeyboardEvent("keydown", {keyCode: 27}));            
            }
        },

        handleContextMenu(event: MouseEvent) {
            // This method can be called either when the mouse has been right-clicked (context menu) or a keyboard shortcut for context menu has been hit
            if(this.appStore.isContextMenuKeyboardShortcutUsed){                    
                // Handle the context menu triggered by the keyboard here.
                // 3 cases should be considered 
                //  1) we are editing (so in a slot: we do nothing special, because we want to show the native context menu),
                //  2) we are not editing and there is a frame selection: get the frames context menu opened for that selection
                //  3) we are not editing and there is no frame selection: get the caret context menu opened for that position (i.e. paste...)
                if(!this.appStore.isEditing) {
                    // We only show a context menu if we are not executing the user's code
                    if(!this.isPythonExecuting) {
                        // We wait for the next tick even to show the menu, because the flag about the key need to be reset
                        // in the call of this handleClick() (for frames context menu)
                        const areFramesSelected = (this.appStore.selectedFrames.length > 0);
                        this.$nextTick(() => {
                            // Prepare positioning stuff before showing the menu; then use the position informations to call the handleClick method
                            const menuPosition = this.ensureFrameKBShortcutContextMenu(areFramesSelected);
                            // We retrieve the element on which we need to call the menu: the first frame of the selection if some frames are selected,
                            // the current blue caret otherwise
                            const frameComponent = getFrameComponent((areFramesSelected) ? this.appStore.selectedFrames[0] : this.appStore.currentFrame.id);
                            if(frameComponent) {
                                if(areFramesSelected){
                                    (frameComponent as InstanceType<typeof Frame>).handleClick(event, menuPosition);
                                }
                                else{
                                    // When there is no selection, the menu to open is for the current caret, which can either be inside a frame's body or under a frame
                                    const caretContainerComponent = getCaretContainerComponent(frameComponent);
                                    caretContainerComponent.handleClick(event, menuPosition);
                                }
                            }
                        });  
                    }
                    // Prevent the default browser's handling of a context menu here
                    event.stopImmediatePropagation();
                    event.preventDefault();
                }
                this.appStore.isContextMenuKeyboardShortcutUsed = false;
            }
            else{
                // Handling the context menu triggered by a click here.
                if(!isElementLabelSlotInput(event.target)){
                    event.stopImmediatePropagation();
                    event.preventDefault();
                }
                else{
                    const currentCustomMenuId: string = this.appStore.contextMenuShownId;
                    if(currentCustomMenuId.length > 0){
                        const customMenu = document.getElementById(getFrameContextMenuUID(currentCustomMenuId));
                        customMenu?.setAttribute("hidden", "true");
                    }
                }
            }
        },

        checkMouseSelection(){
            // Contrary to the keyboard selection, we do not have a very easy way to control the mouse selection,
            // and the browser's handling selection may end up with a wrong selection in the sense of our slot structure.
            // (However it will not exceed the scope of the frame label slots struct the selection is currently in.)
            // When the mouse button is released we check that we have a multi slot selection that it is coherent, if not we updated it.
            // Note that calling this on dragend event won't work, I think because the event is captured by the frame drag and drop already

            if(this.isPythonExecuting){
                // We have no selection possible when the user's code is being executed.
                return;
            }
            
            this.$nextTick(() => {
                const anchorSlotCursorInfos = this.appStore.anchorSlotCursorInfos;
                const focusSlotCursorInfos = this.appStore.focusSlotCursorInfos;
                if(anchorSlotCursorInfos && focusSlotCursorInfos){
                    const anchorParentSlotId = getSlotParentIdAndIndexSplit(anchorSlotCursorInfos.slotInfos.slotId).parentId;
                    const focusParentSlotId = getSlotParentIdAndIndexSplit(focusSlotCursorInfos.slotInfos.slotId).parentId;
                    // If one of the anchor/focus is a string and the other isn't the same string (case A),or the anchor and focus are not in the same level (tree-wise) (case B)
                    // or the selection is one quote or bracket token (case C, and oneQuoteOrBracketSelected is set to true)
                    // then we need to amend the selection
                    const anchorLevel =  (anchorSlotCursorInfos?.slotInfos.slotId.split(",").length)??0;
                    const focusLevel = (focusSlotCursorInfos?.slotInfos.slotId.split(",").length)??0;
                    const sameLevelDiffParents = (focusLevel == anchorLevel && anchorParentSlotId != focusParentSlotId);
                    const hasStringSelected = (focusSlotCursorInfos.slotInfos.slotType == SlotType.string || anchorSlotCursorInfos.slotInfos.slotType == SlotType.string);
                    const oneQuoteOrBracketSelected = ((focusSlotCursorInfos.slotInfos.slotType & SlotType.quote) > 0  || (focusSlotCursorInfos.slotInfos.slotType & SlotType.bracket) > 0)
                        && areSlotCoreInfosEqual(focusSlotCursorInfos.slotInfos,anchorSlotCursorInfos.slotInfos);
                    const isSelectionNotAllowed = (focusLevel != anchorLevel) || sameLevelDiffParents || oneQuoteOrBracketSelected
                        || (hasStringSelected && focusSlotCursorInfos.slotInfos.slotId != anchorSlotCursorInfos.slotInfos.slotId);

                    // Fix an issue with anchor on empty slots: the underlying span element matching the anchor slot contains a zero-width space when empty,
                    // therefore it possible that, with the mouse, the cursor was placed right after that ZWSP and we get an anchor slot core infos that
                    // doesn't match our "code" content. So we always replace the cursor position when detect this situation.
                    if(anchorSlotCursorInfos.cursorPos == 1 && (anchorSlotCursorInfos.slotInfos.slotType & SlotType.code) > 0
                        && (retrieveSlotFromSlotInfos(anchorSlotCursorInfos.slotInfos) as BaseSlot).code.length == 0){
                        anchorSlotCursorInfos.cursorPos = 0;
                    } 
                        
                    let amendedSelectionFocusCursorSlotInfos = cloneDeep(anchorSlotCursorInfos) as SlotCursorInfos;
                    if(isSelectionNotAllowed) {
                        const forwardSelection = ((getSelectionCursorsComparisonValue() as number) < 0);
                        if(oneQuoteOrBracketSelected) {
                            // For case C: we have a quote/string token selection (the anchor/focus is on a TOKEN slot): we prevent that selection by getting a not spanning selection.
                            // The final cursor position might not be the one set below, because something else in the code later places the caret to the a valid place.
                            // The important thing is to make sure we don't have spanning selection anymore, and that we don't keep the cursor on the token slot.
                            // Therefore we reset the anchor/focus to a valid anchor position that depends on the nature and direction of the selection.
                            const isBracketToken = (focusSlotCursorInfos.slotInfos.slotType & SlotType.bracket) > 0;
                            if(amendedSelectionFocusCursorSlotInfos.slotInfos.slotType == SlotType.openingBracket || amendedSelectionFocusCursorSlotInfos.slotInfos.slotType == SlotType.openingQuote) {
                                amendedSelectionFocusCursorSlotInfos.cursorPos = 0;
                                // If we go backward after an opening quote/bracket we need to stay on the string literal/first bracketed element
                                amendedSelectionFocusCursorSlotInfos.slotInfos.slotType = (isBracketToken) ? SlotType.code : SlotType.string;
                                amendedSelectionFocusCursorSlotInfos.slotInfos.slotId += ((isBracketToken) ?  ",0" : "");
                                if(forwardSelection){
                                    // If we go forward before an opening quote/bracket we need to stay on the previous sibling.
                                    // So we "go inside the string/brackets" (done above) and look before.
                                    amendedSelectionFocusCursorSlotInfos.slotInfos.slotType = SlotType.code;
                                    amendedSelectionFocusCursorSlotInfos.slotInfos = getFlatNeighbourFieldSlotInfos(amendedSelectionFocusCursorSlotInfos.slotInfos, false) as SlotCoreInfos;
                                    amendedSelectionFocusCursorSlotInfos.cursorPos = (retrieveSlotFromSlotInfos(amendedSelectionFocusCursorSlotInfos.slotInfos) as BaseSlot).code.length;
                                }
                            }
                            else{                
                                // If we go forward before a closing quote/bracket we need to stay on the string literal/last bracketed element
                                const structureSlot = retrieveSlotFromSlotInfos({...focusSlotCursorInfos.slotInfos, slotType: (isBracketToken) ? SlotType.bracket : SlotType.string});
                                amendedSelectionFocusCursorSlotInfos.slotInfos.slotType = (isBracketToken) ? SlotType.code : SlotType.string;
                                if(isBracketToken){
                                    const lastBracketChildSlotIndex = (structureSlot as SlotsStructure).fields.length -1;
                                    const lastBracketChildCodeLength = ((structureSlot as SlotsStructure).fields[lastBracketChildSlotIndex] as BaseSlot).code.length;
                                    amendedSelectionFocusCursorSlotInfos.slotInfos.slotId += ("," + lastBracketChildSlotIndex);
                                    amendedSelectionFocusCursorSlotInfos.cursorPos =  lastBracketChildCodeLength;
                                }
                                else{
                                    amendedSelectionFocusCursorSlotInfos.cursorPos =  (structureSlot as BaseSlot).code.length;
                                }                                
                                if(!forwardSelection){
                                    // If we go backward after an closing quote/bracket we need to stay on the next sibling
                                    // So we "go inside the string/brackets" (done above) and look after.
                                    amendedSelectionFocusCursorSlotInfos.slotInfos.slotType = SlotType.code;
                                    amendedSelectionFocusCursorSlotInfos.slotInfos = getFlatNeighbourFieldSlotInfos(amendedSelectionFocusCursorSlotInfos.slotInfos, true) as SlotCoreInfos;
                                    amendedSelectionFocusCursorSlotInfos.cursorPos = 0;
                                }
                            }
                        }
                        else {
                            // Case A: problem with string selection :
                            // if the anchor is a string we reach the beginning or the end of that string depending on the selection direction
                            // if the anchor is not a string then we stop just before or after the target string depending on the selection direction
                            //     and the validity of where we would "land" --> cf case B
                            if(hasStringSelected && anchorSlotCursorInfos.slotInfos.slotType == SlotType.string){
                                const anchorSlot = (retrieveSlotFromSlotInfos(anchorSlotCursorInfos.slotInfos) as StringSlot);
                                amendedSelectionFocusCursorSlotInfos.cursorPos = (forwardSelection) ? anchorSlot.code.length : 0;
                            }
                            else{
                                // Case B: different levels of slots or destination is a string
                                if ((focusLevel < anchorLevel) || sameLevelDiffParents) {
                                    // Case B.1: if we go from a deeper level to an outer level, then we stop at the last [resp. first] sibling of the anchor level when selection forwards [resp. backwards]
                                    const anchorParentSlot = retrieveParentSlotFromSlotInfos(anchorSlotCursorInfos.slotInfos) as SlotsStructure;
                                    const siblingSlotId = getSlotIdFromParentIdAndIndexSplit(anchorParentSlotId,  (forwardSelection) ? anchorParentSlot.fields.length - 1 : 0);
                                    amendedSelectionFocusCursorSlotInfos.slotInfos.slotId = siblingSlotId;
                                    const siblingSlot = retrieveSlotFromSlotInfos(amendedSelectionFocusCursorSlotInfos.slotInfos);
                                    amendedSelectionFocusCursorSlotInfos.cursorPos = (forwardSelection) ? (siblingSlot as BaseSlot).code.length : 0;
                                }
                                else{
                                    // case B.2: if we go from an outer level to a deeper level, then need to find where is the focus "ancestor" in same level of the anchor, and stop before [resp. after] if going forwards [resp. backwards]
                                    const ancestorIndex = getSameLevelAncestorIndex(focusSlotCursorInfos.slotInfos.slotId, anchorParentSlotId);
                                    const closestAncestorNeighbourSlotId = getSlotIdFromParentIdAndIndexSplit(anchorParentSlotId,  (forwardSelection) ? ancestorIndex - 1 : ancestorIndex + 1);
                                    const closestAncestorNeighbourSlot = retrieveSlotFromSlotInfos({...amendedSelectionFocusCursorSlotInfos.slotInfos, slotId: closestAncestorNeighbourSlotId}) as BaseSlot;
                                    amendedSelectionFocusCursorSlotInfos.slotInfos.slotId = closestAncestorNeighbourSlotId;
                                    amendedSelectionFocusCursorSlotInfos.cursorPos = (forwardSelection) ? closestAncestorNeighbourSlot.code.length : 0;
                                }
                            }
                        }
                    }

                    // Update the selection now 
                    const focusCursorInfoToUse = (isSelectionNotAllowed) ? amendedSelectionFocusCursorSlotInfos : focusSlotCursorInfos;
                    if(!isSelectionNotAllowed && focusSlotCursorInfos.cursorPos == 1 && focusCursorInfoToUse.slotInfos.slotType == SlotType.code && (retrieveSlotFromSlotInfos(focusSlotCursorInfos.slotInfos) as BaseSlot).code.length == 0 ){
                        // Fix an issue with focus on empty slots: the underlying span element matching the anchor slot contains a zero-width space when empty,
                        // therefore it possible that, with the mouse, the cursor was placed right after that ZWSP and we get a focus slot core infos that
                        // doesn't match our "code" content. So we always replace the cursor position when detect this situation.
                        focusCursorInfoToUse.cursorPos = 0;                    
                    }
                    this.appStore.setSlotTextCursors((oneQuoteOrBracketSelected) ? focusCursorInfoToUse : anchorSlotCursorInfos, focusCursorInfoToUse);
                    setDocumentSelection((oneQuoteOrBracketSelected) ? focusCursorInfoToUse : anchorSlotCursorInfos, focusCursorInfoToUse);
                    // Explicitly set the focused property to the focused slot
                    if (this.appStore.frameObjects[focusCursorInfoToUse.slotInfos.frameId]) {
                        this.appStore.setFocusEditableSlot({
                            frameSlotInfos: focusCursorInfoToUse.slotInfos,
                            caretPosition: (this.appStore.frameObjects[focusCursorInfoToUse.slotInfos.frameId].frameType.allowChildren) ? CaretPosition.body : CaretPosition.below,
                        });
                    }
                }
                else{
                    // This situation is usually handled properly: we clicked "outside" a frame and it will show the frame cursor we were at.
                    // There is one exception we can handle here: when we were inside the project documentation and left to a part of the editor
                    // that's not defined (like the green black space below the editor). 
                    // That is because the project documentation is inside a specific "fake" frame.
                    // We go to the next available frame section.
                    if(this.appStore.currentFrame.id == projectDocumentationFrameId){
                        const nextVisibleSectionFrame = [this.appStore.importContainerId, this.appStore.defsContainerId, this.appStore.getMainCodeFrameContainerId]
                            .find((frameContainerId) => this.appStore.frameObjects[frameContainerId].collapsedState != CollapsedState.ONLY_HEADER_VISIBLE);
                        // At least the main section is not collapsed we should always get a value.. but let's keep TS happy
                        if(nextVisibleSectionFrame != undefined){
                            this.appStore.toggleCaret({id: nextVisibleSectionFrame, caretPosition: CaretPosition.body});
                        }
                    }
                }
            });     
        },

        ensureFrameKBShortcutContextMenu(isTargetFrames: boolean): Position {
            // This method is called when the context menu for selected frames or the blue caret is going to be shown because of a keyboard shortcut.
            // We need to make sure the frame(s) / caret and the context menu will be visible, as the user may have scrolled and left the selection (partially or fully) out of view.
            // We need to force a position for that menu, because the mouse is not the reference when using the keyboard shortcut
            // We do it like that: if top of the target position + estimated large menu height for safety can be visible, we make sure the top of the target position, and place the menu with both X and Y offsets from the top;
            // if the top of the target + estimated large menu height can't be visible (for example when we are at the down-most frames) then we make sure the bottom
            // of the target is in view, and place the menu with a X offset based on the bottom positions
            const menuHeightSpace = (isTargetFrames) ? 320 : 90, menuOffsetY = 5, menuOffsetX = 40;
            const firstSelectedTargetElement = (isTargetFrames) 
                ? document.getElementById(getFrameUID(this.appStore.selectedFrames[0]))
                : document.querySelector(`.${scssVars.caretContainerClassName}:has(> .${scssVars.navigationPositionClassName}.${scssVars.caretClassName}:not(.${scssVars.invisibleClassName}))`); // We want to retrieve the caret container of the currently visible caret
            const lastSelectedTargetElement = (isTargetFrames) 
                ? document.getElementById(getFrameUID(this.appStore.selectedFrames.at(-1) as number)) 
                : document.querySelector(`.${scssVars.caretContainerClassName}:has(> .${scssVars.navigationPositionClassName}.${scssVars.caretClassName}:not(.${scssVars.invisibleClassName}))`);
            // For the editor, we need to get whole editor container, not the space in the middle that is adapted to the viewport
            const editorViewingElement = document.getElementById(getEditorMiddleUID());
            const editorElement = editorViewingElement?.children[0];
            const positionToReturn: Position = {};
            if(firstSelectedTargetElement && lastSelectedTargetElement && editorElement && editorViewingElement){
                if(firstSelectedTargetElement.getBoundingClientRect().top + menuHeightSpace < editorElement.getBoundingClientRect().bottom){
                    // The menu can be shown from the top of the selection, we just make sure we give enough visibility below the top of the frame
                    const positionOfBottomMenu = firstSelectedTargetElement.getBoundingClientRect().top + menuHeightSpace;
                    if(positionOfBottomMenu > editorViewingElement.getBoundingClientRect().height || firstSelectedTargetElement.getBoundingClientRect().top < 0){
                        editorViewingElement.scroll(0, firstSelectedTargetElement.getBoundingClientRect().top);
                    }
                    positionToReturn.top = firstSelectedTargetElement.getBoundingClientRect().top + menuOffsetY;                                      
                    positionToReturn.left = firstSelectedTargetElement.getBoundingClientRect().left + menuOffsetX;
                }
                else{
                    // The menu cannot be shown from the top of the selection
                    const positionOfTopMenu = lastSelectedTargetElement.getBoundingClientRect().bottom - menuHeightSpace;
                    if(positionOfTopMenu < 0 || lastSelectedTargetElement.getBoundingClientRect().bottom > editorViewingElement.getBoundingClientRect().height){
                        editorViewingElement.scroll(0, positionOfTopMenu);
                    }
                    positionToReturn.bottom = lastSelectedTargetElement.getBoundingClientRect().bottom;     
                    positionToReturn.left = lastSelectedTargetElement.getBoundingClientRect().left + menuOffsetX;
                }
            }
            
            return positionToReturn;                          
        },

        blockScrollOnContextMenu(event :Event) {
            if(getActiveContextMenu()){
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        },

        onContextMenuHover(menuTarget: HTMLElement) {
            // When a context menu entry is hovered, we want to make it as selected. 
            // If we didn't, then there would be a confusion between a selected item with the keyboard, and another hovered item with the mouse.
            // Doing so guarantee that only 1 element is selected in the menu
            menuTarget.focus();
        },

        /* IFTRUE_isPython */
        onExpandedPythonExecAreaSplitPaneResize(event: any, calledForResize?: boolean){
            // We want to know the size of the second pane (https://antoniandre.github.io/splitpanes/#emitted-events).
            // It will dictate the size of the Python execution area (expanded, with a range between 20% and 80% of the vh)
            const lowerPanelSize = event[1].size as number;
            if(!calledForResize){
                // If the call isn't trigger by a window resize, we save the panel 1 size in the project
                if(this.appStore.peaExpandedSplitterPane2Size != undefined) {
                    this.appStore.peaExpandedSplitterPane2Size[this.appStore.peaLayoutMode??StrypePEALayoutMode.tabsCollapsed] = lowerPanelSize; 
                }
                else{
                    // The tricky case of when the state property has never been set
                    this.appStore.peaExpandedSplitterPane2Size = {...defaultEmptyStrypeLayoutDividerSettings, [this.appStore.peaLayoutMode??StrypePEALayoutMode.tabsCollapsed]: lowerPanelSize};

                }

                // A change of divider position triggers a modification notification only when the user actively moves the divider,
                // we can distinguish between a sitation when the divider is position is loaded and user event by the content of the event
                if((event?.length??0) > 1){
                    this.appStore.isEditorContentModified = true;
                }
            }
            if(lowerPanelSize >= this.peaOverlayPane2MinSize && lowerPanelSize <= this.peaOverlayPane2MaxSize){
                // As the splitter works in percentage, and the full app height is which of the body, we can compute the height/position
                // of the editor and of the Python execution area.
                const fullAppHeight= (document.getElementsByTagName("body")[0].clientHeight);
                const editorNewMaxHeight = fullAppHeight * (1 - lowerPanelSize /100);
                // When the user has used the splitter slider to resize the Python execution area, we set a flag in the store: 
                // as we play with styling we need to know (see PythonExecutionArea.vue)
                setManuallyResizedEditorHeightFlag(editorNewMaxHeight);
                debounceComputeAddFrameCommandContainerSize(true);
                // Set the editor's max height (fitting within the first pane's height); as well as the "frame commands" panel's
                const croppedEditor = document.getElementsByClassName(scssVars.croppedEditorDivClassName);
                if(croppedEditor.length > 0){
                    // The "cropped editor", that is when the PEA is expanded may not exist if the PEA wasn't expanded before..
                    (croppedEditor[0] as HTMLDivElement).style.maxHeight = (editorNewMaxHeight + "px");                      
                }
                (document.getElementsByClassName(scssVars.noPEACommandsClassName)[0] as HTMLDivElement).style.maxHeight = (editorNewMaxHeight + "px");
                // Set the Python Execution Area's position
                const peaWithExpandedClass = document.querySelector("." + scssVars.peaContainerClassName + "." + scssVars.expandedPEAClassName);
                if(peaWithExpandedClass){
                    // The "expanded PEA" may not exist if the PEA wasn't expanded before..
                    (peaWithExpandedClass as HTMLDivElement).style.top = (editorNewMaxHeight + "px");
                }     
                // Set the max height of the Python Execution Area's tab content
                setPythonExecutionAreaTabsContentMaxHeight();
                // Trigger a resized event (for scaling the Turtle canvas properly)
                document.getElementById(getPEATabContentContainerDivId())?.dispatchEvent(new CustomEvent(CustomEventTypes.pythonExecAreaSizeChanged));
            }

            // Update the Python Execution Area layout buttons' position
            setPythonExecAreaLayoutButtonPos();
        },
        /* FITRUE_isPython */

        onStrypeCommandsSplitPaneResize(event: any, useSpecificPEALayout?: StrypePEALayoutMode){
            // Save the new size of the RHS pane of the editor/commands splitter
            if(this.appStore.editorCommandsSplitterPane2Size != undefined) {
                Vue.set(this.appStore.editorCommandsSplitterPane2Size, useSpecificPEALayout??(this.appStore.peaLayoutMode??StrypePEALayoutMode.tabsCollapsed), event[1].size);
            }
            else {
                // The tricky case of when the state property has never been set
                this.appStore.editorCommandsSplitterPane2Size = {...defaultEmptyStrypeLayoutDividerSettings, [useSpecificPEALayout??(this.appStore.peaLayoutMode??StrypePEALayoutMode.tabsCollapsed)]: event[1].size};
            }

            // A change of divider position triggers a modification notification only when the user actively moves the divider,
            // we can distinguish between a sitation when the divider is position is loaded and user event by the content of the event
            if(event.length > 1){
                this.appStore.isEditorContentModified = true;
            }

            /* IFTRUE_isPython */
            // When the rightmost panel (with Strype commands) is resized, we need to also update the Turtle canvas and break the natural 4:3 ratio of the PEA
            (this.$refs[this.strypeCommandsRefId] as InstanceType<typeof Commands>).isCommandsSplitterChanged = true;
            document.getElementById(getPEATabContentContainerDivId())?.dispatchEvent(new CustomEvent(CustomEventTypes.pythonExecAreaSizeChanged));
            /* FITRUE_isPython */
        },
        
        setStateFromPythonFile(completeSource: string, fileName: string, lastSaveDate: number, requestFSFileLoadedNotification: boolean, fileLocation?: FileSystemFileHandle) : Promise<void> {
            return new Promise((resolve) => {
                const s = pasteMixedPython(completeSource, true);

                if (s != null) {

                    // Now we can clear other non-frame related elements
                    this.appStore.clearNoneFrameRelatedState();
                
                    /* IFTRUE_isPython */
                    // We check about turtle being imported as at loading a state we should reflect if turtle was added in that state.
                    actOnTurtleImport();

                    // Clear the Python Execution Area as it could have be run before.
                    ((this.$root.$children[0].$refs[getStrypeCommandComponentRefId()] as Vue).$refs[getPEAComponentRefId()] as any).clear();
                    /* FITRUE_isPython */
                    
                    this.appStore.setDividerStates(
                        loadDivider(s.headers["editorCommandsSplitterPane2Size"]),
                        s.headers["peaLayoutMode"] !== undefined ? StrypePEALayoutMode[s.headers["peaLayoutMode"] as keyof typeof StrypePEALayoutMode] : StrypePEALayoutMode.tabsCollapsed,
                        loadDivider(s.headers["peaCommandsSplitterPane2Size"]),
                        loadDivider(s.headers["peaSplitViewSplitterPane1Size"]),
                        loadDivider(s.headers["peaExpandedSplitterPane2Size"]),
                        () => {
                            // Finally, we can trigger the notifcation a file from FS has been loaded.
                            if(requestFSFileLoadedNotification){
                                (this.$refs[this.menuUID] as InstanceType<typeof Menu>).onFileLoaded(fileName, lastSaveDate, fileLocation);
                            }
                            resolve();
                        },
                        true
                    );
                    
                    // Check for errors (could be that we loaded something with blanks or syntax errors):
                    this.$nextTick(() => checkCodeErrors());                    
                }
            });
        },
        getMediaPreviewPopupInstance() {
            return this.$refs.mediaPreviewPopup;
        },
        getPeaComponent() {
            return (this.$refs[this.strypeCommandsRefId] as any).$refs[getPEAComponentRefId()];
        },
        editImageInDialog(imageDataURL: string, showPreview: (dataURL: string) => void, callback: (replacement: {code: string, mediaType: string}) => void) {
            const editImageDlg = this.$refs.editImageDlg as InstanceType<typeof EditImageDlg>;
            this.imgToEditInDialog = imageDataURL;
            this.showImgPreview = showPreview;

            const editedImage = (event: BvModalEvent, dlgId: string) => {
                if((event.trigger == "ok" || event.trigger=="event") && dlgId == "editImageDlg"){
                    //Call the callback:
                    editImageDlg.getUpdatedMedia().then(callback);

                    this.$root.$off("bv::modal::hide", editedImage);
                }
            };
            this.$root.$on("bv::modal::hide", editedImage);

            this.$root.$emit("bv::show::modal", "editImageDlg");
        },
        editSoundInDialog(audioBuffer: AudioBuffer, callback: (replacement: {code: string, mediaType: string}) => void) {
            const editSoundDlg = this.$refs.editSoundDlg as InstanceType<typeof EditSoundDlg>;
            this.soundToEditInDialog = audioBuffer;

            const editedSound = (event: BvModalEvent, dlgId: string) => {
                if((event.trigger == "ok" || event.trigger=="event") && dlgId == "editSoundDlg"){
                    //Call the callback:
                    editSoundDlg.getUpdatedMedia().then(callback);

                    this.$root.$off("bv::modal::hide", editedSound);
                }
            };
            this.$root.$on("bv::modal::hide", editedSound);

            this.$root.$emit("bv::show::modal", "editSoundDlg");
        },
    },

    provide() : { mediaPreviewPopupInstance : any, peaComponent: any, editImageInDialog : EditImageInDialogFunction, editSoundInDialog : EditSoundInDialogFunction} {
        return {
            mediaPreviewPopupInstance: this.getMediaPreviewPopupInstance,
            peaComponent: this.getPeaComponent,
            // Note, this provides the function:
            editImageInDialog: this.editImageInDialog,
            editSoundInDialog: this.editSoundInDialog,
        };
    },
});
</script>

<style lang="scss">
// The @media print classes apply only for the "print" media, that is on the print preview of the browser
@media print {
    .print-full-height  {
        height: auto !important;
        max-height: none !important;
        overflow: auto !important;
    }

    .no-print{
        display: none
    }
}

// The @media screen classes apply only for the "screen" media, that is what is displayed in the broswser.
// We only need to put classes here that would conflict with the rendering for printing.
@media screen {
    .#{$strype-classname-cropped-editor-code-div} {
        max-height: #{100 - $pea-expanded-overlay-splitter-pane2-size-value}vh;
    }

    .full-height-editor-code-div {
        height: 100vh !important;
        max-height: 100vh !important;
    }
}

html,body {
    margin: 0px;
    height: 100vh;
    background-color: #bbc6b6 !important;
}

body.#{$strype-classname-dragging-frame} {
    cursor: grabbing !important;
}

.app-overlay-pane  {
    width: 100%;
    height: 100vh;
    position: absolute;
    left: 0px;
    z-index: 500;
}

.app-progress-pane {
    background-color: rgba($color: gray, $alpha: 0.7);
}

.app-progress-container {
    position:relative;
    top: 50vh;
    padding-left: 10%;
    padding-right:10%;
 }

#app {
    font-family: 'AHN-Strype', sans-serif;
    font-optical-sizing: auto;
    font-size: 15px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    color: #2c3e50;
    box-sizing: border-box;
    height: 100vh;
    max-height: 100vh;
    overflow:hidden;
}

#editor {
    height: 100vh;
    max-height: 100vh;
}

.editor-code-div {
    overflow-y: auto;
}

.top {
    text-align: center;
    margin-left:10px;
}

.noselect {
  -webkit-touch-callout: none; /* iOS Safari */
    -webkit-user-select: none; /* Safari */
     -khtml-user-select: none; /* Konqueror HTML */
       -moz-user-select: none; /* Old versions of Firefox */
        -ms-user-select: none; /* Internet Explorer/Edge */
            user-select: none; /* Non-prefixed version, currently
                                  supported by Chrome, Edge, Opera and Firefox */
}

.nohover{
    pointer-events: none;
}

.flex-padding {
    flex-grow: 2;
}

/**
 * Style defined for the context menus (based on CSS templates from the Vue-Context component library)
 * (note that the method onContextMenuHover() in this component handle conflicts between selection and hovering)
 */
$black: #333;
$hover-blue: #5a7bfc;
$background-grey: #ecf0f1;
$divider-grey: darken($background-grey, 15%);

.v-context,
.v-context ul {
    background-color: $background-grey;
    display:block;
    margin:0;
    padding: 0;
    min-width:10rem;
    z-index:600;
    position:fixed;
    list-style:none;
    max-height:calc(100% - 50px);
    overflow-y:auto;
    border-color: transparent;
    border-bottom-width: 0px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen",
        "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue",
        sans-serif;
    box-shadow: 0 3px 6px 0 rgba($black, 0.2);
    border-radius: 4px;
}

.v-context > li,
.v-context ul > li {
    margin:0;
    position:relative
}

.v-context > li > a,
.v-context ul > li > a {
    display:block;
    padding: 5px 10px;
    color:$black !important;
    text-decoration:none;
    white-space:nowrap;
    background-color:transparent;
    border:0
}

.v-context > li.v-context-disabled > a,
.v-context ul > li.v-context-disabled > a {
    color: grey !important;
}

.v-context > li > a:focus,
.v-context ul > li > a:focus,
.#{$strype-classname-ac-item}.#{$strype-classname-ac-item-selected} {
    text-decoration:none;
    color:white !important;
    background-color: $hover-blue;
}

.v-context:focus,
.v-context > li > a:focus,
.v-context ul:focus,
.v-context ul > li > a:focus{
    outline:0
}

.v-context__sub > a:after{
    content:"\203A";
    float:right;
    padding-left:1rem
}

.v-context__sub > ul{
    display:none
}

.v-context > li {
    &:first-of-type {
      margin-top: 4px;
    }

    &:last-of-type {
      margin-bottom: 4px;
    }
  }

.v-context > ul > li > hr,
.v-context > li > hr{
    box-sizing: content-box;
    height: 1px;
    background-color: $divider-grey;
    padding: 3px 0;
    margin: 0;
    background-clip: content-box;
    pointer-events: none;
    border: none;
}

// Styling of the expanded Python execution area splitter overlay (used to simulate a splitter above the Python execution area)
// It must be full width and heigh, overlaying from (0,0), and we use events to apply the splitting ratio back to the Python execution area
.expanded-PEA-splitter-overlay {
    width: 100vw !important;
    height: 100vh !important;
    position: absolute;
    top:0;
    left:0;
}

.expanded-PEA-splitter-overlay .splitpanes__splitter {
    z-index: 502; // It needs to be higher than the PEA
}

.companion-canvas-dnd {
    position: fixed;
    z-index: 20;
    border-radius: 8px;
    border: 1px solid #8e8e8e;
    background-color: #BBB;
}

/* 
 * The following classes are to be used for styling the spliters component.
 * We just don't include the default CSS of the component and change whichever
 * part of the styling we want to change, like the background colours for instance.
 */
.splitpanes {
	display: -webkit-box;
	display: -ms-flexbox;
	display: flex;
	width: 100%;
	height: 100%
}

.splitpanes--vertical {
	-webkit-box-orient: horizontal;
	-webkit-box-direction: normal;
	-ms-flex-direction: row;
	flex-direction: row
}

.splitpanes--horizontal {
	-webkit-box-orient: vertical;
	-webkit-box-direction: normal;
	-ms-flex-direction: column;
	flex-direction: column
}

.splitpanes--dragging * {
	-webkit-user-select: none;
	-moz-user-select: none;
	-ms-user-select: none;
	user-select: none
}

.splitpanes__pane {
	width: 100%;
	height: 100%;
	overflow: hidden
}

.splitpanes--vertical .splitpanes__pane {
	-webkit-transition: width .1s ease-out;
	-o-transition: width .1s ease-out;
	transition: width .1s ease-out
}

.splitpanes--horizontal .splitpanes__pane {
	-webkit-transition: height .1s ease-out;
	-o-transition: height .1s ease-out;
	transition: height .1s ease-out
}

.splitpanes--dragging .splitpanes__pane {
	-webkit-transition: none;
	-o-transition: none;
	transition: none
}

.splitpanes__splitter {
	-ms-touch-action: none;
	touch-action: none
}

.splitpanes--vertical>.splitpanes__splitter {
	min-width: 1px;
	cursor: col-resize
}

.splitpanes--horizontal>.splitpanes__splitter {
	min-height: 1px;
	cursor: row-resize
}

.splitpanes.strype-split-theme > .splitpanes__pane {
	background-color: transparent;
}

.splitpanes.strype-split-theme > .splitpanes__splitter {
    background-color: transparent;
	-webkit-box-sizing: border-box;
	box-sizing: border-box;
	position: relative;
	-ms-flex-negative: 0;
	flex-shrink: 0
}

.splitpanes.strype-split-theme > .splitpanes__splitter:first-child {
	cursor: auto
}

.strype-split-theme.splitpanes > .splitpanes .splitpanes__splitter {
	z-index: 1
}

.strype-split-theme.splitpanes--vertical>.splitpanes__splitter,
.strype-split-theme .splitpanes--vertical>.splitpanes__splitter {
	width: 2px;
	//border-left: 1px solid #eee;
    border-right: 1px solid transparent;
	margin-left: -1px
}

.strype-split-theme.splitpanes--vertical>.splitpanes__splitter:before,
.strype-split-theme.splitpanes--vertical>.splitpanes__splitter:after,
.strype-split-theme .splitpanes--vertical>.splitpanes__splitter:before,
.strype-split-theme .splitpanes--vertical>.splitpanes__splitter:after {
	-webkit-transform: translateY(-50%);
	-ms-transform: translateY(-50%);
	transform: translateY(-50%);
	width: 1px;
	height: 30px
}

.strype-split-theme.splitpanes--vertical>.splitpanes__splitter:before,
.strype-split-theme .splitpanes--vertical>.splitpanes__splitter:before {
	margin-left: -2px
}

.strype-split-theme.splitpanes--vertical>.splitpanes__splitter:after,
.strype-split-theme .splitpanes--vertical>.splitpanes__splitter:after {
	margin-left: 1px
}

.strype-split-theme.splitpanes--horizontal>.splitpanes__splitter,
.strype-split-theme .splitpanes--horizontal>.splitpanes__splitter {
	height: 14px;
	border-top: 1px solid transparent;
	margin-top: -1px
}

.strype-split-theme.splitpanes--horizontal>.splitpanes__splitter:before,
.strype-split-theme.splitpanes--horizontal>.splitpanes__splitter:after,
.strype-split-theme .splitpanes--horizontal>.splitpanes__splitter:before,
.strype-split-theme .splitpanes--horizontal>.splitpanes__splitter:after {
	-webkit-transform: translateX(-50%);
	-ms-transform: translateX(-50%);
	transform: translate(-50%);
	width: 30px;
	height: 1px
}

.strype-split-theme.splitpanes--horizontal>.splitpanes__splitter:before,
.strype-split-theme .splitpanes--horizontal>.splitpanes__splitter:before {
	margin-top: -2px
}

.strype-split-theme.splitpanes--horizontal>.splitpanes__splitter:after,
.strype-split-theme .splitpanes--horizontal>.splitpanes__splitter:after {
	margin-top: 1px
}
</style>
