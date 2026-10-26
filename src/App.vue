<template>
    <!-- With the new package for Bootstrap (for Vue 3), BApp must wrap the application content -->
    <BApp>
        <div @mousedown.capture="onAppMouseDownCapture">
            <div v-if="showAppProgress || setAppNotOnTop" :class="{'app-overlay-pane': true, 'app-overlay-pane-absolute': showAppProgress, 'app-progress-pane': showAppProgress}" @contextmenu="handleOverlayRightClick">
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
                        </div>
                        <span class="progress-bar-text">{{progressbarMessage}}</span>
                    </div>
                </div>
            </div>
            <!-- #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE -->
            <!-- the container div is only here because the new version of Splitpanes doesn't get the classes -->
            <div class="expanded-PEA-splitter-overlay strype-split-theme">
                <Splitpanes v-show="isExpandedPythonExecArea" horizontal @resize=onExpandedPythonExecAreaSplitPaneResize>
                    <pane key="1" :size="100 - expandedPEAOverlaySplitterPane2Size">
                    </pane>
                    <pane :id="overlayExpandedPEASplitterPane2Id" key="2" :size="expandedPEAOverlaySplitterPane2Size" :min-size="peaOverlayPane2MinSize" :max-size="peaOverlayPane2MaxSize">
                    </pane>
                </Splitpanes>
            </div>
            <!-- #v-endif-->
            <!-- Keep the style position of the row div to get proper z order layout of the app -->
            <div class="row g-0" style="position: relative;">
                <!-- the container div is only here because the new version of Splitpanes doesn't get the classes -->
                <div class="strype-split-theme">
                    <Splitpanes @resize=onStrypeCommandsSplitPaneResize>
                        <Pane key="1" :size="100 - editorCommandsSplitterPane2Size" min-size="33" max-size="90">
                            <!-- These data items are to enable testing: -->
                            <div :id="editorId" :data-slot-focus-id="slotFocusId" :data-slot-cursor="slotCursorPos" :data-pending-slot-conversion="pendingSlotConversion" class="print-full-height">
                                <div class="top no-print">
                                    <MessageBanner 
                                        v-if="showMessage"
                                    />
                                </div>
                                <div class="row g-0" >
                                    <Menu 
                                        :id="menuUID" 
                                        :ref="menuUID"
                                        v-on:[CustomEventTypes.appShowProgressOverlay]="applyShowAppProgress"
                                        v-on:[CustomEventTypes.appResetProject]="resetStrypeProject"
                                        class="noselect no-print col flex-grow-0"
                                    />
                                    <div class="col">
                                        <div
                                            :id="editorUID"
                                            :class="{'editor-code-div noselect print-full-height':true, 'has-frame-numbers-gutter': settingsStore.frameNumbersEnabled, ...layoutClassesForStandardVersion}"
                                            @mousedown="handleWholeEditorMouseDown"
                                        >
                                            <FrameNumbersGutter />
                                            <FrameHeader
                                                :id="getFrameHeaderUID(-10)"
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
                        <Pane :id="strypeEditorCommandsSplitPane2Id" key="2" :size="editorCommandsSplitterPane2Size" class="no-print">
                            <Commands :id="commandsContainerId" class="noselect" :ref="strypeCommandsRefId" />
                        </Pane>
                    </SplitPanes>
                </div>
            </div>
            <SimpleMsgModalDlg :dlgId="simpleMsgModalDlgId"/>
            <ModalDlg :dlgId="importDiffVersionModalDlgId" :okCustomTitle="$t('buttonLabel.continue')">
                <span>{{ $t("appMessage.loadEditorFileWrongVersion") }}</span>                
            </ModalDlg>
            <ModalDlg :dlgId="resyncToCloudDriveAtStartupModalDlgId" :elementToFocusId="resyncSaveToCloudDriveAtStartupButtonId" size="lg">
                <span style="white-space:pre-wrap" v-html="resyncToCloudDriveAtStartupDetailsMessage"></span>
                <!-- in order to allow 3 (customed) buttons, we use the slot "modal-footer-content" made available in the underlying BModal -->
                <template #modal-footer-content="{ok, cancel}">
                    <BButton variant="secondary" @click="cancel()">{{$t('buttonLabel.noContinueWithout')}}</BButton>
                    <BButton :id="resyncLoadFromCloudDriveAtStartupButtonId" variant="primary" @click="resyncToCloudDriveAtStartup(true ,ok);">{{resyncLoadFromCloudDriveAtStartupButtonLabel}}</BButton>
                    <BButton :id="resyncSaveToCloudDriveAtStartupButtonId" variant="primary" @click="resyncToCloudDriveAtStartup(false, ok);">{{resyncSaveToCloudDriveAtStartupButtonLabel}}</BButton>
                </template>
            </ModalDlg>
            <MediaPreviewPopup ref="mediaPreviewPopup" />
            <EditImageDlg dlgId="editImageDlg" ref="editImageDlg" :imgToEdit="imgToEditInDialog" :showImgPreview="showImgPreview" :showReRecordButton="editImageDlgShowReRecord" />
            <EditSoundDlg dlgId="editSoundDlg" ref="editSoundDlg" :soundToEdit="soundToEditInDialog" :showReRecordButton="editSoundDlgShowReRecord" />
            <RecordImageDlg ref="recordImageDlg" />
            <RecordSoundDlg ref="recordSoundDlg" />
            <ColourPickerDlg ref="colourPickerDlg" :initialColour="colourPickerInitialColour" />
            <canvas v-show="appStore.isDraggingFrame" :id="getCompanionDndCanvasId" class="companion-canvas-dnd"/>
            <ModalDlg :dlgId="confirmNewProjectModalDlgId" :okCustomTitle="$t('buttonLabel.continue')">
                <span style="white-space:pre-wrap" v-html="$t('appMessage.newProjectConfirmation')"></span>
            </ModalDlg>
        </div>
    </BApp>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import { defineComponent, watch } from "vue";
import { useI18n } from "vue-i18n";
import { BApp } from "bootstrap-vue-next";
import MessageBanner from "@/components/MessageBanner.vue";
import FrameContainer from "@/components/FrameContainer.vue";
import FrameNumbersGutter from "@/components/FrameNumbersGutter.vue";
import Commands from "@/components/Commands.vue";
import Menu from "@/components/Menu.vue";
import ModalDlg from "@/components/ModalDlg.vue";
import SimpleMsgModalDlg from "@/components/SimpleMsgModalDlg.vue";
import {Splitpanes, Pane} from "splitpanes";
import { useStore, settingsStore, getEditorTabId } from "@/store/store";
import { AppEvent, ProjectSaveFunction, BaseSlot, CaretPosition, FrameObject, FrozenState, MediaSlot, MessageTypes, ModifierKeyCode, Position, PythonExecRunningState, SaveRequestReason, SlotCursorInfos, SlotsStructure, SlotType, StringSlot, StrypeSyncTarget, StrypePEALayoutMode, defaultEmptyStrypeLayoutDividerSettings, EditImageInDialogFunction, EditSoundInDialogFunction, RecordNewImageInDialogFunction, RecordNewSoundInDialogFunction, OpenColourPickerInDialogFunction, areSlotCoreInfosEqual, SlotCoreInfos, ProjectDocumentationDefinition, CollapsedState, LoadRequestReason, StateAppObject, MessageDefinitions, FormattedMessage, FormattedMessageArgKeyValuePlaceholders } from "@/types/types";
import { CloudDriveAPIState, isSyncTargetCloudDrive } from "@/types/cloud-drive-types";
import { getFrameContainerUID, getMenuLeftPaneUID, getEditorMiddleUID, getCommandsRightPaneContainerId, isElementLabelSlotInput, CustomEventTypes, getFrameUID, parseLabelSlotUID, getLabelSlotUID, getFrameLabelSlotsStructureUID, getFocusedEditableSlotTextSelectionStartEnd, getSelectionCursorsComparisonValue, bumpCaretRequestSeq, getCaretRequestSeq, setDocumentSelection, getSameLevelAncestorIndex, autoSaveFreqMins, getImportDiffVersionModalDlgId, getAppSimpleMsgDlgId, getActiveContextMenu, actOnGraphicsImport, setPythonExecutionAreaTabsContentMaxHeight, setManuallyResizedEditorHeightFlag, setPythonExecAreaLayoutButtonPos, getStrypeCommandComponentRefId, frameContextMenuShortcuts, getCompanionDndCanvasId, addDuplicateActionOnFramesDnD, removeDuplicateActionOnFramesDnD, sharedStrypeProjectTargetKey, sharedStrypeProjectIdKey, getCaretContainerUID, isCaretContainerFocusInputElement, getEditorID, getLoadProjectLinkId, AutoSaveKeyNames, getFrameHeaderUID, closeRenameIdentifierPopups, newStrypeProject } from "./helpers/editor";
import { AllFrameTypesIdentifier} from "@/types/types";
// #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
import { debounceComputeAddFrameCommandContainerSize, getPEATabContentContainerDivId, getPEAComponentRefId } from "@/helpers/editor";
// #v-else
import { getAPIItemTextualDescriptions } from "./helpers/microbitAPIDiscovery";
import { DAPWrapper } from "./helpers/partial-flashing";
// #v-endif
import { mapStores } from "pinia";
import {getAdjacentColourSlotInfos, getFlatNeighbourFieldSlotInfos, getSlotIdFromParentIdAndIndexSplit, getSlotParentIdAndIndexSplit, retrieveParentSlotFromSlotInfos, retrieveSlotFromSlotInfos, getFrameBelowCaretPosition, checkCodeErrors, calculateNextCollapseState, showIndexDBError} from "./helpers/storeMethods";
import { cloneDeep } from "lodash";
import {pasteMixedPython} from "@/helpers/pythonToFrames";
import MediaPreviewPopup from "@/components/MediaPreviewPopup.vue";
import EditImageDlg from "@/components/EditImageDlg.vue";
import EditSoundDlg from "@/components/EditSoundDlg.vue";
import RecordImageDlg from "@/components/RecordImageDlg.vue";
import RecordSoundDlg from "@/components/RecordSoundDlg.vue";
import ColourPickerDlg from "@/components/ColourPickerDlg.vue";
import axios from "axios";
import scssVars from "@/assets/style/_export.module.scss";
import {loadDivider, loadPinnedLocalFiles} from "@/helpers/load-save";
import FrameHeader from "@/components/FrameHeader.vue";
import { eventBus, projectDocumentationFrameId } from "@/helpers/appContext";
import {inflateRaw} from "pako";
import { Base64 } from "js-base64";
import { BvTriggerableEvent } from "bootstrap-vue-next";
import { vueComponentsAPIHandler } from "@/helpers/vueComponentAPI";
import { loadSessionState, saveSessionState, emergencySaveSessionState, checkForRecentSaveStates } from "@/store/store-db-storage";
import initialStates from "@/store/initial-states";

let autoSaveTimerId = -1;
let projectSaveFunctionsState : ProjectSaveFunction[] = [];

const RELOAD_KEY = "sw-reload-attempted";

