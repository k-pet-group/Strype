<template>
    <div class="commands">
        <!-- #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE -->
        <!-- the container div is only here because the new version of Splitpanes doesn't get the classes -->
        <div :class="{[scssVars.commandsPEASplitterThemeClassName]: true, [scssVars.expandedPEAClassName]: isExpandedPEA}">
            <Splitpanes horizontal @resize="onCommandsSplitterResize">
                <pane key="1" :size="100 - commandsSplitterPane2Size" :min-size="commandSplitterPane1MinSize">
        <!-- #v-endif-->
                    <div :class="scssVars.noPEACommandsClassName" @wheel.stop>
                        <div :class="scssVars.strypeProjectNameContainerClassName">
                            <span class="project-name">{{projectName}}</span>
                            <div @mouseover="getLastProjectSavedDateTooltip" :title="lastProjectSavedDateTooltip">
                                <img v-if="isProjectFromCloudDrive" :src="syncedTargetLogo" :alt="syncedTargetName" class="project-target-logo"/> 
                                <img v-else-if="isProjectFromFS" :src="syncedTargetLogo" :alt="syncedTargetName" class="project-target-logo"/> 
                                <span class="gdrive-sync-label" v-if="!isProjectNotSourced && !isEditorContentModifiedFlag">{{ $t("appMessage.saved") }}</span>
                                <span class="gdrive-sync-label" v-else-if="isEditorContentModifiedFlag" :class="{'modifed-label-span': isProjectNotSourced}">{{ $t("appMessage.modified") }}</span>
                            </div>
                        </div>
                        <div class="commands-flex-fill" @mousedown.prevent.stop @mouseup.prevent.stop>
                            <!-- #v-ifdef STRYPE_PLATFORM == VITE_MICROBIT_MODE -->
                            <!-- no-fade: opening the frame commands pane (Tab/Space at a frame caret) switches
                                 to this tab and immediately needs to focus one of its buttons -- a fade transition
                                 leaves the tab's content display:none (unfocusable) for its whole duration, which
                                 loses the race against a shortcut letter typed right after (see openFrameCommandsPane()). -->
                            <BTabs id="commandsTabs" content-class="mt-2" v-model:index="tabIndex" no-fade>
                                <BTab :title="$t('commandTabs.0')" active :title-link-class="getTabClasses(0)" :disabled="isEditing">
                            <!-- #v-endif-->
                                    <div :id="commandsContainerUID" class="command-tab-content" >
                                        <div id="addFramePanel" :class="{'frame-commands-pane-active': isFrameCommandsPaneActive}">
                                            <!-- #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE -->
                                            <div :class="{[scssVars.addFrameCommandsContainerClassName]: true, 'with-expanded-PEA': isExpandedPEA}">
                                            <!-- #v-else-->
                                            <div :class="scssVars.addFrameCommandsContainerClassName">
                                            <!-- #v-endif-->
                                                <div
                                                    class="frame-commands-pane-intro"
                                                    :class="{'frame-commands-pane-intro-hidden': isFrameCommandsPaneActive}"
                                                    v-if="!isEditing && !isPythonExecuting"
                                                >
                                                    <span class="frame-cmd-prefix-btn frame-cmd-btn-large frame-cmd-prefix-btn-wide">{{ $t('autoCompletion.spaceKey') }}</span>
                                                    <span>{{ $t('commandsPane.pressSpaceThenSuffix') }}</span>
                                                </div>
                                                <p class="frame-cmd-row add-frame-commands-list">
                                                    <AddFrameCommand
                                                        v-for="addFrameCommand in addFrameCommands"
                                                        :id="addFrameCommandUID(addFrameCommand[0].type.type)"
                                                        :key="addFrameCommand[0].type.type"
                                                        :type="addFrameCommand[0].type.type"
                                                        :shortcut="addFrameCommand[0].shortcuts[0]"
                                                        :symbol="
                                                            addFrameCommand[0].symbol !== undefined
                                                                ? addFrameCommand[0].symbol
                                                                : addFrameCommand[0].shortcuts[0]
                                                        "
                                                        :isSVGIconSymbol="addFrameCommand[0].isSVGIconSymbol"
                                                        :description="addFrameCommand[0].description"
                                                        :index="
                                                            addFrameCommand[0].index!==undefined
                                                            ? addFrameCommand[0].index
                                                            : 0
                                                        "
                                                        :greyedOut="!isFrameCommandsPaneActive"
                                                    />
                                                </p>
                                                <div v-if="codeCompletionCommand" class="frame-cmd-row">
                                                    <div class="frame-cmd-container text-editing-command">
                                                        <span class="text-editing-command-keys">
                                                            <button class="frame-cmd-btn frame-cmd-btn-large">{{ codeCompletionCommand.ctrlSymbol }}</button>
                                                            <span class="text-editing-command-keys-plus">+</span>
                                                            <button class="frame-cmd-btn frame-cmd-btn-large">{{ codeCompletionCommand.spaceSymbol }}</button>
                                                        </span>
                                                        <span>{{ codeCompletionCommand.description }}</span>
                                                    </div>
                                                </div>
                                                <div v-if="slotShortcutsCommands.length" class="frame-cmd-divider"></div>
                                                <div
                                                    class="frame-commands-pane-intro"
                                                    :class="{'frame-commands-pane-intro-hidden': isSlotShortcutsPaneActive}"
                                                    v-if="slotShortcutsCommands.length"
                                                >
                                                    <span class="frame-cmd-prefix-btn frame-cmd-btn-large frame-cmd-prefix-btn-wide">{{ $t('autoCompletion.spaceKey') }}</span>
                                                    <span>{{ $t('commandsPane.pressSpaceThenSuffix') }}</span>
                                                </div>
                                                <p
                                                    v-if="slotShortcutsCommands.length"
                                                    id="addSlotShortcutsPanel"
                                                    class="frame-cmd-row"
                                                    :class="{'frame-commands-pane-active': isSlotShortcutsPaneActive}"
                                                >
                                                    <div
                                                        v-for="slotShortcutCommand in slotShortcutsCommands"
                                                        :key="slotShortcutCommand.kind"
                                                        class="frame-cmd-container"
                                                        @click="triggerSlotShortcut(slotShortcutCommand.kind)"
                                                    >
                                                        <button
                                                            class="frame-cmd-btn"
                                                            :class="{'frame-cmd-greyed': !isSlotShortcutsPaneActive}"
                                                        >{{ slotShortcutCommand.key }}</button>
                                                        <span>{{ slotShortcutCommand.description }}</span>
                                                    </div>
                                                </p>
                                                <div v-if="wrapSelectionCommands.length" class="frame-cmd-row">
                                                    <div
                                                        v-for="wrapSelectionCommand in wrapSelectionCommands"
                                                        :key="wrapSelectionCommand.symbol"
                                                        class="frame-cmd-container text-editing-command"
                                                    >
                                                        <button class="frame-cmd-btn">{{ wrapSelectionCommand.symbol }}</button>
                                                        <span>{{ wrapSelectionCommand.description }}</span>
                                                    </div>
                                                </div>
                                            <!-- this conditional rendering is only used for our code editor to see the closing <div> right -->
                                            <!-- #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE -->
                                            </div>
                                            <!-- #v-else-->
                                            </div>
                                            <!-- #v-endif-->
                                        </div>
                                    </div>
                                <!-- #v-ifdef STRYPE_PLATFORM == VITE_MICROBIT_MODE -->
                                </BTab>
                                    <BTab :title="$t('commandTabs.1')" :title-link-class="getTabClasses(1)">
                                        <APIDiscovery  class="command-tab-content"/>
                                    </BTab>                       
                            </BTabs>
                            <!-- #v-endif-->
                        </div>
                        <text id="userCode"></text>
                        <span id="keystrokeSpan"></span>
                    </div>
        <!-- #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE -->
                </pane>
                <pane key="2" :size="commandsSplitterPane2Size" :min-size="commandSplitterPane2MinSize" :class="{'collapsed-pea-splitter-pane': !isExpandedPEA}">
                    <python-execution-area :class="scssVars.peaContainerClassName" :ref="peaComponentRefId" v-on:[peaMountedEventName]="onPEAMounted" :hasDefault43Ratio="!isCommandsSplitterChanged && !hasPEAExpanded"/>
                </pane>
            </Splitpanes>
        </div>
        <!-- #v-else -->
        <div :class="scssVars.peaContainerClassName">  
            <div v-if="showProgress" class="progress cmd-progress-container">
                <div
                    class="progress-bar progress-bar-striped bg-info"
                    role="progressbar"
                    :style="progressPercentWidthStyle"
                    aria-valuenow="progressPercent"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    >
                </div>
                <span class="progress-bar-text">{{ $t("action.uploadingToMicrobit") }}</span>
            </div>
            <div class="commands-container">    
                <iframe id="mbSimulatorIframe" src="https://python-simulator.usermbit.org/v/0.1/simulator.html?color=%2300FF00" frameborder="0" scrolling="no" sandbox="allow-scripts allow-same-origin"></iframe>
                <br>
                <button type="button" @click="runToMicrobit" class="btn btn-secondary cmd-button">{{ $t("buttonLabel.runOnMicrobit") }}</button>
                <button v-if="isMBSimulatorRunning" type="button" @click="stopMBSimulator" class="btn btn-secondary cmd-button stop-mb-sim-btn ">{{ $t("buttonLabel.stopMBSimulator") }}</button>
            </div>
        </div>
        <SimpleMsgModalDlg :dlgId="startMBSimulatorlDlgId" />
    <!-- #v-endif-->
    </div>
</template>

