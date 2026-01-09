<template>
    <div class="commands">
        /* IFTRUE_isPython
        <Splitpanes horizontal :class="{[scssVars.commandsPEASplitterThemeClassName]: true, [scssVars.expandedPEAClassName]: isExpandedPEA}" @resize="onCommandsSplitterResize">
            <pane key="1" ref="peaCommandsSplitterPane1Ref" :size="100 - commandsSplitterPane2Size" :min-size="commandSplitterPane1MinSize">
        FITRUE_isPython */
                <div :class="scssVars.noPEACommandsClassName" @wheel.stop>
                    <div :class="scssVars.strypeProjectNameContainerClassName">
                        <span class="project-name">{{projectName}}</span>
                        <div @mouseover="getLastProjectSavedDateTooltip" :title="lastProjectSavedDateTooltip">
                            <img v-if="isProjectFromCloudDrive" :src="syncedTargetLogo" :alt="syncedTargetName" class="project-target-logo"/> 
                            <img v-else-if="isProjectFromFS" :src="syncedTargetLogo" :alt="syncedTargetName" class="project-target-logo"/> 
                            <span class="gdrive-sync-label" v-if="!isProjectNotSourced && !isEditorContentModifiedFlag" v-t="'appMessage.savedCloudFile'" />
                            <span class="gdrive-sync-label" v-else-if="isEditorContentModifiedFlag" v-t="'appMessage.modifCloudFile'" :class="{'modifed-label-span': isProjectNotSourced}" />                     
                        </div>
                    </div>     
                    <div @mousedown.prevent.stop @mouseup.prevent.stop>
                        /* IFTRUE_isMicrobit
                        <b-tabs id="commandsTabs" content-class="mt-2" v-model="tabIndex">
                            <b-tab :title="$t('commandTabs.0')" active :title-link-class="getTabClasses(0)" :disabled="isEditing">
                        FITRUE_isMicrobit */
                                <div :id="commandsContainerUID" class="command-tab-content" >
                                    <div id="addFramePanel">
                                        <div :class="{[scssVars.addFrameCommandsContainerClassName]: true/* IFTRUE_isPython , 'with-expanded-PEA': isExpandedPEA FITRUE_isPython*/}">
                                            <p>
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
                                                />
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            /* IFTRUE_isMicrobit 
                            </b-tab>
                                <b-tab :title="$t('commandTabs.1')" :title-link-class="getTabClasses(1)">
                                    <APIDiscovery  class="command-tab-content"/>
                                </b-tab>
                            FITRUE_isMicrobit */
                        </b-tabs>
                    </div>
                    <text id="userCode"></text>
                    <span id="keystrokeSpan"></span>
                </div>
        /* IFTRUE_isPython
            </pane>
            <pane key="2" ref="peaCommandsSplitterPane2Ref" :size="commandsSplitterPane2Size" :min-size="commandSplitterPane2MinSize" :class="{'collapsed-pea-splitter-pane': !isExpandedPEA}">
                <python-execution-area :class="scssVars.peaContainerClassName" :ref="peaComponentRefId" v-on:[peaMountedEventName]="onPEAMounted" :hasDefault43Ratio="!isCommandsSplitterChanged && !hasPEAExpanded"/>
            </pane>
        </Splitpanes>
        FITRUE_isPython */
        /* IFTRUE_isMicrobit 
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
                    <span v-t="'action.uploadingToMicrobit'" class="progress-bar-text"></span>
                </div>
            </div>
            <div class="commands-container">    
                <iframe id="mbSimulatorIframe" src="https://python-simulator.usermbit.org/v/0.1/simulator.html?color=%2300FF00" frameborder="0" scrolling="no" sandbox="allow-scripts allow-same-origin"></iframe>
                <br>
                <button type="button" @click="runToMicrobit" v-t="'buttonLabel.runOnMicrobit'" class="btn btn-secondary cmd-button"/>
                <button v-if="isMBSimulatorRunning" type="button" @click="stopMBSimulator" v-t="'buttonLabel.stopMBSimulator'" class="btn btn-secondary cmd-button stop-mb-sim-btn "/>
            </div>
        </div>
        <SimpleMsgModalDlg :dlgId="startMBSimulatorlDlgId" />
        FITRUE_isMicrobit */
    </div>
