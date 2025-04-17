<template>
    <div id="app" class="container-fluid print-full-height">
        <BadgeBanner 
            v-if="isBadgeVisible" 
            :message="badgeMessage" 
            @close="$emit('close')" 
        />
        <Splitpanes id="expandedPythonExecAreaSplitersOverlay" class="strype-split-theme" v-show="isExpandedPythonExecArea" horizontal @resize=onExpandedPythonExecAreaSplitPaneResize>
            <pane key="1">
            </pane>
            <pane key="2" min-size="20" max-size="80" size="50">
            </pane>
        </Splitpanes>
        <!-- Keep the style position of the row div to get proper z order layout of the app -->
        <div class="row" style="position: relative;">
            <Splitpanes class="strype-split-theme" @resize=onStrypeCommandsSplitPaneResize>
                <Pane key="1" size="66" min-size="33" max-size="90">
                    <!-- These data items are to enable testing: -->
                    <div id="editor" :data-slot-focus-id="slotFocusId" :data-slot-cursor="slotCursorPos" class="print-full-height">
                        <div class="top no-print">
                            <MessageBanner 
                                v-if="showMessage"
                            />
                        </div>
                        <div class="row no-gutters" >
                            <Menu 
                                :id="menuUID" 
                                :ref="menuUID"
                                @app-showprogress="applyShowAppProgress"
                                @app-reset-project="resetStrypeProject"
                                class="noselect no-print"
                            />
                            <div class="col">
                                <div 
                                    :id="editorUID" 
                                    :class="{'editor-code-div noselect print-full-height':true, 'full-height-editor-code-div':!isExpandedPythonExecArea, 'cropped-editor-code-div': isExpandedPythonExecArea}" 
                                >
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
                <Pane key="2" size="34" class="no-print">
                    <Commands :id="commandsContainerId" class="noselect" :ref="strypeCommandsRefId" />
                </Pane>
            </SplitPanes>
        </div>
        <SimpleMsgModalDlg :dlgId="simpleMsgModalDlgId"/>
        <ModalDlg :dlgId="importDiffVersionModalDlgId" :useYesNo="true">
            <span v-t="'appMessage.editorFileUploadWrongVersion'" />                
        </ModalDlg>
        <ModalDlg :dlgId="resyncGDAtStartupModalDlgId" :useYesNo="true" :okCustomTitle="$t('buttonLabel.yesSign')" :cancelCustomTitle="$t('buttonLabel.noContinueWithout')">
            <span style="white-space:pre-wrap">{{ $t('appMessage.resyncToGDAtStartup') }}</span>
        </ModalDlg>
        <div :id="getSkulptBackendTurtleDivId" class="hidden"></div>
        <canvas v-show="appStore.isDraggingFrame" :id="getCompanionDndCanvasId" class="companion-canvas-dnd"/>
    </div>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import BadgeBanner from "@/components/BadgeBanner.vue";