<script lang="ts">
import AddFrameCommand from "@/components/AddFrameCommand.vue";
import { alwaysDirectFrameShortcutKeys, bumpCaretRequestSeq, computeAddFrameCommandContainerSize, CustomEventTypes, getActiveContextMenu, getAddFrameCmdElementUID, getCaretContainerUID, getCommandsContainerUID, getCommandsRightPaneContainerId, getCurrentFrameSelectAllAction, getFrameUID, getFrameLabelSlotsStructureUID, getEditorMiddleUID, getLabelSlotUID, getLegacyShortcut, getMenuLeftPaneUID, hiddenShorthandFrames, notifyDragEnded, setDocumentSelection, waitForPanesSettled } from "@/helpers/editor";
import { useStore } from "@/store/store";
import { AddFrameCommandDef, AllFrameTypesIdentifier, areSlotCoreInfosEqual, CaretPosition, CollapsedState, defaultEmptyStrypeLayoutDividerSettings, FrameObject, getFrameDefType, isSlotStringLiteralType, PythonExecRunningState, SelectAllFramesAction, SlotType, StrypePEALayoutMode, StrypeSyncTarget } from "@/types/types";
import $ from "jquery";
import { defineComponent } from "vue";
import { mapStores } from "pinia";
import {computeFrameSnapshot, getAvailableNavigationPositions, getFrameSectionIdFromFrameId} from "@/helpers/storeMethods";
import scssVars  from "@/assets/style/_export.module.scss";
import { isMacOSPlatform } from "@/helpers/common";
import fsIcon from "@/assets/images/FSicon.png";
import gdIcon from "@/assets/images/logoGDrive.png";
import odIcon from "@/assets/images/logoOneDrive.svg";
import ghIcon from "@/assets/images/logoGitHub.svg";
import glIcon from "@/assets/images/logoGitLab.svg";
import { findCurrentStrypeLocation, STRYPE_LOCATION } from "@/helpers/pythonToFrames";
import { clamp } from "lodash";
import { vueComponentsAPIHandler } from "@/helpers/vueComponentAPI";
import { eventBus } from "@/helpers/appContext";
import { BTab, BTabs } from "bootstrap-vue-next";
// #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
import {Splitpanes, Pane} from "splitpanes";
import PythonExecutionArea from "@/components/PythonExecutionArea.vue";
import {getPEAConsoleId, getPEATabContentContainerDivId, getPEAComponentRefId, getPEAControlsDivId} from "@/helpers/editor";
// #v-else
import APIDiscovery from "@/components/APIDiscovery.vue";
import { flash } from "@/helpers/webUSB";
import { downloadHex, getPythonContent } from "@/helpers/download";
import SimpleMsgModalDlg from "@/components/SimpleMsgModalDlg.vue";
import { useBrowserDetect } from "vue3-detect-browser";
// #v-endif

// #v-ifdef STRYPE_PLATFORM == VITE_MICROBIT_MODE
// This variable is moved to at the module level rather than in data because having a Window as a reactive property doesn't work with Vue 2.7 (and Vue 3)
let mbSimulator: Window | null = null;
// #v-endif