</template>

<script lang="ts">
import AddFrameCommand from "@/components/AddFrameCommand.vue";
import { computeAddFrameCommandContainerSize, CustomEventTypes, getActiveContextMenu, getAddFrameCmdElementUID, getCaretContainerUID, getCloudDriveHandlerComponentRefId, getCommandsContainerUID, getCommandsRightPaneContainerId, getCurrentFrameSelectAllAction, getFrameUID, getEditorMiddleUID, getMenuLeftPaneUID, handleContextMenuKBInteraction, hiddenShorthandFrames, notifyDragEnded } from "@/helpers/editor";
import { useStore } from "@/store/store";
import { AddFrameCommandDef, AllFrameTypesIdentifier, CaretPosition, CollapsedState, defaultEmptyStrypeLayoutDividerSettings, FrameObject, PythonExecRunningState, SelectAllFramesAction, StrypePEALayoutMode, StrypeSyncTarget } from "@/types/types";
import $ from "jquery";
import Vue from "vue";
import browserDetect from "vue-browser-detect-plugin";
import { mapStores } from "pinia";
import { getAvailableNavigationPositions, getFrameSectionIdFromFrameId } from "@/helpers/storeMethods";
import scssVars  from "@/assets/style/_export.module.scss";
import { isMacOSPlatform } from "@/helpers/common";
import fsIcon from "@/assets/images/FSicon.png";
import gdIcon from "@/assets/images/logoGDrive.png";
import odIcon from "@/assets/images/logoOneDrive.svg";
import { findCurrentStrypeLocation, STRYPE_LOCATION } from "@/helpers/pythonToFrames";
import { clamp } from "lodash";
/* IFTRUE_isPython */
import {Splitpanes, Pane, PaneData} from "splitpanes";
import PythonExecutionArea from "@/components/PythonExecutionArea.vue";
import {getPEAConsoleId, getPEAGraphicsDivId, getPEATabContentContainerDivId, getPEAComponentRefId, getPEAControlsDivId} from "@/helpers/editor";
/* FITRUE_isPython */
/* IFTRUE_isMicrobit */
import APIDiscovery from "@/components/APIDiscovery.vue";
import { flash } from "@/helpers/webUSB";
import CloudDriveHandlerComponent from "./CloudDriveHandler.vue";
import { downloadHex, getPythonContent } from "@/helpers/download";
import SimpleMsgModalDlg from "@/components/SimpleMsgModalDlg.vue";
/* FITRUE_isMicrobit */

