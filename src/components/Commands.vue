<template>
    <div class="commands">
        <div :class="{'no-PEA-commands': true, 'cropped': isExpandedPEA}" @wheel.stop>
            <div class="project-name-container">
                <span class="project-name">{{projectName}}</span>
                <div @mouseover="getLastProjectSavedDateTooltip" :title="lastProjectSavedDateTooltip">
                    <img v-if="isProjectFromGoogleDrive" :src="require('@/assets/images/logoGDrive.png')" alt="Google Drive" class="project-target-logo"/> 
                    <img v-else-if="isProjectFromFS" :src="require('@/assets/images/FSicon.png')" :alt="$t('appMessage.targetFS')" class="project-target-logo"/> 
                    <span class="gdrive-sync-label" v-if="!isProjectNotSourced && !isEditorContentModifiedFlag" v-t="'appMessage.savedGDrive'" />
                    <span class="gdrive-sync-label" v-else-if="isEditorContentModifiedFlag" v-t="'appMessage.modifGDrive'" :class="{'modifed-label-span': isProjectNotSourced}" />
                    <ModalDlg :dlgId="shareGDProjectModalDlgId" :okCustomTitle="$t('buttonLabel.copyLink')" :dlgTitle="$t('appMessage.createShareProjectLink')" :autoFocusButton="'ok'">
                        <div>
                            <span class="share-mode-buttons-container-title">{{$i18n.t('appMessage.shareProjectModeLabel')}}</span>
                            <div class="share-mode-buttons-container">
                                    <div class="share-mode-button-group">
                                    <input type="radio" id="shareGDProjectPublicRadioBtn" name="shareGDModeRadioGroup" 
                                        v-model="shareProjectMode" :value="shareProjectWithinGDModeValue" />
                                    <div>
                                        <label for="shareGDProjectPublicRadioBtn" >{{$i18n.t("appMessage.shareProjectWithinGDMode")}}</label>
                                        <span>{{$i18n.t("appMessage.shareProjectWithinGDModeDetails")}}</span>
                                    </div>
                                </div>
                                <div class="share-mode-button-group">
                                    <input type="radio" id="shareGDProjectWithGDRadioBtn" name="shareGDModeRadioGroup"
                                    v-model="shareProjectMode" :value="shareProjectPublicModeValue" />
                                    <div>
                                        <label for="shareGDProjectWithGDRadioBtn" >{{$i18n.t("appMessage.shareProjectPublicMode")}}</label>
                                        <span>{{$i18n.t("appMessage.shareProjectPublicModeDetails")}}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ModalDlg>
                </div>
                <img 
                    v-if="isProjectFromGoogleDrive"
                    :src="require('@/assets/images/share.png')"
                    :class="{'share-proj-img': true, disabled: isEditorContentModifiedFlag}" 
                    :title="$t((isEditorContentModifiedFlag)?'appMessage.needSaveShareProj':'appMessage.shareProj')"
                    @click="shareProject"
                />
            </div>     
            <div @mousedown.prevent.stop @mouseup.prevent.stop>
                /* IFTRUE_isMicrobit
                <b-tabs id="commandsTabs" content-class="mt-2" v-model="tabIndex">
                    <b-tab :title="$t('commandTabs.0')" active :title-link-class="getTabClasses(0)" :disabled="isEditing">
                FITRUE_isMicrobit */
                        <div :id="commandsContainerUID" class="command-tab-content" >
                            <div id="addFramePanel">
                                <div class="frameCommands">
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
        <div class="flex-padding"/>
        <python-execution-area class="python-exec-area-container" :ref="peaComponentRefId"/>
        FITRUE_isPython */
        /* IFTRUE_isMicrobit      
        <div class="python-exec-area-container">  
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
                <button type="button" @click="runToMicrobit" v-t="'buttonLabel.runOnMicrobit'" class="btn btn-secondary cmd-button"/>
            </div>
        </div>
        FITRUE_isMicrobit */
    </div>
</template>