export default defineComponent({
    name: "Commands",

    setup(){
        // #v-ifdef STRYPE_PLATFORM == VITE_MICROBIT_MODE
        // Get the detectBrowser function from the (replaced for Vue 3) browser detection package
        const detectBrowser = useBrowserDetect;
        return { detectBrowser };
        // #v-endif
    },

    components: {
        AddFrameCommand,
        BTabs, BTab,
        // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
        Splitpanes, Pane,
        PythonExecutionArea,
        // #v-else
        APIDiscovery,
        SimpleMsgModalDlg,
        // #v-endif
    },

    data: function () {
        return {
            scssVars, // just to be able to use in template
            showProgress: false,
            progressPercent: 0,
            uploadThroughUSB: false,
            frameCommandsReactiveFlag: false, // this flag is only use to allow a reactive binding when the add frame commands are updated (language),
            // Set right before closing the slot shortcuts pane on Escape: LabelSlot.vue's onEscKeyUp
            // (bound to the slot's own span) reacts to appStore.isEditing still being true (which it
            // deliberately is throughout this pane's whole lifetime) by blurring whatever now has real
            // DOM focus -- which, by the time that keyup fires, is the slot we just carefully refocused
            // in closeSlotShortcutsPane(). This flag tells the capturing "keyup" listener (created())
            // to consume that one specific Escape keyup before it can reach onEscKeyUp at all.
            suppressNextEscapeKeyUp: false,
            lastProjectSavedDateTooltip: "", // update on a mouse over event (in getLastProjectSavedDateTooltip)
            // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
            isExpandedPEA: false, // flag indicating whether the Python Execution Area is expanded (to update the UI parts accordingly)
            hasPEAExpanded: false, // flag indicating whether the Python Execution Area *has ever been* expanded
            peaMountedEventName: CustomEventTypes.pythonExecAreaMounted,
            commandSplitterPane1MinSize: 0, // to be adjusted after the component is mounted
            commandSplitterPane2MinSize: 0, // to be adjusted after the component is mounted
            commandsSplitterPane2Size: 0, // to be adjused after the component is mounted
            isCommandsSplitterChanged: false,
            // #v-endif
        };
    },

    // #v-ifdef STRYPE_PLATFORM == VITE_MICROBIT_MODE
    beforeMount() {
        this.uploadThroughUSB = (this.detectBrowser().isChrome || this.detectBrowser().isOpera || this.detectBrowser().isEdge);
    },
    // #v-endif

    computed: {
        ...mapStores(useStore),

        projectName(): string {
            // When the project is updated, we reflect this into the HTML meta-data.
            document.title = "Strype - " + this.appStore.projectName;
            return this.appStore.projectName;
        },

        isEditorContentModifiedFlag(): boolean {
            return (this.appStore.isEditorContentModified);
        },

        isProjectFromCloudDrive(): boolean {
            return this.appStore.syncTarget != StrypeSyncTarget.fs && this.appStore.syncTarget != StrypeSyncTarget.none;
        },

        isProjectFromFS(): boolean {
            return this.appStore.syncTarget == StrypeSyncTarget.fs;
        },
        
        isProjectNotSourced(): boolean {
            return this.appStore.syncTarget == StrypeSyncTarget.none;
        },

        syncedTargetLogo(): string {
            switch(this.appStore.syncTarget){
            case StrypeSyncTarget.fs:
                return fsIcon;                
            case StrypeSyncTarget.gd:
                return gdIcon;
            case StrypeSyncTarget.od:
                return odIcon;
            case StrypeSyncTarget.gh:
                return ghIcon;
            case StrypeSyncTarget.gl:
                return glIcon;
            default:
                return "";
            }
        },

        syncedTargetName(): string {
            const cloudDriveHandlerComponentAPI =  (vueComponentsAPIHandler.cloudDriveHandlerComponentAPI);
            switch(this.appStore.syncTarget){
            case StrypeSyncTarget.fs:
                return this.$t("appMessage.targetFS");
            case StrypeSyncTarget.gd:
            case StrypeSyncTarget.od:
            case StrypeSyncTarget.gh:
            case StrypeSyncTarget.gl:
                return (cloudDriveHandlerComponentAPI?.getDriveName())??"";
            default:
                return "";
            }
        },
        
        // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
        peaComponentRefId(): string {
            return getPEAComponentRefId();
        },
        // #v-else
        tabIndex: {
            get(): number{
                return this.appStore.commandsTabIndex;
            },
            set(index: number){
                this.appStore.commandsTabIndex = index;
            },
        },

        startMBSimulatorlDlgId(): string {
            return "startMBSimulatorlDlg";
        },

        isMBSimulatorRunning(): boolean {
            // Indicates when the users triggered the simulator
            return this.appStore.pythonExecRunningState == PythonExecRunningState.Running; 
        },
        // #v-endif

        commandsContainerUID(): string {
            return getCommandsContainerUID();
        },

        isEditing(): boolean {
            return this.appStore.isEditing;
        },

        isPythonExecuting(): boolean {
            return (this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning;
        },

        isFrameCommandsPaneActive(): boolean {
            return this.appStore.isFrameCommandsPaneActive;
        },

        isSlotShortcutsPaneActive(): boolean {
            return this.appStore.isSlotShortcutsPaneActive;
        },

        // Whether the slot shortcuts pane (record image/sound, colour picker) is currently valid to open:
        // only at the very start of a completely empty non-string, non-comment code slot -- see LabelSlot.vue's
        // processInput, which is what actually opens the pane once this condition holds and Space is pressed.
        // Re-checked here too since it also gates whether this row/pane is shown at all as a hint.
        canOpenSlotShortcutsPane(): boolean {
            const focusSlotCursorInfos = this.appStore.focusSlotCursorInfos;
            if(!this.appStore.isEditing || !focusSlotCursorInfos){
                return false;
            }
            const slotInfos = focusSlotCursorInfos.slotInfos;
            if(slotInfos.slotType == SlotType.comment || isSlotStringLiteralType(slotInfos.slotType)){
                return false;
            }
            const frameType = this.appStore.frameObjects[slotInfos.frameId]?.frameType.type;
            if(frameType == AllFrameTypesIdentifier.comment){
                return false;
            }
            if(focusSlotCursorInfos.cursorPos != 0){
                return false;
            }
            const slotContent = (document.getElementById(getLabelSlotUID(slotInfos)) as HTMLSpanElement | null)?.textContent?.replace(/\u200B/g, "") ?? "";
            return slotContent.length === 0;
        },

        slotShortcutsCommands(): {key: string; description: string; kind: "image" | "sound" | "colour"}[] {
            if(!this.canOpenSlotShortcutsPane){
                return [];
            }
            return [
                {key: "i", description: this.$t("autoCompletion.recordImageShortcut"), kind: "image"},
                {key: "s", description: this.$t("autoCompletion.recordSoundShortcut"), kind: "sound"},
                {key: "c", description: this.$t("autoCompletion.colourPickerShortcut"), kind: "colour"},
            ];
        },

        addFrameCommands(): Record<string, AddFrameCommandDef[]> {
            // Just use the flag data to bind this computed property to the flag, so that when the frame commands are changed, we can update the UI
            this.frameCommandsReactiveFlag;

            //We retrieve the add frame commands associated with the current frame 
            //if the frame is enabled, we always check, if it is disabled we return no frame when caret is body, and check when caret is below
            const currentFrame: FrameObject = this.appStore.getCurrentFrameObject;
            if(!currentFrame || (currentFrame.isDisabled && ((currentFrame.caretVisibility === CaretPosition.body) ? true : !this.appStore.canAddFrameBelowDisabled(currentFrame.id)))){
                return {};
            }

            return this.appStore.generateAvailableFrameCommands(this.appStore.currentFrame.id, this.appStore.currentFrame.caretPosition);
        },

        // When a text cursor is focused inside a code or string slot (but not a comment/documentation slot),
        // we show the code completion shortcut instead of the (then empty) list of add frame commands.
        // Note this shortcut is Ctrl+Space on every platform, including macOS (not Cmd+Space).
        codeCompletionCommand(): {ctrlSymbol: string; spaceSymbol: string; description: string} | null {
            const focusSlotCursorInfos = this.appStore.focusSlotCursorInfos;
            if(!this.appStore.isEditing || !focusSlotCursorInfos || focusSlotCursorInfos.slotInfos.slotType == SlotType.comment){
                return null;
            }

            const description = (isSlotStringLiteralType(focusSlotCursorInfos.slotInfos.slotType))
                ? this.$t("autoCompletion.codeCompletionFilePaths")
                : this.$t("autoCompletion.codeCompletion");

            return {ctrlSymbol: this.$t("contextMenu.ctrl"), spaceSymbol: this.$t("autoCompletion.spaceKey"), description};
        },

        // When the user has a text selection inside a code slot (not a comment/documentation slot, and not
        // a string literal slot -- wrapping a selection in quotes there wouldn't make sense), typing one of
        // these bracket/quote characters wraps the selection with it. We show those shortcuts here as a hint.
        wrapSelectionCommands(): {symbol: string; description: string}[] {
            const focusSlotCursorInfos = this.appStore.focusSlotCursorInfos;
            const anchorSlotCursorInfos = this.appStore.anchorSlotCursorInfos;
            if(!this.appStore.isEditing || !focusSlotCursorInfos || !anchorSlotCursorInfos){
                return [];
            }

            const hasSelection = !areSlotCoreInfosEqual(focusSlotCursorInfos.slotInfos, anchorSlotCursorInfos.slotInfos) || focusSlotCursorInfos.cursorPos != anchorSlotCursorInfos.cursorPos;
            const slotType = focusSlotCursorInfos.slotInfos.slotType;
            if(!hasSelection || slotType == SlotType.comment || isSlotStringLiteralType(slotType)){
                return [];
            }

            return [
                {symbol: "(", description: this.$t("autoCompletion.wrapRoundBrackets")},
                {symbol: "[", description: this.$t("autoCompletion.wrapSquareBrackets")},
                {symbol: "{", description: this.$t("autoCompletion.wrapCurlyBrackets")},
                {symbol: "\"", description: this.$t("autoCompletion.wrapDoubleQuotes")},
                {symbol: "'", description: this.$t("autoCompletion.wrapSingleQuotes")},
            ];
        },

        progressPercentWidthStyle(): string {
            return "width: " + this.progressPercent + "%;";
        },
    },

    created() {
        // Expose this component that other components might need.
        // Vue 3 has deprecated direct access to components.
        // (we don't set it in setup() because we want to have this accessible, and the component created!)
        vueComponentsAPIHandler.commandsComponentAPI = {
            onCommandsSplitterResize: this.onCommandsSplitterResize,
            resetPEACommmandsSplitterDefaultState: this.resetPEACommmandsSplitterDefaultState,
            setCommandsSplitterPane2Size: (value: number) => {
                this.commandsSplitterPane2Size= value;
            },
            openSlotShortcutsPane: this.openSlotShortcutsPane,
            canOpenSlotShortcutsPane: () => this.canOpenSlotShortcutsPane,
            // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
            setPEACommandsSplitterPanesMinSize: this.setPEACommandsSplitterPanesMinSize,
            setIsExpandedPEA: (value: boolean) => {
                this.isExpandedPEA = value;
            },
            setLogicalORHasPEAExpanded: (value: boolean) => {
                this.hasPEAExpanded ||= value;
            },
            setIsCommandsSplitterChanged: (value: boolean) => {
                this.isCommandsSplitterChanged = value;
            },
            // #v-endif
        };

        if(this.appStore.showKeystroke){
            window.addEventListener(
                "dblclick",
                () => {
                    (document.getElementById("keystrokeSpan") as HTMLSpanElement).textContent = "[double click]";
                    //leave the message for a short moment only
                    setTimeout(()=> (document.getElementById("keystrokeSpan") as HTMLSpanElement).textContent = "", 1000);    
                }
            );

            window.addEventListener(
                "mousedown",
                (event: MouseEvent) => {
                    let mouseButton = "unknown mouse click";
                    switch(event.button){
                    case 0:
                        mouseButton = "left click";
                        break;
                    case 1:
                        mouseButton = "middle click";
                        break;
                    case 2:
                        mouseButton = "right click";
                        break;
                    }
                    (document.getElementById("keystrokeSpan") as HTMLSpanElement).textContent = "["+mouseButton+"]";
                    //leave the message for a short moment only
                    setTimeout(()=> (document.getElementById("keystrokeSpan") as HTMLSpanElement).textContent = "", 1000);    
                }
            );
        }

        window.addEventListener(
            "keydown",
            (event: KeyboardEvent) => {
                if (event.repeat && !(!this.appStore.isEditing &&  ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Tab", "Home", "End"].includes(event.key))) {
                    // For all keys except Arrows when not editing, ignore all repeated keypresses, only process the initial press:
                    
                    // For enter, prevent repeat as this can cause issues, e.g. repeated triggering of the Run button on Mac:
                    if (event.key.toLowerCase() == "enter") {
                        event.preventDefault();
                    }
                    return;
                }

                const eventKeyLowCase = event.key.toLowerCase();
                const isPythonExecuting = ((this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning);
                const isEditing = this.appStore.isEditing;
                const isDraggingFrames = this.appStore.isDraggingFrame;
                
                //if we requested to log keystroke, display the keystroke event in an unobtrusive location
                //when editing, we don't show the keystroke for basic keys (like [a-zA-Z0-1]), only those whose key value is longer than 1
                if(this.appStore.showKeystroke && (!isEditing || event.key.match(/^.{2,}$/))){
                    (document.getElementById("keystrokeSpan") as HTMLSpanElement).textContent = "["+event.key+"]";
                    //leave the message for a short moment only
                    setTimeout(()=> (document.getElementById("keystrokeSpan") as HTMLSpanElement).textContent = "", 1000);         
                }

                // If a modal is open, we let the event be handled by the browser
                if(this.appStore.isModalDlgShown){
                    return;
                }

                // While the frame commands pane is focused (entered via Tab/Space at the frame caret),
                // it owns all keydown handling until a frame is inserted or Escape is hit. Same
                // mechanism for the slot shortcuts pane just below (entered via Space at the start of
                // an empty non-string code slot, or adjacent to a colour literal -- see LabelSlot.vue's
                // processInput/onKeyDown and openSlotShortcutsPane below) -- see dispatchToPaneIfActive.
                const setFrameCommandsPaneInactive = () => this.appStore.isFrameCommandsPaneActive = false;
                if(this.dispatchToPaneIfActive(event, this.appStore.isFrameCommandsPaneActive, "#addFramePanel", this.handleFrameCommandsPaneKeyDown, setFrameCommandsPaneInactive)){
                    return;
                }
                const setSlotShortcutsPaneInactive = () => this.appStore.isSlotShortcutsPaneActive = false;
                if(this.dispatchToPaneIfActive(event, this.appStore.isSlotShortcutsPaneActive, "#addSlotShortcutsPanel", this.handleSlotShortcutsPaneKeyDown, setSlotShortcutsPaneInactive)){
                    return;
                }

                if(!isDraggingFrames && (event.ctrlKey || event.metaKey)) {
                    // Undo-redo
                    if(eventKeyLowCase === "z" || eventKeyLowCase === "y"){
                        if(!isPythonExecuting) {
                            this.appStore.undoRedo((eventKeyLowCase === "z"));
                        }
                        event.preventDefault();
                        return;
                    }          
                    
                    // Select all - we only need to interfere with the frame selection (i.e. when not editing slots).
                    // Selecting all frames selects all the frames of the current frame container (e.g. "imports" or "main code")
                    // and position the caret at the bottom of the selection.
                    // For function definitions, however, we use a slightly different approach: we have "intermediate" selection steps:
                    // function's body > whole function > all functions (that last case is equivalent to as mentioned for "imports" and "main code")
                    if(eventKeyLowCase === "a" && !isEditing){ 
                        if(getActiveContextMenu() == null && !this.appStore.isAppMenuOpened){
                            const frameContainerId = getFrameSectionIdFromFrameId(this.appStore.currentFrame.id);
                            // If a selection already exists, we clear it, after checking where we are at with respect to the select-all action to take
                            const selectAllFramesAction = getCurrentFrameSelectAllAction();
                            this.appStore.unselectAllFrames();
                            switch(selectAllFramesAction){
                            case SelectAllFramesAction.wholeContainer:
                                // In imports or main code. Or in definitions section  with some items selected.
                                // Position the frame cursor inside the body of the frame container
                                this.appStore.setCurrentFrame({id: frameContainerId, caretPosition: CaretPosition.body});
                                // And select all the children frame of the container (if any...)
                                this.appStore.frameObjects[frameContainerId].childrenIds.forEach(() => {
                                    this.appStore.selectMultipleFrames("ArrowDown");
                                });     
                                break;
                            case SelectAllFramesAction.functionOrClassContents:
                            case SelectAllFramesAction.currentLevel: {
                                let selectAllOfId;
                                let currentFrameId = this.appStore.currentFrame.id;
                                if (selectAllFramesAction == SelectAllFramesAction.currentLevel) {
                                    selectAllOfId = this.appStore.frameObjects[currentFrameId].parentId;
                                }
                                else {
                                    // We need to find the nearest parent that is a class or function
                                    let parentId = 0, foundFunctionDefFrame = false;
                                    // The second part is a fail safe to prevent an infinite loop, just in case:
                                    while (!foundFunctionDefFrame && currentFrameId != useStore().defsContainerId) {
                                        parentId = this.appStore.frameObjects[currentFrameId].parentId;
                                        foundFunctionDefFrame = this.appStore.frameObjects[parentId].frameType.type == AllFrameTypesIdentifier.funcdef
                                            || this.appStore.frameObjects[parentId].frameType.type == AllFrameTypesIdentifier.classdef;
                                        currentFrameId = parentId;
                                    }
                                    selectAllOfId = parentId;
                                }
                                this.appStore.setCurrentFrame({id: selectAllOfId, caretPosition: CaretPosition.body});
                                // And select all the children frame of the container (if any...)
                                this.appStore.frameObjects[selectAllOfId].childrenIds.forEach(() => {
                                    this.appStore.selectMultipleFrames("ArrowDown");
                                });
                                break;
                            }
                            case SelectAllFramesAction.parent:
                                // In function definitions with function body frames selected.
                                // We select the whole function.
                                {
                                    const functionFrameId = (this.appStore.currentFrame.caretPosition == CaretPosition.body) 
                                        ? this.appStore.currentFrame.id 
                                        : this.appStore.frameObjects[this.appStore.currentFrame.id].parentId; 
                                    this.appStore.setCurrentFrame({id: functionFrameId, caretPosition: CaretPosition.below});
                                    // And select the function going upwards
                                    this.appStore.selectMultipleFrames("ArrowUp");
                                    // And reposition the caret below for consistency with other select-all conditions
                                    this.appStore.setCurrentFrame({id: functionFrameId, caretPosition: CaretPosition.below});    
                                }
                                break;
                            default:                                            
                                break;
                            }
                        }
                        event.preventDefault();
                        return;
                    }
                }
                
                // If ctrl-enter/cmd-enter is pressed, make sure we quit the editing (if that's the case) and run the code
                let isTargetRefDefined = false;
                // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
                isTargetRefDefined = !!this.$refs[getPEAComponentRefId()];
                // #v-else
                isTargetRefDefined = (mbSimulator != null);
                // #v-endif
                if((event.ctrlKey || event.metaKey) && eventKeyLowCase === "enter" && isTargetRefDefined) {
                    // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
                    vueComponentsAPIHandler.peaComponentAPI?.focusClickRunButton();
                    // Need to unfocus to avoid keyboard focus non-obviously remaining with the run button:
                    vueComponentsAPIHandler.peaComponentAPI?.blurRunButton();
                    // #v-else
                    // If the run Python shortcut is triggered with the micro:bit version, we start/stop the simulator.                        
                    if(event.ctrlKey){
                        if(this.isMBSimulatorRunning) {
                            this.stopMBSimulator();
                        } 
                        else {
                            // The micro:bit simulator do not support non-user interaction for a flash request.
                            // So we just tell the user here what to do...
                            this.appStore.simpleModalDlgMsg = this.$t("appMessage.startMBSimulatorNeedUserAction");
                            eventBus.emit(CustomEventTypes.showStrypeModal, this.startMBSimulatorlDlgId);                            
                        }
                    }
                    // #v-endif
                    
                    // Don't then process the keypress for other purposes:
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    return;
                }

                // If a context menu is currently displayed, we handle the menu keyboard interaction here
                // (note that preventing the event here also prevents the keyboard scrolling of the page)
                if(!isEditing && this.appStore.contextMenuShownId.length > 0 && getActiveContextMenu()){
                    event.stopImmediatePropagation();
                    event.preventDefault();
                    return;
                }

                // Tab or Space at the frame caret opens the frame commands pane (letting the user then
                // either press a shortcut letter, or arrow to a command and press Enter) instead of their
                // usual jobs (Tab normally moves to the next navigable position, Space normally inserts a
                // func-call frame directly). If there's nothing insertable here, we fall through so Tab/Space
                // keep their old behaviour (matching what happens today when the panel is empty). Ctrl/Meta
                // must be excluded here so Ctrl+Space keeps doing its own thing below (insert + autocomplete).
                // Also works with a frame selection active (this.addFrameCommands is already filtered down
                // to wrap-capable types in that case -- see generateAvailableFrameCommands in store.ts), so
                // this deliberately isn't gated on selectedFrames.length === 0: that used to block it
                // entirely, leaving Space's other job -- opening the frame context menu when frames are
                // selected, see App.vue -- as the only thing Space did with a selection, and no keyboard way
                // left to wrap one. See the matching change there.
                if(!isEditing && !isDraggingFrames && !isPythonExecuting && !this.appStore.isAppMenuOpened
                    && !event.ctrlKey && !event.metaKey
                    && (event.key === "Tab" || event.key === " ") && Object.keys(this.addFrameCommands).length > 0){
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    event.stopPropagation();
                    this.openFrameCommandsPane();
                    return;
                }

                // Prevent default scrolling and navigation in the editor, except if Python is currently running
                // (then we just leave the PEA handling it, see at the end of these conditions for related code)
                let extraConditionsForPEA = true;
                // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
                extraConditionsForPEA = !isPythonExecuting;
                // #v-endif
                if (!isDraggingFrames && !isEditing && extraConditionsForPEA && ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Tab", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
                    event.stopImmediatePropagation();
                    event.stopPropagation();
                    event.preventDefault();
                    
                    if(this.appStore.ignoreKeyEvent){
                        this.appStore.ignoreKeyEvent = false;
                        return;
                    }
                    
                    if (event.key === "ArrowDown" || event.key === "ArrowUp" ) {
                        if(event.shiftKey){
                            this.appStore.selectMultipleFrames(event.key);
                        }
                        else {
                            // The navigation is "level scope" when the ctrl key is pressed (alt key for macOS)
                            this.appStore.changeCaretPosition(event.key, ((event.ctrlKey && !isMacOSPlatform()) || (event.altKey && isMacOSPlatform())));
                        }
                    }
                    else if(event.key == "Home" || event.key == "End"){
                        // For the "home" and "end" key, we move the blue caret to the first or last position of the current main section the caret is in.
                        // If the ctrl key is used together with home/end, we go to the very start/end of the editor (i.e. import section*/below last frame in main)
                        // (*) the very top of the editor is actually the project documentation slot, but it is not a frame proper and the frame cursor can't go above
                        // This is overriding the natural browser behaviour that scrolls to the top or bottom of the page (at least with Chrome)
                        const sectionId = (event.ctrlKey) ? this.appStore.getMainCodeFrameContainerId :  getFrameSectionIdFromFrameId(this.appStore.currentFrame.id);
                        const isSectionEmpty = (this.appStore.frameObjects[sectionId].childrenIds.length == 0);
                        const isMovingHome = (event.key == "Home");
                        const firstVisibleSectionId = [this.appStore.importContainerId, this.appStore.defsContainerId, this.appStore.getMainCodeFrameContainerId]
                            .find((frameContainerId) => (this.appStore.frameObjects[frameContainerId].collapsedState ?? CollapsedState.FULLY_VISIBLE) == CollapsedState.FULLY_VISIBLE) as number;
                        const newCaretId = (isMovingHome || isSectionEmpty) 
                            ? ((isMovingHome && event.ctrlKey) ? firstVisibleSectionId : sectionId) 
                            : this.appStore.frameObjects[sectionId].childrenIds.at(-1) as number;
                        const newCaretPosition = (isMovingHome || isSectionEmpty) ? CaretPosition.body : CaretPosition.below;
                        this.appStore.toggleCaret({id: newCaretId, caretPosition: newCaretPosition});
                    }
                    else if(event.key == "PageUp" || event.key == "PageDown"){
                        // For the "PageUp" and "PageDown", we "scroll" up/down the frame cursor.
                        const viewportTop = window.scrollY;
                        const viewportBottom = viewportTop + window.innerHeight;
                        const allNotCollapsedFrameCursorPos = getAvailableNavigationPositions(true).filter((navigationPos) => navigationPos.caretPosition);
                        let ourCurrentPositionIndex = allNotCollapsedFrameCursorPos.findIndex((navigationPos) => navigationPos.caretPosition == this.appStore.currentFrame.caretPosition && navigationPos.frameId == this.appStore.currentFrame.id);
                        if(ourCurrentPositionIndex > -1){
                            // We approximate some scroll page number of carets to offset by counting how many carets positions are in the viewport.
                            const lookCaretBefore = (event.key == "PageUp");
                            const numberOfCaretPosInViewPort = allNotCollapsedFrameCursorPos
                                .filter((navigationPos) => {
                                    const caretHTMLEl = document.getElementById(getCaretContainerUID(navigationPos.caretPosition as CaretPosition, navigationPos.frameId));
                                    const caretHTMLElBoundingBox = caretHTMLEl?.getBoundingClientRect()??null;
                                    if(caretHTMLElBoundingBox){
                                        return caretHTMLElBoundingBox.top >= 0 && (caretHTMLElBoundingBox.top + caretHTMLElBoundingBox.height) <= viewportBottom;                                        
                                    }
                                    return false;

                                })
                                .length;

                            // We clamp the value to the boundary index of allNotCollapsedFrameCursorPos
                            const caretPosToScrollToIIndex = clamp(ourCurrentPositionIndex + numberOfCaretPosInViewPort * (lookCaretBefore ? -1 : 1), 0, allNotCollapsedFrameCursorPos.length - 1);
                            const caretPosToScrollTo = allNotCollapsedFrameCursorPos[caretPosToScrollToIIndex];
                            this.appStore.toggleCaret({id: caretPosToScrollTo.frameId, caretPosition: caretPosToScrollTo.caretPosition as CaretPosition});
                        }
                    }
                    else{
                        // At this stage, tab and left/right arrows are handled only if not editing: editing cases are directly handled by LabelSlotsStructure.
                        // We start by getting from the DOM all the available caret and editable slot positions
                        this.appStore.leftRightKey({ key: event.key, isShiftKeyHold: event.shiftKey});
                    }
                    return;
                }

                const ignoreKeyEvent = this.appStore.ignoreKeyEvent;

                if(event.key != "Escape"){
                    if(!isEditing && !this.appStore.isAppMenuOpened && !isPythonExecuting && !isDraggingFrames){
                        // Cases when there is no editing:
                        if(!(event.ctrlKey || event.metaKey)){
                            if(event.key == "Delete" || event.key == "Backspace"){
                                if(!ignoreKeyEvent && !event.repeat){
                                    //delete a frame or a frame selection
                                    this.appStore.deleteFrames(event.key);
                                    event.stopImmediatePropagation();
                                }
                                else{
                                    this.appStore.ignoreKeyEvent = false;
                                }
                            }
                            // Everything else that can insert a frame requires the Tab/Space prefix (frame
                            // commands pane) first, except for these three shortcuts which stay direct:
                            else if(alwaysDirectFrameShortcutKeys.includes(eventKeyLowCase)){
                                if(!ignoreKeyEvent){
                                    event.stopImmediatePropagation();
                                    event.stopPropagation(),
                                    event.preventDefault();
                                    this.insertFrameForShortcutKey(eventKeyLowCase);
                                }
                                else{
                                    this.appStore.ignoreKeyEvent = false;
                                }
                            }
                            // Typing any other single printable character (not Alt-held -- Ctrl/Meta are already
                            // excluded above -- and not a key like F1/Escape/ArrowLeft, which all have a
                            // multi-character event.key) starts a func-call frame with that character as the
                            // beginning of its name, and there's no frame selection to interfere with. Not
                            // gated on this.addFrameCommands["c"] (whether func-call is currently offered as a
                            // pane command) -- containers that forbid it (Imports/Definitions) correctly don't
                            // offer it there as a pane command, but bare typing must still work as the generic
                            // "type anything, get an error later if it's wrong here" fallback everywhere,
                            // same as it already does in Main/bodies -- see the "frame not allowed here" check
                            // (setFrameErroneous/atParsingError in store.ts) that flags it afterwards instead
                            // of pre-emptively blocking the keystroke. "#"/"=" need no separate exclusion here:
                            // the alwaysDirectFrameShortcutKeys branch above already claims them (this is an
                            // else-if chain) -- only space needs excluding, since it opens/closes the pane
                            // instead (handled elsewhere) rather than being in that list.
                            else if(!event.altKey && event.key.length === 1 && event.key !== " "
                                && this.appStore.selectedFrames.length === 0){
                                if(!ignoreKeyEvent){
                                    event.stopImmediatePropagation();
                                    event.stopPropagation();
                                    event.preventDefault();
                                    this.createFuncCallFrameFromTypedChar(event.key);
                                }
                                else{
                                    this.appStore.ignoreKeyEvent = false;
                                }
                            }
                        }
                        else if(event.key == " " && this.appStore.selectedFrames.length == 0){
                            const currentStrypeLocation = findCurrentStrypeLocation().strypeLocation;
                            if(currentStrypeLocation == STRYPE_LOCATION.MAIN_CODE_SECTION || currentStrypeLocation == STRYPE_LOCATION.IN_FUNCDEF){
                                // If ctrl/meta + space is activated on caret (in a function/class definition or in the main section), we add a new functional call frame and trigger the a/c.
                                // Looked up directly (not via this.addFrameCommands[" "]) since func-call's own
                                // shortcut is "c" now, not Space -- see FuncCallDefinition's entry in
                                // allFrameCommandsDefs (editor.ts).
                                // We must wait for addFrameWithCommand() to fully finish -- including its internal
                                // cursor placement into the new frame's first slot -- before re-dispatching ctrl-space:
                                // a single $nextTick() isn't always enough (that placement can itself need more than
                                // one tick, e.g. for a frame added deep inside a freshly-created class/method), and a
                                // too-early redispatch finds no focused slot to forward to and is silently dropped,
                                // leaving auto-complete never triggered.
                                this.appStore.addFrameWithCommand(getFrameDefType(AllFrameTypesIdentifier.funccall)).then(() => {
                                    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown",{key: " ", ctrlKey: true}));
                                });
                                this.appStore.trackFrameInsert(AllFrameTypesIdentifier.funccall, "shortcut_key");
                            }
                        }
                    }
                }
                else if(this.appStore.isDraggingFrame){
                    // Hitting escape during a DnD cancels it.
                    notifyDragEnded();
                }

                //prevent default browser behaviours when an add frame command key is typed (letters and spaces) (e.g. Firefox "search while typing")
                if(!isEditing && !this.appStore.isAppMenuOpened && !(event.ctrlKey || event.metaKey) && (event.key.match(/^[a-z A-Z=]$/) || event.key === "Backspace")){
                    event.preventDefault();
                    return;
                }
            }
        );

        document.addEventListener(CustomEventTypes.editorAddFrameCommandsUpdated, () => {
            // When the frame commands have been updated (i.e. language changed), we need to get this component to be re-rendered:
            // we use this reactive flag to trigger the recomputation of the computed property addFrameCommands
            this.frameCommandsReactiveFlag = !this.frameCommandsReactiveFlag;
        });

        // See suppressNextEscapeKeyUp's own comment (data()): this must run in the CAPTURE phase (root
        // to target), not the usual bubble phase, so it runs *before* LabelSlot.vue's own
        // "keyup.esc"-bound onEscKeyUp handler on the slot's span -- by the time a bubble-phase listener
        // on window (like the one just below) would run, bubbling has already reached and fired every
        // listener on the way up, including that one.
        document.addEventListener(
            "keyup",
            (event: KeyboardEvent) => {
                if(this.suppressNextEscapeKeyUp && event.key === "Escape"){
                    this.suppressNextEscapeKeyUp = false;
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    event.stopPropagation();
                }
            },
            true
        );

        // Companion to the frame commands pane's Enter handling in handleFrameCommandsPaneKeyDown() above
        // (see the comment there): the actual activation of the focused command happens on keyup, not
        // keydown, so that moving focus into the newly-inserted frame only happens once this key press's
        // keydown/keyup pair is otherwise finished.
        window.addEventListener(
            "keyup",
            (event: KeyboardEvent) => {
                const activateFocusedButtonOnEnter = (isPaneActive: boolean, containerSelector: string) => {
                    if(isPaneActive && event.key === "Enter" && document.activeElement?.closest(containerSelector)){
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        event.stopPropagation();
                        (document.activeElement as HTMLElement).click();
                    }
                };
                activateFocusedButtonOnEnter(this.appStore.isFrameCommandsPaneActive, "#addFramePanel");
                activateFocusedButtonOnEnter(this.appStore.isSlotShortcutsPaneActive, "#addSlotShortcutsPanel");
            }
        );
    },

    mounted() {
        //scroll events on the left pane (menu) and right pane (commands) are forwarded to the editor
        document.getElementById(getMenuLeftPaneUID())?.addEventListener(
            "wheel",
            this.handleAppScroll,
            false
        );

        document.getElementById(getCommandsRightPaneContainerId())?.addEventListener(
            "wheel",
            this.handleAppScroll,
            false
        );

        // Belt-and-braces alongside the lazy check in the keydown handler: if focus leaves the frame
        // commands pane to somewhere outside it (e.g. a mouse click elsewhere), close pane mode eagerly
        // rather than waiting for the next keydown to notice.
        document.getElementById("addFramePanel")?.addEventListener("focusout", (event: FocusEvent) => {
            const relatedTarget = event.relatedTarget as HTMLElement | null;
            if(!relatedTarget?.closest("#addFramePanel")){
                this.appStore.isFrameCommandsPaneActive = false;
            }
        });

        // Unlike #addFramePanel above, #addSlotShortcutsPanel is only rendered (v-if) while it has
        // content to show, so it doesn't necessarily exist yet at mount time to attach a listener to
        // directly -- attached on document instead (focusout bubbles) and filtered by event.target.
        document.addEventListener("focusout", (event: FocusEvent) => {
            const target = event.target as HTMLElement | null;
            if(!target?.closest("#addSlotShortcutsPanel")){
                return;
            }
            const relatedTarget = event.relatedTarget as HTMLElement | null;
            if(!relatedTarget?.closest("#addSlotShortcutsPanel")){
                this.appStore.isSlotShortcutsPaneActive = false;
            }
        });

        // #v-ifdef STRYPE_PLATFORM == VITE_MICROBIT_MODE
        mbSimulator = (document.querySelector("#mbSimulatorIframe") as HTMLIFrameElement)?.contentWindow;
        window.addEventListener("blur", this.handleMBSimulatorTakesFocus);        
        window.addEventListener("message", this.onMicrobitSimulatorMsgReceived);
        // #v-endif
    },

    methods: {
        addFrameCommandUID(commandType: string): string {
            return getAddFrameCmdElementUID(commandType);
        },

        // Inserts the frame matching this (lowercased) shortcut key -- by its original shortcut, its
        // legacy shortcut (see getLegacyShortcut, editor.ts), or a hidden shorthand -- exactly as the
        // direct top-level dispatch always has. Returns whether a match was found and dispatched, so
        // callers can leave non-matching keys as a no-op. Shared between the always-direct shortcuts
        // (Enter/#/=, handled above regardless of the frame commands pane) and the pane's own
        // shortcut-letter handling (handleFrameCommandsPaneKeyDown), where every shortcut is fair
        // game once the pane is focused.
        insertFrameForShortcutKey(eventKeyLowCase: string): boolean {
            const isHiddenShorthandFrameCommand = (hiddenShorthandFrames[eventKeyLowCase] !== undefined
                && Object.values(this.addFrameCommands).flat().flatMap((addFrameDef) => addFrameDef.type.type).includes(hiddenShorthandFrames[eventKeyLowCase].type.type));

            if(this.addFrameCommands[eventKeyLowCase] === undefined
                && Object.values(this.addFrameCommands).find((addFrameCmdDef) => getLegacyShortcut(addFrameCmdDef[0]) == eventKeyLowCase) === undefined
                && !isHiddenShorthandFrameCommand){
                return false;
            }

            if(isHiddenShorthandFrameCommand) {
                // Adding a shorthand frame required to 1) add the frame itself
                const shorthandDef = hiddenShorthandFrames[eventKeyLowCase];
                this.appStore.addFrameWithCommand(shorthandDef.type, shorthandDef);
                this.appStore.trackFrameInsert(shorthandDef.type.type, "shortcut_key");
            }
            else{
                // We can add the frame by its original shortcut or legacy one
                const isOriginalShortcut = (this.addFrameCommands[eventKeyLowCase] != undefined);
                const resolvedType = (isOriginalShortcut)
                    ? this.addFrameCommands[eventKeyLowCase][0].type
                    : (Object.values(this.addFrameCommands).find((addFrameCmdDef) => getLegacyShortcut(addFrameCmdDef[0]) == eventKeyLowCase) as AddFrameCommandDef[])[0].type;
                this.appStore.addFrameWithCommand(resolvedType);
                this.appStore.trackFrameInsert(resolvedType.type, "shortcut_key");
            }
            return true;
        },

        // Typing any other printable character at the bare frame caret creates an (empty) func-call
        // frame, then feeds the typed character into its name slot through the same "paste into a slot"
        // pipeline LabelSlot.vue already uses for real pastes (onCodePasteImpl, invoked here via the
        // contentPastedInSlot custom event on the newly-focused slot) -- rather than setting the slot's
        // code directly -- so bracket/quote pairing and any other slot-splitting logic that already
        // applies when typing a character into a slot keeps working here too (e.g. typing "(" or '"'
        // still auto-pairs, since it's genuinely going through the same code path as typing it into a
        // slot, just retargeted at a freshly created one). Mirrors the existing ctrl-space-redispatch
        // pattern below (waiting for addFrameWithCommand()'s own promise, which only resolves once the
        // new frame's first slot is genuinely focused, before dispatching to document.activeElement).
        createFuncCallFrameFromTypedChar(typedChar: string): void {
            // Looked up directly rather than via this.addFrameCommands["c"] -- that's filtered down to
            // whatever's valid to offer as a pane command at the current position (see the caller's
            // comment for containers that exclude it), but it must still be creatable here.
            // Unlike the explicit "c" pane command, we don't pre-fill the default "()" brackets here:
            // the user is just typing (e.g. the start of "if"/"while"/"return"), and the frame may well
            // get converted away from func-call entirely once LabelSlotsStructure.vue's funccall->
            // keyword-frame/varassign conversion kicks in -- see skipFuncCallBrackets's own comment.
            this.appStore.trackFrameInsert(AllFrameTypesIdentifier.funccall, "typed");
            this.appStore.addFrameWithCommand(getFrameDefType(AllFrameTypesIdentifier.funccall), undefined, true).then((newFrameId: number) => {
                // Target the new frame's name slot explicitly (rather than document.activeElement):
                // its own name slot isn't necessarily what ends up focused by the time this promise
                // resolves (e.g. autocomplete-related focus shifts can already be underway), so we
                // address it directly by the frame ID addFrameWithCommand() just gave us.
                const nameSlotUID = getLabelSlotUID({frameId: newFrameId, labelSlotsIndex: 0, slotId: "0", slotType: SlotType.code});
                document.getElementById(nameSlotUID)?.dispatchEvent(new CustomEvent(CustomEventTypes.editorContentPastedInSlot, {detail: {type: "text", content: typedChar, skipStateSave: true}}));
            });
        },

        // All command buttons currently in the given space-triggered command pane (the frame commands
        // pane or the slot shortcuts pane), in DOM order.
        getPaneButtons(containerSelector: string): HTMLButtonElement[] {
            return Array.from(document.querySelectorAll(`${containerSelector} .frame-cmd-btn`)) as HTMLButtonElement[];
        },

        // If the pane flagged active by isPaneActive still has focus within it, dispatches the keydown
        // to its own handler and reports it as consumed (the caller should return immediately). If the
        // flag is stale -- focus left the pane some other way, e.g. a mouse click elsewhere -- clears it
        // via setInactive() instead, so a stale flag doesn't hijack normal keydown handling below.
        // Shared by both the frame commands pane and the slot shortcuts pane in the top-level keydown
        // listener above.
        dispatchToPaneIfActive(event: KeyboardEvent, isPaneActive: boolean, containerSelector: string,
            handler: (event: KeyboardEvent) => void, setInactive: () => void): boolean {
            if(!isPaneActive){
                return false;
            }
            if(document.activeElement?.closest(containerSelector)){
                handler(event);
                return true;
            }
            setInactive();
            return false;
        },

        // Handles all keydown events while a space-triggered command pane (the frame commands pane or
        // the slot shortcuts pane) is focused: arrow keys cycle between command buttons, Enter activates
        // whichever one is currently focused (same as a mouse click, done on keyup instead of keydown --
        // see the "keyup" listener in created() -- because focused <button> elements natively
        // self-activate (synthesise a click) on Enter keydown, and if we let that happen -- or trigger
        // our own click here -- focus can move to whatever the command inserts/opens *before* this same
        // physical key press's keyup fires; that keyup would then land somewhere else entirely and be
        // reacted to there, e.g. immediately leaving a newly-focused slot again. Same fix Menu.vue
        // already uses for its own Enter-confirms-selection handling), shouldClose's keys close the pane
        // and hand off to onClose (e.g. Escape, and whatever else re-toggles shut the way it was opened),
        // and any other key is tried as a direct shortcut letter via onActivateKey.
        handlePaneKeyDown(event: KeyboardEvent, options: {
            containerSelector: string,
            shouldClose: (event: KeyboardEvent) => boolean,
            onClose: (event: KeyboardEvent) => void,
            shouldCycle: (event: KeyboardEvent) => boolean,
            onActivateKey: (key: string) => void,
        }): void {
            event.stopImmediatePropagation();
            event.stopPropagation();

            if(options.shouldClose(event)){
                event.preventDefault();
                options.onClose(event);
                return;
            }

            if(event.key === "Enter"){
                event.preventDefault();
                return;
            }

            if(options.shouldCycle(event)){
                // Only this needs the current button list/position -- everything above is handled
                // (and returns) without it.
                const buttons = this.getPaneButtons(options.containerSelector);
                const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
                event.preventDefault();
                if(buttons.length > 0){
                    const delta = (event.key === "ArrowDown" || event.key === "ArrowRight") ? 1 : -1;
                    buttons[(currentIndex + delta + buttons.length) % buttons.length].focus();
                }
                return;
            }

            // Any other key: try it as a direct shortcut letter (a no-op if it doesn't match anything).
            event.preventDefault();
            options.onActivateKey(event.key.toLowerCase());
        },

        // Opens the frame commands pane: moves real DOM focus onto the first available command button.
        // addFrameWithCommand() (store.ts) resets isFrameCommandsPaneActive itself once a frame is
        // actually inserted, so the only explicit close path needed here is Escape (closeFrameCommandsPane).
        openFrameCommandsPane(): void {
            this.appStore.isFrameCommandsPaneActive = true;
            // The first ".frame-cmd-btn" in DOM order isn't necessarily the one currently shown
            // (some commands, e.g. func-call's own "space" shortcut, aren't always applicable at
            // the current caret position) -- focusing a hidden button is a silent no-op, which
            // leaves focus outside #addFramePanel entirely and makes the very next keydown handler
            // think the pane was never actually entered (see the isFrameCommandsPaneActive check
            // above), so it falls through and treats a following shortcut letter as a literal typed
            // character instead. (This also relies on the Commands tab switch above -- see
            // validateSlot() in store.ts -- being instant: BTabs is set `no-fade` for exactly this
            // reason, otherwise its buttons would stay display:none for the fade's duration.)
            const firstAvailableButton = this.getPaneButtons("#addFramePanel").find((button) => !button.disabled && button.offsetParent !== null);
            firstAvailableButton?.focus();
        },

        closeFrameCommandsPane(returnFocusToCaret: boolean): void {
            this.appStore.isFrameCommandsPaneActive = false;
            if(returnFocusToCaret){
                document.getElementById(getFrameUID(this.appStore.currentFrame.id))?.focus();
            }
        },

        // Plain Tab and Space both close the pane and return to the frame caret, same as Escape:
        // they're what opened the pane in the first place (at the bare frame caret), so a second press
        // toggles it shut again, the same way you'd expect of any open/close key -- arrow keys are the
        // dedicated way to navigate between buttons once the pane is open, so Tab isn't needed for that
        // too, and Space no longer doubles as a func-call shortcut (that's "c" now, see
        // allFrameCommandsDefs in editor.ts), so it's free for this instead. Shift+Tab falls through to
        // shouldCycle below instead of closing, cycling backwards like ArrowUp/ArrowLeft.
        handleFrameCommandsPaneKeyDown(event: KeyboardEvent): void {
            this.handlePaneKeyDown(event, {
                containerSelector: "#addFramePanel",
                shouldClose: (e) => e.key === "Escape" || e.key === " " || (e.key === "Tab" && !e.shiftKey),
                onClose: () => this.closeFrameCommandsPane(true),
                shouldCycle: (e) => ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Tab"].includes(e.key),
                onActivateKey: (key) => this.insertFrameForShortcutKey(key),
            });
        },

        // Opens the slot shortcuts pane: moves real DOM focus onto the first command button, mirroring
        // openFrameCommandsPane() above. Called from LabelSlot.vue's processInput once it's determined
        // Space was pressed at the start of a completely empty non-string/comment code slot.
        openSlotShortcutsPane(): void {
            if(!this.canOpenSlotShortcutsPane){
                return;
            }
            this.appStore.isSlotShortcutsPaneActive = true;
            // Moving DOM focus away from the slot below would otherwise trigger LabelSlotsStructure.vue's
            // blurEditableSlot() in full (error-checking, prepend-text updates, etc.) -- same suppression
            // LabelSlot.vue's own triggerMediaRecording/triggerColourPicker already use before moving
            // focus to their modal dialogs, needed here for the same reason (this flag is consumed/reset
            // by blurEditableSlot() itself the next time it runs).
            this.appStore.ignoreBlurEditableSlot = true;
            // The keystroke/click that originally put the caret into this (empty) slot already scheduled
            // LabelSlot.vue's onGetCaret() delayed re-selection (its "on Firefox, force the focus" branch
            // for empty slots) -- left alone, that still-pending callback fires shortly after we move focus
            // to the button below and silently steals it back. bumpCaretRequestSeq() invalidates it, the
            // same fix used for the identical race in LabelSlotsStructure.vue's checkSlotRefactoring().
            bumpCaretRequestSeq();
            // This is called from inside the contenteditable slot's own native "input" event handling
            // (see LabelSlot.vue's processInput) -- on Firefox/WebKit, moving focus away within that same
            // call stack/microtask queue can be silently overridden once the browser finishes its own
            // internal focus/selection bookkeeping for the edit that's still in flight. A macrotask
            // (rather than $nextTick's microtask) defers this until after that's genuinely done.
            setTimeout(() => {
                this.getPaneButtons("#addSlotShortcutsPanel")[0]?.focus();
            }, 0);
        },

        // Restoring focus into the (still-empty) slot needs a real focus() call, not just
        // setDocumentSelection() -- and crucially, it must target the label's own *containing*
        // contenteditable element (getFrameLabelSlotsStructureUID), not the individual slot's span:
        // each slot is a contenteditable <span> nested inside further contenteditable ancestors (its
        // own wrapper div, and the whole label row), and once editing is underway, real DOM focus is
        // actually held by that outermost row container, not by any individual span -- see
        // LabelSlotsStructure.vue's own comment ("the spans don't get focus anymore because the
        // containing editable div grabs it") and the identical pattern already used to move focus
        // *away* from a slot (changeCaretWithKeyboard-adjacent code there). setDocumentSelection() then
        // places the actual text cursor within that now-focused container, exactly as it does for a
        // normal click (LabelSlot.vue's onGetCaret).
        closeSlotShortcutsPane(): void {
            this.appStore.isSlotShortcutsPaneActive = false;
            const focusSlotCursorInfos = this.appStore.focusSlotCursorInfos;
            if(focusSlotCursorInfos){
                const targetSlotInfos = focusSlotCursorInfos.slotInfos;
                const cursorInfo = {slotInfos: targetSlotInfos, cursorPos: 0};
                document.getElementById(getFrameLabelSlotsStructureUID(targetSlotInfos.frameId, targetSlotInfos.labelSlotsIndex))?.focus();
                setDocumentSelection(cursorInfo, cursorInfo);
                this.appStore.setSlotTextCursors(cursorInfo, cursorInfo);
            }
        },

        // Escape/Space/Tab close the pane and return focus to the slot (closeSlotShortcutsPane()) --
        // Tab and Space are what opened it in the first place (see LabelSlotsStructure.vue's
        // forwardKeyEvent), same as the frame commands pane below; any other key is tried as a direct
        // shortcut letter against slotShortcutsCommands.
        handleSlotShortcutsPaneKeyDown(event: KeyboardEvent): void {
            this.handlePaneKeyDown(event, {
                containerSelector: "#addSlotShortcutsPanel",
                shouldClose: (e) => e.key === "Escape" || e.key === " " || (e.key === "Tab" && !e.shiftKey),
                onClose: (e) => {
                    if(e.key === "Escape"){
                        this.suppressNextEscapeKeyUp = true;
                    }
                    this.closeSlotShortcutsPane();
                },
                shouldCycle: (e) => ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Tab"].includes(e.key),
                onActivateKey: (key) => {
                    const matchingCommand = this.slotShortcutsCommands.find((command) => command.key === key);
                    if(matchingCommand){
                        this.triggerSlotShortcut(matchingCommand.kind);
                    }
                },
            });
        },

        // Dispatches to the focused LabelSlot instance's own triggerMediaRecording/triggerColourPicker
        // via the shared component API registry -- used both for a direct click on a pane button and
        // for the pane's own keyboard activation (Enter or a shortcut letter). This is now the *only*
        // way to reach these actions (see LabelSlot.vue's onKeyDown -- the old direct Ctrl-Shift-I/U/Y
        // shortcuts have been removed).
        triggerSlotShortcut(kind: "image" | "sound" | "colour"): void {
            const focusSlotCursorInfos = this.appStore.focusSlotCursorInfos;
            this.appStore.isSlotShortcutsPaneActive = false;
            if(!focusSlotCursorInfos){
                return;
            }
            if(kind === "colour"){
                vueComponentsAPIHandler.appComponentAPI?.triggerColourPicker(focusSlotCursorInfos.slotInfos);
            }
            else{
                vueComponentsAPIHandler.appComponentAPI?.triggerMediaRecording(kind, focusSlotCursorInfos.slotInfos);
            }
        },

        handleAppScroll(event: WheelEvent) {
            // Don't do anything if a context menu is displayed 
            if(!getActiveContextMenu()){
                const currentScroll = $("#"+getEditorMiddleUID()).scrollTop();
                $("#"+getEditorMiddleUID()).scrollTop((currentScroll??0) + (event as WheelEvent).deltaY/2);
            }          
        },

        getLastProjectSavedDateTooltip() {
            // We show an indication about the last saved date of the document (unless there is no select source yet)
            if(this.isProjectNotSourced) {
                return "";
            }
            
            // There shouldn't be a case when we get a date that is no set to a proper value, but to prevent
            // weird and invalid date display, we associate the default value -1 to "unknown".
            if(this.appStore.projectLastSaveDate == -1){
                this.lastProjectSavedDateTooltip = this.$t("appMessage.lastSavedDateUnknown");
                return;
            } 

            // The format of that indication depends on how long the last saved date was.
            // If it was within a week (that is, less than 24*7 hours ago), we show "last saved <xxx> ago",
            // otherwise, we show "last saved on <yyy>".
            let toolTipVal = "";
            const lastSaveDateTickDiff = Date.now() - this.appStore.projectLastSaveDate;
            if(lastSaveDateTickDiff > 604800000 ){
                // More than a week ago (7 days * 24 h * 60 min * 60 s * 1000 ms)
                toolTipVal = this.$t("appMessage.lastSavedOn", {lastSavedDate: new Date(this.appStore.projectLastSaveDate).toLocaleString()}); 
            }
            else if(lastSaveDateTickDiff > 86400000){
                // Less than a week but more than a day ago (24 h * 60 min * 60 s * 1000 ms)
                const nbDays = lastSaveDateTickDiff / 86400000;
                toolTipVal = (nbDays > 1)
                    ? this.$t("appMessage.lastSavedOnNDays", {nbLastSave: Math.round(nbDays)})
                    : this.$t("appMessage.lastSavedOn1Day");
            }
            else if(lastSaveDateTickDiff > 3600000){
                // Less than a day but more than an hour ago (60 min * 60 s * 1000 ms)
                const nbHours = lastSaveDateTickDiff / 3600000;
                toolTipVal = (nbHours > 1)
                    ? this.$t("appMessage.lastSavedOnNHours", {nbLastSave: Math.round(nbHours)})
                    : this.$t("appMessage.lastSavedOn1Hour");
            }
            else if(lastSaveDateTickDiff > 60000){
                // Less than an hour but more than a minute ago (60 s * 1000 ms)
                const nbMins = lastSaveDateTickDiff / 60000;
                toolTipVal = (nbMins > 1)
                    ? this.$t("appMessage.lastSavedOnNMins", {nbLastSave: Math.round(nbMins)})
                    : this.$t("appMessage.lastSavedOn1Min");

            }
            else {
            // Less than a minute ago (we will use min 1 seconde even if less than a second, which is unlikely)
                const nbSecs = lastSaveDateTickDiff / 1000;
                toolTipVal = (nbSecs > 1)
                    ? this.$t("appMessage.lastSavedOnNSecs", {nbLastSave: Math.round(nbSecs)})
                    : this.$t("appMessage.lastSavedOn1Sec");
            }
            this.lastProjectSavedDateTooltip = toolTipVal;
        },

        // #v-ifdef STRYPE_PLATFORM == VITE_MICROBIT_MODE
        runToMicrobit() {
            // If we can directly upload on microbit, we run the method flash().
            // If we cannot, we run downloadHex(), it already contains code to show a message to the user.
            if(this.uploadThroughUSB){
                flash(this.$data);
            }
            else{
                downloadHex(true);
            }
        },

        onMicrobitSimulatorMsgReceived(e: MessageEvent<Record<string, any>>){
            // Example reference: https://github.com/micropython-microbit-v2-simulator/micropython-microbit-v2-simulator/blob/main/src/demo.html
            const { data } = e;
            const simulator = mbSimulator;
            // Actions on the simulator will loose the focus on Strype, so we save where we were.
            if (simulator && e.source === simulator) {
                switch (data.kind) {                            
                case "request_flash":
                    // We can send the current code to the microbit simulator
                    getPythonContent()
                        .then((pyContent) => {                            
                            this.appStore.pythonExecRunningState = PythonExecRunningState.Running;
                            this.appStore.enqueueAnalyticsEvent("run", computeFrameSnapshot());
                            this.appStore.flushAnalyticsQueue("critical");
                            mbSimulator?.postMessage({
                                "kind": "flash",
                                "filesystem": {
                                    "main.py": new TextEncoder()
                                        .encode(pyContent),
                                },
                            },"*");                                                     
                        })
                        // Error from code parsing is handled in getPythonContent()
                        .catch((_) => {});                    
                    break;
                default:
                    // Do nothing                    
                    break;
                }                
            }
        },

        handleMBSimulatorTakesFocus(){
            // Importantly, interactions with the simulator will give it focus.
            // We need to make sure the focus gets back to Strype so we can still have control...
            setTimeout(() => {
                if(this.appStore.pythonExecRunningState){
                    document.getElementById(getFrameUID(this.appStore.currentFrame.id))?.focus(); 
                }
            },500);
        },

        stopMBSimulator() {
            // Send a stop message to the simulator
            mbSimulator?.postMessage({"kind": "stop"}, "*");
            this.appStore.pythonExecRunningState = PythonExecRunningState.NotRunning;
        },
        
        getTabClasses(tabIndex: number): string[] {
            const disabledClassStr = (this.isEditing) ? " commands-tab-disabled" : "";
            if(tabIndex == this.tabIndex){
                return ["commands-tab commands-tab-active"];
            }
            else {
                return ["commands-tab" + disabledClassStr];
            }
        },
        // #v-else
        onPEAMounted(){
            // Once the PEA is ready, we need to fix the splitter's position between the frame commands area and the PEA,
            // so that the PEA stays at the bottom of the viewport as intially intented (in its initial 4:3 ratio).
            const peaElement = (this.$refs[this.peaComponentRefId] as InstanceType<typeof PythonExecutionArea>).$el;
            const peaHeight = peaElement.getBoundingClientRect().height;
            const peaMargin = parseInt(scssVars.pythonExecutionAreaMargin.replace("px",""));
            // (The divider isn't exactly the size we give in CSS (I don't know why so we check it like that))
            const commandsSplitterDivider = document.querySelector("." + scssVars.commandsPEASplitterThemeClassName + " .splitpanes__splitter");
            if(commandsSplitterDivider){
                const commandsSplitterHeight = commandsSplitterDivider.getBoundingClientRect().height + parseInt(window.getComputedStyle(commandsSplitterDivider).marginTop.replace("px","")); 
                const viewPortH = document.getElementsByTagName("body")[0].getBoundingClientRect().height;
                this.commandsSplitterPane2Size = ((peaHeight + peaMargin ) * 100) / (viewPortH - commandsSplitterHeight);
                // The splitter's PEA pane's min size will be updated after computeAddFrameCommandContainerSize() is called
            }

            // Finally, also refresh the commands/PEA splitter's minimum pane sizes, as the frame
            // commands panel's rendered height (and so its minimum) may have changed.
            setTimeout(() => {
                computeAddFrameCommandContainerSize();
            }, 200);
        },

        resetPEACommmandsSplitterDefaultState(): Promise<void> {
            // When a project is loaded, a PEA layout will be affected.
            // We need to make sure to be "as if" we were starting from a default project layout
            // before doing anything (otherwise we have issues with some layout related stuff that
            // are not saved, or some styling that gets messy).
            this.hasPEAExpanded = false;
            this.isCommandsSplitterChanged = false;
            vueComponentsAPIHandler.peaComponentAPI?.togglePEALayout(StrypePEALayoutMode.tabsCollapsed);
            // Wait for the splitter panes to actually finish resizing rather than guessing how long
            // that takes -- see waitForPanesSettled().
            return waitForPanesSettled();
        },

        onCommandsSplitterResize(event: any, isProgrammaticRestore?: boolean) {
            // When the splitter is resized, we need to resize the frame commands container (wrap/unwrap)
            // and the PEA (will take the full space in its pane, breaking the initial 4:3 ratio)
            document.getElementById(getPEATabContentContainerDivId())?.dispatchEvent(new CustomEvent(CustomEventTypes.pythonExecAreaSizeChanged));
            this.isCommandsSplitterChanged = true;
            this.commandsSplitterPane2Size = event.panes[1].size;
            // We also save the value in the store. We do not want to set commandsSplitterPane2Size as get/set computed property
            // (and call the appStore change in set()) because we set the value based on other settings (the 4:3 ratio) when PEA is mounted,
            // that value then shouldn't be saved in the store.
            if(this.appStore.peaCommandsSplitterPane2Size != undefined){
                this.appStore.peaCommandsSplitterPane2Size[this.appStore.peaLayoutMode??StrypePEALayoutMode.tabsCollapsed] = this.commandsSplitterPane2Size;
            }
            else {
                // The tricky case of when the state property has never been set
                this.appStore.peaCommandsSplitterPane2Size = {...defaultEmptyStrypeLayoutDividerSettings, [this.appStore.peaLayoutMode??StrypePEALayoutMode.tabsCollapsed]: event.panes[1].size};
            }

            // A change of divider position triggers a modification notification only when the user actively moves the divider.
            // We can't infer this from the event's shape (a real Splitpanes "resize" event and the synthetic event used to
            // restore a saved layout both carry a 2-element "panes" array), so callers doing a programmatic restore must
            // say so explicitly via isProgrammaticRestore.
            if(!isProgrammaticRestore){
                this.appStore.isEditorContentModified = true;
                this.appStore.editorLastModificationAt = Date.now();
            }
        },

        setPEACommandsSplitterPanesMinSize(onlyResizePEA?: boolean) {
            // Called to get the right min sizes of the pea/Commands splitter.
            // The minimum size the first pane of the splitter can take is set to guarantee
            // the project name is visible, and the first row of add frame commands + potential scrollbars.
            // The minimum size for the second pane of the splitter is a bit more deterministic: the header
            // of the PEA component + about 3 lines of text (we don't include the botton margin). 
            // Nevertheless, the min size need to change if the PEA component changes: in window resize events 
            // or when the editor/commands splitters pushes the commands too small.
            const viewPortH = document.getElementsByTagName("body")[0].getBoundingClientRect().height;
            const commandsSplitterDivider = document.querySelector("." + scssVars.commandsPEASplitterThemeClassName + " .splitpanes__splitter");
            if(commandsSplitterDivider) {               
                const commandsSplitterHeight = commandsSplitterDivider.getBoundingClientRect().height; 
                const projectNameContainerDiv = document.getElementsByClassName(scssVars.strypeProjectNameContainerClassName)?.[0];
                const firstAddCommandDiv = document.querySelector("." + scssVars.addFrameCommandsContainerClassName + " p > div");                
                // Pane 1: it is possible that at some point, the frame commands panel has a x-axis scroll bar (when the commands are wrapped). 
                // So we need to account for that in the min size.
                const frameCommandsContainer = (document.querySelector("." + scssVars.noPEACommandsClassName) as HTMLDivElement);
                const frameCommandsScrollBarH = frameCommandsContainer.offsetHeight - frameCommandsContainer.clientHeight;
                if(projectNameContainerDiv && firstAddCommandDiv){
                    const firstAddCommandDivFullHeight = firstAddCommandDiv.getBoundingClientRect().height + parseInt(window.getComputedStyle(firstAddCommandDiv).marginTop.replace("px","")) + parseInt(window.getComputedStyle(firstAddCommandDiv).marginBottom.replace("px",""));                    
                    this.commandSplitterPane1MinSize = ((projectNameContainerDiv.getBoundingClientRect().height + firstAddCommandDivFullHeight + frameCommandsScrollBarH) * 100) / (viewPortH - commandsSplitterHeight);                    
                }    
            
                // Pane 2:
                const peaHeaderHeight = (document?.getElementById(getPEAControlsDivId())?.getBoundingClientRect().height)??0;
                const peaConsoleElement = document.getElementById(getPEAConsoleId());
                if(peaConsoleElement){               
                    const peaConsoleLineH = parseFloat(window.getComputedStyle(peaConsoleElement).lineHeight.replace("px",""));
                    this.commandSplitterPane2MinSize = ((peaHeaderHeight + 3 * peaConsoleLineH) * 100) / (viewPortH - commandsSplitterHeight);    
                }
            }
        },
        // #v-endif
    },
});
</script>

<style lang="scss">
.#{$strype-classname-project-name-container} {
    display: flex;
    align-items: center;
    justify-content: center;
}

.modifed-label-span {
     margin-left: 15px;
}

// Unlike other .text-editing-command hints (informational only, cursor: default -- see
// AddFrameCommand.vue), the media-recording/colour-picker hints can also be clicked directly to
// trigger the same action as their keyboard shortcut, so they get the pointer cursor back plus a
// hover highlight for affordance.
.frame-cmd-container.clickable-command,
.frame-cmd-container.clickable-command .frame-cmd-btn {
    cursor: pointer;
}
.frame-cmd-container.clickable-command {
    border-radius: 4px;
}
.frame-cmd-container.clickable-command:hover {
    background-color: rgba(0, 0, 0, 0.06);
}

.project-name {
    color: #274D19;
}

.project-target-logo {
    width: 16px;
    height: 16px;
    margin-left: 15px;
    margin-right: 5px;
}

.gdrive-sync-label {
    color: #2e641b;
    font-size: 80%;
}

.commands {
    border-left: #383b40 1px solid;
    color: #252323;
    background-color: #E2E7E0;
    height: 100vh;
    // #v-ifdef STRYPE_PLATFORM == VITE_MICROBIT_MODE
    display: flex;
    flex-direction: column;
    padding:0px 15px;
    // #v-endif
}

/**
 * The following classes overwrite the spitter's style
 * for the splitter in use in this component.
 */
// #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
.#{$strype-classname-commands-pea-splitter-theme} {
    height: 100%;
}

.#{$strype-classname-commands-pea-splitter-theme} > .splitpanes--horizontal>.splitpanes__splitter {
    height: 1px !important;
    background-color: black !important;
}