import Commands from "@/components/Commands.vue";
import Frame from "@/components/Frame.vue";
import FrameBody from "@/components/FrameBody.vue";
import FrameContainer from "@/components/FrameContainer.vue";
import JointFrames from "@/components/JointFrames.vue";
import Menu from "@/components/Menu.vue";
import MessageBanner from "@/components/MessageBanner.vue";
import ModalDlg from "@/components/ModalDlg.vue";
import SimpleMsgModalDlg from "@/components/SimpleMsgModalDlg.vue";
import { useStore } from "@/store/store";
import { AppEvent, AutoSaveFunction, BaseSlot, CaretPosition, FormattedMessage, FormattedMessageArgKeyValuePlaceholders, FrameObject, MessageDefinitions, MessageTypes, ModifierKeyCode, Position, PythonExecRunningState, SaveRequestReason, SlotCursorInfos, SlotType, SlotsStructure, StringSlot } from "@/types/types";
import { Pane, Splitpanes } from "splitpanes";
import Vue from "vue";
import { CustomEventTypes, actOnTurtleImport, addDuplicateActionOnFramesDnD, autoSaveFreqMins, frameContextMenuShortcuts, getActiveContextMenu, getAppSimpleMsgDlgId, getCaretContainerRef, getCommandsRightPaneContainerId, getCompanionDndCanvasId, getEditorMiddleUID, getFrameBodyRef, getFrameContainerUID, getFrameContextMenuUID, getFrameLabelSlotsStructureUID, getFrameUID, getGoogleDriveComponentRefId, getImportDiffVersionModalDlgId, getJointFramesRef, getLabelSlotUID, getMenuLeftPaneUID, getSameLevelAncestorIndex, getSelectionCursorsComparisonValue, getStrypeCommandComponentRefId, getStrypePEAComponentRefId, isContextMenuItemSelected, isElementLabelSlotInput, parseLabelSlotUID, removeDuplicateActionOnFramesDnD, setDocumentSelection, setManuallyResizedEditorHeightFlag, setPythonExecAreaExpandButtonPos, setPythonExecutionAreaTabsContentMaxHeight } from "./helpers/editor";
/* IFTRUE_isMicrobit */
import { getAPIItemTextualDescriptions } from "./helpers/microbitAPIDiscovery";
import { DAPWrapper } from "./helpers/partial-flashing";
/* FITRUE_isMicrobit */
import { BACKEND_SKULPT_DIV_ID } from "@/autocompletion/ac-skulpt";
import CaretContainer from "@/components/CaretContainer.vue";
import GoogleDrive from "@/components/GoogleDrive.vue";
import { STRYPE_LOCATION, copyFramesFromParsedPython, splitLinesToSections } from "@/helpers/pythonToFrames";
import { BvModalEvent } from "bootstrap-vue";
import { cloneDeep } from "lodash";
import { mapStores } from "pinia";
import { VueContextConstructor } from "vue-context";
import { getFrameContainer, getSlotIdFromParentIdAndIndexSplit, getSlotParentIdAndIndexSplit, retrieveParentSlotFromSlotInfos, retrieveSlotFromSlotInfos } from "./helpers/storeMethods";

let autoSaveTimerId = -1;
let autoSaveState : AutoSaveFunction[] = [];