<script lang="ts">
import AddFrameCommand from "@/components/AddFrameCommand.vue";
import { CustomEventTypes, getActiveContextMenu, getAddFrameCmdElementUID, getAppSimpleMsgDlgId, getCommandsContainerUID, getCommandsRightPaneContainerId, getCurrentFrameSelectionScope, getEditorMiddleUID, getGoogleDriveComponentRefId, getManuallyResizedEditorHeightFlag, getMenuLeftPaneUID, getStrypePEAComponentRefId, handleContextMenuKBInteraction, hiddenShorthandFrames, notifyDragEnded, sharedStrypeProjectIdKey, sharedStrypeProjectTargetKey } from "@/helpers/editor";
import { useStore } from "@/store/store";
import { AddFrameCommandDef, AllFrameTypesIdentifier, CaretPosition, FrameObject, PythonExecRunningState, SelectAllFramesFuncDefScope, ShareProjectMode, StrypeSyncTarget } from "@/types/types";
import $ from "jquery";
import Vue from "vue";
import browserDetect from "vue-browser-detect-plugin";
import { mapStores } from "pinia";
import { getFrameSectionIdFromFrameId } from "@/helpers/storeMethods";
import Menu from "@/components/Menu.vue";
import GoogleDrive from "@/components/GoogleDrive.vue";
import ModalDlg from "@/components/ModalDlg.vue";
/* IFTRUE_isPython */
import PythonExecutionArea from "@/components/PythonExecutionArea.vue";
import { isMacOSPlatform } from "@/helpers/common";
/* FITRUE_isPython */
/* IFTRUE_isMicrobit */
import APIDiscovery from "@/components/APIDiscovery.vue";
import { flash } from "@/helpers/webUSB";
import { downloadHex } from "@/helpers/download";
import { BvModalEvent } from "bootstrap-vue";
/* FITRUE_isMicrobit */