.#{$strype-classname-commands-pea-splitter-theme}.#{$strype-classname-expanded-pea} > .splitpanes--horizontal>.splitpanes__splitter {
    background-color: transparent !important;    
}

.#{$strype-classname-commands-pea-splitter-theme} > .splitpanes--horizontal>.splitpanes__splitter:before {
    content: "";
    position: absolute;
    left: 0;
    top: -2px;
    bottom: -2px;
    width: 100% !important;
    transform: none !important;
    height: auto !important;
}

.collapsed-pea-splitter-pane {
    background-color: $pea-outer-background-color !important;
}
// #v-endif
/** End splitter classes */

.cmd-progress-container {
    margin-top: 5px;
    background-color: #E2E7E0 !important;
    border: 1px lightgrey solid;
    width: 100%;
}

.#{$strype-classname-no-pea-commands} {
    // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
    overflow-y: hidden;
    display: flex;
    flex-direction: column;
    height: 100%;    
    // #v-else
    overflow-y: auto;
    // #v-endif
}

// The bar's own width changes as progress advances, so the label is a sibling
// overlay spanning the whole track (not a child of .progress-bar) - that way it
// stays centred on the full bar instead of drifting with the fill.
.progress {
    position: relative;
}

.progress-bar-text {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    white-space: nowrap;
    pointer-events: none;
    color: #fefefe !important;
    font-weight: bold;
}