//////////////////////
//     Component    //
//////////////////////
export default Vue.extend({
    name: "App",
    
    components: {
        MessageBanner,
        FrameContainer,
        Commands,
        Menu,
        ModalDlg,
        SimpleMsgModalDlg,
        Splitpanes,
        Pane,
        BadgeBanner, //Added the badge banner component
    },

    data: function() {
        return {
            showAppProgress: false,
            setAppNotOnTop: false,
            progressbarMessage: "",
            resetStrypeProjectFlag: false,
            isExpandedPythonExecArea: false,
            badgeMessage: "Hooray!", //Added for badge message
        };
    },

    computed: {
        ...mapStores(useStore),
        isBadgeVisible(): boolean{
            return this.appStore.badgeBannerVisible;
        },
        // gets the container frames objects which are in the root
        containerFrames(): FrameObject[] {
            return this.appStore.getFramesForParentId(0);
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

        commandsContainerId(): string {
            return getCommandsRightPaneContainerId();
        },

        localStorageAutosaveKey(): string {
            let storageString = "PythonStrypeSavedState";
            /* IFTRUE_isMicrobit */
            storageString = "MicrobitStrypeSavedState";
            /*FITRUE_isMicrobit */
            return storageString;
        },

        simpleMsgModalDlgId(): string{
            return getAppSimpleMsgDlgId();
        },

        importDiffVersionModalDlgId(): string {
            return getImportDiffVersionModalDlgId();
        },

        resyncGDAtStartupModalDlgId(): string {
            return "resyncGDAtStartupModalDlg";
        },

        getSkulptBackendTurtleDivId(): string {
            return BACKEND_SKULPT_DIV_ID;
        },

        isPythonExecuting(): boolean {
            return (this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning;
        },

        getCompanionDndCanvasId(): string {
            return getCompanionDndCanvasId();
        },
    },

    created() {
        autoSaveState[0] = {name: "WS", function: (reason: SaveRequestReason) => this.autoSaveStateToWebLocalStorage(reason)};
        window.addEventListener("beforeunload", (event) => {
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
            if(!this.resetStrypeProjectFlag){
                autoSaveState.forEach((asf) => asf.function(SaveRequestReason.unloadPage));
            }
            else {
                // if the user cancels the reload, and that the reset was request, we need to restore the autosave process:
                // to make sure this doesn't happen right when the user validates the reload, we do it later: if the user had
                // cancelled the reload, the timeout will occur, and if the page has been reload, it won't (most likely)
                setTimeout(() =>  {
                    this.resetStrypeProjectFlag = true;
                    this.setAutoSaveState();
                }, 10000);
                
            }
        });

        // By means of protection against browser crashes or anything that could prevent auto-backup, we do a backup every 2 minutes
        this.setAutoSaveState();

        // Prevent the native context menu to be shown at some places we don't want it to be shown (basically everywhere but editable slots)
        // We can't know if that is called because of a click or because of the keyboard shortcut - and it's important to know because we need to process
        // things differently based on one or the other. That's why we have a flag on the keyboard shortcut (in keydown even registration) to make the distinction.
        window.addEventListener(
            "contextmenu", (event) => this.handleContextMenu(event)
        );

        window.addEventListener("keydown", (event: KeyboardEvent) => {
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
                else if(event.key != "Enter" || (event.key == "Enter" && !isContextMenuItemSelected())){
                    // Note: that's not an ideal way of using the Keyboard Event, but the source code for VueContext uses keycodes...
                    activeContextMenu.dispatchEvent(new KeyboardEvent("keydown", {keyCode: 27}));
                }
                else{
                    // An element from the menu is activated via "Enter", we don't interfere.
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
        });

        // There are only a few cases when we need to handle key up events
        window.addEventListener("keyup", (event) => {
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
        });

        /* IFTRUE_isPython */
        // Listen to the Python execution area size change events (as the editor needs to be resized too)
        document.addEventListener(CustomEventTypes.pythonExecAreaExpandCollapseChanged, (event) => {
            this.isExpandedPythonExecArea = (event as CustomEvent).detail;
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

        // Add a listener for the whole window resize.
        window.addEventListener("resize",() => {
            // Re-scale the Turtle canvas.
            document.getElementById("tabContentContainerDiv")?.dispatchEvent(new CustomEvent(CustomEventTypes.pythonExecAreaSizeChanged));
        });

        // When the page is loaded, we might load an existing code for which the caret is not visible, so we get it into view.
        setTimeout(() => {
            const htmlElementToShowId = (this.appStore.focusSlotCursorInfos) ? getLabelSlotUID(this.appStore.focusSlotCursorInfos.slotInfos) : ("caret_"+this.appStore.currentFrame.caretPosition+"_of_frame_"+this.appStore.currentFrame.id);
            document.getElementById(htmlElementToShowId)?.scrollIntoView();
        }, 1000);

        // Add an event listener to put the app not on top (for an element to be modal) or reset it to normal
        document.addEventListener(CustomEventTypes.requestAppNotOnTop, (event) => {
            this.setAppNotOnTop = (event as CustomEvent).detail;
        });       
    },

    destroyed() {
        // Removes the listeners
        document.removeEventListener("selectionchange", this.handleDocumentSelectionChange);
        document.removeEventListener("mouseup", this.checkMouseSelection);
        document.removeEventListener("wheel", this.blockScrollOnContextMenu);

    },

    mounted() {
        // Check the local storage (WebStorage) to see if there is a saved project from the previous time the user entered the system
        // if browser supports localstorage
        if (typeof(Storage) !== "undefined") {
            const savedState = localStorage.getItem(this.localStorageAutosaveKey);
            if(savedState) {
                this.appStore.setStateFromJSONStr( 
                    {
                        stateJSONStr: savedState,
                        showMessage: false,
                        readCompressed: true,
                    }
                ).then(() => {
                    // When a file had been reloaded and it was previously synced with Google Drive, we want to ask the user
                    // about reloading the project from Google Drive again
                    if(this.appStore.currentGoogleDriveSaveFileId) {
                        const execGetGDFileFunction = (event: BvModalEvent, dlgId: string) => {
                            if((event.trigger == "ok" || event.trigger=="event") && dlgId == this.resyncGDAtStartupModalDlgId){
                                // Fetch the Google Drive component
                                const gdVueComponent = ((this.$refs[this.menuUID] as InstanceType<typeof Menu>).$refs[getGoogleDriveComponentRefId()] as InstanceType<typeof GoogleDrive>);
                                // Initiate a connection to Google Drive via loading mechanisms (for resync at startup)
                                gdVueComponent.loadFile(true);

                                this.$root.$off("bv::modal::hide", execGetGDFileFunction); 
                            }
                        };
                        this.$root.$on("bv::modal::hide", execGetGDFileFunction); 
                        this.$root.$emit("bv::show::modal", this.resyncGDAtStartupModalDlgId);
                    }
                }, () => {});
            }
        }

        // Register a listener to handle the context menu hovers (cf onContextMenuHover())
        this.$root.$on(CustomEventTypes.contextMenuHovered, (menuElement: HTMLElement) => this.onContextMenuHover(menuElement));

        // Register a listener for a request to close a caret context menu (used by Frame.vue)
        this.$root.$on(CustomEventTypes.requestCaretContextMenuClose, () => {
            // We find the CaretContainer component currently active to properly close the menu using the component close() method.
            const currentFrameComponent = this.getFrameComponent(this.appStore.currentFrame.id);
            if(currentFrameComponent){
                const currentCaretContainerComponent = this.getCaretContainerComponent(currentFrameComponent);
                ((currentCaretContainerComponent.$refs.menu as unknown) as VueContextConstructor).close();
            }
        });

        this.$root.$on(CustomEventTypes.addFunctionToEditorAutoSave, (asf: AutoSaveFunction) => {
            // Before adding a new function to execute in the autosave mechanism, we stop the current time, and will restart it again once the function is added.
            // That is because, if the new function is added just before the next tick of the timer is due, we don't want to excecuted actions just yet to give
            // time to the user to sign in to Google Drive first, then load a potential project without saving the project that is in the editor in between.
            window.clearInterval(autoSaveTimerId);
            const asfEntry = autoSaveState.find((asfEntry) => (asfEntry.name == asf.name));
            if(asfEntry){
                // There is already some function set for that type of autosave, we just update the function
                asfEntry.function = asf.function;
            }
            else{
                // Nothing yet set for this type of autosave, we add the entry autoSaveState
                autoSaveState.push(asf);
            }
            this.setAutoSaveState();
        });

        this.$root.$on(CustomEventTypes.removeFunctionToEditorAutoSave, (asfName: string) => {           
            const toDeleteIndex = autoSaveState.findIndex((asf) => asf.name == asfName);
            if(toDeleteIndex > -1){
                window.clearInterval(autoSaveTimerId);
                autoSaveState.splice(toDeleteIndex, 1);
                this.setAutoSaveState();
            }            
        });

        // Listen to event for requesting the autosave now
        this.$root.$on(CustomEventTypes.requestEditorAutoSaveNow, (saveReason: SaveRequestReason) => autoSaveState.forEach((asf) => asf.function(saveReason)));

        // This case may not happen, but if we had a Strype version that contains a default initial state working with Turtle,
        // the UI should reflect it (showing the Turtle tab) so we look for Turtle in any case.
        actOnTurtleImport();
    },

    methods: {
        setAutoSaveState() {
            autoSaveTimerId = window.setInterval(() => {
                autoSaveState.forEach((asf) => asf.function(SaveRequestReason.autosave));
            }, autoSaveFreqMins * 60000);
        },
        
        autoSaveStateToWebLocalStorage(reason: SaveRequestReason) : void {
            // save the project to the localStorage (WebStorage)
            if (!this.appStore.debugging && typeof(Storage) !== "undefined") {
                localStorage.setItem(this.localStorageAutosaveKey, this.appStore.generateStateJSONStrWithCheckpoint(true));
                // If that's the only element of the auto save functions, then we can notify we're done when we save for loading
                if(reason==SaveRequestReason.loadProject && autoSaveState.length == 1){
                    this.$root.$emit(CustomEventTypes.saveStrypeProjectDoneForLoad);
                }
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
            // 2) toggle the flag to disable saving on unload
            this.resetStrypeProjectFlag = true;
            // 3) delete the WebStorage key that refers to the current autosaved project
            if (typeof(Storage) !== "undefined") {
                localStorage.removeItem(this.localStorageAutosaveKey);
            }
            // finally, reload the page to reload the Strype default project
            window.location.reload();
        },

        getFrameContainerUID(frameId: number){
            return getFrameContainerUID(frameId);
        },

        messageTop(): boolean {
            return this.appStore.currentMessage.type !== MessageTypes.imageDisplay;
        },

        handleDocumentSelectionChange(){
            // When the selection has changed, we update the cursor infos in the store.
            const docSelection = document.getSelection();
            if(docSelection){
                let anchorSpanElement = docSelection?.anchorNode?.parentElement;
                let focusSpanElement =  docSelection?.focusNode?.parentElement;
                // When the editable slots are empty, the span doesn't get the focus, but the container div does.
                // So we need to retrieve the right HTML component by hand.      
                // (usually, the first level div container gets the selection, but with FF, the second level container can also get it)     
                if(anchorSpanElement?.tagName.toLowerCase() == "div"){
                    if(anchorSpanElement.className.match(/(^| )labelSlot-container($| )/) != null){
                        // The most common case
                        anchorSpanElement = anchorSpanElement.firstElementChild as HTMLSpanElement;
                    }
                    else if(anchorSpanElement.firstElementChild?.className.match(/(^| )labelSlot-container($| )/) != null){
                        // The odd case in FF
                        anchorSpanElement = anchorSpanElement.firstElementChild.firstElementChild as HTMLSpanElement;
                    }
                }
                if(focusSpanElement?.tagName.toLowerCase() == "div"){
                    if(focusSpanElement.className.match(/(^| )labelSlot-container($| )/) != null){
                        // The most common case
                        focusSpanElement = focusSpanElement.firstElementChild as HTMLSpanElement;
                    }
                    else if(focusSpanElement.firstElementChild?.className.match(/(^| )labelSlot-container($| )/) != null){
                        // The odd case in FF
                        focusSpanElement = focusSpanElement.firstElementChild.firstElementChild as HTMLSpanElement;
                    }
                }
                if(anchorSpanElement && focusSpanElement && isElementLabelSlotInput(anchorSpanElement) && isElementLabelSlotInput(focusSpanElement)){
                    const anchorSlotInfo = parseLabelSlotUID(anchorSpanElement.id);
                    const focusSlotInfo = parseLabelSlotUID(focusSpanElement.id);
                    this.appStore.setSlotTextCursors({slotInfos: anchorSlotInfo, cursorPos: docSelection.anchorOffset},
                        {slotInfos: focusSlotInfo, cursorPos: docSelection.focusOffset});
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
                            const frameComponent = this.getFrameComponent((areFramesSelected) ? this.appStore.selectedFrames[0] : this.appStore.currentFrame.id);
                            if(frameComponent) {
                                if(areFramesSelected){
                                    (frameComponent as InstanceType<typeof Frame>).handleClick(event, menuPosition);
                                }
                                else{
                                    // When there is no selection, the menu to open is for the current caret, which can either be inside a frame's body or under a frame
                                    const caretContainerComponent = this.getCaretContainerComponent(frameComponent);
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
                    // then we need to amend the selection
                    const anchorLevel =  (anchorSlotCursorInfos?.slotInfos.slotId.split(",").length)??0;
                    const focusLevel = (focusSlotCursorInfos?.slotInfos.slotId.split(",").length)??0;
                    const sameLevelDiffParents = (focusLevel == anchorLevel && anchorParentSlotId != focusParentSlotId);
                    const hasStringSelected = (focusSlotCursorInfos.slotInfos.slotType == SlotType.string || anchorSlotCursorInfos.slotInfos.slotType == SlotType.string);
                    const isSelectionNotAllowed = (focusLevel != anchorLevel) || sameLevelDiffParents
                        || (hasStringSelected && focusSlotCursorInfos.slotInfos.slotId != anchorSlotCursorInfos.slotInfos.slotId);
                    let amendedSelectionFocusCursorSlotInfos = cloneDeep(anchorSlotCursorInfos) as SlotCursorInfos;
                    if(isSelectionNotAllowed) {
                        const forwardSelection = ((getSelectionCursorsComparisonValue() as number) < 0);
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

                    // Update the selection now 
                    const focusCursorInfoToUse = (isSelectionNotAllowed) ? amendedSelectionFocusCursorSlotInfos : focusSlotCursorInfos;
                    this.appStore.setSlotTextCursors(anchorSlotCursorInfos, focusCursorInfoToUse);
                    setDocumentSelection(anchorSlotCursorInfos, focusCursorInfoToUse);
                    // Explicitly set the focused property to the focused slot
                    this.appStore.setFocusEditableSlot({frameSlotInfos: focusCursorInfoToUse.slotInfos, 
                        caretPosition: (this.appStore.frameObjects[focusCursorInfoToUse.slotInfos.frameId].frameType.allowChildren) ? CaretPosition.body : CaretPosition.below});
                }
            });     
        },

        getFrameComponent(frameId: number, innerLookDetails?: {frameParentComponent: InstanceType<typeof Frame> | InstanceType<typeof FrameContainer> | InstanceType<typeof FrameBody> | InstanceType<typeof JointFrames>, listOfFrameIdToCheck: number[]}): InstanceType<typeof Frame> | InstanceType<typeof FrameContainer> | undefined {
            // This methods gets the (Vue) reference of a frame based on its ID, or undefined if we could not find it.
            // The logic to retrieve the reference relies on the implementation of the editor, as we look in 
            // the frame containers which are supposed to hold the frames, and within frame body/joint when a frame can have children/joint frames.
            // If no root is provided, we assume we search the frame reference everywhere in the editor, meaning we look into the frame containers of App (this)
            // IMPORTANT NOTE: we are getting arrays of refs here when retrieving the refs, because the referenced elements are within a v-for
            // https://laracasts.com/discuss/channels/vue/ref-is-an-array 
            let result = undefined;
            if(innerLookDetails){                
                for(const childFrameId of innerLookDetails.listOfFrameIdToCheck){
                    const childFrameComponent = ((innerLookDetails.frameParentComponent.$refs[getFrameUID(childFrameId)] as (Vue|Element)[])[0] as InstanceType<typeof Frame>);
                    if(childFrameId == frameId){
                        // Found the frame directly inside this list of frames
                        result =  childFrameComponent;
                        break;
                    }
                    else if(this.appStore.frameObjects[childFrameId].childrenIds.length > 0 || this.appStore.frameObjects[childFrameId].jointFrameIds.length > 0){
                        // That frame isn't the one we want, but maybe it contains the one we want so we look into it.
                        // We first look into the children, the joint frames (which may have children as well)
                        const frameBodyComponent = (childFrameComponent.$refs[getFrameBodyRef()] as InstanceType<typeof FrameBody>); // There is 1 body in a frame, no v-for is used, we have 1 element
                        result = this.getFrameComponent(frameId, {frameParentComponent: frameBodyComponent, listOfFrameIdToCheck: this.appStore.frameObjects[childFrameId].childrenIds});

                        if(!result){
                            // Check joints if we didn't find anything in the children
                            const jointFramesComponent = (childFrameComponent.$refs[getJointFramesRef()] as InstanceType<typeof FrameBody>); // There is 1 joint frames strcut in a frame, no v-for is used, we have 1 element
                            result = this.getFrameComponent(frameId, {frameParentComponent: jointFramesComponent, listOfFrameIdToCheck: this.appStore.frameObjects[childFrameId].jointFrameIds});
                        }

                        if(result){
                            break;
                        }
                    }
                }
            }
            else{
                // When we look for the frame from the whole editor, we need to find in wich frame container that frame lives.
                // We don't need to parse recursively for getting the refs/frames as we can just find out what frame container it is in first directly...
                // And if we are already in the container (body), then we just return this component 
                const frameContainerId = (frameId < 0) ? frameId : getFrameContainer(frameId); 
                const containerElementRefs = this.$refs[getFrameContainerUID(frameContainerId)] as (Vue|Element)[];
                if(containerElementRefs) {
                    result = (frameId < 0) 
                        ? containerElementRefs[0] as InstanceType<typeof FrameContainer>
                        : this.getFrameComponent(frameId,{frameParentComponent: containerElementRefs[0] as InstanceType<typeof FrameContainer>, listOfFrameIdToCheck: this.appStore.frameObjects[frameContainerId].childrenIds});
                }
            }

            return result;
        },

        getCaretContainerComponent(frameComponent: InstanceType<typeof Frame> | InstanceType<typeof FrameContainer>): InstanceType<typeof CaretContainer> {
            const caretContainerComponent = (this.appStore.currentFrame.id < 0 || this.appStore.currentFrame.caretPosition == CaretPosition.below)
                ? (frameComponent.$refs[getCaretContainerRef()] as InstanceType<typeof CaretContainer>)
                : ((frameComponent.$refs[getFrameBodyRef()] as InstanceType<typeof FrameBody>).$refs[getCaretContainerRef()] as InstanceType<typeof CaretContainer>); 
            return caretContainerComponent;                              
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
                : document.querySelector(".caret-container:has(> .navigationPosition.caret:not(.invisible))"); // We want to retrieve the caret container of the currently visible caret
            const lastSelectedTargetElement = (isTargetFrames) 
                ? document.getElementById(getFrameUID(this.appStore.selectedFrames.at(-1) as number)) 
                : document.querySelector(".caret-container:has(> .navigationPosition.caret:not(.invisible))");
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

        onExpandedPythonExecAreaSplitPaneResize(event: any){
            // We want to know the size of the second pane (https://antoniandre.github.io/splitpanes/#emitted-events).
            // It will dictate the size of the Python execution area (expanded, with a range between 20% and 80% of the vh)
            const lowerPanelSize = event[1].size;
            if(lowerPanelSize >= 20 && lowerPanelSize <= 80){
                // As the splitter works in percentage, and the full app height is which of the body, we can compute the height/position
                // of the editor and of the Python execution area.
                const fullAppHeight= (document.getElementsByTagName("body")[0].clientHeight);
                const editorNewMaxHeight = fullAppHeight * (1 - lowerPanelSize /100);
                // When the user has used the splitter slider to resize the Python execution area, we set a flag in the store: 
                // as we play with styling we need to know (see PythonExecutionArea.vue)
                setManuallyResizedEditorHeightFlag(editorNewMaxHeight);
                // Set the editor's max height (fitting within the first pane's height); as well as the "frame commands" panel's
                (document.getElementsByClassName("cropped-editor-code-div")[0] as HTMLDivElement).style.maxHeight = (editorNewMaxHeight + "px");
                (document.getElementsByClassName("no-PEA-commands")[0] as HTMLDivElement).style.maxHeight = (editorNewMaxHeight + "px");
                // Set the Python Execution Area's position
                (document.querySelector(".python-exec-area-container.expanded-PEA") as HTMLDivElement).style.top = (editorNewMaxHeight + "px");
                // Set the max height of the Python Execution Area's tab content
                setPythonExecutionAreaTabsContentMaxHeight();
                // Trigger a resized event (for scaling the Turtle canvas properly)
                document.getElementById("tabContentContainerDiv")?.dispatchEvent(new CustomEvent(CustomEventTypes.pythonExecAreaSizeChanged));
            }

            // Update the Python Execution Area expand button position
            setPythonExecAreaExpandButtonPos();
        },

        onStrypeCommandsSplitPaneResize(){
            // When the Stryle commands are resized, we need to also update the Turtle canvas
            document.getElementById("tabContentContainerDiv")?.dispatchEvent(new CustomEvent(CustomEventTypes.pythonExecAreaSizeChanged));
        },
        
        setStateFromPythonFile(completeSource: string, fileName: string, fileLocation?: FileSystemFileHandle) : void {
            const allLines = completeSource.split(/\r?\n/);
            // Split can make an extra blank line at the end which we don't want:
            if (allLines.length > 0 && allLines[allLines.length - 1] === "") {
                allLines.pop();
            }
            const s = splitLinesToSections(allLines);
            // Bit awkward but we first copy each to check for errors because
            // if there are any errors we don't want to paste any:
            const err = copyFramesFromParsedPython(s.imports.join("\n"), STRYPE_LOCATION.IMPORTS_SECTION, s.importsMapping)
                        ?? copyFramesFromParsedPython(s.defs.join("\n"), STRYPE_LOCATION.FUNCDEF_SECTION, s.defsMapping)
                        ?? copyFramesFromParsedPython(s.main.join("\n"), STRYPE_LOCATION.MAIN_CODE_SECTION, s.mainMapping);
            if (err != null) {
                const msg = cloneDeep(MessageDefinitions.InvalidPythonParseImport);
                const msgObj = msg.message as FormattedMessage;
                msgObj.args[FormattedMessageArgKeyValuePlaceholders.error.key] = msgObj.args.errorMsg.replace(FormattedMessageArgKeyValuePlaceholders.error.placeholderName, err);
                
                useStore().showMessage(msg, 10000);
            }
            else {
                // Clear the current existing code (i.e. frames) of the editor
                this.appStore.clearAllFrames();

                copyFramesFromParsedPython(s.imports.join("\n"), STRYPE_LOCATION.IMPORTS_SECTION);
                if (useStore().copiedSelectionFrameIds.length > 0) {
                    this.getCaretContainerComponent(this.getFrameComponent(-1) as InstanceType<typeof FrameContainer>).doPaste(true);
                }
                copyFramesFromParsedPython(s.defs.join("\n"), STRYPE_LOCATION.FUNCDEF_SECTION);
                if (useStore().copiedSelectionFrameIds.length > 0) {
                    this.getCaretContainerComponent(this.getFrameComponent(-2) as InstanceType<typeof FrameContainer>).doPaste(true);
                }
                if (s.main.length > 0) {
                    copyFramesFromParsedPython(s.main.join("\n"), STRYPE_LOCATION.MAIN_CODE_SECTION);
                    if (useStore().copiedSelectionFrameIds.length > 0) {
                        this.getCaretContainerComponent(this.getFrameComponent(-3) as InstanceType<typeof FrameContainer>).doPaste(true);
                    }
                }

                // Now we can clear other non-frame related elements
                this.appStore.clearNoneFrameRelatedState();
             
                /* IFTRUE_isPython */
                // We check about turtle being imported as at loading a state we should reflect if turtle was added in that state.
                actOnTurtleImport();

                // Clear the Python Execution Area as it could have be run before.
                ((this.$root.$children[0].$refs[getStrypeCommandComponentRefId()] as Vue).$refs[getStrypePEAComponentRefId()] as any).clear();
                /* FITRUE_isPython */

                // Finally, we can trigger the notifcation a file has been loaded.
                (this.$refs[this.menuUID] as InstanceType<typeof Menu>).onFileLoaded(fileName, fileLocation);
            }
        },
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
    .cropped-editor-code-div {
        max-height: 50vh;
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

body.dragging-frame {
    cursor: grabbing !important;
}

.app-overlay-pane  {
    width: 100%;
    height: 100vh;
    position: absolute;
    left: 0px;
    z-index: 5000;

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
    font-family: 'Source Sans Pro', sans-serif;
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
    z-index:6000;
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

.v-context > li > a:focus,
.v-context ul > li > a:focus,
.acItem.acItemSelected {
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
#expandedPythonExecAreaSplitersOverlay {
    width: 100vw;
    height: 100vh;
    position: absolute;
    top:0;
    left:0;
}

#expandedPythonExecAreaSplitersOverlay .splitpanes__splitter {
    z-index: 10;
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
	-webkit-transition: width .2s ease-out;
	-o-transition: width .2s ease-out;
	transition: width .2s ease-out
}

.splitpanes--horizontal .splitpanes__pane {
	-webkit-transition: height .2s ease-out;
	-o-transition: height .2s ease-out;
	transition: height .2s ease-out
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

.splitpanes.strype-split-theme .splitpanes__pane {
	background-color: transparent;
}

.splitpanes.strype-split-theme .splitpanes__splitter {
	//background-color: #fff;
    background-color: transparent;
	-webkit-box-sizing: border-box;
	box-sizing: border-box;
	position: relative;
	-ms-flex-negative: 0;
	flex-shrink: 0
}

.splitpanes.strype-split-theme .splitpanes__splitter:first-child {
	cursor: auto
}

.strype-split-theme.splitpanes .splitpanes .splitpanes__splitter {
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
	height: 7px;
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