export default Vue.extend({
    name: "Commands",

    components: {
        AddFrameCommand,
        ModalDlg,
        /* IFTRUE_isMicrobit */
        APIDiscovery,
        /* FITRUE_isMicrobit */
        /* IFTRUE_isPython */
        PythonExecutionArea, 
        /* FITRUE_isPython */
    },

    data: function () {
        return {
            showProgress: false,
            progressPercent: 0,
            uploadThroughUSB: false,
            frameCommandsReactiveFlag: false, // this flag is only use to allow a reactive binding when the add frame commands are updated (language),
            isExpandedPEA: false, // flag indicating whether the Python Execution Area is expanded (to fit the other parts of the commands)
            lastProjectSavedDateTooltip: "", // update on a mouse over event (in getLastProjectSavedDateTooltip)
            shareProjectMode: ShareProjectMode.withinGD,
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

        isProjectFromGoogleDrive(): boolean {
            return this.appStore.syncTarget == StrypeSyncTarget.gd;
        },

        isProjectFromFS(): boolean {
            return this.appStore.syncTarget == StrypeSyncTarget.fs;
        },
        
        isProjectNotSourced(): boolean {
            return this.appStore.syncTarget == StrypeSyncTarget.none;
        },

        shareGDProjectModalDlgId(): string {
            return "shareGDProjectModalDlg";
        },

        shareProjectPublicModeValue() {
            return ShareProjectMode.public;
        },

        shareProjectWithinGDModeValue() {
            return ShareProjectMode.withinGD;
        },
        
        /* IFTRUE_isPython */
        peaComponentRefId(): string {
            return getStrypePEAComponentRefId();
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
            if(currentFrame.isDisabled && ((currentFrame.caretVisibility === CaretPosition.body) ? true : !this.appStore.canAddFrameBelowDisabled(currentFrame.id))){
                return {};
            }

            return this.appStore.generateAvailableFrameCommands(this.appStore.currentFrame.id, this.appStore.currentFrame.caretPosition);
        },

        progressPercentWidthStyle(): string {
            return "width: " + this.progressPercent + "%;";
        },
    },

    watch: {
        addFrameCommands(){
            // When the commands list is regenerated, the height of the frame commands list may change, and so may the Python Exec Area.
            // So to make sure that the Turtle canvas is still showing in the right scaling, if Turtle is showing then we rescale a bit later.
            // Keep this in the watch rather directly inside the corresponding computed property as computed property shouldn't contain time functions.
            if(document.getElementById("pythonTurtleContainerDiv")?.style.display != "none"){
                setTimeout(() => document.getElementById("tabContentContainerDiv")?.dispatchEvent(new CustomEvent(CustomEventTypes.pythonExecAreaSizeChanged)),
                    800);
            }
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
                            // If a selection already exists, we clear it, after checking where we are at in the case of function defs (cf. below)
                            const currentFrameSelection = getCurrentFrameSelectionScope();
                            this.appStore.unselectAllFrames();
                            switch(currentFrameSelection){
                            case SelectAllFramesFuncDefScope.frame:
                            case SelectAllFramesFuncDefScope.functionsContainerBody:
                                // In imports or main code. Or in function definitions with some functions selected, or inside the function defs container.
                                // Position the frame cursor inside the body of the frame container
                                this.appStore.setCurrentFrame({id: frameContainerId, caretPosition: CaretPosition.body});
                                // And select all the children frame of the container (if any...)
                                this.appStore.frameObjects[frameContainerId].childrenIds.forEach(() => {
                                    this.appStore.selectMultipleFrames("ArrowDown");
                                });     
                                break;
                            case SelectAllFramesFuncDefScope.none:
                                // In a function definition with no frame selected or some frames inside a function body (not all).
                                // We select all the frames of the function's body.
                                {
                                    let functionDefFrameId = 0, currentFrameId = this.appStore.currentFrame.id, foundFunctionDefFrame = false;
                                    if(this.appStore.frameObjects[currentFrameId].frameType.type == AllFrameTypesIdentifier.funcdef){
                                        // If we are in the body of the function definition (just inside the body position, not somewhere else)
                                        //then we don't need to look up for the body position as we're already there...
                                        foundFunctionDefFrame = true;
                                        functionDefFrameId = currentFrameId;
                                    }
                                    while(!foundFunctionDefFrame){
                                        functionDefFrameId = this.appStore.frameObjects[currentFrameId].parentId;
                                        foundFunctionDefFrame = (this.appStore.frameObjects[functionDefFrameId].frameType.type == AllFrameTypesIdentifier.funcdef);
                                        currentFrameId = functionDefFrameId;
                                    }
                                    this.appStore.setCurrentFrame({id: functionDefFrameId, caretPosition: CaretPosition.body});
                                    // And select all the children frame of the container (if any...)
                                    this.appStore.frameObjects[functionDefFrameId].childrenIds.forEach(() => {
                                        this.appStore.selectMultipleFrames("ArrowDown");
                                    });    
                                }
                                break;
                            case SelectAllFramesFuncDefScope.belowFunc:
                                // Below a whole function definition, we select that function.
                                this.appStore.selectMultipleFrames("ArrowUp");     
                                // And reposition the caret below for consistency with other select-all conditions
                                this.appStore.setCurrentFrame({id: this.appStore.selectedFrames.at(-1) as number, caretPosition: CaretPosition.below});   
                                break;
                            case SelectAllFramesFuncDefScope.wholeFunctionBody:
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
                if((event.ctrlKey || event.metaKey) && eventKeyLowCase === "enter" && this.$refs.strypePEA) {
                    ((this.$refs.strypePEA as InstanceType<typeof PythonExecutionArea>).$refs.runButton as HTMLButtonElement).focus();
                    ((this.$refs.strypePEA as InstanceType<typeof PythonExecutionArea>).$refs.runButton as HTMLButtonElement).click();
                    // Need to unfocus to avoid keyboard focus non-obviously remaining with the run button:
                    ((this.$refs.strypePEA as InstanceType<typeof PythonExecutionArea>).$refs.runButton as HTMLButtonElement).blur();
                    
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
                if (!isDraggingFrames && !isEditing && !(isPythonExecuting && (this.$refs.strypePEA as InstanceType<typeof PythonExecutionArea>).$data.isTurtleListeningKeyEvents) && ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Tab", "Home", "End"].includes(event.key)) {
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
                        // This is overriding the natural browser behaviour that scrolls to the top or bottom of the page (at least with Chrome)
                       
                        // Look for the section we're in
                        const sectionId = getFrameSectionIdFromFrameId(this.appStore.currentFrame.id);
                        // Update the caret to the first/last position within this section
                        const isMovingHome = (event.key == "Home");
                        const isSectionEmpty = (this.appStore.frameObjects[sectionId].childrenIds.length == 0);
                        const newCaretId = (isMovingHome || isSectionEmpty) ? sectionId : this.appStore.frameObjects[sectionId].childrenIds.at(-1) as number;
                        const newCaretPosition = (isMovingHome || isSectionEmpty) ? CaretPosition.body : CaretPosition.below;
                        this.appStore.toggleCaret({id: newCaretId, caretPosition: newCaretPosition});
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
                            // If ctrl/meta + space is activated on caret, we add a new functional call frame and trigger the a/c
                            this.appStore.addFrameWithCommand(this.addFrameCommands[eventKeyLowCase][0].type);
                            this.$nextTick(() => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown",{key: " ", ctrlKey: true})));
                        }
                    }
                    else if(isPythonExecuting){
                        // The special case when the user's code is being executing, we want to handle the key events carefully.
                        // If there is a combination key (ctrl,...) we just ignore the events, otherwise, if Turtle is active we pass events to the Turtle graphics,
                        // and if it's not active AND the Python Execution console hasn't go focus, we prevents events.
                        if(!event.altKey && !event.ctrlKey && !event.metaKey){
                            const turtlePlaceholder = document.getElementById("pythonTurtleDiv");
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

                            if(document.activeElement?.id === "pythonConsole"){
                                // Don't interfere with the Python Execution console if it's having focus
                                return;
                            }

                            event.stopImmediatePropagation();
                            event.stopPropagation(),
                            event.preventDefault();
                            return;
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

                //prevent specific characters in specific frames (cf details)
                if(isEditing){
                    const frameType = this.appStore.getCurrentFrameObject.frameType.type;
                    //space in import frame's editable slots
                    if((frameType === AllFrameTypesIdentifier.import || frameType === AllFrameTypesIdentifier.fromimport) && event.key === " "){
                        event.preventDefault();
                        return;
                    }
                }
            }
        );

        document.addEventListener(CustomEventTypes.editorAddFrameCommandsUpdated, () => {
            // When the frame commands have been updated (i.e. language changed), we need to get this component to be re-rendered:
            // we use this reactive flag to trigger the recomputation of the computed property addFrameCommands
            this.frameCommandsReactiveFlag = !this.frameCommandsReactiveFlag;
        });
            
        /* IFTRUE_isPython */
        // Listen to the Python execution area size change events (as the other commands max height need to be ammended)
        document.addEventListener(CustomEventTypes.pythonExecAreaExpandCollapseChanged, (event) => {
            this.isExpandedPEA = (event as CustomEvent).detail;
            // The maximum height of the "frame commands" (the part that doesn't contain the Python Execution Area)
            // should be set to the same as the editor when the PEA is expanded, otherwise we remove the style.
            this.$nextTick(() => {
                const noPEACommandsDiv = document.getElementsByClassName("no-PEA-commands")[0] as HTMLDivElement;
                if(this.isExpandedPEA){
                    // If the editor's size was manually set by moving the splitter, we use that value, otherwise, we use 50vh.
                    noPEACommandsDiv.style.maxHeight = (getManuallyResizedEditorHeightFlag()) ? getManuallyResizedEditorHeightFlag()+"px" : "50vh";
                }
                else{
                    noPEACommandsDiv.style.maxHeight ="";
                }
            });
        });
        /* FITRUE_isPython */
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

        // Register share mode modal dialog opening event
        this.$root.$on("bv::modal::hide", this.onShareProjectModeSelectionHideModalDlg);
    },

    beforeDestroy() {
        // Just in case, we remove the Bootstrap modal event handler from the root app 
        this.$root.$off("bv::modal::hide", this.onShareProjectModeSelectionHideModalDlg);
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

        shareProject(){
            // We only share a project that is saved. Show the user what mode of sharing to use (see details in shareProjectWithMode())
            if(!this.isEditorContentModifiedFlag){
                this.$root.$emit("bv::show::modal", this.shareGDProjectModalDlgId);
            }
        },

        onShareProjectModeSelectionHideModalDlg(event: BvModalEvent, dlgId: string){
            if(dlgId == this.shareGDProjectModalDlgId && event.trigger == "ok"){
                this.shareProjectWithMode(this.shareProjectMode == ShareProjectMode.public);
            }
        },

        shareProjectWithMode(isPublicShare: boolean){
            // There is no intermediate steps when the mode is selected for sharing a project
            // (we first close the mode selector modal, then validate)
            this.$root.$emit("bv::hide::modal", this.shareGDProjectModalDlgId);

            // Sharing a project results in the share URL to be created and copied in the clipboard.
            // With Google Drive, we allow two types of sharing: either sharing the Google Drive link (after setting the project readonly and totally public in the sharing settings)
            // or just getting a Strype URL with a shared Google Drive file ID (in that case, users getting the shared link still need to connect to Google Drive first.)
            // We preare the link to share and the message to show to the users as a confirmation or error situation.
            // Note that we always generate the link: if public sharing fails, we fall back on the within Google Drive mode sharing.
            let shareLink = "", alertMessage = "";
            if(isPublicShare){
                // Before generating a link, we change the file setttings on Google Drive to make it accessible at large.
                const gdVueComponent = ((this.$root.$children[0].$refs[getMenuLeftPaneUID()] as InstanceType<typeof Menu>).$refs[getGoogleDriveComponentRefId()] as InstanceType<typeof GoogleDrive>);
                let createPermissionSucceeded = false;
                let alertErrorDetail = "";
                gdVueComponent.shareGoogleDriveFile()
                    .then((succeeded) => createPermissionSucceeded = succeeded)
                    .catch((error) => alertMessage = error)
                    .finally(() => {
                        if(createPermissionSucceeded){
                            // We have set the file public on Google Drive, now we retrieve the share link.
                            gapi.client.request({
                                path: "https://www.googleapis.com/drive/v3/files/" + gdVueComponent.saveFileId,
                                method: "GET",
                                params: {fields: "webViewLink"},
                            })
                                .then((resp) => {
                                    if(resp.status == 200){
                                        shareLink = `${window.location}?${sharedStrypeProjectIdKey}=${encodeURIComponent(JSON.parse(resp.body)["webViewLink"])}`;
                                        alertMessage = this.$i18n.t("appMessage.sharedProjectLinkCopied") as string;
                                    }
                                    else{
                                    // Something happened when we tried to get the public URL of the Google Drive file.
                                    // We still share the file within Google Drive
                                        shareLink = `${window.location}?${sharedStrypeProjectTargetKey}=${this.appStore.syncTarget}&${sharedStrypeProjectIdKey}=${this.appStore.currentGoogleDriveSaveFileId}`;
                                        alertMessage = this.$i18n.t("appMessage.gdPublicShareFailed", (this.$i18n.t("errorMessage.webViewLinkNotRetrieved", resp.status?.toString()??"unknown") as string)) as string;
                                    }
                                })
                                .catch((error) => {
                                    // Something happened when we tried to get the public URL of the Google Drive file.
                                    // We still share the file within Google Drive
                                    shareLink = `${window.location}?${sharedStrypeProjectTargetKey}=${this.appStore.syncTarget}&${sharedStrypeProjectIdKey}=${this.appStore.currentGoogleDriveSaveFileId}`;
                                    alertMessage = this.$i18n.t("appMessage.gdPublicShareFailed", (this.$i18n.t("errorMessage.webViewLinkNotRetrieved", error) as string)) as string;
            
                                })
                                .finally(() => this.finaliseShareProjectLink(shareLink, alertMessage));                           
                        }
                        else{
                            // The project could not be made public on Google Drive for some reason.
                            // We still make a share link but we make it within Google Drive instead.
                            shareLink = `${window.location}?${sharedStrypeProjectTargetKey}=${this.appStore.syncTarget}&${sharedStrypeProjectIdKey}=${this.appStore.currentGoogleDriveSaveFileId}`;
                            alertMessage = this.$i18n.t("appMessage.gdPublicShareFailed", alertErrorDetail) as string;
                            this.finaliseShareProjectLink(shareLink, alertMessage);
                        }
                    });            
            }
            else{
                shareLink = `${window.location}?${sharedStrypeProjectTargetKey}=${this.appStore.syncTarget}&${sharedStrypeProjectIdKey}=${this.appStore.currentGoogleDriveSaveFileId}`;
                alertMessage = this.$i18n.t("appMessage.sharedProjectLinkCopied") as string;
                this.finaliseShareProjectLink(shareLink, alertMessage);
            }
        },

        finaliseShareProjectLink(shareLink: string, alertMsg: string){
            // Paste the share link in the clipboard and show the user an information message.
            navigator.clipboard.writeText(shareLink);
            this.appStore.simpleModalDlgMsg = alertMsg;
            this.$root.$emit("bv::show::modal", getAppSimpleMsgDlgId());        
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
    },
});
</script>

<style lang="scss">
.project-name-container {
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

.share-proj-img {
    cursor: pointer;
    margin-left: 5px;
    width: 0.75em;
}

.share-proj-img.disabled {
    opacity: 25%;
    cursor: default;
}

.share-mode-buttons-container-title {
    font-weight: 600;
}

.share-mode-buttons-container {
    display: table;
    margin-left: 30px;
    margin-top: 10px;
}

.share-mode-button-group {
    display: table-row;
}

.share-mode-buttons-container input,
.share-mode-buttons-container > div > div {
    display: table-cell;
    font-size: 95%;
}

.share-mode-buttons-container > div > div {
    padding-left: 5px;
}

.share-mode-buttons-container span {
    font-size: 90%;
    display: block;
}

.share-mode-buttons-container > .share-mode-button-group:first-child span {
    margin-bottom: 20px;
}

.commands {
    border-left: #383b40 1px solid;
    color: #252323;
    background-color: #E2E7E0;
    display: flex;
    flex-direction: column;
    height: 100vh;
    /* IFTRUE_isMicrobit */
    padding:0px 15px;
    /* FITRUE_isMicrobit */
}

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

.no-PEA-commands {
    overflow-y: auto;
}

.no-PEA-commands.cropped {
    max-height: 50vh;
}

.progress-bar-text {
    @include centerer;
    color:#fefefe !important;
    text-align: left !important;
    font-weight: bold;
}

.commands-container {
    display: inline-block;
}

#keystrokeSpan {
    bottom:2px;
    left: 50%;
    transform: translate(-50%, 0);
    position: absolute;
    font-size:large;
    color:#666666;
}

.frameCommands p {
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
}

.flex-padding {
    flex-grow: 2;
}

.python-exec-area-container {
    /* IFTRUE_isPython */
    margin: 0px 5px 5px 5px;
    /* FITRUE_isPython */
    /* IFTRUE_isMicrobit */
    margin-bottom: 90px;
    overflow: hidden; // that is used to keep the margin https://stackoverflow.com/questions/44165725/flexbox-preventing-margins-from-being-respected
    flex-grow: 3;
    /* FITRUE_isMicrobit */
    display: flex;
    flex-direction: column;    
    align-items: flex-start;
    justify-content: flex-end;
}

.cmd-button {
    padding: 1px 6px 1px 6px !important;
    margin-top: 5px;
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
</style>