#keystrokeSpan {
    bottom:2px;
    left: 50%;
    transform: translate(-50%, 0);
    position: absolute;
    font-size:large;
    color:#666666;
}

.#{$strype-classname-add-frame-commands-container} .frame-cmd-row {
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
    // Matches the margin a <p> would have had (these rows were previously <p> elements).
    margin: 0 0 1rem 0;
}

// #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
// The add-frame-commands list (.add-frame-commands-list below) needs to wrap into extra columns
// whenever it doesn't have room to lay its commands out in one, and it needs to know how much
// room that is. Rather than have JS measure the pane and pin an explicit pixel height on it (which
// only happened on splitter-resize/PEA-expand-collapse events, and so went stale the moment the
// *content* changed instead -- e.g. moving the frame cursor to a section with a different number
// of available commands -- see the "4-column layout cuts off the right edge" bug this replaced),
// this chain threads flex-grow with min-height: 0 down from the pane that already has a real,
// non-auto height, so the list gets an actual CSS height for free, one the browser keeps in sync
// on every layout change automatically instead of only at specific JS-triggered moments.
.commands-flex-fill,
.command-tab-content,
#addFramePanel {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
}

.#{$strype-classname-add-frame-commands-container} {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
}

// The list itself is the only child of that chain that should actually grow -- the intro
// sentence and the (mutually-exclusive, editing-only) code-completion/slot-shortcuts/wrap-selection
// rows around it all keep their natural content height.
.add-frame-commands-list {
    flex: 1 1 0;
    min-height: 0;
    display: grid;
    grid-auto-flow: column;
    // 28px is a floor slightly under a single command row's natural rendered height (~30px,
    // AddFrameCommand.vue's .frame-cmd-container margin plus its button); auto-fill uses it to
    // work out how many rows fit, and the 1fr max then shares out any leftover height evenly so
    // rows don't end up shorter than their content.
    grid-template-rows: repeat(auto-fill, minmax(28px, 1fr));
    // If there's genuinely not enough width for as many columns as the height demands, scroll
    // rather than silently clip -- unlike the old flex-wrap mechanism, which had no equivalent.
    overflow-x: auto;
}