export default Vue.extend({
    name: "Commands",

    components: {
        AddFrameCommand,
        /* IFTRUE_isMicrobit */
        APIDiscovery,
        SimpleMsgModalDlg,
        /* FITRUE_isMicrobit */
        /* IFTRUE_isPython */
        Splitpanes, Pane,
        PythonExecutionArea, 
        /* FITRUE_isPython */
    },

    data: function () {
        return {
            scssVars, // just to be able to use in template
            showProgress: false,
            progressPercent: 0,
            uploadThroughUSB: false,
            frameCommandsReactiveFlag: false, // this flag is only use to allow a reactive binding when the add frame commands are updated (language),
            lastProjectSavedDateTooltip: "", // update on a mouse over event (in getLastProjectSavedDateTooltip)
            /* IFTRUE_isPython */
            isExpandedPEA: false, // flag indicating whether the Python Execution Area is expanded (to update the UI parts accordingly)
            hasPEAExpanded: false, // flag indicating whether the Python Execution Area *has ever been* expanded
            peaMountedEventName: CustomEventTypes.pythonExecAreaMounted,
            commandSplitterPane1MinSize: 0, // to be adjusted after the component is mounted
            commandSplitterPane2MinSize: 0, // to be adjusted after the component is mounted
            commandsSplitterPane2Size: 0, // to be adjused after the component is mounted
            isCommandsSplitterChanged: false,
            /* FITRUE_isPython */
            /* IFTRUE_isMicrobit */
            mbSimulator: null as Window | null,
            /* FITRUE_isMicrobit */
        };
    },

    /* IFTRUE_isMicrobit */
    beforeMount() {
        Vue.use(browserDetect);
        this.uploadThroughUSB = (this.$browserDetect.isChrome || this.$browserDetect.isOpera || this.$browserDetect.isEdge);
    },
    /* FITRUE_isMicrobit */

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
            default:
                return "";
            }
        },

        syncedTargetName(): string {
            const cloudDriveHandlerComponent =  ((this.$root.$children[0].$refs[getMenuLeftPaneUID()] as Vue).$refs[getCloudDriveHandlerComponentRefId()] as InstanceType<typeof CloudDriveHandlerComponent>);
            switch(this.appStore.syncTarget){
            case StrypeSyncTarget.fs:
                return this.$t("appMessage.targetFS") as string;
            case StrypeSyncTarget.gd:
                return cloudDriveHandlerComponent.getDriveName();
            case StrypeSyncTarget.od:
                return cloudDriveHandlerComponent.getDriveName();
            default:
                return "";
            }
        },
        
        /* IFTRUE_isPython */
        peaComponentRefId(): string {
            return getPEAComponentRefId();
        },
        /* FITRUE_isPython */

        /* IFTRUE_isMicrobit */
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
        /* FITRUE_isMicrobit */

        commandsContainerUID(): string {
            return getCommandsContainerUID();
        },

        isEditing(): boolean {
            return this.appStore.isEditing;
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

        progressPercentWidthStyle(): string {
            return "width: " + this.progressPercent + "%;";
        },
    },

    created() {
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
                if((event.ctrlKey || event.metaKey) && eventKeyLowCase === "enter" 
                /* IFTRUE_isPython && this.$refs[getPEAComponentRefId()] FITRUE_isPython *//* IFTRUE_isMicrobit && this.mbSimulator FITRUE_isMicrobit */) {
                    /* IFTRUE_isPython */
                    ((this.$refs[getPEAComponentRefId()] as InstanceType<typeof PythonExecutionArea>).$refs.runButton as HTMLButtonElement).focus();
                    ((this.$refs[getPEAComponentRefId()] as InstanceType<typeof PythonExecutionArea>).$refs.runButton as HTMLButtonElement).click();
                    // Need to unfocus to avoid keyboard focus non-obviously remaining with the run button:
                    ((this.$refs[getPEAComponentRefId()] as InstanceType<typeof PythonExecutionArea>).$refs.runButton as HTMLButtonElement).blur();
                    /* FITRUE_isPython */

                    /* IFTRUE_isMicrobit */
                    // If the run Python shortcut is triggered with the micro:bit version, we start/stop the simulator.
                        
                    if(event.ctrlKey){
                        if(this.isMBSimulatorRunning) {
                            this.stopMBSimulator();
                        } 
                        else {
                            // The micro:bit simulator do not support non-user interaction for a flash request.
                            // So we just tell the user here what to do...
                            this.appStore.simpleModalDlgMsg = this.$i18n.t("appMessage.startMBSimulatorNeedUserAction") as string;
                            this.$root.$emit("bv::show::modal", this.startMBSimulatorlDlgId);                            
                        }
                    }
                    /* FITRUE_isMicrobit */
                    
                    // Don't then process the keypress for other purposes:
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    return;
                }

                // If a context menu is currently displayed, we handle the menu keyboard interaction here
                // (note that preventing the event here also prevents the keyboard scrolling of the page)
                if(!isEditing && this.appStore.contextMenuShownId.length > 0 && getActiveContextMenu()){
                    handleContextMenuKBInteraction(event.key);
                    event.stopImmediatePropagation();
                    event.preventDefault();
                    return;
                }

                // Prevent default scrolling and navigation in the editor, except if Turtle is currently running and listening for key events
                // (then we just leave the PEA handling it, see at the end of these conditions for related code)
                if (!isDraggingFrames && !isEditing && /*IFTRUE_isPython*/ !(isPythonExecuting && ((this.$refs[getPEAComponentRefId()] as InstanceType<typeof PythonExecutionArea>).$data.isTurtleListeningKeyEvents || (this.$refs[getPEAComponentRefId()] as InstanceType<typeof PythonExecutionArea>).$data.isRunningStrypeGraphics)) && /*FITRUE_isPython*/ ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Tab", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
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
                        const isHiddenShorthandFrameCommand = (hiddenShorthandFrames[eventKeyLowCase] !== undefined 
                            && Object.values(this.addFrameCommands).flat().flatMap((addFrameDef) => addFrameDef.type.type).includes(hiddenShorthandFrames[eventKeyLowCase].type.type));
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
                            //add the frame in the editor if allowed or the special cases of hidden frames
                            else if(this.addFrameCommands[eventKeyLowCase] !== undefined || Object.values(this.addFrameCommands).find((addFrameCmdDef) =>  addFrameCmdDef[0].shortcuts[1] == eventKeyLowCase) !== undefined
                                || isHiddenShorthandFrameCommand){
                                if(!ignoreKeyEvent){
                                    event.stopImmediatePropagation();
                                    event.stopPropagation(),
                                    event.preventDefault();
                                    if(isHiddenShorthandFrameCommand) {
                                        // Adding a shorthand frame required to 1) add the frame itself
                                        this.appStore.addFrameWithCommand(hiddenShorthandFrames[eventKeyLowCase].type, hiddenShorthandFrames[eventKeyLowCase]);
                                    }
                                    else{
                                        // We can add the frame by its original shortcut or hidden one
                                        const isOriginalShortcut = (this.addFrameCommands[eventKeyLowCase] != undefined);
                                        this.appStore.addFrameWithCommand(
                                            (isOriginalShortcut)
                                                ? this.addFrameCommands[eventKeyLowCase][0].type
                                                : (Object.values(this.addFrameCommands).find((addFrameCmdDef) =>  addFrameCmdDef[0].shortcuts[1] == eventKeyLowCase) as AddFrameCommandDef[])[0].type
                                        );
                                    }
                                }
                                else{
                                    this.appStore.ignoreKeyEvent = false;
                                }
                            }
                        }
                        else if(event.key == " " && this.appStore.selectedFrames.length == 0){
                            const currentStrypeLocation = findCurrentStrypeLocation().strypeLocation;
                            if(currentStrypeLocation == STRYPE_LOCATION.MAIN_CODE_SECTION || currentStrypeLocation == STRYPE_LOCATION.IN_FUNCDEF){
                                // If ctrl/meta + space is activated on caret (in a function/class definition or in the main section), we add a new functional call frame and trigger the a/c
                                this.appStore.addFrameWithCommand(this.addFrameCommands[eventKeyLowCase][0].type);
                                this.$nextTick(() => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown",{key: " ", ctrlKey: true})));
                            }
                        }
                    }
                    /* IFTRUE_isPython */
                    else if(isPythonExecuting && !(this.$refs[getPEAComponentRefId()] as InstanceType<typeof PythonExecutionArea>).$data.isRunningStrypeGraphics){
                        // The special case when the user's code is being executing, we want to handle the key events carefully.
                        // If there is a combination key (ctrl,...) we just ignore the events, otherwise, if Turtle is active we pass events to the Turtle graphics,
                        // and if it's not active AND the Python Execution console hasn't go focus, we prevents events.
                        if(!event.altKey && !event.ctrlKey && !event.metaKey){
                            const turtlePlaceholder = document.getElementById(getPEAGraphicsDivId());
                            const isTurtleShowing = turtlePlaceholder?.style.display != "none";
                            if(turtlePlaceholder && isTurtleShowing && document.activeElement?.id != turtlePlaceholder.id){
                                // Give focus to the Turtle graphics first to make sure it will respond.
                                turtlePlaceholder.focus();
                                // Then we can forward the key event.
                                setTimeout(() => {
                                    turtlePlaceholder.dispatchEvent(new KeyboardEvent("keydown", {
                                        keyCode: event.keyCode,
                                    }));
                                    turtlePlaceholder.dispatchEvent(new KeyboardEvent("keyup", {
                                        key: event.key,
                                        keyCode: event.keyCode,
                                    }));
                                }, 500);
                            }

                            if(document.activeElement?.id === getPEAConsoleId()){
                                // Don't interfere with the Python Execution console if it's having focus
                                return;
                            }

                            event.stopImmediatePropagation();
                            event.stopPropagation(),
                            event.preventDefault();
                            return;
                        }
                    }
                    /* FITRUE_isPython */
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
        
        /* IFTRUE_isMicrobit */
        this.mbSimulator = (document.querySelector("#mbSimulatorIframe") as HTMLIFrameElement)?.contentWindow;
        window.addEventListener("blur", this.handleMBSimulatorTakesFocus);        
        window.addEventListener("message", this.onMicrobitSimulatorMsgReceived);
        /* FITRUE_isMicrobit */
    },

    methods: {
        addFrameCommandUID(commandType: string): string {
            return getAddFrameCmdElementUID(commandType);
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
                this.lastProjectSavedDateTooltip = this.$i18n.t("appMessage.lastSavedDateUnknown") as string;
                return;
            } 

            // The format of that indication depends on how long the last saved date was.
            // If it was within a week (that is, less than 24*7 hours ago), we show "last saved <xxx> ago",
            // otherwise, we show "last saved on <yyy>".
            let toolTipVal = "";
            const lastSaveDateTickDiff = Date.now() - this.appStore.projectLastSaveDate;
            if(lastSaveDateTickDiff > 604800000 ){
                // More than a week ago (7 days * 24 h * 60 min * 60 s * 1000 ms)
                toolTipVal = this.$i18n.t("appMessage.lastSavedOn", {lastSavedDate: new Date(this.appStore.projectLastSaveDate).toLocaleString()}) as string; 
            }
            else if(lastSaveDateTickDiff > 86400000){
                // Less than a week but more than a day ago (24 h * 60 min * 60 s * 1000 ms)
                const nbDays = lastSaveDateTickDiff / 86400000;
                toolTipVal = (nbDays > 1)
                    ? this.$i18n.t("appMessage.lastSavedOnNDays", {nbLastSave: Math.round(nbDays)}) as string
                    : this.$i18n.t("appMessage.lastSavedOn1Day") as string;
            }
            else if(lastSaveDateTickDiff > 3600000){
                // Less than a day but more than an hour ago (60 min * 60 s * 1000 ms)
                const nbHours = lastSaveDateTickDiff / 3600000;
                toolTipVal = (nbHours > 1)
                    ? this.$i18n.t("appMessage.lastSavedOnNHours", {nbLastSave: Math.round(nbHours)}) as string
                    : this.$i18n.t("appMessage.lastSavedOn1Hour") as string;
            }
            else if(lastSaveDateTickDiff > 60000){
                // Less than an hour but more than a minute ago (60 s * 1000 ms)
                const nbMins = lastSaveDateTickDiff / 60000;
                toolTipVal = (nbMins > 1)
                    ? this.$i18n.t("appMessage.lastSavedOnNMins", {nbLastSave: Math.round(nbMins)}) as string
                    : this.$i18n.t("appMessage.lastSavedOn1Min") as string;

            }
            else {
            // Less than a minute ago (we will use min 1 seconde even if less than a second, which is unlikely)
                const nbSecs = lastSaveDateTickDiff / 1000;
                toolTipVal = (nbSecs > 1)
                    ? this.$i18n.t("appMessage.lastSavedOnNSecs", {nbLastSave: Math.round(nbSecs)}) as string
                    : this.$i18n.t("appMessage.lastSavedOn1Sec") as string;
            }
            this.lastProjectSavedDateTooltip = toolTipVal;
        },

        /* IFTRUE_isMicrobit */
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
            const simulator = this.mbSimulator;
            // Actions on the simulator will loose the focus on Strype, so we save where we were.
            if (simulator && e.source === simulator) {
                switch (data.kind) {                            
                case "request_flash":
                    // We can send the current code to the microbit simulator
                    getPythonContent()
                        .then((pyContent) => {                            
                            this.appStore.pythonExecRunningState = PythonExecRunningState.Running;
                            this.mbSimulator?.postMessage({
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
            this.mbSimulator?.postMessage({"kind": "stop"}, "*");
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
        /*FITRUE_isMicrobit */

        /* IFTRUE_isPython */
        onPEAMounted(){
            // Once the PEA is ready, we need to fix the splitter's position between the frame commands area and the PEA,
            // so that the PEA stays at the bottom of the viewport as intially intented (in its initial 4:3 ratio).
            const peaElement = (this.$refs[this.peaComponentRefId] as Vue).$el;
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

            // Finally, also update the frame commands panel as it may now overflow...
            setTimeout(() => {
                computeAddFrameCommandContainerSize(); 
            }, 200);
        },

        resetPEACommmandsSplitterDefaultState(): Promise<void> {
            // When a project is loaded, a PEA layout will be affected.
            // We need to make sure to be "as if" we were starting from a default project layout
            // before doing anything (otherwise we have issues with some layout related stuff that
            // are not saved, or some styling that gets messy).
            return new Promise((resolve) => {
                this.hasPEAExpanded = false;
                this.isCommandsSplitterChanged = false;               
                (this.$refs[this.peaComponentRefId] as InstanceType<typeof PythonExecutionArea>).togglePEALayout(StrypePEALayoutMode.tabsCollapsed);
                // Once we have the flags set, we set a timer to wait for the splitter to update before returning from the promise
                setTimeout(() => {
                    resolve();
                }, 800);   
            });            
        },        

        onCommandsSplitterResize(event: any) {
            // When the splitter is resized, we need to resize the frame commands container (wrap/unwrap)
            // and the PEA (will take the full space in its pane, breaking the initial 4:3 ratio)
            document.getElementById(getPEATabContentContainerDivId())?.dispatchEvent(new CustomEvent(CustomEventTypes.pythonExecAreaSizeChanged));
            this.isCommandsSplitterChanged = true;
            this.commandsSplitterPane2Size = event[1].size;
            // We also save the value in the store. We do not want to set commandsSplitterPane2Size as get/set computed property
            // (and call the appStore change in set()) because we set the value based on other settings (the 4:3 ratio) when PEA is mounted,
            // that value then shouldn't be saved in the store.
            if(this.appStore.peaCommandsSplitterPane2Size != undefined){
                this.appStore.peaCommandsSplitterPane2Size[this.appStore.peaLayoutMode??StrypePEALayoutMode.tabsCollapsed] = this.commandsSplitterPane2Size;
            }
            else {
                // The tricky case of when the state property has never been set
                this.appStore.peaCommandsSplitterPane2Size = {...defaultEmptyStrypeLayoutDividerSettings, [this.appStore.peaLayoutMode??StrypePEALayoutMode.tabsCollapsed]: event[1].size};
            }

            // A change of divider position triggers a modification notification only when the user actively moves the divider,
            // we can distinguish between a sitation when the divider is position is loaded and user event by the content of the event
            if(event.length > 1){
                this.appStore.isEditorContentModified = true;
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
                    const currentPane1Size = parseFloat(((this.$refs.peaCommandsSplitterPane1Ref as InstanceType<typeof Pane>).$data as PaneData).style.height.replace("%",""));
                    if(currentPane1Size < this.commandSplitterPane1MinSize){
                        // Setting the min size doesn't mean that the current size will update to be valid. 
                        // So we do it ourselves. The reactivity doesn't seem to always work (some timing issue?)
                        // so we change the data of the Panes directly
                        setTimeout(() => {
                            this.commandsSplitterPane2Size = (100 - this.commandSplitterPane1MinSize);      
                            (this.$refs.peaCommandsSplitterPane1Ref as InstanceType<typeof Pane>).$data.style.height = this.commandSplitterPane1MinSize + "%";
                            (this.$refs.peaCommandsSplitterPane2Ref as InstanceType<typeof Pane>).$data.style.height = this.commandsSplitterPane2Size + "%";
                            // And trigger the Graphics to resize properly
                            document.getElementById(getPEATabContentContainerDivId())?.dispatchEvent(new CustomEvent(CustomEventTypes.pythonExecAreaSizeChanged, {detail: onlyResizePEA}));
                        }, 200);                        
                    }     
                }    
            
                // Pane 2:
                const peaHeaderHeight = (document?.getElementById(getPEAControlsDivId())?.getBoundingClientRect().height)??0;
                const peaConsoleElement = document.getElementById(getPEAConsoleId());
                if(peaConsoleElement){               
                    const peaConsoleLineH = parseFloat(window.getComputedStyle(peaConsoleElement).lineHeight.replace("px",""));
                    this.commandSplitterPane2MinSize = ((peaHeaderHeight + 3 * peaConsoleLineH) * 100) / (viewPortH - commandsSplitterHeight);
                    const currentPane2Size = parseFloat(((this.$refs.peaCommandsSplitterPane2Ref as InstanceType<typeof Pane>).$data as PaneData).style.height.replace("%",""));
                    if(currentPane2Size < this.commandSplitterPane2MinSize){
                        // Setting the min size doesn't mean that the current size will update to be valid. 
                        // So we do it ourselves. The reactivity doesn't seem to always work (some timing issue?)
                        // so we change the data of the Panes directly
                        setTimeout(() => {
                            this.commandsSplitterPane2Size = (this.commandSplitterPane2MinSize);      
                            (this.$refs.peaCommandsSplitterPane1Ref as InstanceType<typeof Pane>).$data.style.height = (100 - this.commandsSplitterPane2Size) + "%";
                            (this.$refs.peaCommandsSplitterPane2Ref as InstanceType<typeof Pane>).$data.style.height = this.commandsSplitterPane2Size + "%";
                        }, 200);                        
                    }     
                }
            }
        },
        /* FITRUE_isPython */
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
    /* IFTRUE_isMicrobit */
    display: flex;
    flex-direction: column;
    padding:0px 15px;
    /* FITRUE_isMicrobit */
}

/**
 * The following classes overwrite the spitter's style
 * for the splitter in use in this component.
 */
/* IFTRUE_isPython */
.#{$strype-classname-commands-pea-splitter-theme}.splitpanes--horizontal>.splitpanes__splitter,
.#{$strype-classname-commands-pea-splitter-theme} > .splitpanes--horizontal>.splitpanes__splitter {
    height: 1px !important;
    background-color: black;
    position: relative;
}

.#{$strype-classname-commands-pea-splitter-theme}.#{$strype-classname-expanded-pea}.splitpanes--horizontal>.splitpanes__splitter,
.#{$strype-classname-commands-pea-splitter-theme}.#{$strype-classname-expanded-pea} > .splitpanes--horizontal>.splitpanes__splitter {
    background-color: transparent !important;    
}

.#{$strype-classname-commands-pea-splitter-theme}.splitpanes--horizontal>.splitpanes__splitter:before,
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
    background-color: $pea-outer-background-color;
}
/* FITRUE_isPython */
/** End splitter classes */

.cmd-progress-container {
    margin-top: 5px;
    background-color: #E2E7E0 !important;
    border: 1px lightgrey solid;
    width: 100%;
}

@mixin centerer {
  position: absolute;
  left: 50%;
  transform: translate(-50%, -50%);
}

.#{$strype-classname-no-pea-commands} {
    /* IFTRUE_isPython */
    overflow-y: hidden;
    display: flex;
    flex-direction: column;
    height: 100%;    
    /* FITRUE_isPython */
    /* IFTRUE_isMicrobit */
    overflow-y: auto;
    /* FITRUE_isMicrobit */
}

.progress-bar-text {
    @include centerer;
    color:#fefefe !important;
    text-align: left !important;
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

.#{$strype-classname-add-frame-commands-container} p {
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
}

.#{$strype-classname-add-frame-commands-container}.with-expanded-PEA p {
   // So that the frame commands in expanded view expands over the commands/PEA splitter,
   // the width is set programmatically
   position: absolute;   
}

.#{$strype-classname-pea-container} {
    /* IFTRUE_isPython */
    margin: 0px $strype-python-exec-area-margin $strype-python-exec-area-margin $strype-python-exec-area-margin;
    /* FITRUE_isPython */
    /* IFTRUE_isMicrobit */
    margin-bottom: 40px;
    overflow: hidden; // that is used to keep the margin https://stackoverflow.com/questions/44165725/flexbox-preventing-margins-from-being-respected
    flex-grow: 3;
    flex-shrink: 0;
    /* FITRUE_isMicrobit */
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
}

//the following overrides the bootstrap tab generated styles
#commandsTabs ul {
    border-bottom-color: #bbc8b6 !important;
}

.nav-item{
    cursor: no-drop;
}
//ends bootstrap overriding

/* IFTRUE_isMicrobit */
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
/* FITRUE_isMicrobit */
</style>