//////////////////////
//     Component    //
//////////////////////
export default defineComponent({
    name: "App",

    setup() {
        watch(
            // Watch the changes of frame cursor (cannot use "currentFrame" here as it's an object and we wouldn't see a difference)
            () => [useStore().currentFrame.caretPosition, useStore().currentFrame.id],
            ([newCaretPosVal, newIdVal], [oldCaretPosVal, oldIdVal]) => {
                // When a change is detected, we check if we should close the rename identifiers popup:
                // changing the frame cursor: until a timeout hasn't passed, we keep the popup opened - otherwise we reset the timestamp in the store and close the popup
                // changing the editor content: always discard the popup
                const isChangeOfCaret = (newCaretPosVal != oldCaretPosVal || newIdVal != oldIdVal);
                if(useStore().renameIdentifierPopupShownTimestamp > 0 && isChangeOfCaret
                    && Date.now() - useStore().renameIdentifierPopupShownTimestamp > 5*1000){
                    closeRenameIdentifierPopups();                  
                }
            }
        );

        // We use the Composition API style for i18n
        const { availableLocales } = useI18n();
        return { availableLocales };
    },
    
    components: {
        BApp,
        FrameHeader,
        MessageBanner,
        FrameContainer,
        FrameNumbersGutter,
        Commands,
        EditImageDlg,
        EditSoundDlg,
        RecordImageDlg,
        RecordSoundDlg,
        ColourPickerDlg,
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
            // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
            isExpandedPythonExecArea: false,
            // #v-endif
            imgToEditInDialog: "",
            soundToEditInDialog: null as AudioBuffer | null,
            showImgPreview: (() => {}) as (dataURL: string) => void,
            editImageDlgShowReRecord: false,
            editSoundDlgShowReRecord: false,
            // Guards against a second Ctrl-Shift-I/U re-entering the record flow while one is
            // already in progress, which would otherwise register a second competing
            // strypeModalHidden listener chain:
            isRecordingMediaFlowActive: false,
            colourPickerInitialColour: null as string | null,
        };
    },

    computed: {       
        ...mapStores(useStore, settingsStore),

        editorId(): string {
            return getEditorID();
        },

        layoutClassesForStandardVersion(){
            let classes = {};
            // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
            classes = {"full-height-editor-code-div":!this.isExpandedPythonExecArea, [scssVars.croppedEditorDivClassName]: this.isExpandedPythonExecArea};            
            // #v-endif
            return classes;
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

        // Exposed for tests: whether a debounced funccall->keyword-frame/varassign conversion is
        // currently pending (see LabelSlotsStructure.vue's cancelPendingConversion()).
        pendingSlotConversion() : string {
            return (this.appStore.pendingSlotConversionCount > 0) ? "true" : "false";
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

        strypeEditorCommandsSplitPane2Id(): string {
            return "strypeEditorCommandsSplitPane2";
        },

        overlayExpandedPEASplitterPane2Id(): string {
            return "overlayExpandedPEASplitterPane2";
        },

        editorCommandsSplitterPane2Size: {
            get(): number {
                let value = (this.appStore.editorCommandsSplitterPane2Size != undefined && this.appStore.editorCommandsSplitterPane2Size[StrypePEALayoutMode.tabsCollapsed] != undefined) 
                    ? this.appStore.editorCommandsSplitterPane2Size[StrypePEALayoutMode.tabsCollapsed] 
                    : parseFloat(scssVars.editorCommandsSplitterPane2SizePercentValue);
                // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
                value = (this.appStore.peaLayoutMode != undefined && this.appStore.editorCommandsSplitterPane2Size != undefined && this.appStore.editorCommandsSplitterPane2Size[this.appStore.peaLayoutMode] != undefined) 
                    ? this.appStore.editorCommandsSplitterPane2Size[this.appStore.peaLayoutMode] as number
                    // When there is no set value for a given layout mode,
                    // we check that any change in another layout has ever been made: if yes we just keep the divider as it is, if not, we use the default value.
                    : ((this.appStore.editorCommandsSplitterPane2Size != undefined)
                        ? parseFloat((document.getElementById(this.strypeEditorCommandsSplitPane2Id) as HTMLDivElement).style.width.replace("%",""))
                        : parseFloat(scssVars.editorCommandsSplitterPane2SizePercentValue));
                // #v-endif
                return value;
                
            },
            set(value: number) {
                this.onStrypeCommandsSplitPaneResize({panes: [{}, {size: value}]});
            },
        },

        commandsContainerId(): string {
            return getCommandsRightPaneContainerId();
        },

        localStorageAutosaveEditorKey(): string {
            let storageString = AutoSaveKeyNames.pythonEditorState;
            // #v-ifdef STRYPE_PLATFORM == VITE_MICROBIT_MODE
            storageString = AutoSaveKeyNames.mbEditor;
            // #v-endif
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
            return this.$t("appMessage.resyncToCloudDriveAtStartup", {drivename: this.cloudDriveName});
        },

        resyncSaveToCloudDriveAtStartupButtonId(): string {
            return "resyncSaveToCloudAtStartupButton";
        },

        resyncLoadFromCloudDriveAtStartupButtonId(): string {
            return "resyncLoadFromCloudAtStartupButton";
        },

        resyncLoadFromCloudDriveAtStartupButtonLabel(): string {
            return this.$t("buttonLabel.loadFromCloudDrive", {drivename: this.cloudDriveName});
        },

        resyncSaveToCloudDriveAtStartupButtonLabel(): string {
            return this.$t("buttonLabel.saveToCloudDrive", {drivename: this.cloudDriveName});
        },

        confirmNewProjectModalDlgId(): string {
            return "confirmNewProjectModalDlg";
        },

        isPythonExecuting(): boolean {
            return (this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning;
        },
        
        // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
        expandedPEAOverlaySplitterPane2Size: {
            get(): number {
                const value = (this.appStore.peaExpandedSplitterPane2Size != undefined && this.appStore.peaLayoutMode != undefined && this.appStore.peaExpandedSplitterPane2Size[this.appStore.peaLayoutMode] != undefined)
                    ? this.appStore.peaExpandedSplitterPane2Size[this.appStore.peaLayoutMode] as number
                    // When there is no set value for a given layout mode,
                    // whe check that any change in another layout has ever been made: if yes we just keep the divider as it is, if not, we use the default value.
                    : ((this.appStore.peaExpandedSplitterPane2Size != undefined)
                        ? parseFloat((document.getElementById(this.overlayExpandedPEASplitterPane2Id) as HTMLElement).style.height.replace("%",""))
                        :  parseFloat(scssVars.peaExpandedOverlaySplitterPane2SizePercentValue));
                // The PEA needs to react to the change of value when we are in an expanded mode
                if(this.appStore.peaLayoutMode == StrypePEALayoutMode.tabsExpanded || this.appStore.peaLayoutMode == StrypePEALayoutMode.splitExpanded){
                    this.$nextTick(() => this.onExpandedPythonExecAreaSplitPaneResize({panes: [{}, {size: value}]}));
                }
                return value;
            },
            set(value: number) {
                this.onExpandedPythonExecAreaSplitPaneResize({panes: [{}, {size: value}]});                    
            },
        },

        peaOverlayPane2MinSize(): number {
            return 10;
        },

        peaOverlayPane2MaxSize(): number {
            return 95;
        },
        // #v-endif

        getCompanionDndCanvasId(): string {
            return getCompanionDndCanvasId();
        },
    },

    created() {
        // The very first action we want to do is trying to restore the Strype settings:
        // Strype locale:
        this.setStrypeLocale();

        projectSaveFunctionsState[0] = {syncTarget: StrypeSyncTarget.ws, function: (reason: SaveRequestReason) => this.autoSaveStateToWebLocalStorage(reason)};
        window.addEventListener("visibilitychange", this.visibilityHandler);
        window.addEventListener("beforeunload", this.beforeUnloadHandler);
        window.addEventListener("pagehide", () => this.autoSaveStateToWebLocalStorage(SaveRequestReason.unloadPage));

        // By means of protection against browser crashes or anything that could prevent auto-backup, we do a backup every 2 minutes
        this.setAutoSaveState();

        // Expose this component that other components might need
        // Vue 3 has deprecated direct access to components.
        // (we don't set it in setup() because we want to have this accessible, and the component created!)
        vueComponentsAPIHandler.appComponentAPI = {
            applyShowAppProgress: this.applyShowAppProgress,
            setStateFromPythonFile: this.setStateFromPythonFile,
            finaliseOpenShareProject: this.finaliseOpenShareProject,
            onExpandedPythonExecAreaSplitPaneResize: this.onExpandedPythonExecAreaSplitPaneResize,
            onStrypeCommandsSplitPaneResize: this.onStrypeCommandsSplitPaneResize,
            triggerMediaRecording: this.triggerMediaRecording,
            triggerColourPicker: this.triggerColourPicker,
        };

        // Prevent the native context menu to be shown at some places we don't want it to be shown (basically everywhere but editable slots)
        // We can't know if that is called because of a click or because of the keyboard shortcut - and it's important to know because we need to process
        // things differently based on one or the other. That's why we have a flag on the keyboard shortcut (in keydown even registration) to make the distinction.
        window.addEventListener(
            "contextmenu", (event) => this.handleContextMenu(event)
        );

        window.addEventListener("keydown", (event: KeyboardEvent) => {
            // When code is executed, we should ignore all key events internally to the editor, 
            // only the PEA graphics or console should consume the events.
            if(this.isPythonExecuting){
                event.preventDefault();
                return;
            }

            // The media editor dialogs also register an event listener which callback will be called after this one.
            // So when we detect one of the dialogs is opened, we just ignore this callback method.
            if(this.appStore.isModalDlgShown && (this.appStore.currentModalDlgId == "editImageDlg" || this.appStore.currentModalDlgId == "editSoundDlg")){
                return;
            }

            // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
            // Handle the keyboard shortcuts for the PEA console copy (when the PEA console is visible).
            if((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() == "c" && vueComponentsAPIHandler.peaComponentAPI?.getIsConsoleAreaShowing()){
                vueComponentsAPIHandler.peaComponentAPI?.copyConsoleText(new Event(CustomEventTypes.copyPEAConsoleText));
                event.preventDefault();
                event.stopImmediatePropagation();
                event.stopPropagation();
                return;            
            }
            // #v-endif

            // Close the rename identifiers popup on most keys:
            // to simplify the event registration on when we close the popup, we close it on almost all key hits except navigation keys:
            // they will be handled in watch() via the change of frame and we do allow navigation when the popup is showing.
            // We also ignore escape and ctrl+R (that's handled later), enter and # (OK to add a blank frame and comments)
            if(this.appStore.renameIdentifierPopupShownTimestamp > 0 && !["Escape", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "", "Meta", "Control"].includes(event.key) 
                && !(event.ctrlKey &&  event.key == "r")){
                closeRenameIdentifierPopups(); 
            }

            this.appStore.updateKeyModifiers(event);
            const activeContextMenu = getActiveContextMenu();
            if(activeContextMenu != null){
                // All key hits in the context menu should result in the menu closing.
                // If a keyboard shortcut of the menu has been used, we process it.
                // Note that with the Vue3 context menu, the action-name is set to the menu item wrapper, which is not a direct child of the menu.
                // (Enter is already handled when a menu item is selected, so we don't worry about it.)
                const activeModifierKeys = {[ModifierKeyCode.ctrl]: event.ctrlKey, [ModifierKeyCode.meta]: event.metaKey, [ModifierKeyCode.shift]: event.shiftKey, [ModifierKeyCode.alt]: event.altKey};
                const menuItemForKBShortcut = Array.from(activeContextMenu.querySelectorAll("[action-name]")).find((menuItemEl) => {
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
                    // We found one menu entry matching the hit keyboard shortcut, we simulate a click (which will close the menu) on the element
                    (menuItemForKBShortcut.children[0] as HTMLDivElement)?.click();
                }
                else if((!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) && event.key != "Enter"){
                    // Any other keys but those handled by the context menu already (like arrows and enter) close the menu
                    activeContextMenu.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}));
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
            // Case for allowing macOS to have a context menu shortcut. Space is deliberately not
            // included here any more: with a frame selection active, Space is now the frame-commands
            // prefix key (for wrapping the selection, e.g. Space then "i" for if) -- see the matching
            // removal of the selectedFrames.length === 0 restriction in Commands.vue's Tab/Space
            // pane-opening branch. Enter still opens the context menu as before.
            if(this.appStore.selectedFrames.length > 0 && event.key.toLowerCase() == "enter"){
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
            
            // The frame shortcuts below don't apply when typing in a text field outside the frames (e.g. in a dialog):
            // the keys must act on that text field instead. (A frame cursor's invisible paste-focus <input> doesn't count:
            // it is the focus target when at a frame cursor, see CaretContainer.vue.)
            const isTypingInTextField = (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
                && !isCaretContainerFocusInputElement(event.target.id);

            // If we are at a frame cursor and they hit ctrl-x or ctrl-c or ctrl-d or ctrl-/ then we do cut/copy/duplicate/disable[enable]:
            if(!this.appStore.isEditing && !this.isPythonExecuting && !isTypingInTextField && (event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "c" || event.key.toLowerCase() === "x" || event.key.toLowerCase() === "d" || event.key === "/")) {
                // We emit an event to be picked up by the first frame in the current selection:
                // The frames themselves decide whether to act based on whether they are the first frame in the selection:
                let customEvent = "";
                switch(event.key.toLowerCase()) {
                case "c":
                    customEvent = CustomEventTypes.copyFrameSelection;
                    break;
                case "x":
                    customEvent = CustomEventTypes.cutFrameSelection;
                    break;
                case "d":
                    customEvent = CustomEventTypes.duplicateFrameSelection;
                    break;
                case "/":
                    customEvent = CustomEventTypes.toggleFrameSelectionDisable;
                    break;
                }
                eventBus.emit(customEvent);
                event.preventDefault();
                event.stopImmediatePropagation();
                event.stopPropagation();
                return;
            }

            // The rename identifier action cannot be executed when Python is executed.
            // (This action should already discard the popup, but just to make sure...)
            // We only want to capture the rename identifier action keyboard shortcut if one popup is visible,
            // otherwise we leave the shortcut for the browser.
            const openedPopup = document.querySelector(".popover.show:has(." + scssVars.renameIdentifierPopoverClassName + "");
            if (openedPopup && !this.isPythonExecuting && event.ctrlKey && event.key ==  "r"){
                eventBus.emit(CustomEventTypes.renameIdentifier);
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return;
            }
            
            if (!this.appStore.isEditing && !this.isPythonExecuting && !isTypingInTextField && !event.ctrlKey && !event.metaKey && event.key === ".") {
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

            // Handle "escape" on error and rename identifier popovers: if an error popover is showing, escape should discard the popup.
            if(event.key == "Escape" && !this.appStore.isAppMenuOpened && !this.isPythonExecuting && !this.appStore.isDraggingFrame){
                // For error popovers:
                [...document.querySelectorAll(".popover.b-popover:has(.error-popover)")].forEach((popup) => (popup as HTMLDivElement).style.display = "none");
                // For rename identifier popover
                closeRenameIdentifierPopups();
            }
        });

        // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
        // Listen to the Python execution area size change events (as the editor needs to be resized too)
        document.addEventListener(CustomEventTypes.pythonExecAreaExpandCollapseChanged, (event) => {
            const expandedPEAValue = (event as CustomEvent<boolean>).detail;
            this.isExpandedPythonExecArea = expandedPEAValue;
            vueComponentsAPIHandler.commandsComponentAPI?.setIsExpandedPEA(expandedPEAValue);
            vueComponentsAPIHandler.commandsComponentAPI?.setLogicalORHasPEAExpanded(expandedPEAValue);
            setTimeout(() => {
                debounceComputeAddFrameCommandContainerSize((event as CustomEvent).detail);
                if((event as CustomEvent).detail){
                    this.onExpandedPythonExecAreaSplitPaneResize({panes: [{}, {size: this.expandedPEAOverlaySplitterPane2Size}]});
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
        // #v-else
        // Register an event for WebUSB to detect when the micro:bit has been disconnected. We only do that once, and if WebUSB is available...
        if (navigator.usb) {
            navigator.usb.addEventListener("disconnect", () => this.appStore.previousDAPWrapper = {} as DAPWrapper);
        }
        
        // As the application starts up, we compile the microbit library with the appropriate language setting.
        getAPIItemTextualDescriptions(true);
        // #v-endif

        // Add an event listener for text selection changes. It will be used for changes of text selection and text cursors (start/end).
        document.addEventListener("selectionchange", this.handleDocumentSelectionChange);

        // Add en event listener for the mouse up events, it will be used for detecting the end of a drag in the context of slots/text selection.
        document.addEventListener("mouseup", this.checkMouseSelection);

        // Add a listener for the mouse scroll events. We do not want to allow scrolling when the context menu is shown
        document.addEventListener("wheel", this.blockScrollOnContextMenu, {passive:false});

        // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
        // Add a listener for the whole window resize.
        window.addEventListener("resize",() => {
            // When the window is resized, the overlay expanded PEA splitter is properly updated. However, the underlying UI is not updated
            // properly (because it isn't inside that splitter) so we need to manually update things.
            if(this.isExpandedPythonExecArea) {
                this.onExpandedPythonExecAreaSplitPaneResize({panes: [{}, {size: (document.getElementById(this.overlayExpandedPEASplitterPane2Id) as HTMLElement).style.height.replace("%","")}]}, true);
            }

            // Re-scale the Turtle canvas.
            document.getElementById(getPEATabContentContainerDivId())?.dispatchEvent(new CustomEvent(CustomEventTypes.pythonExecAreaSizeChanged));
        });
        // #v-endif

        // When the page is loaded, we might load an existing code for which the caret is not visible, so we get it into view.
        setTimeout(() => {
            const htmlElementToShowId = (this.appStore.focusSlotCursorInfos) ? getLabelSlotUID(this.appStore.focusSlotCursorInfos.slotInfos) : getCaretContainerUID(this.appStore.currentFrame.caretPosition, this.appStore.currentFrame.id);
            document.getElementById(htmlElementToShowId)?.scrollIntoView({block:"nearest"});
        }, 1000);

        // Add an event listener to put the app not on top (for an element to be modal) or reset it to normal
        document.addEventListener(CustomEventTypes.requestAppNotOnTop, (event) => {
            this.setAppNotOnTop = (event as CustomEvent).detail;
        });

        // The events from Bootstrap modal are registered on the eventBus
        eventBus.on(CustomEventTypes.strypeModalHidden, this.onHideModalDlg);  
    },

    unmounted() {
        // Removes the listeners
        document.removeEventListener("selectionchange", this.handleDocumentSelectionChange);
        document.removeEventListener("mouseup", this.checkMouseSelection);
        document.removeEventListener("wheel", this.blockScrollOnContextMenu);
        eventBus.off(CustomEventTypes.strypeModalHidden, this.onHideModalDlg);  
    },

    mounted() {
        // Register the callback needed by the Settings store
        this.settingsStore.saveSettingInLocalStorageHandler = this.autoSaveStateToWebLocalStorage;

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
            const cloudTarget = parseInt(sharedProjectTarget) as StrypeSyncTarget;
            vueComponentsAPIHandler.menuComponentAPI?.setOpenSharedProjectTarget(cloudTarget);
            vueComponentsAPIHandler.menuComponentAPI?.setOpenSharedProjectId(shareProjectId);
            const afterAPILoaded = () => {
                document.getElementById(getLoadProjectLinkId())?.click();
            };
            const cloudDriveHandlerComponentAPI = vueComponentsAPIHandler.cloudDriveHandlerComponentAPI;
            // For Google API, we wait a bit as it must have been loaded first.
            const specifcDriveComponent = cloudDriveHandlerComponentAPI?.getSpecificCloudDriveComponent(cloudTarget);
            if(cloudTarget == StrypeSyncTarget.gd){                    
                cloudDriveHandlerComponentAPI?.getCloudAPIStatusWhenLoadedOrFailed(StrypeSyncTarget.gd)
                    ?.then((gapiState) =>{
                        // Only open the project is the GAPI is loaded, and show a message of error if it hasn't.
                        if(gapiState == CloudDriveAPIState.LOADED){
                            afterAPILoaded();
                        }
                        else{
                            this.finaliseOpenShareProject({key: "errorMessage.retrievedSharedGenericProject", param: this.$t("errorMessage.cloudAPIFailed",{apiname: specifcDriveComponent?.driveAPIName})});
                        }
                    });
            }
            else {
                // We don't use a client OneDrive API so we can request the file right away.
                afterAPILoaded();
            }            
        }        
        // Generic opening
        else if(shareProjectId && shareProjectId.match(/^https?:\/\/.*$/g) != null){
            // The "fall out" case of a generic share: we don't care about the source target, it is only a URL to get to and retrive the Strype file.
            // We just do a small sanity check that it is a HTTP(S) link.
            // IMPORTANT: it is custom to the source to expose the file as such or not. So the generic share does NOT guarantee we can get the Strype file.
            
            const googleDrivePublicURLPreamble = "https://drive.google.com/file/d/";
            const isPublicShareFromGD = shareProjectId.startsWith(googleDrivePublicURLPreamble);
            // OneDrive public links are on 1drv.ms or onedrive.live.com for personal accounts, and on <tenant>-my.sharepoint.com for work/school accounts.
            let sharedURLHost = "";
            try {
                sharedURLHost = new URL(shareProjectId).hostname.toLowerCase();
            }
            catch {
                // Malformed URL: it isn't a OneDrive link (and retrieving it will fail and be reported below)
            }
            const isPublicShareFromOD = ["1drv.ms", "onedrive.live.com"].includes(sharedURLHost) || sharedURLHost.endsWith("-my.sharepoint.com");
            let alertMsgKey = "";
            let alertParams = "";
            if(isPublicShareFromGD){
                // Google Drive will not expose the file directly, so we can *try* to extract the file ID and then get the data with the API (without authentication).
                // Extract the file ID and attempt a retrieving of the file with the Google Drive API (it waits a bit for the API to be loaded)
                const sharedFileID = shareProjectId.substring(googleDrivePublicURLPreamble.length).match(/^([^/]+)\/.*$/)?.[1];
                vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.getPublicSharedProjectContent(StrypeSyncTarget.gd, sharedFileID??"");
            }
            else{
                // Show a progress indication on the editor
                vueComponentsAPIHandler.appComponentAPI?.applyShowAppProgress({requestAttention: true, message: this.$t("appMessage.loadEditorFile")});
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
                                this.setStateFromPythonFile(resp.data, filename, 0, false, "import")
                            ).then(() => {
                                // A generic project is saved in memory, so we must make sure there is no target destination saved.
                                vueComponentsAPIHandler.menuComponentAPI?.saveTargetChoice(StrypeSyncTarget.none);

                                // And we make sure we show the project is unmodified
                                this.appStore.isEditorContentModified = false;
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
                        alertParams = error?.message??error.toString();
                        // OneDrive public links lead to a OneDrive page rather than the file itself, so we can't retrieve the file:
                        // we open that page for the user to download the project from there.
                        if(isPublicShareFromOD){
                            alertParams += `<br/><br/><b>${this.$t("appMessage.publicSharedProjectUserDownloadAttempt")}`;
                            setTimeout(() => {
                                window.open(shareProjectId, "_blank");
                            }, 3000);
                        }
                    })
                    .finally(() => {
                        // Make sure the progress indication on the editor is removed.
                        vueComponentsAPIHandler.appComponentAPI?.applyShowAppProgress({requestAttention: false});
                        this.finaliseOpenShareProject((alertMsgKey) ? {key: alertMsgKey, param: alertParams} : undefined);
                    });
            }
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

                this.setStateFromPythonFile(spyContent, this.$t("defaultProjName"), 0, false, "import").catch(() => { /* error message already shown by pasteMixedPython() */ });
                // We want to clear the query parameters of the URL:
                this.finaliseOpenShareProject();
            }
        }
        else{
            // The default opening of Strype (either brand new project or retrieving from local storage -- not opening a shared project)
            this.loadLocalStorageProjectOnStart(queryParams.get(newStrypeProject) != null);
        }

        // Register a listener to handle the context menu hovers (cf onContextMenuHover())
        eventBus.on(CustomEventTypes.contextMenuHovered, (menuElement: HTMLElement) => this.onContextMenuHover(menuElement));

        eventBus.on(CustomEventTypes.addFunctionToEditorProjectSave, (psf: ProjectSaveFunction) => {
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

        eventBus.on(CustomEventTypes.removeFunctionToEditorProjectSave, (psfSyncTarget: StrypeSyncTarget) => {
            const toDeleteIndex = projectSaveFunctionsState.findIndex((psf) => psf.syncTarget == psfSyncTarget);
            if(toDeleteIndex > -1){
                window.clearInterval(autoSaveTimerId);
                projectSaveFunctionsState.splice(toDeleteIndex, 1);
                this.setAutoSaveState();
            }            
        });

        // Listen to event for requesting the project save now
        eventBus.on(CustomEventTypes.requestEditorProjectSaveNow, (saveReason: SaveRequestReason) => {
            // The usual behaviour is to trigger the saving functions for localStorage + any potential target (FS or GD).
            // However, if we are in a situation of requesting a save to open a new project, AND the project wasn't coming
            // from any source (FS or GD) we need to let the user perform a standard save.
            if(saveReason == SaveRequestReason.loadProject && this.appStore.syncTarget == StrypeSyncTarget.none){
                vueComponentsAPIHandler.menuComponentAPI?.handleSaveMenuClick(undefined, saveReason);
            }
            else {
                projectSaveFunctionsState.forEach((psf) => psf.function(saveReason));
            }
        });

        // Listen for a request to back up the current project to the webstorage/IndexedDB backup
        // ONLY (never the real FS/cloud target), before it's about to be discarded in favour of a
        // different project (e.g. "Discard changes" on the load/demo/book dialogs). Deliberately
        // does not go via requestEditorProjectSaveNow: that event either shows an interactive save
        // dialog (if unsynced) or silently re-saves to the real external target (if synced) --
        // both wrong here, since discarding is supposed to skip any save prompt or side effect
        // other than keeping our own internal recovery copy. Reason loadProject marks the backup
        // stillAlive="false", i.e. immediately recoverable via the banner/Open Recent menu, same
        // as if the tab had been closed:
        eventBus.on(CustomEventTypes.backupEditorProjectBeforeDiscard, (payload?: {projectNameOverride?: string}) => {
            this.autoSaveStateToWebLocalStorage(SaveRequestReason.loadProject, true, payload?.projectNameOverride);
        });

        // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
        // This case may not happen, but if we had a Strype version that contains a default initial state working with Turtle,
        // the UI should reflect it (showing the Turtle tab) so we look for Turtle in any case.
        actOnGraphicsImport();
        // #v-endif
    },

    methods: {
        getFrameHeaderUID,
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
        
        autoSaveStateToWebLocalStorage(reason: SaveRequestReason, suppressLoadDoneEvent = false, projectNameOverride?: string) : void {
            // save the project to the localStorage (WebStorage)
            if (!this.appStore.debugging && typeof(Storage) !== "undefined") {
                if(reason == SaveRequestReason.saveSettings){
                    // Save the settings
                    localStorage.setItem(AutoSaveKeyNames.settingsState, JSON.stringify(this.settingsStore.$state));
                }
                else{
                    const stateJSONStrWithCheckpoint = this.appStore.generateStateJSONStrWithCheckpoint(true);
                    // projectNameOverride lets a discard-backup be labelled distinctly from the project's
                    // real name (e.g. "My project (local edits)"), so it doesn't get confused in the
                    // recent-states banner/Open Recent menu with the official copy of the same project:
                    const projectNameForSave = projectNameOverride ?? this.appStore.projectName;
                    if (reason !== SaveRequestReason.unloadPage && reason !== SaveRequestReason.reloadBrowser) {
                        // We have time, so we save normally (which is async):
                        saveSessionState(getEditorTabId(), projectNameForSave, stateJSONStrWithCheckpoint, reason == SaveRequestReason.loadProject ? "false" : "maybe", this.appStore.isEditorContentModified, this.appStore.editorLastModificationAt)
                            .catch(showIndexDBError);
                    }
                    else {
                        // Async might get killed during the closing process so we save to local storage as an alternative:
                        emergencySaveSessionState(getEditorTabId(), projectNameForSave, stateJSONStrWithCheckpoint, this.appStore.editorLastModificationAt, this.appStore.isEditorContentModified);
                    }
                    
                    // If that's the only element of the auto save functions, then we can notify we're done when we save for loading
                    // (suppressLoadDoneEvent is used when we're only taking an internal backup before a discard, not actually
                    // proceeding to load anything as a result of this particular save -- the caller handles that itself):
                    if(reason==SaveRequestReason.loadProject && projectSaveFunctionsState.length == 1 && !suppressLoadDoneEvent){
                        eventBus.emit(CustomEventTypes.saveStrypeProjectDoneForLoad);
                    }
                }
            }
        },

        visibilityHandler() {
            if (document.visibilityState !== "hidden") {
                // Only interested in when we're being hidden (incl. closed), ignore other changess:
                return;
            }
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

            // Save the state when we get hidden (the emergency save is done in pagehide, not visibilitychange):
            this.autoSaveStateToWebLocalStorage(SaveRequestReason.autosave);            

            // We clear the session storage as well. This is notably used to clear MSAL authentication data (when using OneDrive).
            // With the exception of the Tab ID and optional reload key which we explicitly retain:
            const tabId = getEditorTabId();
            const reloadValue = sessionStorage.getItem(RELOAD_KEY);
            sessionStorage.clear();
            sessionStorage.setItem(AutoSaveKeyNames.strypeEditorTabId, tabId);
            if (reloadValue) {
                sessionStorage.setItem(RELOAD_KEY, reloadValue);
            }
        },
        
        beforeUnloadHandler(event: BeforeUnloadEvent) {
            if (this.appStore.isEditorContentModified) {
                event.preventDefault();
                event.returnValue = "";
            }
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
                if(savedSettingsState.frameNumbersEnabled) {
                    this.settingsStore.setFrameNumbersEnabled(savedSettingsState.frameNumbersEnabled);
                }
                // (only a cloud target can be promoted: if the saved value isn't one, we keep the default)
                if(savedSettingsState.promotedCloudTarget !== undefined && isSyncTargetCloudDrive(savedSettingsState.promotedCloudTarget)) {
                    this.settingsStore.promotedCloudTarget = savedSettingsState.promotedCloudTarget;
                }
                if(!savedSettingsState.locale) {
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
                if(languageCode != "en" && this.availableLocales.includes(languageCode)) {
                    strypeSessionLocale = languageCode;
                }
            }

            // Now update the UI
            this.settingsStore.setAppLang(strypeSessionLocale);
        },

        checkLocalStorageHasProject(): Promise<string> {
            // Check if a local storage project exists.
            // The promise returns the local storage content on fulfillment.
            return loadSessionState(getEditorTabId()).catch((err) => {
                showIndexDBError(err);
                return null;
            }).then((value) => {
                if (value === null) {
                    throw new Error("Stored session state not found");
                }
                return value;
            });
        },

        onAppMouseDownCapture(event: MouseEvent){
            // If a mousedown is performed on the application when a rename popup is displayed (but *on* not the popup itself), we close that popup.
            // (we work on the CAPTURE phase, not the bubble phase as some other element may consume the mousedown event before the parent gets it.)
            if(this.appStore.renameIdentifierPopupShownTimestamp > 0){
                const openedPopup = document.querySelector(".popover.show:has(." + scssVars.renameIdentifierPopoverClassName + "");
                if(event.target == null || !openedPopup?.contains(event.target as Node)){
                    closeRenameIdentifierPopups();
                }
            }
        },

        onHideModalDlg(event: BvTriggerableEvent) {
            const dlgId = event.componentId;
            if(dlgId == this.confirmNewProjectModalDlgId){
                if(event.trigger == "ok"){
                    // If the user confirmed: delete the WebStorage key that refers to the current tab, so that when they reload
                    // it will be a fresh tab (but the old state is actually retained if they want to get back to it)
                    if (typeof(Storage) !== "undefined") {
                        sessionStorage.removeItem(AutoSaveKeyNames.strypeEditorTabId);
                    }
                    // We need to stop the browser from showing a "Leave page" dialog for this
                    // deliberate reload. We do that by removing the beforeunload listener directly,
                    // rather than clearing isEditorContentModified -- that flag also feeds
                    // modifiedSinceExternalSave in the close-time save a moment from now, so forcing
                    // it false here would wrongly mark the discarded project as already saved
                    // externally, hiding it from the recent-states banner/Open Recent menu even
                    // though (per the comment above) it's meant to still be retrievable.
                    window.removeEventListener("beforeunload", this.beforeUnloadHandler);
                    // ... and reload the page to reload the Strype default project (removing potential query parameters)
                    window.location.href = window.location.pathname + "?" + newStrypeProject;
                }
                else{
                    // If the user declined: restore the autosave timer and the registration to the "beforeunload" event
                    window.addEventListener("visibilitychange", this.visibilityHandler);
                    this.setAutoSaveState();
                }
            }
        },

        loadLocalStorageProjectOnStart(forceNewProject: boolean) {
            // Just to make sure when reaching this path from a cancelled shared project load,
            // we remove the query parameters in the URL (it won't change if we came in normal case so no problem)
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // Check the local storage (WebStorage) to see if there is a saved project from the previous time the user entered the system
            // if browser supports localstorage. However if forcing new project, fail this fetch immediately:
            (forceNewProject ? Promise.reject(): this.checkLocalStorageHasProject()).then((savedState) => {
                this.appStore.setStateFromJSONStr( 
                    {
                        stateJSONStr: savedState,
                        showMessage: false,
                        readCompressed: true,
                    }
                ).then(async () => {
                    // When a file had been reloaded and it was previously synced with a Cloud Drive, we want to ask the user
                    // about reloading the project from that Cloud Drive again (only if we were not attempting to open a shared project via the URL)
                    if(this.appStore.currentCloudSaveFileId) {
                        // We need to have the specific Cloud Drive component loaded for getting its name,so we do that now...
                        const cloudHandlerComponentAPI = vueComponentsAPIHandler.cloudDriveHandlerComponentAPI;
                        // This makes sure we had set things properly when getting the Drive name below)
                        cloudHandlerComponentAPI?.getSpecificCloudDriveComponent(this.appStore.syncTarget);
                        this.cloudDriveName = cloudHandlerComponentAPI?.getDriveName()??"";

                        // Register a "temporary" cancel action listener. For OK, actions are handled explicitly in this.resyncToCloudDriveAtStartup()
                        const resetCloudDriveSyncTargetFunction = (event: BvTriggerableEvent) => {
                            const dlgId = event.componentId;
                            if(dlgId == this.resyncToCloudDriveAtStartupModalDlgId){
                                if(event.trigger == "cancel"){
                                    // We make sure we do not keep a wrong sync target!
                                    vueComponentsAPIHandler.menuComponentAPI?.saveTargetChoice(StrypeSyncTarget.none);
                                    eventBus.off(CustomEventTypes.strypeModalHidden, resetCloudDriveSyncTargetFunction); 
                                }                               
                            }
                        };
                        eventBus.on(CustomEventTypes.strypeModalHidden, resetCloudDriveSyncTargetFunction);   
                        eventBus.emit(CustomEventTypes.showStrypeModal, this.resyncToCloudDriveAtStartupModalDlgId);
                    }
                    // When a file has been reloaded and it was previously saved the File System, we want to clear off any references to that file
                    else if(this.appStore.syncTarget == StrypeSyncTarget.fs){
                        vueComponentsAPIHandler.menuComponentAPI?.saveTargetChoice(StrypeSyncTarget.none);
                    }

                    void this.reloadForServiceWorkerIfNeeded();

                }, () => {});
            }, async () => {
                // No local storage; load fresh:
                let state : StateAppObject;
                // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
                state = initialStates["initialPythonState"];
                // #v-else
                state = initialStates["initialMicrobitState"];
                // #v-endif

                this.appStore.nextAvailableId = state.nextAvailableId;
                this.appStore.frameObjects = cloneDeep(state.initialState);
                               
                // Could be because of a hard refresh, in which case we need to soft refresh to get service worker going:
                await this.reloadForServiceWorkerIfNeeded();
                
                if (forceNewProject) {
                    return;
                }

                // Check if there is old state which could be loaded (we don't need to await this):
                void checkForRecentSaveStates(settingsStore().locale ?? "en", "banner").then((saveStates) => {
                    if (saveStates.length > 0) {
                        const msg = cloneDeep(MessageDefinitions.FoundRecentUnsavedState);
                        const msgObj = msg.message as FormattedMessage;
                        msgObj.args[FormattedMessageArgKeyValuePlaceholders.when.key] = msgObj.args[FormattedMessageArgKeyValuePlaceholders.when.key].replace(FormattedMessageArgKeyValuePlaceholders.when.placeholderName, saveStates[0].when);
                        this.appStore.foundRecentState = {data: saveStates[0].data, tabId: saveStates[0].tabId};
                        this.appStore.showMessage(msg, null);
                    }
                });
            });
        },

        async reloadForServiceWorkerIfNeeded() {

            // If the user does a hard reload (Ctrl/Cmd-Shift-R on most browsers) then according to
            // browser security policy, the service worker will not take control of the page because
            // it's trying to give a "fresh" version of the page.  But for us that means if the user
            // does a hard reload of the page, Pyodide communication won't work when they hit Run!
            // The solution is a bit horrible; in this case we need to perform an additional "soft"
            // reload of the page to get the service worker to take control again.  To avoid getting
            // stuck in a reload loop if there is a constant service worker failure (for some other
            // reason?) we use an item in the session storage to not do it repeatedly if we refreshed
            // recently.

            await navigator.serviceWorker.ready;

            // If the service worker hasn't taken control of us yet, controller will be null (but
            // ready just above will still succeed).  There is an awkward race between "ready" and
            // the worker actually calling clients.claim(), so we wait for a controllerchange event
            // before concluding the worker is truly absent.  A hard-reload bypass will never fire
            // that event, so the timeout acts as our give-up signal:
            if (!navigator.serviceWorker.controller) {
                const tookControl = await new Promise((resolve) => {
                    const timeout = setTimeout(() => resolve(false), 1000);

                    navigator.serviceWorker.addEventListener(
                        "controllerchange",
                        () => {
                            clearTimeout(timeout);
                            resolve(true);
                        },
                        { once: true }
                    );

                    // Send a claim request to the SW via the registration,
                    // since we have no controller yet we must use the active worker directly.
                    // This seems necessary on Firefox in some cases:
                    navigator.serviceWorker.ready.then((reg) => {
                        reg.active?.postMessage("claim");
                    });
                });

                if (tookControl || navigator.serviceWorker.controller) {
                    // Resolved the race legitimately — no reload needed:
                    sessionStorage.removeItem(RELOAD_KEY);
                    return;
                }
                console.error("No service worker controller; considering reloading");

                const reloadTime = sessionStorage.getItem(RELOAD_KEY);
                // Don't reload again if we did this soft-reload in the last 30 seconds:
                const reloadRecently = reloadTime && (Date.now() - parseInt(reloadTime)) < 30000;

                if (reloadRecently) {
                    console.error("Service worker unavailable even after reload attempt");
                    return;
                }

                sessionStorage.setItem(RELOAD_KEY, Date.now().toString());
                // Vue/Vite's dev mode intercepts the reload, so we have to circumvent that in dev mode:
                if (import.meta.env.DEV) {
                    window.location.replace(window.location.href);
                }
                else {
                    window.location.reload();
                }
                // Block forever to avoid anything else happening — we're about to reload anyway
                await new Promise(() => {});
            }
            sessionStorage.removeItem(RELOAD_KEY);
        },

        resyncToCloudDriveAtStartup(isLoadingRequested: boolean, dialogOK: VoidFunction){
            // First validate the OK action of the modal:
            dialogOK();
            
            if(isLoadingRequested){          
                // Request load, the signin will be handled there.         
                vueComponentsAPIHandler?.cloudDriveHandlerComponentAPI?.loadFile(this.appStore.syncTarget, LoadRequestReason.reloadBrowser);
            }
            else {
                // Initiate a connection to the Cloud Drive (for updating the Cloud Drive with local changes)
                vueComponentsAPIHandler?.cloudDriveHandlerComponentAPI?.setGenericSignInCallBack(this.appStore.syncTarget, () => vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.saveFile(this.appStore.syncTarget, SaveRequestReason.reloadBrowser));
                vueComponentsAPIHandler?.cloudDriveHandlerComponentAPI?.signInFn();
            }         
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
            window.removeEventListener("visibilitychange", this.visibilityHandler);
            // 3) 2 situations: Strype knows we are in a saved state* --> just do like if we confirmed the project update (see below)
            //                  otherwise --> show the modal dialog for user confirmation
            const isSavedProject = this.appStore.syncTarget != StrypeSyncTarget.none && !this.appStore.isEditorContentModified;
            if(isSavedProject){
                // (*) project is saved (to the cloud or FS) without modifications
                this.onHideModalDlg({trigger: "ok", componentId: this.confirmNewProjectModalDlgId } as BvTriggerableEvent);
            }
            else {
                eventBus.emit(CustomEventTypes.showStrypeModal, this.confirmNewProjectModalDlgId);
            }            
        },

        finaliseOpenShareProject(message?: {key: string, param: string}) {
            // Show a message to the user that the project has (not) been loaded, if requested
            if(message){
                this.appStore.simpleModalDlgMsg = this.$t(message.key, {param1: message.param});
                eventBus.emit(CustomEventTypes.showStrypeModal, getAppSimpleMsgDlgId());
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
            vueComponentsAPIHandler.menuComponentAPI?.toggleMenuOnOff(null);
        },

        handleDocumentSelectionChange(){
            // When the selection has changed, we update the cursor infos in the store.
            const docSelection = document.getSelection();
            if(docSelection){
                // Focusing a frame cursor's invisible paste-focus <input> (see CaretContainer.vue,
                // focusCaretContainerInput() in editor.ts) makes Chromium/Firefox asynchronously manufacture
                // a phantom, zero-length Selection collapsed on the caret container div -- a browser quirk
                // when giving focus to a form control nested in an otherwise non-editable div. It fires here
                // as its own selectionchange event *after* focusCaretContainerInput() has already cleared
                // the selection once, so it must be discarded again, here, rather than mistaken for the user
                // having selected text in a slot (which would otherwise show a phantom text cursor alongside
                // the very real frame cursor).
                const activeElement = document.activeElement as HTMLElement | null;
                if(activeElement && isCaretContainerFocusInputElement(activeElement.id)){
                    docSelection.removeAllRanges();
                    return;
                }
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
                            const frameComponentId = (areFramesSelected) ? this.appStore.selectedFrames[0] : this.appStore.currentFrame.id;
                            if(areFramesSelected){
                                vueComponentsAPIHandler.frameComponentAPI?.forInstance[frameComponentId].handleClick(event, menuPosition);
                            }
                            else{
                                // When there is no selection, the menu to open is for the current caret, which can either be inside a frame's body or under a frame
                                vueComponentsAPIHandler.caretContainerComponentAPI?.forInstance[getCaretContainerUID(this.appStore.currentFrame.caretPosition, this.appStore.currentFrame.id)].handleClick(event, menuPosition);
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
            // For the editor, we need to get the whole editor container, not the space in the middle that is adapted to the viewport
            const editorElement = document.getElementById(getEditorMiddleUID());
            const positionToReturn: Position = {};
            if(firstSelectedTargetElement && lastSelectedTargetElement && editorElement){
                if(firstSelectedTargetElement.getBoundingClientRect().top + menuHeightSpace + menuOffsetY < editorElement.getBoundingClientRect().height){
                    // The menu can be shown from the top of the selection, we just make sure we give enough visibility below the top of the frame
                    const positionOfBottomMenu = firstSelectedTargetElement.getBoundingClientRect().top + menuHeightSpace;
                    if(positionOfBottomMenu > editorElement.getBoundingClientRect().height || firstSelectedTargetElement.getBoundingClientRect().top < 0){
                        editorElement.scroll(0, firstSelectedTargetElement.getBoundingClientRect().top);
                    }
                    positionToReturn.top = firstSelectedTargetElement.getBoundingClientRect().top + menuOffsetY;                                      
                    positionToReturn.left = firstSelectedTargetElement.getBoundingClientRect().left + menuOffsetX;
                }
                else{
                    // The menu cannot be shown from the top of the selection
                    const positionOfTopMenu = lastSelectedTargetElement.getBoundingClientRect().bottom - menuHeightSpace;
                    if(positionOfTopMenu < 0 || lastSelectedTargetElement.getBoundingClientRect().bottom > editorElement.getBoundingClientRect().height){
                        editorElement.scroll(0, positionOfTopMenu);
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
            // When a context menu entry is hovered, we want to make it as it was selected via the keyboard. 
            // If we didn't, then there would be a confusion between a selected item with the keyboard, and another hovered item with the mouse.
            // Doing so guarantee that only 1 element is selected in the menu.
            // (Note that we don't need to worry about hovering out: the context menu handles that natively already.)
            // We remove the current "keyboard-focus" class if any, and set it on the currently hovered item, unless that item is a group and opened.
            const currentlyKBFocusedEntry = document.querySelector(".mx-context-menu-item.keyboard-focus");
            currentlyKBFocusedEntry?.classList.remove("keyboard-focus");
            if(!menuTarget.classList.contains("open") && !menuTarget.classList.contains("disabled")){
                menuTarget.classList.add("keyboard-focus");
            }
        },

        // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
        onExpandedPythonExecAreaSplitPaneResize(event: any, calledForResize?: boolean, isProgrammaticRestore?: boolean){
            // We want to know the size of the second pane (https://antoniandre.github.io/splitpanes/#emitted-events).
            // It will dictate the size of the Python execution area (expanded, with a range between 20% and 80% of the vh)
            const lowerPanelSize = event.panes[1].size as number;
            if(!calledForResize){
                // If the call isn't trigger by a window resize, we save the panel 1 size in the project
                if(this.appStore.peaExpandedSplitterPane2Size != undefined) {
                    this.appStore.peaExpandedSplitterPane2Size[this.appStore.peaLayoutMode??StrypePEALayoutMode.tabsCollapsed] = lowerPanelSize; 
                }
                else{
                    // The tricky case of when the state property has never been set
                    this.appStore.peaExpandedSplitterPane2Size = {...defaultEmptyStrypeLayoutDividerSettings, [this.appStore.peaLayoutMode??StrypePEALayoutMode.tabsCollapsed]: lowerPanelSize};

                }

                // A change of divider position triggers a modification notification only when the user actively moves the divider.
                // We can't infer this from the event's shape (a real Splitpanes "resize" event and the synthetic event used to
                // restore a saved layout both carry a 2-element "panes" array), so callers doing a programmatic restore must
                // say so explicitly via isProgrammaticRestore.
                if(!isProgrammaticRestore){
                    this.appStore.isEditorContentModified = true;
                    this.appStore.editorLastModificationAt = Date.now();
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
        // #v-endif

        onStrypeCommandsSplitPaneResize(event: any, useSpecificPEALayout?: StrypePEALayoutMode){
            // Save the new size of the RHS pane of the editor/commands splitter
            if(this.appStore.editorCommandsSplitterPane2Size != undefined) {
                this.appStore.editorCommandsSplitterPane2Size[useSpecificPEALayout??(this.appStore.peaLayoutMode??StrypePEALayoutMode.tabsCollapsed)] = event.panes[1].size;
            }
            else {
                // The tricky case of when the state property has never been set
                this.appStore.editorCommandsSplitterPane2Size = {...defaultEmptyStrypeLayoutDividerSettings, [useSpecificPEALayout??(this.appStore.peaLayoutMode??StrypePEALayoutMode.tabsCollapsed)]: event.panes[1].size};
            }

            // A change of divider position triggers a modification notification only when the user actively moves the divider,
            // we can distinguish between a sitation when the divider is position is loaded and user event by the content of the event
            if(event.length > 1){
                this.appStore.isEditorContentModified = true;
                this.appStore.editorLastModificationAt = Date.now();
            }

            // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
            // When the rightmost panel (with Strype commands) is resized, we need to also update the Turtle canvas and break the natural 4:3 ratio of the PEA
            vueComponentsAPIHandler.commandsComponentAPI?.setIsCommandsSplitterChanged(true);
            document.getElementById(getPEATabContentContainerDivId())?.dispatchEvent(new CustomEvent(CustomEventTypes.pythonExecAreaSizeChanged));
            // #v-endif
        },
        
        setStateFromPythonFile(completeSource: string, fileName: string, lastSaveDate: number, requestFSFileLoadedNotification: boolean, fileLocation: FileSystemFileHandle | "local" | "cloud" | "import") : Promise<void> {
            return new Promise((resolve, reject) => {
                const s = pasteMixedPython(completeSource, {id: useStore().getMainCodeFrameContainerId, caretPosition: CaretPosition.body}, true);
                if (s != null) {
                    // Now we can clear other non-frame related elements
                    this.appStore.clearNoneFrameRelatedState();
                
                    // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
                    // We check about turtle being imported as at loading a state we should reflect if turtle was added in that state.
                    actOnGraphicsImport();

                    // Clear the Python Execution Area as it could have be run before.
                    vueComponentsAPIHandler.peaComponentAPI?.clear();

                    // Restore any files pinned into this project (see load-save.ts's
                    // savePinnedLocalFiles()) into "/local" -- see loadPinnedLocalFiles()'s own
                    // comment. Only relevant here, not micro:bit mode, since that has no Files tab.
                    loadPinnedLocalFiles(s.headers);
                    // #v-endif
                    
                    this.appStore.setDividerStates(
                        loadDivider(s.headers["editorCommandsSplitterPane2Size"]),
                        s.headers["peaLayoutMode"] !== undefined ? StrypePEALayoutMode[s.headers["peaLayoutMode"] as keyof typeof StrypePEALayoutMode] : StrypePEALayoutMode.tabsCollapsed,
                        loadDivider(s.headers["peaCommandsSplitterPane2Size"]),
                        loadDivider(s.headers["peaSplitViewSplitterPane1Size"]),
                        loadDivider(s.headers["peaExpandedSplitterPane2Size"]),
                        () => {
                            // Finally, we can trigger the notifcation a file from FS has been loaded.
                            if(requestFSFileLoadedNotification){
                                vueComponentsAPIHandler.menuComponentAPI?.onFileLoaded(fileName, lastSaveDate, fileLocation);
                            }
                            else {
                                const noExtFileName = (fileName.includes(".")) ? fileName.substring(0, fileName.lastIndexOf(".")) : fileName;
                                this.appStore.projectName = noExtFileName;
                            }
                            resolve();
                        },
                        true
                    );
                    
                    // Check for errors (could be that we loaded something with blanks or syntax errors):
                    this.$nextTick(() => checkCodeErrors());
                }
                else {
                    // pasteMixedPython() already showed an error message; reject so callers
                    // (e.g. the loading overlay) don't wait on a promise that never settles.
                    reject(new Error("Failed to parse Python file"));
                }
            });
        },
        getPeaComponent() {
            return (this.$refs[this.strypeCommandsRefId] as any).$refs[getPEAComponentRefId()];
        },
        editImageInDialog(imageDataURL: string, showPreview: (dataURL: string) => void, callback: (replacement: {code: string, mediaType: string}) => void, recordOptions?: {onReRecord: () => void}, onCancelled?: () => void) {
            const editImageDlgComponentAPI = vueComponentsAPIHandler.editImageDlgComponentAPI;
            this.imgToEditInDialog = imageDataURL;
            this.showImgPreview = showPreview;
            this.editImageDlgShowReRecord = recordOptions != undefined;

            const editedImage = (event: BvTriggerableEvent) => {
                if (event.componentId != "editImageDlg") {
                    return;
                }
                // Always unregister once the dialog closes, regardless of how it closed
                // (previously this only happened on "ok"/"event", leaking a stale listener
                // whenever the dialog was cancelled):
                eventBus.off(CustomEventTypes.strypeModalHidden, editedImage);

                // Reset the image to edit to make sure we always start from a good start when opening modals again
                this.imgToEditInDialog = "";
                this.editImageDlgShowReRecord = false;

                if(event.trigger == "ok" || event.trigger=="event"){
                    // Call the callback:
                    editImageDlgComponentAPI?.getUpdatedMedia().then(callback);
                    // If we got here via the record flow, this is where it terminates (successfully):
                    if (recordOptions) {
                        this.isRecordingMediaFlowActive = false;
                    }
                }
                else if (event.trigger == "reRecord" && recordOptions) {
                    // Nothing is inserted; loop back to the record dialog with the same outer
                    // callback -- isRecordingMediaFlowActive deliberately stays true, the flow continues:
                    recordOptions.onReRecord();
                }
                else {
                    // Any other trigger ("cancel", backdrop, Esc): nothing further, capture (if
                    // any) is discarded. If we got here via the record flow, it terminates here too:
                    if (recordOptions) {
                        this.isRecordingMediaFlowActive = false;
                    }
                    onCancelled?.();
                }
            };
            eventBus.on(CustomEventTypes.strypeModalHidden, editedImage);

            eventBus.emit(CustomEventTypes.showStrypeModal, "editImageDlg");
        },
        editSoundInDialog(audioBuffer: AudioBuffer, callback: (replacement: {code: string, mediaType: string}) => void, recordOptions?: {onReRecord: () => void}, onCancelled?: () => void) {
            const editSoundDlgComponentAPI = vueComponentsAPIHandler.editSoundDlgComponentAPI;
            this.soundToEditInDialog = audioBuffer;
            this.editSoundDlgShowReRecord = recordOptions != undefined;

            const editedSound = (event: BvTriggerableEvent) => {
                if (event.componentId != "editSoundDlg") {
                    return;
                }
                // Always unregister once the dialog closes, regardless of how it closed
                // (previously this only happened on "ok"/"event", leaking a stale listener
                // whenever the dialog was cancelled):
                eventBus.off(CustomEventTypes.strypeModalHidden, editedSound);

                // Reset the sound to edit to make sure we always start from a good start when opening modals again
                this.soundToEditInDialog = null;
                this.editSoundDlgShowReRecord = false;

                if(event.trigger == "ok" || event.trigger=="event"){
                    // Call the callback:
                    editSoundDlgComponentAPI?.getUpdatedMedia().then(callback);
                    // If we got here via the record flow, this is where it terminates (successfully):
                    if (recordOptions) {
                        this.isRecordingMediaFlowActive = false;
                    }
                }
                else if (event.trigger == "reRecord" && recordOptions) {
                    // Nothing is inserted; loop back to the record dialog with the same outer
                    // callback -- isRecordingMediaFlowActive deliberately stays true, the flow continues:
                    recordOptions.onReRecord();
                }
                else {
                    // Any other trigger ("cancel", backdrop, Esc): nothing further, capture (if
                    // any) is discarded. If we got here via the record flow, it terminates here too:
                    if (recordOptions) {
                        this.isRecordingMediaFlowActive = false;
                    }
                    onCancelled?.();
                }
            };
            eventBus.on(CustomEventTypes.strypeModalHidden, editedSound);

            eventBus.emit(CustomEventTypes.showStrypeModal, "editSoundDlg");
        },
        // Public entry point for the record-new-image flow (Ctrl-Shift-I). callback is only ever
        // called if the user completes the whole flow with "OK" on the edit dialog; onCancelled is
        // called instead if the user cancels at any point.
        recordNewImageInDialog(callback: (replacement: {code: string, mediaType: string}) => void, onCancelled: () => void) {
            if (this.isRecordingMediaFlowActive) {
                // A shortcut-triggered flow (or another modal) is already in progress; ignore:
                return;
            }
            this.isRecordingMediaFlowActive = true;
            this.startRecordImageDlg(callback, onCancelled);
        },
        // Internal: (re-)opens the record dialog without touching isRecordingMediaFlowActive, so
        // it can be safely called again from "Re-record" without the guard above rejecting it.
        startRecordImageDlg(callback: (replacement: {code: string, mediaType: string}) => void, onCancelled: () => void) {
            const recordImageDlgComponentAPI = vueComponentsAPIHandler.recordImageDlgComponentAPI;

            const recorded = (event: BvTriggerableEvent) => {
                if (event.componentId != "recordImageDlg") {
                    return;
                }
                eventBus.off(CustomEventTypes.strypeModalHidden, recorded);

                const capturedDataURL = event.trigger == "captured" ? recordImageDlgComponentAPI?.getCapturedImageDataURL() : null;
                if (capturedDataURL) {
                    this.editImageInDialog(capturedDataURL, () => {}, callback, {onReRecord: () => this.startRecordImageDlg(callback, onCancelled)}, onCancelled);
                    // The flow continues into the edit dialog; isRecordingMediaFlowActive stays true.
                }
                else {
                    // Cancelled (or, defensively, no captured data somehow): the flow ends here.
                    this.isRecordingMediaFlowActive = false;
                    onCancelled();
                }
            };
            eventBus.on(CustomEventTypes.strypeModalHidden, recorded);

            eventBus.emit(CustomEventTypes.showStrypeModal, "recordImageDlg");
        },
        // Public entry point for the record-new-sound flow (Ctrl-Shift-U). Mirrors recordNewImageInDialog.
        recordNewSoundInDialog(callback: (replacement: {code: string, mediaType: string}) => void, onCancelled: () => void) {
            if (this.isRecordingMediaFlowActive) {
                return;
            }
            this.isRecordingMediaFlowActive = true;
            this.startRecordSoundDlg(callback, onCancelled);
        },
        startRecordSoundDlg(callback: (replacement: {code: string, mediaType: string}) => void, onCancelled: () => void) {
            const recordSoundDlgComponentAPI = vueComponentsAPIHandler.recordSoundDlgComponentAPI;

            const recorded = (event: BvTriggerableEvent) => {
                if (event.componentId != "recordSoundDlg") {
                    return;
                }
                eventBus.off(CustomEventTypes.strypeModalHidden, recorded);

                const capturedAudioBuffer = event.trigger == "captured" ? recordSoundDlgComponentAPI?.getCapturedAudioBuffer() : null;
                if (capturedAudioBuffer) {
                    this.editSoundInDialog(capturedAudioBuffer, callback, {onReRecord: () => this.startRecordSoundDlg(callback, onCancelled)}, onCancelled);
                }
                else {
                    this.isRecordingMediaFlowActive = false;
                    onCancelled();
                }
            };
            eventBus.on(CustomEventTypes.strypeModalHidden, recorded);

            eventBus.emit(CustomEventTypes.showStrypeModal, "recordSoundDlg");
        },
        // Public entry point for the colour picker (Ctrl-Shift-L). callback is only called if the
        // user confirms with "OK"; onCancelled is called instead if the user cancels. Guarded by
        // appStore.isModalDlgShown (checked by the caller in LabelSlot.vue) rather than a dedicated
        // flag, since -- unlike the record-then-edit media flows above -- this is a single dialog
        // with no follow-on modal to chain into.
        async openColourPickerInDialog(initialColour: string | null, callback: (hex: string) => void, onCancelled: () => void) {
            const colourPickerDlgComponentAPI = vueComponentsAPIHandler.colourPickerDlgComponentAPI;
            this.colourPickerInitialColour = initialColour;
            // ColourPickerDlg.vue's own seeding (onShowModalDlg) reads its initialColour *prop* on the
            // modal's "show" event, which -- unlike "shown" -- can fire before Vue has flushed the
            // reactive update above out to the child, seeing the previous (often null) value instead.
            // Wait a tick so the prop is definitely current before triggering the modal at all:
            await this.$nextTick();

            const picked = (event: BvTriggerableEvent) => {
                if (event.componentId != "colourPickerDlg") {
                    return;
                }
                eventBus.off(CustomEventTypes.strypeModalHidden, picked);
                this.colourPickerInitialColour = null;

                if (event.trigger == "ok") {
                    const hex = colourPickerDlgComponentAPI?.getHexValue();
                    if (hex) {
                        callback(hex);
                    }
                    else {
                        onCancelled();
                    }
                }
                else {
                    onCancelled();
                }
            };
            eventBus.on(CustomEventTypes.strypeModalHidden, picked);

            eventBus.emit(CustomEventTypes.showStrypeModal, "colourPickerDlg");
        },

        // Focuses the label row's container and restores the given anchor/focus selection into it
        // -- used to put the caret/selection back after a record/edit/colour-picker dialog is
        // cancelled (or, with a single collapsed position, after committing an insertion). Real DOM
        // focus is on a dialog/pane button beforehand -- setDocumentSelection() alone won't reliably
        // drag focus back into a nested contenteditable slot from there (once editing is underway,
        // real focus is held by the whole label row's own container, not the individual span -- see
        // LabelSlotsStructure.vue's onLoseCaret comment), so we focus that container first.
        // Applied both immediately and again after a short delay: bootstrap-vue-next's modal can
        // itself restore focus (to whatever had it before the modal opened) slightly *after* its
        // "hidden" event fires, which would otherwise silently undo an immediate-only restore.
        // That restore comes from the vendored focus-trap library's own "returnFocusOnDeactivate"
        // behaviour (see createFocusTrap's defaults) and isn't tied to a fixed delay -- a single
        // 100ms-later re-check isn't always late enough (confirmed via a real, reproducible failure:
        // `npx playwright test tests/playwright/e2e/colour-picker.spec.ts --repeat-each` left real
        // DOM focus permanently stuck outside the slot, on the button that had triggered the
        // dialog, because the library's own restore landed *after* that single re-check). Re-check
        // a few times over a longer window instead of just once, on the same "only if focus never
        // actually landed here, and nothing newer has superseded this request" guard as before.
        //
        // Lives here (rather than on LabelSlot.vue, where the media/colour shortcuts used to live
        // before the slot shortcuts pane) because App.vue is a true singleton -- unlike a LabelSlot
        // instance, which Vue can reuse for a different slot after the slot list is spliced (e.g.
        // inserting a new media literal), it can never go stale underneath a lookup by slot id.
        restoreSlotFocusAndSelection(anchor: SlotCursorInfos, focus: SlotCursorInfos) {
            const containerUID = getFrameLabelSlotsStructureUID(focus.slotInfos.frameId, focus.slotInfos.labelSlotsIndex);
            // Mark this as the newest pending caret request (see bumpCaretRequestSeq() doc) so that
            // if the user moves on (e.g. opens the slot shortcuts pane again) before the delayed
            // re-apply below fires, we can tell it's stale and must not clobber that newer state.
            const myCaretRequestSeq = bumpCaretRequestSeq();
            const apply = () => {
                document.getElementById(containerUID)?.focus();
                setDocumentSelection(anchor, focus);
                this.appStore.setSlotTextCursors(anchor, focus);
                this.appStore.setFocusEditableSlot({
                    frameSlotInfos: focus.slotInfos,
                    caretPosition: this.appStore.getAllowedChildren(focus.slotInfos.frameId) ? CaretPosition.body : CaretPosition.below,
                });
            };
            this.$nextTick(apply);
            // Only re-apply if real focus never actually landed in the container AND nothing newer
            // has happened since (see comment above) -- otherwise this would clobber anything the
            // user typed, or any subsequent action, in the meantime.
            for (const delayMs of [100, 300, 600]) {
                setTimeout(() => {
                    if (myCaretRequestSeq === getCaretRequestSeq() && document.activeElement?.id !== containerUID) {
                        apply();
                    }
                }, delayMs);
            }
        },

        // Captures where to insert the recorded media literal (the slot and the text either side
        // of the caret) synchronously, at the moment the shortcut is pressed -- NOT re-derived from
        // DOM/focus later, since focus moves to the record/edit modals for a while before the user
        // finishes (or cancels). Mirrors the DOM-read logic already used for paste in
        // onCodePasteImpl (LabelSlot.vue). The record/edit dialogs are true modals that block all
        // editor interaction while open, so the target slot cannot change or be deleted meanwhile.
        // Triggered via the slot shortcuts pane's "i"/"s" shortcuts -- see Commands.vue's
        // triggerSlotShortcut, which passes the currently-focused slot's SlotCoreInfos here.
        triggerMediaRecording(kind: "image" | "sound", targetSlotInfos: SlotCoreInfos) {
            const uid = getLabelSlotUID(targetSlotInfos);
            const inputSpanField = document.getElementById(uid) as HTMLSpanElement;
            if (!inputSpanField) {
                return;
            }

            const {selectionStart, selectionEnd} = getFocusedEditableSlotTextSelectionStartEnd(uid);
            const lhsCode = (inputSpanField.textContent?.substring(0, selectionStart) ?? "").replace(/\u200B/g, "");
            const rhsCode = (inputSpanField.textContent?.substring(selectionEnd) ?? "").replace(/\u200B/g, "");

            // Suppress the artificial blur about to happen as focus moves to the modal, exactly as
            // is already done before opening the large-image edit dialog on paste (see onCodePaste):
            this.appStore.ignoreBlurEditableSlot = true;

            // If the user cancels (at either the record or the edit dialog) instead of confirming,
            // nothing is inserted -- but real DOM focus has still moved to the modal throughout, so
            // without this we'd be left showing the frame cursor instead of back in the slot. Restore
            // the original selection exactly as it was before the shortcut was pressed:
            const restoreAnchor: SlotCursorInfos = {slotInfos: targetSlotInfos, cursorPos: selectionStart};
            const restoreFocus: SlotCursorInfos = {slotInfos: targetSlotInfos, cursorPos: selectionEnd};
            const restoreOriginalCursor = () => this.restoreSlotFocusAndSelection(restoreAnchor, restoreFocus);

            const commitInsertion = (replacement: {code: string, mediaType: string}) => {
                this.appStore.addNewSlot(targetSlotInfos, replacement.mediaType, lhsCode, rhsCode, SlotType.media, false, replacement.code);
                // Explicitly place the cursor in the new trailing (empty) field right after the
                // inserted media, mirroring the same three calls onGetCaret() uses when a user
                // clicks into a slot (setDocumentSelection + setSlotTextCursors +
                // setFocusEditableSlot, see LabelSlot.vue's onGetCaret). We can't rely on
                // leftRightKey()'s *relative* navigation here (as paste's onCodePasteImpl does)
                // because that depends on appStore.isEditing/focusSlotCursorInfos reflecting where
                // we were focused, which is no longer valid after going through the record/edit
                // dialogs: real DOM focus has been on dialog buttons throughout, not any text slot,
                // so leftRightKey ends up navigating frame-caret-style from a stale/wrong position
                // instead of moving within the slot text (observed: caret landing at the very
                // start of the line rather than after the media).
                const {parentId, slotIndex} = getSlotParentIdAndIndexSplit(targetSlotInfos.slotId);
                const rhsSlotInfos: SlotCoreInfos = {...targetSlotInfos, slotId: getSlotIdFromParentIdAndIndexSplit(parentId, slotIndex + 2)};
                const cursorInfo: SlotCursorInfos = {slotInfos: rhsSlotInfos, cursorPos: 0};
                // Same focus-restore race as restoreOriginalCursor above (bootstrap-vue-next's modal
                // can itself steal focus back asynchronously after "hidden" fires) -- go through
                // restoreSlotFocusAndSelection's retries rather than a bare, unguarded $nextTick:
                this.restoreSlotFocusAndSelection(cursorInfo, cursorInfo);
            };

            if (kind == "image") {
                this.recordNewImageInDialog(commitInsertion, restoreOriginalCursor);
            }
            else {
                this.recordNewSoundInDialog(commitInsertion, restoreOriginalCursor);
            }
        },

        // Opens the colour-picker dialog at the current caret position (triggered via the slot
        // shortcuts pane's "c" shortcut -- see Commands.vue's triggerSlotShortcut, which passes the
        // currently-focused slot's SlotCoreInfos here). Three cases, per the same synchronous-capture
        // approach as triggerMediaRecording above:
        // - Outside a string, with the caret directly before/after an existing colour literal
        //   (no selection, at the start/end of this -- typically empty -- field, colour literal in
        //   that direction): edits that colour literal in place, seeding the picker from its
        //   current hex and replacing its code on "OK", via setFrameEditableSlotContent -- same
        //   mechanism as the hover-popup "Edit" button (see LabelSlot.vue's showMediaPreviewPopup).
        // - Outside a string, otherwise: inserts a brand new string literal containing the picked
        //   hex code, via addNewSlot (mirrors the media-literal-insertion case there).
        // - Inside a string: seeds the picker from the current string content (if it parses as a
        //   colour), and on "OK" replaces the WHOLE string content with the picked hex code
        //   (regardless of whether the original content was a valid colour), via
        //   setFrameEditableSlotContent. Cancel leaves the string untouched.
        triggerColourPicker(targetSlotInfos: SlotCoreInfos) {
            const uid = getLabelSlotUID(targetSlotInfos);
            const inputSpanField = document.getElementById(uid) as HTMLSpanElement;
            if (!inputSpanField) {
                return;
            }
            const isInString = targetSlotInfos.slotType == SlotType.string;

            // Suppress the artificial blur about to happen as focus moves to the modal (see
            // triggerMediaRecording above for why):
            this.appStore.ignoreBlurEditableSlot = true;

            if (isInString) {
                const currentCode = (inputSpanField.textContent ?? "").replace(/\u200B/g, "");
                const restoreOriginalCursor = () => {
                    const cursorInfo: SlotCursorInfos = {slotInfos: targetSlotInfos, cursorPos: currentCode.length};
                    this.restoreSlotFocusAndSelection(cursorInfo, cursorInfo);
                };

                const commitReplacement = (hex: string) => {
                    // Converts the whole string to a colour literal (now an atomic, 1-char-wide field), so
                    // rather than leaving the cursor "inside" it, we place it in the adjacent sibling field.
                    this.appStore.convertStringSlotToColourLiteral(targetSlotInfos, hex);
                    const {parentId, slotIndex} = getSlotParentIdAndIndexSplit(targetSlotInfos.slotId);
                    const rhsSlotInfos: SlotCoreInfos = {...targetSlotInfos, slotId: getSlotIdFromParentIdAndIndexSplit(parentId, slotIndex + 1)};
                    const cursorInfo: SlotCursorInfos = {slotInfos: rhsSlotInfos, cursorPos: 0};
                    // Same focus-restore race as restoreOriginalCursor above -- see
                    // restoreSlotFocusAndSelection's own comment for why this needs its retries
                    // rather than a bare, unguarded $nextTick:
                    this.restoreSlotFocusAndSelection(cursorInfo, cursorInfo);
                };

                this.openColourPickerInDialog(currentCode, commitReplacement, restoreOriginalCursor);
            }
            else {
                const {selectionStart, selectionEnd} = getFocusedEditableSlotTextSelectionStartEnd(uid);

                // If the caret has no selection and sits right at the start/end of this (typically
                // empty) field, and the adjacent field in that direction is an existing colour
                // literal, edit that colour in place rather than inserting a new one next to it --
                // this is what lets triggering the colour picker "just before/after" a swatch feel
                // like editing it.
                if (selectionStart === selectionEnd) {
                    const plainTextLength = (inputSpanField.textContent ?? "").replace(/\u200B/g, "").length;
                    const adjacentColourSlotInfos = getAdjacentColourSlotInfos(targetSlotInfos, selectionStart, plainTextLength);
                    if (adjacentColourSlotInfos) {
                        const existingSlot = retrieveSlotFromSlotInfos(adjacentColourSlotInfos) as MediaSlot;
                        const existingHex = existingSlot.code.replace(/["']/g, "");
                        const commitEdit = (hex: string) => {
                            this.appStore.setFrameEditableSlotContent({
                                ...adjacentColourSlotInfos,
                                code: "\"" + hex + "\"",
                                mediaType: "colour",
                                initCode: "",
                                isFirstChange: true,
                            });
                            // The edited slot itself is atomic (a swatch, not text), so the cursor goes
                            // back into the same empty field the shortcut was triggered from, exactly as
                            // when cancelling (see restoreOriginalCursorForEdit below).
                            const cursorInfo: SlotCursorInfos = {slotInfos: targetSlotInfos, cursorPos: selectionStart};
                            this.restoreSlotFocusAndSelection(cursorInfo, cursorInfo);
                        };
                        const restoreOriginalCursorForEdit = () => {
                            const cursorInfo: SlotCursorInfos = {slotInfos: targetSlotInfos, cursorPos: selectionStart};
                            this.restoreSlotFocusAndSelection(cursorInfo, cursorInfo);
                        };
                        this.openColourPickerInDialog(existingHex, commitEdit, restoreOriginalCursorForEdit);
                        return;
                    }
                }

                const lhsCode = (inputSpanField.textContent?.substring(0, selectionStart) ?? "").replace(/\u200B/g, "");
                const rhsCode = (inputSpanField.textContent?.substring(selectionEnd) ?? "").replace(/\u200B/g, "");

                const restoreAnchor: SlotCursorInfos = {slotInfos: targetSlotInfos, cursorPos: selectionStart};
                const restoreFocus: SlotCursorInfos = {slotInfos: targetSlotInfos, cursorPos: selectionEnd};
                const restoreOriginalCursor = () => this.restoreSlotFocusAndSelection(restoreAnchor, restoreFocus);

                const commitInsertion = (hex: string) => {
                    this.appStore.addNewSlot(targetSlotInfos, "colour", lhsCode, rhsCode, SlotType.media, false, "\"" + hex + "\"");
                    // Place the cursor in the new trailing (empty) field right after the inserted
                    // colour literal, mirroring commitInsertion in triggerMediaRecording above:
                    const {parentId, slotIndex} = getSlotParentIdAndIndexSplit(targetSlotInfos.slotId);
                    const rhsSlotInfos: SlotCoreInfos = {...targetSlotInfos, slotId: getSlotIdFromParentIdAndIndexSplit(parentId, slotIndex + 2)};
                    const cursorInfo: SlotCursorInfos = {slotInfos: rhsSlotInfos, cursorPos: 0};
                    // Same focus-restore race as restoreOriginalCursor above -- see
                    // restoreSlotFocusAndSelection's own comment for why this needs its retries
                    // rather than a bare, unguarded $nextTick:
                    this.restoreSlotFocusAndSelection(cursorInfo, cursorInfo);
                };

                this.openColourPickerInDialog(null, commitInsertion, restoreOriginalCursor);
            }
        },
    },

    provide() : { peaComponent: any, editImageInDialog : EditImageInDialogFunction, editSoundInDialog : EditSoundInDialogFunction, recordNewImageInDialog : RecordNewImageInDialogFunction, recordNewSoundInDialog : RecordNewSoundInDialogFunction, openColourPickerInDialog : OpenColourPickerInDialogFunction} {
        return {
            peaComponent: this.getPeaComponent,
            // Note, this provides the function:
            editImageInDialog: this.editImageInDialog,
            editSoundInDialog: this.editSoundInDialog,
            recordNewImageInDialog: this.recordNewImageInDialog,
            recordNewSoundInDialog: this.recordNewSoundInDialog,
            openColourPickerInDialog: this.openColourPickerInDialog,
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

.app-overlay-pane-absolute  {    
    z-index: 600 !important;
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
    position: relative;
}

.editor-code-div.has-frame-numbers-gutter {
    padding-left: 24px;
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
	user-select: none;
    pointer-events: none;
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

.strype-split-theme .splitpanes .splitpanes__pane {
	background-color: transparent;
}

.strype-split-theme .splitpanes > .splitpanes__splitter {
    background-color: transparent;
	-webkit-box-sizing: border-box;
	box-sizing: border-box;
	position: relative;
	-ms-flex-negative: 0;
	flex-shrink: 0
}

.strype-split-theme .splitpanes > .splitpanes__splitter:first-child {
	cursor: auto
}

.strype-split-theme .splitpanes > .splitpanes .splitpanes__splitter {
	z-index: 1
}

.strype-split-theme .splitpanes--vertical>.splitpanes__splitter {
	width: 2px;
	//border-left: 1px solid #eee;
    border-right: 1px solid transparent;
	margin-left: -1px
}

.strype-split-theme .splitpanes--vertical>.splitpanes__splitter:before,
.strype-split-theme .splitpanes--vertical>.splitpanes__splitter:after {
	-webkit-transform: translateY(-50%);
	-ms-transform: translateY(-50%);
	transform: translateY(-50%);
	width: 1px;
	height: 30px
}

.strype-split-theme .splitpanes--vertical>.splitpanes__splitter:before {
	margin-left: -2px
}

.strype-split-theme .splitpanes--vertical>.splitpanes__splitter:after {
	margin-left: 1px
}

.strype-split-theme .splitpanes--horizontal>.splitpanes__splitter {
	height: 14px;
	border-top: 1px solid transparent;
	margin-top: -1px
}

.strype-split-theme .splitpanes--horizontal>.splitpanes__splitter:before,
.strype-split-theme .splitpanes--horizontal>.splitpanes__splitter:after {
	-webkit-transform: translateX(-50%);
	-ms-transform: translateX(-50%);
	transform: translate(-50%);
	width: 30px;
	height: 1px
}

.strype-split-theme .splitpanes--horizontal>.splitpanes__splitter:before {
	margin-top: -2px
}

.strype-split-theme .splitpanes--horizontal>.splitpanes__splitter:after {
	margin-top: 1px
}
</style>