// While a slot is being edited, generateAvailableFrameCommands() (store.ts) deliberately returns
// no commands at all, so this list renders with zero children; without this override it would
// still flex-grow to fill the available height (an empty box, but one still taking up space),
// pushing the code-completion/slot-shortcuts/wrap-selection rows that come after it in the DOM
// down by that amount -- in the non-expanded-PEA case those rows are in normal flow, so they'd
// visibly shift down (and could end up hidden behind the PEA pane), same symptom as the bug above.
.add-frame-commands-list:empty {
    flex: 0 0 auto;
}
// #v-endif

.frame-commands-pane-intro {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    margin: 2px 5px 8px 0;
}

.frame-cmd-divider {
    border-top: 1px solid #d0d0d0;
    margin: 0 5px 8px 0;
}

// Hidden via visibility (rather than the content being swapped or removed) once the pane becomes
// active, so this row keeps occupying exactly the same space and the frame commands underneath
// never shift.
.frame-commands-pane-intro-hidden {
    visibility: hidden;
}

.frame-commands-pane-intro .frame-cmd-prefix-btn {
    margin-right: 0;
}

// Like .text-editing-command .frame-cmd-btn-large (AddFrameCommand.vue): this sentence's
// "Space"/"Tab" boxes aren't crammed into a row with many others, so there's no need to condense
// the font horizontally to save space (unlike the "space" symbol in the frame commands table below).
.frame-commands-pane-intro .frame-cmd-btn-large {
    @include frame-cmd-btn-large-normal-stretch;
}

