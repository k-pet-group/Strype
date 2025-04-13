<template>
    <div class="commands">
        <div :class="{'no-PEA-commands': true, 'cropped': isExpandedPEA}" @wheel.stop>
            <div class="project-name-container">
                <span class="project-name">{{projectName}}</span>
                <div v-if="isSyncingInGoogleDrive" :title="autoSaveGDriveTooltip">
                    <img :src="require('@/assets/images/logoGDrive.png')" alt="Google Drive" class="gdrive-logo"/>   
                    <span class="gdrive-sync-label" v-if="isSyncingInGoogleDrive && !isEditorContentModifiedFlag" v-t="'appMessage.autosaveGDrive'" />
                </div>
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
import { autoSaveFreqMins, CustomEventTypes, getActiveContextMenu, getAddFrameCmdElementUID, getCommandsContainerUID, getCommandsRightPaneContainerId, getCurrentFrameSelectionScope, getEditorMiddleUID, getManuallyResizedEditorHeightFlag, getMenuLeftPaneUID, getStrypePEAComponentRefId, handleContextMenuKBInteraction, hiddenShorthandFrames, notifyDragEnded } from "@/helpers/editor";
import { getFrameSectionIdFromFrameId } from "@/helpers/storeMethods";
import { useStore } from "@/store/store";
import { AddFrameCommandDef, AllFrameTypesIdentifier, CaretPosition, FrameObject, PythonExecRunningState, SelectAllFramesFuncDefScope, StrypeSyncTarget } from "@/types/types";
import $ from "jquery";
import { mapStores } from "pinia";
import Vue from "vue";
import browserDetect from "vue-browser-detect-plugin";
/* IFTRUE_isPython */
import PythonExecutionArea from "@/components/PythonExecutionArea.vue";
import { isMacOSPlatform } from "@/helpers/common";
/* FITRUE_isPython */
/* IFTRUE_isMicrobit */
import APIDiscovery from "@/components/APIDiscovery.vue";
import { downloadHex } from "@/helpers/download";
import { flash } from "@/helpers/webUSB";
/* FITRUE_isMicrobit */

export default Vue.extend({
    name: "Commands",

    components: {
        AddFrameCommand,
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

        isSyncingInGoogleDrive(): boolean {
            return this.appStore.syncTarget == StrypeSyncTarget.gd;
        },

        autoSaveGDriveTooltip(): string {
            return this.$i18n.t("appMessage.autoSaveGDriveTooltip", {freq: autoSaveFreqMins}) as string;
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

                if(event.ctrlKey || event.metaKey) {
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
                // (then we jus leave the PEA handling it, see at the end of these conditions for related code)
                if (!isEditing && !(isPythonExecuting && (this.$refs.strypePEA as InstanceType<typeof PythonExecutionArea>).$data.isTurtleListeningKeyEvents) && ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Tab", "Home", "End"].includes(event.key)) {
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
                    if(!isEditing && !this.appStore.isAppMenuOpened && !isPythonExecuting){
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

.project-name {
    color: #274D19;
}

.gdrive-logo {
    width: 16px;
    height: 16px;
    margin-left: 5px;
    margin-right: 2px;
}

.gdrive-sync-label {
    color: #2e641b;
    font-size: 80%;
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