.frame-cmd-prefix-btn-wide {
    padding-left: 10px;
    padding-right: 10px;
}

.#{$strype-classname-add-frame-commands-container}.with-expanded-PEA .frame-cmd-row {
   // So that the frame commands in expanded view expands over the commands/PEA splitter,
   // the width is set programmatically
   position: absolute;
}

// Shown around #addFramePanel/#addSlotShortcutsPanel while that pane is focused for keyboard-driven
// insertion (entered via Tab/Space at the frame caret, or Space at a blank slot -- see
// LabelSlotsStructure.vue's forwardKeyEvent), to make the mode change obvious.
// Same blue as the frame caret (Caret.vue's .caret background-color: #3467FE).
// Uses an inset box-shadow rather than outline: an outline is painted outside the element's
// box, so with this panel flush against the right edge of its container, the outline's right
// edge was clipped off screen. An inset shadow stays within the box and so is never clipped.
// Padding is applied always (not just while active) so the shortcut/label content doesn't
// shift position when the border appears -- otherwise it would jump inward by the padding
// amount right as the border is drawn over it.
#addFramePanel, #addSlotShortcutsPanel {
    box-sizing: border-box;
    padding: 6px;
}

#addFramePanel.frame-commands-pane-active, #addSlotShortcutsPanel.frame-commands-pane-active {
    box-shadow: inset 0 0 0 3px rgba(52, 103, 254, 0.9);
}

.#{$strype-classname-pea-container} {
    // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
    margin: 0px $strype-python-exec-area-margin $strype-python-exec-area-margin $strype-python-exec-area-margin;
    // #v-else
    margin-bottom: 40px;
    overflow: hidden; // that is used to keep the margin https://stackoverflow.com/questions/44165725/flexbox-preventing-margins-from-being-respected
    flex-grow: 3;
    flex-shrink: 0;
    // #v-endif
    display: flex;
    flex-direction: column;    
    align-items: flex-start;
    justify-content: flex-end;
}

.commands-tab {
    color: #787978 !important;
    border-color: #bbc8b6 !important;
    background-color: transparent !important;
    margin-top: 10px;
}

.commands-tab-active {
    color: #274D19 !important;
    border-bottom-color: #E2E7E0 !important;
}

.command-tab-content {
    margin-left: 5px;
    margin-right: 5px;
}

//the following overrides the bootstrap tab generated styles
#commandsTabs ul {
    border-bottom-color: #bbc8b6 !important;
}

.nav-item{
    cursor: no-drop;
}
//ends bootstrap overriding

// #v-ifdef STRYPE_PLATFORM == VITE_MICROBIT_MODE
.commands-container {
    display: inline-block;
}

.commands-container > button:first-of-type{
    margin-right: 5px;
}

.stop-mb-sim-btn {
   background-color: red !important;
}

#mbSimulatorIframe {      
    width: 304px;
    height: 240px;
    min-width: 304px;
    min-height: 240px; 
    margin-left: -8px; // We can't access the iframe's content styling for security reasons, this is retrieved from observation.
}

.cmd-button {
    padding: 1px 6px 1px 6px !important;
}
// #v-endif
</style>
