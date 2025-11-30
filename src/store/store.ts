import Vue from "vue";
import { FrameObject, CollapsedState, CurrentFrame, CaretPosition, FrozenState, MessageDefinitions, ObjectPropertyDiff, AddFrameCommandDef, EditorFrameObjects, MainFramesContainerDefinition, DefsContainerDefinition, StateAppObject, UserDefinedElement, ImportsContainerDefinition, EditableFocusPayload, SlotInfos, FramesDefinitions, EmptyFrameObject, NavigationPosition, FormattedMessage, FormattedMessageArgKeyValuePlaceholders, generateAllFrameDefinitionTypes, AllFrameTypesIdentifier, BaseSlot, SlotType, SlotCoreInfos, SlotsStructure, LabelSlotsContent, FieldSlot, SlotCursorInfos, StringSlot, areSlotCoreInfosEqual, StrypeSyncTarget, ProjectLocation, MessageDefinition, PythonExecRunningState, AddShorthandFrameCommandDef, isFieldBaseSlot, StrypePEALayoutMode, SaveRequestReason, RootContainerFrameDefinition, StrypeLayoutDividerSettings, MediaSlot, SlotInfosOptionalMedia, ModifierKeyCode } from "@/types/types";
import { getObjectPropertiesDifferences, getSHA1HashForObject } from "@/helpers/common";
import i18n from "@/i18n";
import {calculateNextCollapseState, checkCodeErrors, checkStateDataIntegrity, cloneFrameAndChildren, evaluateSlotType, generateFlatSlotBases, getAllChildrenAndJointFramesIds, getAvailableNavigationPositions, getFlatNeighbourFieldSlotInfos, getFrameSectionIdFromFrameId, getParentOrJointParent, getSlotDefFromInfos, getSlotIdFromParentIdAndIndexSplit, getSlotParentIdAndIndexSplit, isContainedInFrame, isFramePartOfJointStructure, removeFrameInFrameList, restoreSavedStateFrameTypes, retrieveSlotByPredicate, retrieveSlotFromSlotInfos} from "@/helpers/storeMethods";
import { AppPlatform, AppVersion, projectDocumentationFrameId, vm } from "@/main";
import initialStates from "@/store/initial-states";
import { defineStore } from "pinia";
import { CustomEventTypes, generateAllFrameCommandsDefs, getAddCommandsDefs, getFocusedEditableSlotTextSelectionStartEnd, getLabelSlotUID, isLabelSlotEditable, setDocumentSelection, parseCodeLiteral, undoMaxSteps, getSelectionCursorsComparisonValue, getEditorMiddleUID, getFrameHeaderUID, getImportDiffVersionModalDlgId, checkEditorCodeErrors, countEditorCodeErrors, getCaretUID, getStrypeCommandComponentRefId, getCaretContainerUID, isCaretContainerElement, AutoSaveKeyNames } from "@/helpers/editor";
import { DAPWrapper } from "@/helpers/partial-flashing";
import LZString from "lz-string";
import { getAPIItemTextualDescriptions } from "@/helpers/microbitAPIDiscovery";
import {cloneDeep, isEqual} from "lodash";
import $ from "jquery";
import { BvModalEvent } from "bootstrap-vue";
import { nextTick } from "@vue/composition-api";
import { TPyParser } from "tigerpython-parser";
import AppComponent from "@/App.vue";
import emptyState from "@/store/initial-states/empty-state";
/* IFTRUE_isPython */
import PEAComponent from "@/components/PythonExecutionArea.vue";
import CommandsComponent from "@/components/Commands.vue";
import { actOnTurtleImport, getPEAComponentRefId } from "@/helpers/editor";
/* FITRUE_isPython */

function getState(): StateAppObject {
    // If we have a state available in the local (browser's) storage, we strip off the frame contents
    // from the default state, for a smoother visual rendering. Note that App.vue is responsible for
    // loading the local state later. Here, we only check something exists in the local storage.
    let isExistingStateLocated = false;
    let returnedState;
    if(typeof(Storage) !== "undefined") {
        let storageString = AutoSaveKeyNames.pythonEditorState;
        /* IFTRUE_isMicrobit */
        storageString = AutoSaveKeyNames.mbEditor;
        /* FITRUE_isMicrobit */
        const savedState = localStorage.getItem(storageString);
        if(savedState) {
            isExistingStateLocated = true;
            returnedState = initialStates["initialEmptyState"];        
        }
    }
    
    if(!isExistingStateLocated) {
        /* IFTRUE_isPython */
        returnedState = initialStates["initialPythonState"];
        /* FITRUE_isPython */
        /* IFTRUE_isMicrobit */
        returnedState = initialStates["initialMicrobitState"];
        /* FITRUE_isMicrobit */
    }
    return (returnedState as StateAppObject);
}

const initialState = getState();

// These are deliberately held outside the store because:
// (a) we used to blank them on page load anyway
// (b) there was a bug where sometimes we could end up diffing-the-diffs which led to quadratic memory and CPU consumption.
const diffToPreviousState : ObjectPropertyDiff[][] = [];
const diffToNextState: ObjectPropertyDiff[][] = [];

export const useStore = defineStore("app", {
    state: () => {
        return {
            /** these flags need checking when a build is done **/
            debugging: initialState.debugging,

            showKeystroke: initialState.showKeystroke,

            frameObjects: cloneDeep(initialState.initialState),

            nextAvailableId: initialState.nextAvailableId, 

            importContainerId: -1,

            defsContainerId: -2,

            /** END of flags that need checking when a build is done **/

            currentFrame: { id: -3, caretPosition: CaretPosition.body } as CurrentFrame,

            anchorSlotCursorInfos: undefined as SlotCursorInfos | undefined, // where we "leave" the cursor when selecting (like the base of the arrow)

            focusSlotCursorInfos: undefined as SlotCursorInfos | undefined, // where we move the cursor when selecting (like the tip of the arrow) 

            // Flag to keep a trace of the last critical position in the editor, which is used in undo/redo sequences and allow us to not save changes of positions
            // but restore the last position (blue caret and/or slot position) that is relevant to a cancellable action. That is necessary for doing redo properly as
            // we only save a differences between the state and another version of the state, for that part we need to store what is "next".
            // The initial value is set to the currentFrame caret value of the initial state
            lastCriticalActionPositioning: {lastCriticalCaretPosition: {id: -3, caretPosition: CaretPosition.body}, lastCriticalSlotCursorInfos: undefined} as {lastCriticalCaretPosition: CurrentFrame, lastCriticalSlotCursorInfos?: SlotCursorInfos},

            lastBlurredFrameId: -1, // Used to keep trace of which frame had focus to check is we moved out the frame when clicking somewhere (for errors checking)

            lastAddedFrameIds: -1, // Used to keep trace of which frame has just been added into the editor (for error checking)
 
            isDraggingFrame: false, // Indicates whether drag and drop of frames is in process

            // This is an indicator of the CURRENT editable slot's initial content being edited.
            currentInitCodeValue: "", 

            // This is the selected tab index of the Commands' tab panel.
            commandsTabIndex: 0, 

            // Are we editing a text slot?
            isEditing: false,

            /* These state properties are for saving the layout of the UI.
             * They are initally set to UNDEFINED so we can work out which layout changes the users have done ("delete" needs optional properties).
             * We always apply the changes after getting back to the default layout (when a file is loaded after first time).
             * All the splitters' size properties are expressed PER layout so users can have different configurations for each layout.
             ***/ 
            editorCommandsSplitterPane2Size: undefined as StrypeLayoutDividerSettings | undefined, // same as above for the divider between the editor and the commands (pane 2), default is 34%
            
            /* IFTRUE_isPython */
            peaLayoutMode:  undefined as StrypePEALayoutMode | undefined, // the project layout view is saved with the store
            
            // The size of the commands/PEA splitter pane 2 size is saved with the store.
            // We can't have a default value as the default size will depend on the viewport (to have the PEA in 4:3 ratio)
            peaCommandsSplitterPane2Size: undefined as StrypeLayoutDividerSettings | undefined, 

            peaSplitViewSplitterPane1Size: undefined as StrypeLayoutDividerSettings | undefined, // same as above for the split view PEA divider (pane 1), this time a default value is 50%
            
            peaExpandedSplitterPane2Size: undefined as StrypeLayoutDividerSettings | undefined, // same as above for the expanded view divider (pane 2), this time a default value is 50%
            /* FITRUE_isPython */
            /* end properties for saving layout */

            // This flag indicates if the user code is being executed in the Python Execution Area (including the micro:bit simulator)
            pythonExecRunningState: PythonExecRunningState.NotRunning,

            // This flag can be used anywhere a key event should be ignored within the application
            ignoreKeyEvent: false,

            // This flag is to avoid a loss of focus when we are leaving the application
            ignoreFocusRequest: false,

            // This flag is used to ignore the loss of focus on a text slot (rarely required but may happen)
            ignoreBlurEditableSlot: false,

            // This flag is used to cancel the undo/redo saving mechanisms in some actions.
            // It must be used with care to avoid breaking the whole undo/redo actions (always make sure it's ultimately reverted to false),
            // but it is useful when combining several actions that need to activate the saving mechanisms only once...
            ignoreStateSavingActionsForUndoRedo: false,

            // This flag indicates we should not block a key event inside a LabelSlotsStructure
            allowsKeyEventThroughInLabelSlotStructure: false,

            bypassEditableSlotBlurErrorCheck: false,
            
            // Flag to indicate when an action of selection spans across slots
            isSelectingMultiSlots : false,
            
            // Has to be in the store despite only going from LabelSlotsStructure to LabelSlot,
            // because we need immediate update, faster than we get with setting a prop (trust me, I tried):
            mostRecentSelectedText: "",

            // Do not write to this directly (except for assigning NoMessage), use the
            // showMessage helper instead as that also updates currentMessageId
            currentMessage: MessageDefinitions.NoMessage,
            // Keep track of which message is being shown, so we only close on timeout
            // if it's the same message
            currentMessageId: 0,

            preCompileErrors: [] as string[],

            errorCount: 0,

            wasLastRuntimeErrorFrameId: undefined as number | undefined,

            // The state diffs are removed from the store, but we need to keep reactivity working, so we only keep counters instead
            diffToPreviousStateCounter: 0,

            diffToNextStateCounter: 0,
            
            // We use -100 to avoid any used id. This variable holds the id of the root copied frame.
            copiedFrameId: -100 as number,

            // This variable holds the ids of the root copied frames.
            copiedSelectionFrameIds: []  as number[],

            copiedFrames: {} as EditorFrameObjects,

            // Flag array to indicate the frames that could be deleted when hovering the
            // delete context menu entries (simple delete or delete outer)
            potentialDeleteFrameIds:[] as number[],

            potentialDeleteIsOuter: false,

            isWrappingFrame: false, // Flag to know when we are doing a frame wrapping action

            // Keeps a copy of the state when 2-steps operations are performed and we need to know the previous state (to clear after use!)
            stateBeforeChanges : {} as any, 

            contextMenuShownId: "",

            isContextMenuKeyboardShortcutUsed: false,

            projectName: i18n.t("defaultProjName") as string,

            isEditorContentModified: false,

            syncTarget: StrypeSyncTarget.none, // default value: no target

            strypeProjectLocation: undefined as ProjectLocation, // the last location where the strype project has been saved OR opened

            strypeProjectLocationAlias: "", // for cloud drives using a folder ID, this saves the name of the location (strypeProjectLocation saves the ID, not the name)

            strypeProjectLocationPath: "", // for cloud drives using a folder path (for example OneDrive)

            isProjectUnsaved: true, // flag indicating if we have notified changes that haven't been saved

            currentCloudSaveFileId: undefined as undefined|string,

            projectLastSaveDate: -1, // Date ticks

            selectedFrames: [] as number[],

            tigerPythonLang: "en", // The locale for TigerPython, see parser.ts as to why it's here

            isAppMenuOpened: false,

            isModalDlgShown: false,

            currentModalDlgId: "",
            
            simpleModalDlgMsg: "",
            
            groupToggleMemory: {} as Record<string, { lastStates: Record<number, CollapsedState>; overallState: CollapsedState;}> | undefined, // Undefined if missing in old store

            keyModifierStates: {
                [ModifierKeyCode.ctrl]: false,
                [ModifierKeyCode.meta]: false,
                [ModifierKeyCode.shift]: false,
                [ModifierKeyCode.alt]: false,
            } as Record<ModifierKeyCode, boolean> | undefined, // Undefined if missing in old store
            
            /* The following wrapper is used for interacting with the microbit board via DAP*/
            DAPWrapper: {} as DAPWrapper,

            previousDAPWrapper: {} as DAPWrapper,
        };
    },

    getters: { 
        getFramesForParentId: (state) => (frameId: number) => {
            //Get the childrenIds of this frame and based on these return the children objects corresponding to them
            return state.frameObjects[frameId].childrenIds
                .map((a) => state.frameObjects[a])
                .filter((a) => a);
        },
        
        getContentForFrameSlot: () => (frameSlotInfos: SlotInfos) => {
            return (retrieveSlotFromSlotInfos(frameSlotInfos) as BaseSlot).code;
        },
        
        getFlatSlotBases: (state) => (frameId: number, labelIndex: number) => {
            // Flatten the imbricated slots of associated with a label and return the corresponding array of FlatSlotBase objects
            // The operators always get in between the fields, and we always have one 1 root structure for a label,
            // and bracketed structures can never be found at 1st or last position
            return generateFlatSlotBases(state.frameObjects[frameId].frameType.labels[labelIndex], state.frameObjects[frameId].labelSlotsDict[labelIndex].slotStructures);
        },

        getJointFramesForFrameId: (state) => (frameId: number) => {
            const jointFrameIds = state.frameObjects[frameId].jointFrameIds;
            const jointFrames: FrameObject[] = [];
            jointFrameIds?.forEach((jointFrameId: number) => {
                const jointFrame = state.frameObjects[jointFrameId];
                if (jointFrame !== undefined) {
                    jointFrames.push(jointFrame);
                }
            });
            return jointFrames;
        },
        
        getAllowedChildren: (state) => (frameId: number) => {
            return state.frameObjects[frameId].frameType.allowChildren;
        },
        
        getAllowedJointChildren: (state) => (frameId: number) => {
            return state.frameObjects[frameId].frameType.allowJointChildren;
        },
        
        isJointFrameById: (state) => (frameId: number) => {
            return state.frameObjects[frameId].jointParentId > 0;
        },
        
        getCurrentFrameObject: (state) => {
            return state.frameObjects[state.currentFrame.id];
        },
        
        canAddFrameBelowDisabled: (state) => (frameId: number) => {
            // In this method, we check if frames can be added below the specified (disabled) frame.
            // Note: if we are in a joint structure, being below the (last) joint frame (i.e. "else" is seen as being below the root (i.e. "if") as there is no "below" a joint frame)
            return !state.frameObjects[state.frameObjects[frameId].parentId].isDisabled;
        },

        getRootFrameContainerId: (state) => {
            return Object.values(state.frameObjects).filter((frame: FrameObject) => frame.frameType.type === RootContainerFrameDefinition.type)[0].id;
        },
        
        getMainCodeFrameContainerId: (state) => {
            return Object.values(state.frameObjects).filter((frame: FrameObject) => frame.frameType.type === MainFramesContainerDefinition.type)[0].id;
        },

        getImportsFrameContainerId:(state) => {
            return Object.values(state.frameObjects).filter((frame: FrameObject) => frame.frameType.type === ImportsContainerDefinition.type)[0].id;
        },

        getDefsFrameContainerId:(state) => {
            return Object.values(state.frameObjects).filter((frame: FrameObject) => frame.frameType.type === DefsContainerDefinition.type)[0].id;
        },
        
        isEditableFocused: () => (frameSlotInfos: SlotCoreInfos) => {
            // ONLY a text type slot can be focused (so operators, brackets and quote UI slots will always return false)
            if(isLabelSlotEditable(frameSlotInfos.slotType)){
                return (retrieveSlotFromSlotInfos(frameSlotInfos) as BaseSlot).focused ?? false;
            }
            return false;
        },
        
        generateAvailableFrameCommands: (state) => (frameId: number, caretPosition: CaretPosition, lookingForTargetPos?: boolean) => {
            // If we are currently editing there are no frame command to show...
            if(state.isEditing) {
                return {} as  {[id: string]: AddFrameCommandDef[]};
            }

            const currentFrame  = state.frameObjects[frameId];
            const parent = state.frameObjects[getParentOrJointParent(currentFrame.id)];

            // list with all potential joint children to be added
            let allowedJointChildren: string[] = [];
            // if we are on a JointFrame's context, we need to know which is this joint frame (can be different from the currentFrame)
            let focusedFrame = undefined;
            // We need the next joint of the current in order to contextualise the potential joint frames
            let nextJointChildID = -100;

            // The RULE for the JOINTS is:
            // We allow joint addition only at the end of the body of a frame root or a depending joint. 
            // However, *programmatically* we might have something to check upon the BELOW position of a joint/joint root frame 
            // (for example when moving frames)
            // in that case, we do as if we were *inside* the joint frame (note that we are dealing with TRUE joint, not the parent of structure)
            const isMovingJointFrameToBelow = state.isDraggingFrame && caretPosition == CaretPosition.below && isFramePartOfJointStructure(currentFrame.id);
            // Two possible cases:
            // 1) If we are in an (a)EMPTY (b)BODY, of (C)SOMETHING that is a (C)JOINT frame
            // (b) and (a) 
            if ((caretPosition === CaretPosition.body && currentFrame.childrenIds.length === 0)){
                focusedFrame = currentFrame;
            }
            // 2) If we are (a)BELOW the (b)FINAL frame of (C)SOMETHING that is a (C)JOINT frame, OR if we are in a moving condition as explained above (M)
            // (a) and (b)
            else if ((caretPosition === CaretPosition.below && [...parent.childrenIds].pop() === currentFrame.id) || isMovingJointFrameToBelow) {
                if(isMovingJointFrameToBelow){
                    focusedFrame = currentFrame;
                    caretPosition = CaretPosition.body;
                }
                else{
                    focusedFrame = parent;
                }
            }

            //if we are in the joint context
            if(focusedFrame!==undefined) {

                // (c) -> I am either in a joint parent, we can't add any child if we're below, there is no next child to check.
                if(focusedFrame.frameType.allowJointChildren ) {
                    allowedJointChildren = [...focusedFrame.frameType.jointFrameTypes];
                    nextJointChildID = (caretPosition == CaretPosition.below && focusedFrame.id == frameId) ? -100 : (focusedFrame.jointFrameIds[0]??-100);
                }
                // (c) -> Or a joint child
                else if(focusedFrame.jointParentId>0){
                    // we get the allowed joints from our joint parent
                    allowedJointChildren = [...state.frameObjects[focusedFrame.jointParentId].frameType.jointFrameTypes];
                    const focusedIndexInJointParent = state.frameObjects[focusedFrame.jointParentId].jointFrameIds.indexOf(focusedFrame.id);
                    // get the next joint child from the parent (based on my index)
                    nextJointChildID = state.frameObjects[focusedFrame.jointParentId].jointFrameIds[focusedIndexInJointParent+1]??-100;
                }

                // If (c) was true
                if(allowedJointChildren.length>0) {

                    const uniqueJointFrameTypes = [AllFrameTypesIdentifier.else, AllFrameTypesIdentifier.finally];

                    // -100 means there is no next Joint Child => focused is the last joint or end of joint structure (i.e. below root)
                    if(nextJointChildID === -100){
                        // Below the root, no joint frame can be added (unless in the programmatic case of drag and drop, see above)
                        if(!state.isDraggingFrame && frameId == focusedFrame.id && caretPosition == CaretPosition.below && focusedFrame.frameType.allowJointChildren){
                            allowedJointChildren.splice(0, allowedJointChildren.length);
                        }
                        else{
                            // If the focused Joint is a unique, we need to show the available uniques that can go after it (i.e. show FINALLY or nothing)
                            //    OR special case if we are in TRY statement: we can't show ELSE at any case
                            // else show them all
                            if(focusedFrame.frameType.type === AllFrameTypesIdentifier.try){
                                allowedJointChildren.splice(allowedJointChildren.indexOf(AllFrameTypesIdentifier.else), 1); 
                            }
                            else if(uniqueJointFrameTypes.includes(focusedFrame.frameType.type)){
                                allowedJointChildren.splice(
                                    0,
                                    allowedJointChildren.indexOf(focusedFrame.frameType.type)+1 //delete from the beginning to the current frame type
                                );                        
                            } 
                        }
                    }
                    // on the presence of a next child
                    else{
                        const nextJointChild = state.frameObjects[nextJointChildID];          

                        // if the next is not unique, show all non-uniques ()
                        if(!uniqueJointFrameTypes.includes(nextJointChild.frameType.type)) {
                            allowedJointChildren = allowedJointChildren.filter( (x) => !uniqueJointFrameTypes.includes(x)); // difference
                        }
                        // else if the next AND the current are uniques (i.e. I am in an ELSE and there is a FINALLY after me)
                        else if(uniqueJointFrameTypes.includes(focusedFrame.frameType.type)) {
                            allowedJointChildren = [];
                        }
                        // In the case where only the next is unique
                        // show all but the available up to before the existing unique (i.e. at most up to ELSE)
                        // Special case: if we are in a TRY statement (and since we passed the condition above, next is unique (i.e. FINALLY)) --> we can't show ELSE
                        else {
                            if(focusedFrame.frameType.type === AllFrameTypesIdentifier.try){
                                allowedJointChildren.splice(
                                    allowedJointChildren.indexOf(AllFrameTypesIdentifier.else),
                                    1
                                );
                            }
                            else{
                                allowedJointChildren.splice(
                                    allowedJointChildren.indexOf(nextJointChild.frameType.type),
                                    allowedJointChildren.length - allowedJointChildren.indexOf(nextJointChild.frameType.type) //delete from the index of the nextJointChild to the end
                                );
                            }
                        }
                    }
                }
            }

            //forbidden frames are those of the current frame's type if caret is body, those of the parent/joint root otherwise
            const forbiddenTypes = (caretPosition === CaretPosition.body) ? 
                [...currentFrame.frameType.forbiddenChildrenTypes] :
                ((currentFrame.jointParentId > 0) ? [...state.frameObjects[currentFrame.jointParentId].frameType.forbiddenChildrenTypes] : [...state.frameObjects[currentFrame.parentId].frameType.forbiddenChildrenTypes]);

            //as there is no static rule for showing the "break" or "continue" statements,
            //we need to check if the current frame is within a "for" or a "while" loop.
            //if we are not into a nested for/while --> we add "break" and "continue" in the forbidden frames list
            const canShowLoopBreakers = isContainedInFrame(frameId,caretPosition, [AllFrameTypesIdentifier.for, AllFrameTypesIdentifier.while]);
            if(!canShowLoopBreakers){
                //by default, "break" and "continue" are NOT forbidden to any frame which can host children frames,
                //so if we cannot show "break" and "continue" : we add them from the list of forbidden
                forbiddenTypes.splice(
                    0,
                    0,
                    ...[AllFrameTypesIdentifier.break, AllFrameTypesIdentifier.continue]
                );
            }

            //"return" and "global" statements can't be added when in the main container frame
            //We don't forbid them to be in the main container, but we don't provide a way to add them directly.
            //They can be added when in the function definition container though.
            const canShowReturnStatement = isContainedInFrame(frameId,caretPosition, [DefsContainerDefinition.type]);
            if(!canShowReturnStatement){
                //by default, "break" and "continue" are NOT forbidden to any frame which can host children frames,
                //so if we cannot show "break" and "continue" : we add them from the list of forbidden
                forbiddenTypes.splice(
                    0,
                    0,
                    ...[AllFrameTypesIdentifier.return, AllFrameTypesIdentifier.global]
                );
            }
            const addCommandsDefs = getAddCommandsDefs();
            const filteredCommands: {[id: string]: AddFrameCommandDef[]} = cloneDeep(addCommandsDefs);
            const allowedJointCommand: {[id: string]: AddFrameCommandDef[]} = {};

            // If frames are selected, we only show the frames commands that can be used for wrapping.
            // (For the definitions section, we won't allow any wrapping.)
            const isSelectingInsideDefsSection = ((currentFrame.id == useStore().getDefsFrameContainerId || state.frameObjects[currentFrame.id].parentId == useStore().getDefsFrameContainerId) 
                && state.selectedFrames.length > 0);

            // for each shortcut we get a list of the corresponding commands
            for (const frameShortcut in addCommandsDefs) {

                // keep all the allowedJointChildren with their commands (as they may be deleted in the next step
                allowedJointCommand[frameShortcut] = filteredCommands[frameShortcut].filter( (x) => allowedJointChildren.includes(x.type.type));
                
                // filtered = filtered - forbidden - allJoints
                // all joints need to be removed here as they may overlap with the forbiden and the allowed ones. Allowed will be added on the next step.
                // unless we are checking for a target position, if some frames are currently selected, we do not allow statement type frames to appear 
                // in the list of commands (we can only wrap the selection).
                // We need a special case for when we are directly inside the definitions section, and some frames are selected, to not allow wrapping
                // a function, or a class, with another function or a class.
                if(isSelectingInsideDefsSection) {
                    filteredCommands[frameShortcut] = [];
                }
                else{
                    filteredCommands[frameShortcut] = filteredCommands[frameShortcut].filter((x) => !forbiddenTypes.includes(x.type.type) && !x.type.isJointFrame
                        && (lookingForTargetPos || state.selectedFrames.length == 0 || (state.selectedFrames.length > 0 && x.type.allowChildren)));
                }
                
                // filtered = filtered + allowed
                filteredCommands[frameShortcut].push(...allowedJointCommand[frameShortcut]);
                
                // remove any empty commands (forbidden) for this shortcut
                if( filteredCommands[frameShortcut].length === 0){
                    Vue.delete(
                        filteredCommands,
                        frameShortcut
                    );                    
                }
            }
            
            return filteredCommands;
        },
        
        isErroneousSlot: () => (frameSlotInfos: SlotCoreInfos) => {
            return ((retrieveSlotFromSlotInfos(frameSlotInfos) as BaseSlot).error??"") !== "";
        },
        
        getErrorForSlot: () => (frameSlotInfos: SlotCoreInfos) => {     
            return (retrieveSlotFromSlotInfos(frameSlotInfos) as BaseSlot).error??"";
        },

        getErrorHeaderForSlot: () => (frameSlotInfos: SlotCoreInfos) => {
            const errorTitle = (retrieveSlotFromSlotInfos(frameSlotInfos) as BaseSlot).errorTitle;
            return (errorTitle) 
                ? errorTitle
                : i18n.t("errorMessage.errorTitle") as string; 
        },

        preCompileErrorExists: (state) => (id: string) => {
            return state.preCompileErrors.includes(id);
        },
        
        isMessageBannerOn: (state) => {
            return state.currentMessage.type !== MessageDefinitions.NoMessage.type;
        },
        
        // Automatically checks returns index in Parent OR JointParent
        getIndexInParent: (state) => (frameId: number) => {
            const isJointFrame = state.frameObjects[frameId].frameType.isJointFrame;
            return (isJointFrame)? 
                state.frameObjects[state.frameObjects[frameId].jointParentId].jointFrameIds.indexOf(frameId):
                state.frameObjects[state.frameObjects[frameId].parentId].childrenIds.indexOf(frameId);
        },
        
        isCopiedAvailable: (state) => {
            return (state.copiedFrameId !== -100) || (state.copiedSelectionFrameIds.length > 0);
        },
        
        isPasteAllowedAtFrame() { 
            return (frameId: number, caretPos: CaretPosition) => {
                if(this.isSelectionCopied){
                    if(this.isPositionAllowsSelectedFrames(frameId, caretPos, true)) {
                        return true;
                    }  
                }
                else {
                    if(this.isPositionAllowsFrame(frameId, caretPos, true)) {
                        return true;
                    }
                }
    
                return false;
            };            
        },
        
        // frameToBeMovedId is an optional argument and it is used in cases where we are just checking if a 
        // frame can be moved to a position based on the copied frame type --> we are not really checking about the actual copied Frame
        isPositionAllowsFrame() {
            return (targetFrameId: number, targetCaretPosition: CaretPosition, lookingForTargetPos: boolean, frameToBeMovedId?: number) => {
                // Where do we get the frame from --> from copiedFrames if it is a copied frame
                // Otherwise the input frame is to be checked (e.g. for moving an else statement or duplicating an else statement -- which doesn't go anywhere).
                const sourceFrameList: EditorFrameObjects = (frameToBeMovedId === undefined) ? this.copiedFrames : this.frameObjects;    

                frameToBeMovedId = frameToBeMovedId ?? this.copiedFrameId;

                if(frameToBeMovedId===-100){
                    // If there is nothing to copy, we return false
                    return false;
                }

                const allowedFrameTypes = this.generateAvailableFrameCommands(targetFrameId, targetCaretPosition, lookingForTargetPos);
                // isFrameCopied needs to be checked in the case that the original frame which was copied has been deleted.
                const copiedType: string = sourceFrameList[frameToBeMovedId].frameType.type;
            
                // for..of is used instead of foreach here, as foreach does not supports return.........
                for (const element of Object.values(allowedFrameTypes)) {
                    if (element[0].type.type === copiedType) {
                        return true;
                    }
                }

                return false;
            };
        },

        isPositionAllowsSelectedFrames(){
            return (targetFrameId: number, targetCaretPosition: CaretPosition, areFramesCopied: boolean) => {   
                const allowedFrameTypes = this.generateAvailableFrameCommands(targetFrameId, targetCaretPosition, true);

                const selectedFramesIds = (areFramesCopied) ? this.copiedSelectionFrameIds : this.selectedFrames;
                const sourceList = (areFramesCopied) ? this.copiedFrames : this.frameObjects;
                
                // for..of is used instead of foreach here, as foreach does not supports return.........
                for (const id of selectedFramesIds) {
                    // If one of the selected frames is not found in the allowed list, then return false
                    if(!Object.values(allowedFrameTypes).find((allowed) => allowed[0].type.type === sourceList[id].frameType.type)){
                        return false;
                    }
                }

                return true;
            };
        },

        isFrameSelected: (state) => (frameId: number) => {
            return state.selectedFrames.indexOf(frameId) > -1;
        },

        getFrameSelectionPosition: (state) => (frameId: number) => {
            const index = state.selectedFrames.indexOf(frameId);

            if( index == -1) {
                return "unselected";
            }
            else if( index == 0) {
                if( index == state.selectedFrames.length-1 ){
                    return "first-and-last";
                }
                return "first";
            }
            else  if( index == state.selectedFrames.length-1) {
                return "last";
            }
            else {
                return "middle";
            }
        },

        areAnyFramesSelected: (state) => {
            return state.selectedFrames.length > 0;
        },
        
        isUndoRedoEmpty: (state) => (action: string) => {
            return (action === "undo") ? state.diffToPreviousStateCounter == 0 : state.diffToNextStateCounter == 0;
        },

        isSelectionCopied: (state) => {
            return state.copiedSelectionFrameIds.length > 0;
        },

        isFrameVisible: (state) => (frameId: number) => {
            return state.frameObjects[frameId].isVisible;
        },

        // A frame is "effectively frozen" either if its own state is frozen, or any of its ancestors are frozen.  So for
        // example if you have a frozen class, its member functions are effectively-frozen, as are all frames inside those
        // functions.  This is useful when deciding whether it is possible to delete or focus items in the inner frames. 
        isEffectivelyFrozen: (state) => (frameId: number) => {
            while (frameId > 0) {
                if (state.frameObjects[frameId].frozenState == FrozenState.FROZEN) {
                    return true;
                }
                frameId = state.frameObjects[frameId].parentId;
            }
            // No frozen frames found in the ancestors:
            return false;
        },

        retrieveUserDefinedElements:(state) => {
            // Retrieve the user defined functions and variables.
            // We make sure we don't look up the variable/function in the current frame
            // (for example, if we are in a variable assignment, we shouldn't pick up on that variable being written)
            // the returned value is an array of UserDefinedElement objects.
            // Note: the slots we look at can only be 1 single code since they are LHS or function name slots.
            return Object.values(state.frameObjects).filter((frame: FrameObject) => (frame.id !== state.currentFrame.id 
                && (frame.frameType.type === AllFrameTypesIdentifier.funcdef || frame.frameType.type === AllFrameTypesIdentifier.varassign)))
                .map((frame: FrameObject) => ({name: (frame.labelSlotsDict[0].slotStructures.fields[0] as BaseSlot).code.trim(),
                    isFunction: frame.frameType.type === AllFrameTypesIdentifier.funcdef}) as UserDefinedElement);
        },

        // Check up if the API generator can be shown, depending on the current position in the code editor. 
        // If the current position is within a frame, then it depends what frame it is (cf. inner comments),
        // if the current position isn't a frame (blue caret) check where we are in the editor (cf. inner comments)
        canShowAPICodeGenerator: (state) => {
            const currentFrame = state.frameObjects[state.currentFrame.id];
            const focusSlotCursorInfos = state.focusSlotCursorInfos;
            if(focusSlotCursorInfos){
                // We are in a slot. All slots allow the code generated by the API if they are empty*, except those that never show it:
                // - var assign LHS
                // - imports
                // - function definition
                //(*) for string slots and comments, we allow adding code anywhere. If a slot non space content fully highlighted we also alllow adding the code.
                const {selectionStart, selectionEnd} = getFocusedEditableSlotTextSelectionStartEnd(getLabelSlotUID(focusSlotCursorInfos.slotInfos));
                const currentSlotCode = (document.getElementById(getLabelSlotUID(focusSlotCursorInfos.slotInfos)))?.textContent??"";
                const nonHighlightedCode = currentSlotCode.substring(0, selectionStart) + currentSlotCode.substring(selectionEnd);
                const isSlotWholeCodeContentSelected = (selectionStart != selectionEnd && nonHighlightedCode.trim().length == 0);
                const isLHSVarAssign = (currentFrame.frameType.type == AllFrameTypesIdentifier.varassign && focusSlotCursorInfos.slotInfos.labelSlotsIndex == 0); 
                return (currentSlotCode.trim().length == 0 || focusSlotCursorInfos.slotInfos.slotType == SlotType.string 
                    || currentFrame.frameType.type == AllFrameTypesIdentifier.comment || isSlotWholeCodeContentSelected)
                    && currentFrame.frameType.type != AllFrameTypesIdentifier.import 
                    && currentFrame.frameType.type != AllFrameTypesIdentifier.funcdef
                    && !isLHSVarAssign;
            }
            else{
                // We are at a caret position. We can always add a new method call frame as long as we're not in one of the following:
                // - imports container
                // - function definition container
                const currentFrame = state.frameObjects[state.currentFrame.id];
                return (state.currentFrame.caretPosition == CaretPosition.body && currentFrame.id != state.importContainerId && currentFrame.id != state.defsContainerId) 
                    || (state.currentFrame.caretPosition == CaretPosition.below && currentFrame.parentId !== undefined && currentFrame.parentId != state.importContainerId && currentFrame.parentId != state.defsContainerId);        
            }
        },

        isImportFrame: (state) => (frameId: number) => {
            return state.frameObjects[frameId].frameType.isImportFrame;
        },

        isContainerCollapsed: (state) => (frameId: number) => {
            return (state.frameObjects[frameId].collapsedState ?? CollapsedState.FULLY_VISIBLE) != CollapsedState.FULLY_VISIBLE;
        },
    },
    
    actions:{
        showMessage(newMessage: MessageDefinition, timeoutMillis: number | null) {
            this.currentMessage = newMessage;
            const ourId = ++this.currentMessageId;
            if (timeoutMillis != null) {
                setTimeout(() => {
                    // Close it, but only if it is still the same message showing:
                    if (ourId === this.currentMessageId) {
                        this.currentMessage = MessageDefinitions.NoMessage;
                    }
                }, timeoutMillis);
            }
        },

        updateKeyModifiers(e: KeyboardEvent | MouseEvent) {
            if (this.keyModifierStates == undefined) {
                this.keyModifierStates = {ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey};
            }
            else {
                this.keyModifierStates.ctrl = e.ctrlKey;
                this.keyModifierStates.meta = e.metaKey;
                this.keyModifierStates.shift = e.shiftKey;
                this.keyModifierStates.alt = e.altKey;
            }
        },

        updateStateBeforeChanges(release: boolean) {
            //if the flag release is true, we clear the current stateBeforeChanges value
            Vue.set(
                this,
                "stateBeforeChanges",
                (release) ? {} : cloneDeep(this.$state)
            );
        },

        clearAllFrames() {
            // An short-hand method to clear all the frames of the editor.
            // We only keep frames 0 (the root), and -1 to -3 (the frame containers/sections).
            // For safety, the curent frame (frame cursor) is set to the main code section
            this.toggleCaret({id: -3, caretPosition: CaretPosition.body});
            Object.keys(this.frameObjects).forEach((frameId) => {
                const frameIdInt = parseInt(frameId);
                if(frameIdInt > 0) {
                    Vue.delete(this.frameObjects, frameId);
                }
                else if(frameIdInt < 0){
                    // The frame section containers are not cleared, but their children are!
                    this.frameObjects[frameIdInt].childrenIds.splice(0);
                    // The project description is a slot on a negative frame which must also be cleared:
                    if (this.frameObjects[frameIdInt] && this.frameObjects[frameIdInt].frameType.type == AllFrameTypesIdentifier.projectDocumentation) {
                        this.frameObjects[frameIdInt].labelSlotsDict = cloneDeep(emptyState[projectDocumentationFrameId].labelSlotsDict);
                    }
                }
            });
        },

        deleteFrame(payload: {key: string; frameToDeleteId: number; deleteChildren?: boolean}) {
            //if delete is pressed
            //  case cursor is body: cursor stay here, the first child (if exits) is deleted (*)
            //  case cursor is below: cursor stay here, the next sibling (if exits) is deleted (*)
            //if backspace is pressed
            //  case current frame is Container --> do nothing, a container cannot be deleted
            //  case cursor is body: cursor needs to move one level up, and the current frame's children + all siblings replace its parent
            //  case cursor is below: cursor needs to move to bottom of previous sibling (or body of parent if first child) and the current frame (*) is deleted
            //(*) with all sub levels children

            if(payload.key=== "Delete"){
                //delete the frame and all children
                removeFrameInFrameList(payload.frameToDeleteId);
            }
            else{
                //delete the frame entirely with sub levels
                if(payload.deleteChildren === true){
                    removeFrameInFrameList(payload.frameToDeleteId);
                }
                else{
                    //we "replace" the frame to delete by its content in its parent's location
                    //note: the content is its children and the children of its potential joint frames
                    const frameToDelete = this.frameObjects[payload.frameToDeleteId];
                    const isFrameToDeleteJointFrame = (frameToDelete.jointParentId > 0);
                    const isFrameToDeleteRootJointFrame = (frameToDelete.jointParentId === 0 && frameToDelete.frameType.jointFrameTypes.length > 0);
                    let parentIdOfFrameToDelete = frameToDelete.parentId; 
                    //if the current frame is a joint frame, we find the "parent": the root of the structure if it's the first joint, the joint before otherwise
                    if (isFrameToDeleteJointFrame) {
                        const indexOfJointFrame = this.frameObjects[frameToDelete.jointParentId].jointFrameIds.indexOf(payload.frameToDeleteId);
                        parentIdOfFrameToDelete = (indexOfJointFrame > 0) ?
                            this.frameObjects[frameToDelete.jointParentId].jointFrameIds[indexOfJointFrame - 1] :
                            this.frameObjects[payload.frameToDeleteId].jointParentId;     
                    }

                    const listOfChildrenToMove = this.frameObjects[payload.frameToDeleteId].childrenIds;
                    //if the frame to remove is the root of a joint frames structure, we include all the joint frames' children in the list of children to remove
                    if(isFrameToDeleteRootJointFrame){
                        this.frameObjects[payload.frameToDeleteId]
                            .jointFrameIds
                            .forEach((jointFrameId) => listOfChildrenToMove.push(...this.frameObjects[jointFrameId].childrenIds));
                    }

                    //update the new parent Id of all the children to their new parent and the disabled status (can be disabled when moving in disabled joint frame)
                    listOfChildrenToMove.forEach((childId) => {
                        this.frameObjects[childId].parentId = parentIdOfFrameToDelete;
                        this.frameObjects[childId].isDisabled = this.frameObjects[parentIdOfFrameToDelete].isDisabled;
                    });
                    //replace the frame to delete by the children in the parent frame or append them at the end (for joint frames)
                    const parentChildrenIds = this.frameObjects[parentIdOfFrameToDelete].childrenIds;
                    const indexOfFrameToReplace = (isFrameToDeleteJointFrame) ? parentChildrenIds.length : parentChildrenIds.lastIndexOf(payload.frameToDeleteId);
                    parentChildrenIds.splice(
                        indexOfFrameToReplace,
                        (isFrameToDeleteJointFrame) ? 0 : 1,
                        ...listOfChildrenToMove
                    );
                    //if the frame to delete is a joint frame, we remove it from its parent
                    if(isFrameToDeleteJointFrame){
                        this.frameObjects[this.frameObjects[payload.frameToDeleteId].jointParentId].jointFrameIds.splice(
                            this.frameObjects[this.frameObjects[payload.frameToDeleteId].jointParentId].jointFrameIds.indexOf(payload.frameToDeleteId),
                            1
                        );
                    }
                    //and finally, delete the frame
                    Vue.delete(
                        this.frameObjects,
                        payload.frameToDeleteId
                    );
                }
            }
        },

        setEditableFocus(payload: EditableFocusPayload) {
            // Use Vue.set here because "focused" may not yet exist on the object (it's an optional field)
            Vue.set(
                retrieveSlotFromSlotInfos(payload),
                "focused",
                payload.focused
            );
        },

        changeCaretWithKeyboard(key: string, isLevelScopeChange?: boolean) {  
            const currId = this.currentFrame.id;
            const currPosition = this.currentFrame.caretPosition;

            //Turn off previous caret 
            Vue.set(
                this.frameObjects[currId],
                "caretVisibility",
                CaretPosition.none
            );

            const currentCaret: CurrentFrame = {id: currId, caretPosition: currPosition};
            const availablePositions = getAvailableNavigationPositions();
            const listOfCaretPositions = availablePositions.filter(((e)=> !e.isSlotNavigationPosition));
            // Where is the current in the list
            const currentCaretIndex = listOfCaretPositions.findIndex((e) => e.frameId===currentCaret.id && e.caretPosition === currentCaret.caretPosition);

            const delta = (key === "ArrowDown") ? 1 : -1;
            // Next caret position is a +/- 1 offset position if we are simply moving the caret, or up/down to the next same level caret position if we are navigating at level scope
            let nextCaretPosition = currentCaretIndex + delta;
            if(isLevelScopeChange){
                // To find the neighbour frame at level scope, we look into the current's frame parent: if there is an availble neighbour there, we retrieve its position, otherwise
                // we stay were we are. If the previous position would be index -1 (as 0 minus 1), the position we look for the is the parent's body.
                if(currPosition == CaretPosition.body){
                    // Already at the top of the current level, we stay here if we wanted to go, or go to the first child of the frame (if exists)
                    nextCaretPosition = currentCaretIndex;
                    if(delta > 0 && this.frameObjects[currId].childrenIds.length > 0){
                        const firstChildId = this.frameObjects[currId].childrenIds[0];
                        nextCaretPosition = listOfCaretPositions.findIndex((caretPos) =>  caretPos.frameId==firstChildId && caretPos.caretPosition == CaretPosition.below);
                    }
                }
                else{
                    const parentId = this.frameObjects[currId].parentId;
                    const childrenIds = this.frameObjects[parentId].childrenIds;
                    const neigbourFrameChildIndex = childrenIds.indexOf(currId) + delta;
                    nextCaretPosition = (neigbourFrameChildIndex >= 0 && neigbourFrameChildIndex < childrenIds.length) 
                        ? listOfCaretPositions.findIndex((caretPos) =>  caretPos.frameId==childrenIds[neigbourFrameChildIndex] && caretPos.caretPosition == CaretPosition.below)
                        : ((neigbourFrameChildIndex==-1) ? listOfCaretPositions.findIndex((caretPos) =>  caretPos.frameId==parentId && caretPos.caretPosition == CaretPosition.body) : currentCaretIndex);
                }
            }
            const nextCaret = (listOfCaretPositions[nextCaretPosition]) 
                ? ({id: listOfCaretPositions[nextCaretPosition].frameId, caretPosition: listOfCaretPositions[nextCaretPosition].caretPosition}) as CurrentFrame
                : currentCaret;

            this.currentFrame.id = nextCaret.id;
            this.currentFrame.caretPosition = nextCaret.caretPosition;

            Vue.set(
                this.frameObjects[nextCaret.id],
                "caretVisibility",
                nextCaret.caretPosition
            );

            // Only frame containers (sections) are collapsable, so we don't need to check if a destination frame itself is collapsed,
            // but we do need to check if the target container is - and expand it if needed.
            const containerId = getFrameSectionIdFromFrameId(nextCaret.id);
            this.frameObjects[containerId].collapsedState = CollapsedState.FULLY_VISIBLE;
        },

        setCurrentFrame(newCurrentFrame: CurrentFrame) {
            Vue.set(
                this.frameObjects[this.currentFrame.id],
                "caretVisibility",
                CaretPosition.none
            );

            this.currentFrame.id = newCurrentFrame.id;
            this.currentFrame.caretPosition = newCurrentFrame.caretPosition;

            Vue.set(
                this.frameObjects[newCurrentFrame.id],
                "caretVisibility",
                newCurrentFrame.caretPosition
            );
        },

        setCurrentInitCodeValue(frameSlotInfos: SlotCoreInfos){
            this.currentInitCodeValue = (retrieveSlotFromSlotInfos(frameSlotInfos) as BaseSlot).code;
        },

        addNewSlot(currentSlotInfos: SlotCoreInfos, operatorOrBracket: string, lhsCode: string, rhsCode: string, addingSlotType: SlotType, addOperatorBefore: boolean, midCode: string) {
            // This action adds new slots for a label.
            // The behaviour and meaning of the arguments depends of the type of addition we perform, see details for each case.
            // currentSlotInfos is always the slot from which we are doing an action
            const {parentId, slotIndex} = getSlotParentIdAndIndexSplit(currentSlotInfos.slotId);
            const parentFieldSlot = (parentId.length > 0) 
                ? retrieveSlotFromSlotInfos({...currentSlotInfos, slotId: parentId}) as SlotsStructure
                : this.frameObjects[currentSlotInfos.frameId].labelSlotsDict[currentSlotInfos.labelSlotsIndex].slotStructures;
  
            if(addingSlotType==SlotType.operator){
                // We are adding an operator. In this context, the function arguments have this meaning:
                // operatorOrBracket: the operator we are addding to the current slot structure
                // addOperatorBefore: indicates if we are prepending or appending the operator in relation to current framea
                // lhsCode: the code on the LHS of this operator: the current slot if addOperatorBefore is false, the one before otherwise
                // rhsCode: the code on the RHS of this operator: the current slot if addOperatorBefore is true, the one after otherwise
                // Add operator first
                parentFieldSlot.operators.splice(slotIndex, 0, {code: operatorOrBracket});
                // Update or create the operands
                // If the operator precedes [resp. follows] the current frame, we update the current frame content with rhsCode [resp. lhsCode],
                // and we update the precéding [resp. next] slot content with the lhsCode [resp. rhsCode] if it exists, create it otherwise
                const codeForCurrentSlot = addOperatorBefore ? rhsCode : lhsCode;
                const codeForOtherOperandSlot = addOperatorBefore ? lhsCode : rhsCode;
                const otherOperandSlotIndex = addOperatorBefore ? slotIndex : (slotIndex + 1);
                (parentFieldSlot.fields[slotIndex] as BaseSlot).code = codeForCurrentSlot;
                parentFieldSlot.fields.splice(otherOperandSlotIndex, 0, {code: codeForOtherOperandSlot});                
            }
            else if (addingSlotType==SlotType.media){
                // We are adding a media literal. In this context, the function arguments have this meaning:
                // operatorOrBracket: the mediaType
                // lhsCode: the code on the slot that precedes the media literal we insert
                // rhsCode: the code on the slot that follows the media literal we insert
                // midCode: the code that should be added for the media literal we insert 
                // Adding a new media literal means we also add the empty operators "around" it:
                // we replace the slot where we add the literal into this:
                // <base slot (LHS)><empty operator><media literal slot><empty operator><basic slot (RHS)>

                // Create the fields first
                const newFields: FieldSlot[] = [];
                // the LHS part
                newFields[0] = {code: lhsCode};
                // the new bracketed structure or string slot depending what we are adding
                newFields[1] = {mediaType: operatorOrBracket, code: midCode} as MediaSlot;
                // the RHS part
                newFields[2] = {code: rhsCode};
                // now we can replace the existing slot
                parentFieldSlot.fields.splice(slotIndex, 1, ...newFields);

                // Create the operators
                parentFieldSlot.operators.splice(slotIndex, 0, ...[{code: ""}, {code: ""}]);
            }
            else{
                // We are adding a bracketed structure or a string slot. In this context, the function arguments have this meaning:
                // operatorOrBracket: the opening bracket [resp. quote] of that structure [resp. string slot]
                // lhsCode: the code on the slot that precedes the structured slot [resp. string slot] we insert
                // rhsCode: the code on the slot that follows the structured slot [resp. string slot] we insert
                // midCode: if provided, the code that should be added as a base field within the structured slot [the string quote] we insert 
                //          this makes sense when we highlight a text and wrap it with brackets [resp. quotes]
                // Adding a new bracketed slot means we also add the empty operators "around" it:
                // we replace the slot where we add the brackets into this:
                // <base slot (LHS)><empty operator><bracket [resp. string] slot><empty operator><basic slot (RHS)>

                // Create the fields first
                const newFields: FieldSlot[] = [];
                // the LHS part
                newFields[0] = {code: lhsCode};
                // the new bracketed structure or string slot depending what we are adding
                newFields[1] = (addingSlotType == SlotType.bracket)
                    ? {openingBracketValue: operatorOrBracket, fields: [{code: midCode}], operators: []}
                    : {quote: operatorOrBracket, code: midCode} as FieldSlot;
                // the RHS part
                newFields[2] = {code: rhsCode};
                // now we can replace the existing slot
                parentFieldSlot.fields.splice(slotIndex, 1, ...newFields);

                // Create the operators
                parentFieldSlot.operators.splice(slotIndex, 0, ...[{code: ""}, {code: ""}]);
            }
        },

        /**
         * This method is called if we need to delete an operator, bracket or string (i.e. the deletion is not solely
         * contained neatly in one slot).  We envisage this as being in a particular slot (the current slot) and deleting
         * our neighbouring slot to the left or right.
         * 
         * @param isForwardDeletion True if we are deleting the slot after us (using the Delete key), or
         *                          False if we are deleting the slot before us (using the Backspace key)
         * @param currentSlotInfos The slot where the key was pressed.
         * @returns an object containing the resulting new slot id (newSlotId), and the cursor position offset within this slot (cursorPosOffset)
         */
        deleteSlots(isForwardDeletion: boolean, currentSlotInfos?: SlotCoreInfos | undefined): {newSlotId: string, cursorPosOffset: number} {
            // Deleting slots depends on the direction of deletion (with del or backspace), the scope of deletion
            // (from a selection or a from one position of code) and the nature of the field deleted.
            // When there is no selection, we do a deletion on the basis of a slot and an operator are deleted:
            // the operator is removed, and the fields merge together. When deleting brackets or strings, we do the operation
            // on each end of the bracket / string, because these slots are always surrounded by empty operators.
            // The returned value is the new ID of the current slot and the cursor position offset (to be used by UI)
            // When there is a selection, we always end up with one resulting slot. The deletion direction doesn't matter.
            if(this.anchorSlotCursorInfos && this.focusSlotCursorInfos){
                if (!currentSlotInfos) {
                    currentSlotInfos = this.focusSlotCursorInfos.slotInfos;
                }
                
                const hasSlotSelectedToDelete = (!areSlotCoreInfosEqual(this.anchorSlotCursorInfos.slotInfos, this.focusSlotCursorInfos.slotInfos));
                // Split the target slot ID into parent ID and the index of us within the parent:
                const {parentId, slotIndex} = getSlotParentIdAndIndexSplit(currentSlotInfos.slotId);
                // The parent slot is the root if our parent ID is blank: 
                const parentSlot = (parentId.length > 0) 
                    ? retrieveSlotFromSlotInfos({...currentSlotInfos, slotId: parentId}) as SlotsStructure
                    : this.frameObjects[currentSlotInfos.frameId].labelSlotsDict[currentSlotInfos.labelSlotsIndex].slotStructures;
                if(!hasSlotSelectedToDelete){
                    // This is case when there is NO selection and we need to delete a slot:
                    // we find the  neighbouring slot which is being deleted.  We fold their content into us if we are siblings.
                    const slotToDeleteInfos = getFlatNeighbourFieldSlotInfos(currentSlotInfos, isForwardDeletion);
            
                    // We should only have been called in the first place if this is true, but satisfy TypeScript:
                    if(slotToDeleteInfos){
                        // Get the slot to be deleted:
                        const {parentId: slotToDeleteParentId, slotIndex: slotToDeleteIndex} = getSlotParentIdAndIndexSplit(slotToDeleteInfos.slotId);
                        const slotToDelete = retrieveSlotFromSlotInfos(slotToDeleteInfos);

                        // If we are deleting the brackets (not the structure altogether but literaly the brackets)
                        // then the parents of the current slot and the slot to delete cannot be the same, and one of them is 
                        // de facto in a bracket.
                        const isRemovingBrackets = (parentId != slotToDeleteParentId);
                        const isRemovingString = (slotToDeleteInfos.slotType == SlotType.string) || (currentSlotInfos.slotType == SlotType.string);
                        const isRemovingMedia = (slotToDeleteInfos.slotType == SlotType.media);

                        // Deal with bracket / string partial deletion as a particular case
                        if(isRemovingBrackets || isRemovingString){
                        // If removing brackets, this flag being true indicates we are INSIDE the bracket when deleting, false means we are outside the bracket we are deleting.
                        // Similarly, for strings, true indicates we are INSIDE the string when deleting, false means we are outside.
                            const isCurrentSlotSpecialType = (isRemovingBrackets)
                                ? (currentSlotInfos.slotId.match(/,/g)?.length??0) > (slotToDeleteInfos.slotId.match(/,/g)?.length??0)
                                : currentSlotInfos.slotType == SlotType.string;                    
                            // The parent of the slot to delete:
                            const slotToDeleteParentSlot = (slotToDeleteParentId.length > 0)
                                ? retrieveSlotFromSlotInfos({...currentSlotInfos, slotId: slotToDeleteParentId})
                                : this.frameObjects[currentSlotInfos.frameId].labelSlotsDict[currentSlotInfos.labelSlotsIndex].slotStructures;

                            let parsedStringContentRes = null;
                            if(isRemovingString){
                                const stringSlot = (isCurrentSlotSpecialType) ? retrieveSlotFromSlotInfos(currentSlotInfos) as StringSlot : slotToDelete as StringSlot;
                                const stringLiteral = stringSlot.quote + stringSlot.code + stringSlot.quote;
                                parsedStringContentRes =  parseCodeLiteral(stringLiteral, {isInsideString: true});
                            }
                            // The number of fields in the bracket/string (for the latter, after it is turned into code, so the string "a+b" would be 2):
                            const fieldsInSpecialTypeNumber = (isRemovingBrackets)
                                ? ((isCurrentSlotSpecialType) ? parentSlot.fields.length : (slotToDeleteParentSlot as SlotsStructure).fields.length)
                                : (parsedStringContentRes?.slots.fields.length)??0;
                            // If we are inside and removing brackets, use the [outside] target's parent, otherwise we can just use our parent:
                            const slotStructureToUpdate = (isCurrentSlotSpecialType && isRemovingBrackets) ? slotToDeleteParentSlot as SlotsStructure : parentSlot;
    
                            // Move the content of the bracket / string slot in the bracket parent
                            if(isCurrentSlotSpecialType){
                                const indexOfSpecialTypeField = (isRemovingBrackets) ? parseInt(parentId.substring(parentId.lastIndexOf(",") + 1)) : slotIndex;
                                const contentToMove = (isRemovingBrackets) ? parentSlot : parsedStringContentRes?.slots as SlotsStructure;
                                slotStructureToUpdate.fields.splice(indexOfSpecialTypeField, 1, ...contentToMove.fields);
                                slotStructureToUpdate.operators.splice(indexOfSpecialTypeField, 0, ...contentToMove.operators);
                            }
                            else{
                                const changeSlotsIndexOffset = (isForwardDeletion) ? 1 : -1;
                                const contentToMove = (isRemovingBrackets) ? slotToDeleteParentSlot as SlotsStructure : parsedStringContentRes?.slots as SlotsStructure;
                                slotStructureToUpdate.fields.splice(slotIndex + changeSlotsIndexOffset, 1, ...contentToMove.fields);
                                slotStructureToUpdate.operators.splice(slotIndex + changeSlotsIndexOffset, 0, ...contentToMove.operators);
                            }
                

                            // Compute the cursor offset that deleting a bracket / string slot will trigger.
                            // For strings, the intial cursor position at focus is not used, since we are changing the slots structure altogether,
                            // therefore, we need to also include the newly created slots from the string into our offset
                            const cursorStringOffset = (isRemovingString && isCurrentSlotSpecialType) 
                                ? ((isForwardDeletion) 
                                    ? (slotStructureToUpdate.fields[slotToDeleteIndex  + fieldsInSpecialTypeNumber - 2] as BaseSlot).code.length 
                                    : (slotStructureToUpdate.fields[slotToDeleteIndex  + 1] as BaseSlot).code.length)
                                : 0; 
                            const cursorOffsetSlotIndex = (isForwardDeletion) ? -2 : 2;
                            const cursorPosOffset = cursorStringOffset + ((fieldsInSpecialTypeNumber == 1 && isCurrentSlotSpecialType) 
                                ? (slotStructureToUpdate.fields[slotToDeleteIndex + cursorOffsetSlotIndex] as BaseSlot).code.length 
                                : 0);
                    
                            // Now recursively call the method for each ends of what was the bracket / string before, starting with the closing end
                            const parentToUpdateId = (isCurrentSlotSpecialType && isRemovingBrackets) ? slotToDeleteParentId : parentId;
                            const currentSlotType = (isRemovingString) ? SlotType.code : currentSlotInfos.slotType; // When we delete a string the type is no longer a string...
                            const indexOfLastBracketChild = (isCurrentSlotSpecialType) 
                                ? ((isForwardDeletion) ? slotToDeleteIndex  + fieldsInSpecialTypeNumber - 2 : slotToDeleteIndex + fieldsInSpecialTypeNumber)
                                : ((isForwardDeletion) ? slotIndex + fieldsInSpecialTypeNumber : slotIndex  + fieldsInSpecialTypeNumber - 2);
                            const idForLastBracketChild = getSlotIdFromParentIdAndIndexSplit(parentToUpdateId, indexOfLastBracketChild);
                            this.deleteSlots(true, {...currentSlotInfos, slotId: idForLastBracketChild, slotType: currentSlotType});
                            const indexOfFirstBracketChild = (isCurrentSlotSpecialType) 
                                ? ((isForwardDeletion) ? slotToDeleteIndex - 1 : slotToDeleteIndex + 1)
                                : ((isForwardDeletion) ? slotIndex + 1 : slotIndex - 1);
                            const idForFirstBracketChild = getSlotIdFromParentIdAndIndexSplit(parentToUpdateId, indexOfFirstBracketChild);
                            this.deleteSlots(false, {...currentSlotInfos, slotId: idForFirstBracketChild, slotType: currentSlotType});
                    
                            // Prepare the ID of the new current slot:
                            const newCurrentSlotId = (isCurrentSlotSpecialType)
                                ? ((isForwardDeletion) 
                                    ? getSlotIdFromParentIdAndIndexSplit(parentToUpdateId, Math.max(0, indexOfLastBracketChild - 1)) 
                                    : getSlotIdFromParentIdAndIndexSplit(parentToUpdateId, Math.max(0, indexOfFirstBracketChild - 1)))
                                : ((isForwardDeletion) 
                                    ? currentSlotInfos.slotId 
                                    : getSlotIdFromParentIdAndIndexSplit(parentId, slotIndex + fieldsInSpecialTypeNumber - 3));
                            return {newSlotId: newCurrentSlotId, cursorPosOffset: cursorPosOffset};
                        }
                        else {
                            // Get the adjacent operator and check whether it has a space in it:
                            const deleteOperatorsFromIndex = (isForwardDeletion) ? slotIndex : slotIndex - 1;
                            if (parentSlot.operators[deleteOperatorsFromIndex]?.code?.trim()?.includes(" ")) {
                                parentSlot.operators[deleteOperatorsFromIndex].code = (isForwardDeletion) 
                                    ? parentSlot.operators[deleteOperatorsFromIndex].code.substring(parentSlot.operators[deleteOperatorsFromIndex].code.indexOf(" ") + 1)
                                    : parentSlot.operators[deleteOperatorsFromIndex].code.substring(0, parentSlot.operators[deleteOperatorsFromIndex].code.lastIndexOf(" ", parentSlot.operators[deleteOperatorsFromIndex].code.length - 2));
                                return {
                                    newSlotId: currentSlotInfos.slotId,
                                    cursorPosOffset: 0,
                                };
                            }
                        }                    

                        if (!isRemovingMedia) {
                            // Change the slot content first, to avoid issues with indexes once things are deleted from the store...
                            // Now we merge the 2 fields surrouding the deleted operator:
                            // when forward deleting, that means appening the next field content to the current slot's content,
                            // when backward deleting, that means prepending the previous field content to the current's slot content.
                            const slotToDeleteCode = (slotToDelete as BaseSlot).code;
                            const currentSlotCode = (retrieveSlotFromSlotInfos(currentSlotInfos) as BaseSlot).code;
                            (retrieveSlotFromSlotInfos(currentSlotInfos) as BaseSlot).code = (isForwardDeletion) ? (currentSlotCode + slotToDeleteCode) : (slotToDeleteCode + currentSlotCode);
                        }
                        else {
                            // When we delete a media slot with backspace, the new slot must be indexed 2 prior since it's surrounded with empty operators
                            // so we remove 1 extra index from the id
                            const {parentId, slotIndex} = getSlotParentIdAndIndexSplit(slotToDeleteInfos.slotId);
                            slotToDeleteInfos.slotId = getSlotIdFromParentIdAndIndexSplit(parentId, slotIndex - 1);
                        }

                        // Now we do the fields/operator deletion:
                                
                        // Delete the operators from the parent slot structure
                        const deleteOperatorsFromIndex = (isForwardDeletion) ? slotIndex : slotIndex - 1;
                        parentSlot.operators.splice(deleteOperatorsFromIndex, 1);

                        // Delete the fields from the parent slot structure.
                        parentSlot.fields.splice((isForwardDeletion) ? slotIndex + 1 : slotIndex - 1, 1);

                        return {
                            newSlotId: (isForwardDeletion) ? currentSlotInfos.slotId : slotToDeleteInfos.slotId,
                            cursorPosOffset: 0,
                        };
                    }
                }
                else{
                    // The case of selection of slots requires to check where we are in the boudaries:
                    // either inside a slot or at the edge of it -- when we are inside, the remaining text of the slot need to be kept.
                    // The direction of deletion doesn't matter (isForwardDeletion flag), but the relative position of the anchor/focus does.
                    // 1 - first construct the resulting text of the deletion
                    const anchorSlot = retrieveSlotFromSlotInfos(this.anchorSlotCursorInfos.slotInfos);
                    const focusSlot = retrieveSlotFromSlotInfos(currentSlotInfos);
                    const {slotIndex: anchorSlotIndex} = getSlotParentIdAndIndexSplit(this.anchorSlotCursorInfos.slotInfos.slotId);
                    const isAnchorBeforeFocus = (getSelectionCursorsComparisonValue() as number) < 0;
                    const newCode = (isAnchorBeforeFocus) 
                        ? (anchorSlot as BaseSlot).code.substring(0,this.anchorSlotCursorInfos.cursorPos) + (focusSlot as BaseSlot).code.substring(this.focusSlotCursorInfos.cursorPos)
                        : (focusSlot as BaseSlot).code.substring(0, this.focusSlotCursorInfos.cursorPos) + (anchorSlot as BaseSlot).code.substring(this.anchorSlotCursorInfos.cursorPos);
                    // 2 - perform the actual slot deletion.
                    // Operators: we delete from the operator that follow the selection start slot, it has the same index as this slot.
                    // the last operator to be deleted is the one just before the selection end slot, and it its index is the slot index - 1
                    // there will always be at least 1 operator removed, since slots are separated by operators
                    const deleteOperatorsFromIndex = (isAnchorBeforeFocus) ? anchorSlotIndex : slotIndex;
                    const deleteOperatorsToIndex = (isAnchorBeforeFocus) ? slotIndex - 1 : anchorSlotIndex - 1;
                    parentSlot.operators.splice(deleteOperatorsFromIndex, deleteOperatorsToIndex - deleteOperatorsFromIndex + 1);
                    // Fields: we don't delete the current slot, we delete as many frames there are to the anchor slot.
                    // There will be always at least 1 field to remove since we are doing a selection
                    const deleteFieldsFromIndex = (isAnchorBeforeFocus) ? anchorSlotIndex + 1 : slotIndex + 1;
                    const deleteFieldsToIndex = (isAnchorBeforeFocus) ? slotIndex : anchorSlotIndex;
                    const numberOfFieldsToDelete = deleteFieldsToIndex - deleteFieldsFromIndex + 1;
                    parentSlot.fields.splice(deleteFieldsFromIndex, numberOfFieldsToDelete);
                    // 3 - get the resulting slot ID, and set the resulting code in
                    // (the current slot ID won't change if the selection is leftwards, it will in the other direction as there is an offset once deletion occur)
                    const newSlotId = (isAnchorBeforeFocus) 
                        ? (getSlotIdFromParentIdAndIndexSplit(parentId, slotIndex - numberOfFieldsToDelete)) 
                        : currentSlotInfos.slotId;
                    (retrieveSlotFromSlotInfos({...currentSlotInfos, slotId: newSlotId}) as BaseSlot).code = newCode;
                    // 4 - return value 
                    return {
                        newSlotId: newSlotId, 
                        cursorPosOffset: 0,
                    };
                }
            }

            // We should never arrive here
            return {newSlotId: "", cursorPosOffset: 0};
        },

        setFrameErroneous(frameId: number, errMsg: string) {
            Vue.set(this.frameObjects[frameId], "atParsingError", errMsg);
        },

        setSlotErroneous(frameSlotInfos: SlotInfos) {
            const slotObject = (retrieveSlotFromSlotInfos(frameSlotInfos) as BaseSlot);
            const existingError =  slotObject.error??"";
            const existingErrorBits = existingError.split("\n");
            // Sometimes we need to extend the error, if more than one different errors are on the same slot
            if(!existingErrorBits.includes(frameSlotInfos.error??"")){
                const newError = (existingError === "" || frameSlotInfos.error === "") ? frameSlotInfos.error: (existingError +"\n" + frameSlotInfos.error);
                // As error-related properties are optional, we need to use Vue.set(), since they may not exist on the object yet
                Vue.set(
                    slotObject,
                    "error",
                    newError
                );

                if(frameSlotInfos.errorTitle){
                    Vue.set(
                        slotObject,
                        "errorTitle",
                        frameSlotInfos.errorTitle
                    );
                }
            }           
        },

        addPreCompileErrors(id: string) {
            if(!this.preCompileErrors.includes(id)) {
                this.preCompileErrors.push(id);
            }
        },

        removePreCompileErrors(id: string ) {
            if(this.preCompileErrors.includes(id)) {
                this.preCompileErrors.splice(this.preCompileErrors.indexOf(id),1);
            }
        },

        setSlotTextCursors(anchorCursorInfos: SlotCursorInfos | undefined, focusCursorInfos: SlotCursorInfos | undefined){
            // If we set a new object in these properties then it causes a lot of updates throughout
            // the whole tree.  So we check if the two objects are (deep) equal before
            // we update, to avoid unnecessary updates and renders:
            if (!isEqual(this.anchorSlotCursorInfos, anchorCursorInfos)) {
                Vue.set(this, "anchorSlotCursorInfos", anchorCursorInfos);
            }
            if (!isEqual(this.focusSlotCursorInfos, focusCursorInfos)) {
                Vue.set(this, "focusSlotCursorInfos", focusCursorInfos);
            }
            if(!anchorCursorInfos || !focusCursorInfos){
                // Force the selection on the page to be reset too
                document.getSelection()?.removeAllRanges();
            }
        },

        updateNextAvailableId() {
            this.nextAvailableId = Math.max.apply({},(Object.keys(this.frameObjects).concat(Object.keys(this.copiedFrames))).map(Number))+1;
        },
        
        doCopyFrame(frameId: number) {
            // The nextAvailableId should be right, but for sanity check, we make sure the id is indeed available to avoid potential issues
            let nextAvailableId = this.nextAvailableId;
            while(this.frameObjects[nextAvailableId] != undefined){
                nextAvailableId+=1;
            }
            this.copiedFrameId = nextAvailableId;

            // If it has a JointParent, we're talking about a JointFrame
            const isJointFrame = this.frameObjects[frameId].frameType.isJointFrame;
            
            const parent = (isJointFrame) ? this.frameObjects[frameId].jointParentId : this.frameObjects[frameId].parentId;

            cloneFrameAndChildren(this.frameObjects, frameId, parent, {id: nextAvailableId}, this.copiedFrames);             
        },

        doCopySelection() {
            // If it has a JointParent, we're talking about a JointFrame
            const isJointFrame = this.frameObjects[this.selectedFrames[0]].frameType.isJointFrame;
            
            const parent = (isJointFrame) ? this.frameObjects[this.selectedFrames[0]].jointParentId : this.frameObjects[this.selectedFrames[0]].parentId;

            // We generate the list of frames from the selectedFrames ids
            const sourceFrameList: FrameObject[] = Array(this.selectedFrames.length);
            this.selectedFrames.forEach((id, index) => sourceFrameList[index] = this.frameObjects[id]);
            
            // All the top level cloned frames need to be stored in order to then added to their new parent's list.
            // The nextAvailableId should be right, but for sanity check, we make sure the id is indeed available to avoid potential issues.
            const topLevelCopiedFrames: number[] = [];
            let nextAvailableId = this.nextAvailableId;
            while(this.frameObjects[nextAvailableId] != undefined){
                nextAvailableId+=1;
            }

            sourceFrameList.forEach((frame) => {
                //For each top level frame (i.e. each one on the selected list) we record its new id
                topLevelCopiedFrames.push(nextAvailableId);
                cloneFrameAndChildren(this.frameObjects, frame.id, parent, {id: nextAvailableId}, this.copiedFrames); 
                // Find the largest id form the copied and increase it by 1
                nextAvailableId = Math.max.apply({},(Object.keys(this.copiedFrames).concat(Object.keys(this.copiedFrames))).map(Number)) + 1;
            });

            Vue.set( 
                this,
                "copiedSelectionFrameIds",  
                topLevelCopiedFrames
            );
        },

        updateState(newState: Record<string, unknown>){
            //this method complete changes the state with a new state object
            Object.keys(this.$state).forEach((property) => {
                Vue.set(
                    this,
                    property,
                    newState[property]
                );
            } );

            // The frame cursor cannot be left inside a collapsed frame container (section),
            // however, for compatibility with project saved under the old behaviour (which allowed the situation),
            // we explicitly check the frame container (section) containing the current frame cursor is expanded
            const currentPositionFrameContainerId = getFrameSectionIdFromFrameId(this.currentFrame.id);
            this.frameObjects[currentPositionFrameContainerId].collapsedState = CollapsedState.FULLY_VISIBLE;

            this.clearNoneFrameRelatedState();
        },

        clearNoneFrameRelatedState() {
            //undo redo is cleared
            diffToPreviousState.splice(0, diffToPreviousState.length);
            diffToNextState.splice(0, diffToNextState.length);
            this.diffToPreviousStateCounter = 0;
            this.diffToNextStateCounter = 0;
            
            //copied frames are cleared
            this.copiedFrameId = -100;
            Vue.set(
                this,
                "copiedFrames",
                {}
            );
            this.copiedSelectionFrameIds.splice(0);

            //context menu indicator is cleared
            this.contextMenuShownId = "";
            this.isModalDlgShown = false;
            this.simpleModalDlgMsg = "";
            this.currentModalDlgId = "";
            this.isAppMenuOpened = false;
            this.bypassEditableSlotBlurErrorCheck = false;

            // Should show editing mode
            this.isEditing = false;
            if(this.focusSlotCursorInfos){
                const labelSlotStructs = Object.values(this.frameObjects).flatMap((frameObject) => Object.values(frameObject.labelSlotsDict).map((labelSlotDict) => labelSlotDict.slotStructures));
                const focusedSlot= (retrieveSlotByPredicate(labelSlotStructs, (slot: FieldSlot) => (slot as BaseSlot).focused??false) as BaseSlot);
                if(focusedSlot){
                    focusedSlot.focused = false;
                }
                document.getElementById(getLabelSlotUID(this.focusSlotCursorInfos.slotInfos))
                    ?.dispatchEvent(new CustomEvent(CustomEventTypes.editableSlotLostCaret));
            }
            this.ignoreKeyEvent = false;

            // If the sync target property did not exist in the saved stated, we set it up to the default value
            this.syncTarget = this.syncTarget??StrypeSyncTarget.none;
            this.isEditorContentModified = false;
            this.projectLastSaveDate = -1;

            // We check the errors in the code applied to the that new state
            nextTick().then(() => {
                this.wasLastRuntimeErrorFrameId = undefined,
                checkEditorCodeErrors();
                // To make sure that the error navigator gets updated properly (reactivity) we first set the error count to -1 and then count again in next tick so it notified
                // because when we load a file, we update the error count value in the state but this error check won't be notified if there are actually
                // still the same number of errors...
                useStore().errorCount = -1;
                nextTick().then(() => useStore().errorCount = countEditorCodeErrors());                
            }); 
        },

        saveStateChanges(previousState: (typeof this.$state)) {
            // If have an explicit request to igore the undo/redo save state preps, we don't do anything
            if(this.ignoreStateSavingActionsForUndoRedo){
                return;
            }
            
            this.isEditorContentModified = true;
            // Saves the state changes in diffPreviousState.
            // We do not simply save the differences between the state and the previous state, because when undo/redo will be invoked, we cannot know what will be 
            // the navigation status in the editor (i.e. are we editing? what blue caret or text cursor is currenty displayed), and there might not be any difference right now.
            // So to make sure that we will ALWAYS see a difference of positioning no matter the situation, we simlate a mock change with dummy positioning,
            // in order to get the previous state saved correctly regarding navigation.
            const stateCopy = cloneDeep(this.$state);
            stateCopy.currentFrame = {id: 0, caretPosition: CaretPosition.none};
            previousState.lastCriticalActionPositioning = {lastCriticalCaretPosition: previousState.currentFrame, lastCriticalSlotCursorInfos: previousState.focusSlotCursorInfos};
            this.lastCriticalActionPositioning = {
                lastCriticalCaretPosition: cloneDeep(this.currentFrame),
                lastCriticalSlotCursorInfos: (this.isEditing) ?  cloneDeep(this.focusSlotCursorInfos) : undefined,
            };
            const mockAnchorFocusSlotCursorInfos: SlotCursorInfos = {slotInfos: {frameId: 0, labelSlotsIndex: -1, slotId: "-1", slotType: SlotType.none}, cursorPos: -1};
            stateCopy.lastCriticalActionPositioning.lastCriticalCaretPosition = {id: 0, caretPosition: CaretPosition.none};
            stateCopy.lastCriticalActionPositioning.lastCriticalSlotCursorInfos = mockAnchorFocusSlotCursorInfos;
            if(this.isEditing){
                const labelSlotStructs = Object.values(stateCopy.frameObjects).flatMap((frameObject) => Object.values(frameObject.labelSlotsDict).map((labelSlotDict) => labelSlotDict.slotStructures));
                const focusedSlotCopy = (retrieveSlotByPredicate(labelSlotStructs, (slot: FieldSlot) => (slot as BaseSlot).focused??false) as BaseSlot);
                if(focusedSlotCopy){
                    focusedSlotCopy.focused = false;
                }
                stateCopy.anchorSlotCursorInfos = mockAnchorFocusSlotCursorInfos;
                stateCopy.focusSlotCursorInfos = mockAnchorFocusSlotCursorInfos;
            }
            stateCopy.isEditing = !this.isEditing;

            const diffs = getObjectPropertiesDifferences(stateCopy, previousState);
            diffToPreviousState.push(diffs);

            // Don't exceed the maximum of undo steps allowed
            if(diffToPreviousState.length > undoMaxSteps) {
                diffToPreviousState.splice(
                    0,
                    1
                );
            }
            this.diffToPreviousStateCounter = diffToPreviousState.length;

            //we clear the diffToNextState content as we are now starting a new sequence of actions
            diffToNextState.splice(
                0,
                diffToNextState.length
            );
            this.diffToNextStateCounter = 0;
        },

        applyStateUndoRedoChanges(isUndo: boolean){
            this.isEditorContentModified = true;
            // Clear the current blue caret, whichever the new value will be so we do not get 2 carets if the current and new values differ
            const oldCaretId = this.currentFrame.id;
            if(getAvailableNavigationPositions().map((e)=>e.frameId).includes(oldCaretId) && this.frameObjects[oldCaretId]){
                Vue.set(
                    this.frameObjects[oldCaretId],
                    "caretVisibility",
                    CaretPosition.none
                );
            }

            // And remove any currently focused slot
            const labelSlotStructs = Object.values(this.frameObjects).flatMap((frameObject) => Object.values(frameObject.labelSlotsDict).map((labelSlotDict) => labelSlotDict.slotStructures));
            const focusedSlot = retrieveSlotByPredicate(labelSlotStructs, (slot: FieldSlot) => (slot as BaseSlot).focused??false);
            if(focusedSlot){
                focusedSlot.focused = false;
            }

            // Performing the change if there is any change recorded in the state
            let changeList = [] as ObjectPropertyDiff[];
            if(isUndo) {
                changeList = diffToPreviousState.pop()??[];
                this.diffToPreviousStateCounter--;
            }
            else {
                changeList = diffToNextState.pop()??[];
                this.diffToNextStateCounter--;
            }
            
            const stateBeforeChanges = cloneDeep(this.$state);
            if(changeList.length > 0){
                // This flag stores the arrays that need to be "cleaned" (i.e., removing the null elements)
                const arraysToClean = [] as {[id: string]: any}[];                
                
                //if the value in the changes isn't "null" --> replaced/add, otherwise, delete.
                changeList.forEach((changeEntry: ObjectPropertyDiff) => {
                    //we reconstruct what in the state should be changed based on the difference path
                    const stateParts = changeEntry.propertyPathWithArrayFlag.split(".");
                    const property = stateParts[stateParts.length -1];
                    stateParts.pop();
                    let statePartToChange = this as {[id: string]: any};
                    let lastPartIsArray;
                    stateParts.forEach((partWithArrayFlag) => {
                        //intermediate parts have a flag suffix indicating if the part is an array or not
                        const part = partWithArrayFlag.substring(0, partWithArrayFlag.lastIndexOf("_"));
                        const isArrayPart = partWithArrayFlag.substring(partWithArrayFlag.lastIndexOf("_") + 1) === "true";
                        lastPartIsArray = isArrayPart;
                        //if a part doesn't exist, we create it with an empty object value
                        if(statePartToChange[part] === undefined){
                            Vue.set(
                                statePartToChange,
                                part,
                                (isArrayPart) ? [] : {}
                            );
                        }
                        statePartToChange = statePartToChange[part];
                    });

                    // Now we update the property value :
                    // - For arrays, we replace the element at the index n no matter if it's null or not
                    //   because deletion would offset the indexing during the loop, so we will clean the array later.
                    // - For objects, we check if the element is null: if so, it's fine to remove it directly
                    if(lastPartIsArray || !lastPartIsArray && changeEntry.value != null){
                        Vue.set(
                            statePartToChange,
                            property,
                            changeEntry.value
                        );

                        //if we "delete" something in an array, flag this array for clearning
                        if(lastPartIsArray && changeEntry.value===null && arraysToClean.indexOf(statePartToChange) === -1){
                            arraysToClean.push(statePartToChange);
                        }
                    }
                    else{
                        // Because undefined value for anchor/focus (text selection) are meaningul, we can't destroy the property 
                        // if it's set to be undefined. Instead, in those 2 cases we set the value directly
                        if(property == "anchorSlotCursorInfos" || property == "focusSlotCursorInfos" || property == "lastCriticalSlotCursorInfos"){
                            statePartToChange[property] = undefined;
                        }
                        else{
                            Vue.delete(
                                statePartToChange,
                                property
                            );   
                        }              
                    }
                });

                //clean arrays that need cleaning
                arraysToClean.forEach((arrayToClean) => {
                    for(let arrayIndex = arrayToClean.length; arrayIndex >=0; arrayIndex--){
                        if(arrayToClean[arrayIndex] === null){
                            Vue.delete(
                                arrayToClean,
                                arrayIndex
                            );
                        }
                    }
                }); 

                // We make sure the current selection of the document is in sync with what we have in the store
                Vue.nextTick(() => {
                    // Set the right current frame in any case
                    const newCaretId = this.lastCriticalActionPositioning.lastCriticalCaretPosition.id;
                    if(getAvailableNavigationPositions().map((e)=>e.frameId).includes(newCaretId) && this.frameObjects[newCaretId]){
                        Vue.set(
                            this.frameObjects[newCaretId],
                            "caretVisibility",
                            this.lastCriticalActionPositioning.lastCriticalCaretPosition.caretPosition
                        );
                    }
                    if(this.focusSlotCursorInfos && this.anchorSlotCursorInfos){
                        this.setSlotTextCursors(this.focusSlotCursorInfos, this.focusSlotCursorInfos);
                        setDocumentSelection(this.focusSlotCursorInfos, this.focusSlotCursorInfos);
                        const toFocusSlot = retrieveSlotFromSlotInfos(this.focusSlotCursorInfos.slotInfos) as BaseSlot;
                        toFocusSlot.focused = true;
                        this.isEditing = true;
                    }
                    else{
                        // Force the selection on the page to be reset too
                        document.getSelection()?.removeAllRanges();
                    }

                    // Ensure the caret (frame or text caret) is visible in the page viewport after the change.
                    // For some reason, scrollIntoView() "miss" out the caret by a slight distance (maybe because it's a div?) so we don't see it. To adjust that issue, we scroll up a bit more.
                    const htmlElementToShowId = (this.focusSlotCursorInfos) ? getLabelSlotUID(this.focusSlotCursorInfos.slotInfos) : getCaretContainerUID(this.currentFrame.caretPosition,this.currentFrame.id);
                    const caretContainerEltRect = document.getElementById(htmlElementToShowId)?.getBoundingClientRect();
                    document.getElementById(htmlElementToShowId)?.scrollIntoView();
                    if(isCaretContainerElement(htmlElementToShowId) && caretContainerEltRect){
                        const scrollStep = (caretContainerEltRect.top + caretContainerEltRect.height > document.documentElement.clientHeight) ? 50 : -50;
                        const currentScroll = $("#"+getEditorMiddleUID()).scrollTop();
                        $("#"+getEditorMiddleUID()).scrollTop((currentScroll??0) + scrollStep);
                    }     
                });

                //Finally, for sanity check, we check errors on the whole code after changes have been applied
                checkCodeErrors();

                // Keep the arrays of changes in sync with undo/redo sequences
                // The state reference is sightly modified for using the critical positions that will be required for redo                
                this.currentFrame = this.lastCriticalActionPositioning.lastCriticalCaretPosition;
                if(this.lastCriticalActionPositioning.lastCriticalSlotCursorInfos){
                    this.isEditing = true;
                    this.anchorSlotCursorInfos = this.lastCriticalActionPositioning.lastCriticalSlotCursorInfos;
                    this.focusSlotCursorInfos = this.lastCriticalActionPositioning.lastCriticalSlotCursorInfos;
                }
                else{
                    this.isEditing = false;
                    this.anchorSlotCursorInfos = undefined;
                    this.focusSlotCursorInfos = undefined;
                }

                // As we will show the frame cursor that is potentiallly inside a collapsed frame container, 
                // we make sure we set that frame container expanded to ensure the changes visibility
                this.frameObjects[getFrameSectionIdFromFrameId(this.currentFrame.id)].collapsedState = CollapsedState.FULLY_VISIBLE;

                // Just like for saveStateChanges(), we need to simulate some dummy changes so that differences between
                // the stateBeforeChanges and the current state regarding positioning and editing are all reflected properly
                // (we do not know where we'll be when undo/redo is invoked, so we need to make as if changes of positionning occurred)
                const stateCopy = cloneDeep(this.$state);    
                stateCopy.currentFrame = {id: 0, caretPosition: CaretPosition.none};
                const mockAnchorFocusSlotCursorInfos: SlotCursorInfos = {slotInfos: {frameId: 0, labelSlotsIndex: -1, slotId: "-1", slotType: SlotType.none}, cursorPos: -1};
                stateCopy.lastCriticalActionPositioning.lastCriticalCaretPosition = {id: 0, caretPosition: CaretPosition.none};
                stateCopy.lastCriticalActionPositioning.lastCriticalSlotCursorInfos = mockAnchorFocusSlotCursorInfos;
                if(this.isEditing){
                    const labelSlotStructs = Object.values(stateCopy.frameObjects).flatMap((frameObject) => Object.values(frameObject.labelSlotsDict).map((labelSlotDict) => labelSlotDict.slotStructures));
                    const focusedSlotCopy = (retrieveSlotByPredicate(labelSlotStructs, (slot: FieldSlot) => (slot as BaseSlot).focused??false) as BaseSlot);
                    if(focusedSlotCopy){
                        focusedSlotCopy.focused = false;
                    }
                    stateCopy.anchorSlotCursorInfos = mockAnchorFocusSlotCursorInfos;
                    stateCopy.focusSlotCursorInfos = mockAnchorFocusSlotCursorInfos;
                }
                // Also mock the change of edition between the copy and the previous state to ensure the difference is detected.
                stateCopy.isEditing = !this.isEditing;

                const stateDifferences = getObjectPropertiesDifferences(stateCopy, stateBeforeChanges);
                if(isUndo){
                    diffToNextState.push(stateDifferences);
                    this.diffToNextStateCounter++;
                }
                else{
                    diffToPreviousState.push(stateDifferences);    
                    this.diffToPreviousStateCounter++;    
                }
            }
        },  
        
        doChangeDisableFrame(payload: {frameId: number; isDisabling: boolean; ignoreEnableFromRoot?: boolean}) {
            //When we disable or enable a frame, we also disable/enable all the sublevels (children and joint frames)
            const allFrameIds = [payload.frameId];
            allFrameIds.push(...getAllChildrenAndJointFramesIds(payload.frameId));
            allFrameIds.forEach((frameId) => {
                Vue.set(
                    this.frameObjects[frameId],
                    "isDisabled",
                    payload.isDisabling
                );

                // If disabling [resp. enabling], we also need to remove [resp. add] potential errors of empty editable slots
                // As disabling a frame could impact other places of the code, we actually just run for error checks on the code itself.
                // We don't need to check errors if we are wrapping a frame (because expect users to type something in the wrapping frame's slots, or get out of them which would check errors then)
                if(!this.isWrappingFrame){
                    checkCodeErrors();       
                }
            });
        },

        selectDeselectFrame(payload: {frameId: number; direction: string}) {
            const indexOfFrame = this.selectedFrames.indexOf(payload.frameId);
            // if it exists remove it
            if(indexOfFrame > -1) {
                this.selectedFrames.splice(indexOfFrame,1);
            }
            // else it may be added
            else { 
                this.selectedFrames.splice((payload.direction === "up") ? 0 : this.selectedFrames.length, 0, payload.frameId);
            }
        },

        unselectAllFrames() {
            // Note: .splice changes the content and calls all listeners, even if
            // it has no practical effect (i.e. even if the array was already empty).  So it's
            // very important we don't call it unless we actually need to (i.e. unless there is
            // something in the array), because a change will cause everything reactive which depends
            // on this to update:
            if (this.selectedFrames.length > 0) {
                this.selectedFrames.splice(0,this.selectedFrames.length);
            }
        },

        flushCopiedFrames(){
            Vue.set(
                this,
                "copiedFrames",
                {}
            );

            this.copiedFrameId = -100;
            
            Vue.set(
                this,
                "copiedSelectionFrameIds",
                []
            );
        },

        setCollapseStatuses(statuses: Record<number, CollapsedState>) {
            Object.entries(statuses).forEach(([frameId, collapsed]) => 
                Vue.set(
                    this.frameObjects[Number(frameId)],
                    "collapsedState",
                    collapsed
                ));
        },

        cycleFrameCollapsedState(frameId: number) {
            const parentIsFrozen = this.frameObjects[this.frameObjects[frameId].parentId].frozenState == FrozenState.FROZEN;
            const newStates = calculateNextCollapseState([this.frameObjects[frameId]], parentIsFrozen).individual;
            this.setCollapseStatuses(newStates);
        },

        setFrozenStatus(payload: {frameId: number; frozen: FrozenState}) {
            Vue.set(
                this.frameObjects[payload.frameId],
                "frozenState",
                payload.frozen
            );
        },
        

        /******************** OLD ACTIONS ********** */
        updateDroppedFramesOrder(destinationCaretFrameId: number, destinationCaretPos: CaretPosition, draggedFrameId?: number) {
            const draggedFramesReversed = (draggedFrameId) ? [draggedFrameId] : [...this.selectedFrames].reverse();
            this.unselectAllFrames();
            // Backup the current state for undo/redo
            this.updateStateBeforeChanges(false);
            // We move the frames of the dragged frames reversed list from their parent to the list of frames relative to the destination:
            // if the destination is a body, that's the list of children of the destination frame, if the destination is below a frame,
            // that's the list of children of the parent container of frame that contains the frame just above the destination caret pos.
            const sourceContainerFrame = this.frameObjects[this.frameObjects[(draggedFramesReversed[0])].parentId];
            const destContainerFrame = (destinationCaretPos == CaretPosition.body) 
                ? this.frameObjects[destinationCaretFrameId]
                : this.frameObjects[this.frameObjects[destinationCaretFrameId].parentId];

            draggedFramesReversed.forEach((draggedFrameId) => {
                // VERY IMPORTANT: the frames components being removed from their original parents will be destroyed.
                // However, even if we write the sequence in order (remove -> add), Vue destroys the component AFTER
                // it has been added (I don't know why...) so we defer adding the frame to its new parent to make sure
                // the component gets created again.
                // Remove the frame from its parent
                sourceContainerFrame.childrenIds.splice(sourceContainerFrame.childrenIds.indexOf(draggedFrameId), 1);
                nextTick(() => {
                    // Append it to the destination list
                    const destFrameListInsertIndex = (destinationCaretPos == CaretPosition.body) ? 0 : destContainerFrame.childrenIds.indexOf(destinationCaretFrameId) + 1;
                    destContainerFrame.childrenIds.splice(destFrameListInsertIndex, 0, draggedFrameId);
                    // Update the dragged frame's parent
                    this.frameObjects[draggedFrameId].parentId = destContainerFrame.id;
                });
                // If the container is disabled, the dragged frame and its children must be disabled too
                if(destContainerFrame.isDisabled){
                    this.doChangeDisableFrame({frameId: draggedFrameId, isDisabling: true});
                }
            });

            //save the state changes for undo/redo after all changes changing the order has been done
            nextTick(() => {
                this.saveStateChanges(this.stateBeforeChanges);

                //clear the stateBeforeChanges flag off
                this.updateStateBeforeChanges(true);
            });
        },

        // Returns stateBeforeChanges
        async setFrameEditableSlotContent(frameSlotInfos: SlotInfosOptionalMedia) {
            //This action is called EVERY time a unitary change is made on the editable slot.
            //We save changes at the entire slot level: therefore, we need to remove the last
            //previous state to replace it with the difference between the state even before and now;            
            if(!frameSlotInfos.isFirstChange){
                diffToPreviousState.pop();
                this.diffToPreviousStateCounter--;
                (retrieveSlotFromSlotInfos(frameSlotInfos) as BaseSlot).code = frameSlotInfos.initCode;  
            }

            //save the previous state
            const stateBeforeChanges = cloneDeep(this.$state);

            const destSlot = retrieveSlotFromSlotInfos(frameSlotInfos) as BaseSlot;
            destSlot.code = frameSlotInfos.code;
            if (frameSlotInfos.mediaType) {
                (destSlot as MediaSlot).mediaType = frameSlotInfos.mediaType;
            }

            //save state changes
            this.saveStateChanges(stateBeforeChanges);
        },

        validateSlot(frameSlotInfos: SlotInfos) {
            this.isEditing = false;

            if(this.frameObjects[frameSlotInfos.frameId]){
                this.setEditableFocus(
                    {
                        ...frameSlotInfos,
                        focused: false,
                    }
                );
                
                // When we leave an editable slot, we explicitely select the add frames tab in the Commands panel
                this.commandsTabIndex = 0; //0 is the index of the add frame tab

                this.setCurrentInitCodeValue(frameSlotInfos);       
            }
        },

        setFocusEditableSlot(payload: {frameSlotInfos: SlotCoreInfos; caretPosition: CaretPosition}){            
            // First thing to do is checking if another slot had focus, and remove it that's the case
            // (as the selection has already been changed via the browser, we cannot use it)            
            const labelSlotStructs = Object.values(this.frameObjects).flatMap((frameObject) => Object.values(frameObject.labelSlotsDict).map((labelSlotDict) => labelSlotDict.slotStructures));
            const prevFocusedSlot = retrieveSlotByPredicate(labelSlotStructs, (slot: FieldSlot) => (slot as BaseSlot).focused??false);
            if(prevFocusedSlot){
                (prevFocusedSlot as BaseSlot).focused = false;
            }

            this.setCurrentInitCodeValue(payload.frameSlotInfos);

            this.isEditing = true;

            //First set the curretFrame to this frame
            this.setCurrentFrame(
                {
                    id: payload.frameSlotInfos.frameId,
                    caretPosition: payload.caretPosition,
                }
            );
            //Then store which editable has the focus
            this.setEditableFocus(
                {
                    ...payload.frameSlotInfos,
                    focused: true,
                }
            );   

            // When we enter an editable slot, we explicitely select the API discovery tab in the Commands panel
            this.commandsTabIndex = 1; //1 is the index of the API discovery tab
        
            this.unselectAllFrames();
        },

        undoRedo(isUndo: boolean) {
            //check if the undo/redo list is empty BEFORE doing any action
            const isEmptyList = (isUndo) ? this.diffToPreviousStateCounter == 0 : this.diffToNextStateCounter == 0;
            
            if(isEmptyList){
                //no undo or redo can performed: inform the user on a temporary message
                this.showMessage(
                    (isUndo) ? MessageDefinitions.NoUndo : MessageDefinitions.NoRedo,
                    2000
                );
            }
            else{
                //a undo/redo can be performed: do the action
                this.applyStateUndoRedoChanges(isUndo);
            }

            this.unselectAllFrames();
        },

        changeCaretPosition(key: string, isLevelScopeChange?: boolean) {
            // When the caret is being moved, we explicitely select the add frames tab in the Commands panel
            this.commandsTabIndex = 0; //0 is the index of the add frame tab

            this.changeCaretWithKeyboard(key, isLevelScopeChange);
            
            this.unselectAllFrames();
        },

        async addFrameWithCommand(frame: FramesDefinitions, hiddenShorthandFrameDetails?: AddShorthandFrameCommandDef) {
            const stateBeforeChanges = cloneDeep(this.$state);
            const currentFrame = this.frameObjects[this.currentFrame.id];
            const addingJointFrame = frame.isJointFrame;

            // find parent id 
            let parentId = 0;
            let listToUpdate: number[] = [];
            let indexToAdd = 0;

            // The frame by which we have to contextualise the addition
            // current frame by default (on caret==body)
            let  focusedFrame: FrameObject = currentFrame;

            if(this.currentFrame.caretPosition === CaretPosition.below) {
                focusedFrame = this.frameObjects[currentFrame.parentId];
            }

            if(addingJointFrame){
                // if the focusedFrame allows for joint children
                // Add it in index 0 on the focusedFrame's joint list
                if(focusedFrame.frameType.allowJointChildren) {
                    parentId = focusedFrame.id;
                    listToUpdate = focusedFrame.jointFrameIds;
                }
                // else the focusedFrame is a joint child (e.g. elif)
                // thus we need to take the the focusedFrame's joint parent (e.g. if) and
                // put the frame below our focusedFrame joint frame
                else {
                    parentId = focusedFrame.jointParentId;
                    listToUpdate = this.frameObjects[focusedFrame.jointParentId].jointFrameIds;
                    indexToAdd = listToUpdate.indexOf(focusedFrame.id) +1; //id
                }
            }
            // else -not joint- simply add it to the focusedFrame's parent, below the focusedFrame
            else {
                parentId = focusedFrame.id;
                listToUpdate = focusedFrame.childrenIds;
                indexToAdd = listToUpdate.indexOf(currentFrame.id) +1; // for the case that we are on the body, indexOf is -1 so result = 0
            } 

            // construct the new Frame object to be added
            // for safety we make sure the new ID isn't already used (it shouldn't but in case something is messed up, we keep the new frame with a valid new ID)
            let nextAvailableId = this.nextAvailableId++;
            while(this.frameObjects[nextAvailableId] != undefined){
                nextAvailableId++;
            }
            const newFrame: FrameObject = {
                ...cloneDeep(EmptyFrameObject),
                frameType: frame,
                caretVisibility: (frame.isJointFrame || frame.allowChildren) ? CaretPosition.body : CaretPosition.below,
                id: nextAvailableId,
                parentId: addingJointFrame ? 0 : parentId, // Despite we calculated parentID earlier, it may not be used
                jointParentId: addingJointFrame ? parentId : 0,
                labelSlotsDict:
                    // For each label defined by the frame type, if the label allows slots, we create an empty "field" slot (code type)
                    // optionalLabel is false by default, and if value is true, the label is hidden when created.
                    // For an function call frame, we set the default slots (of the first label) as "<function name>()" rather than only a single code slot
                    frame.labels.reduce(
                        (acc, cur, idx) => {
                            if (!(cur.showSlots??true)) {
                                return acc;
                            }
                            const labelContent: LabelSlotsContent = {
                                shown: (!cur.hidableLabelSlots),
                                slotStructures: (frame.type == AllFrameTypesIdentifier.funccall) 
                                    ? {fields: [{code: ""},{openingBracketValue:"(", fields: [{code: ""}], operators: []},{code: ""}], operators: [{code: ""}, {code: ""}]}
                                    : {fields: [{code: ""}], operators: []},
                            };
                            return { 
                                ...acc, 
                                [idx]: labelContent,
                            };
                        },
                        {}
                    ),
            };

            // If the frame definition requests some default children and/or joint frames, we update their frame, parent and/or joint parent IDs here
            // (and update the next available ID accoringly), and also add that default frame inside the state
            newFrame.frameType.defaultChildrenTypes?.forEach((defaultChildFrame) => {
                defaultChildFrame.id = (++nextAvailableId);
                defaultChildFrame.parentId = newFrame.id;
                defaultChildFrame.jointParentId = 0;
                newFrame.childrenIds.push(defaultChildFrame.id);
                Vue.set(
                    this.frameObjects,
                    defaultChildFrame.id,
                    defaultChildFrame
                );
            });
            newFrame.frameType.defaultJointTypes?.forEach((defaultJointFrame) => {
                defaultJointFrame.id = (++nextAvailableId);
                defaultJointFrame.jointParentId = newFrame.id;
                defaultJointFrame.parentId = 0;
                newFrame.jointFrameIds.push(defaultJointFrame.id);
                Vue.set(
                    this.frameObjects,
                    defaultJointFrame.id,
                    defaultJointFrame
                );
            });

            // In the special case a hidden shorthand frame addition, we add the code content in the first slot of the frame (by design)
            if(hiddenShorthandFrameDetails && isFieldBaseSlot(newFrame.labelSlotsDict[0].slotStructures.fields[0])){
                (newFrame.labelSlotsDict[0].slotStructures.fields[0] as BaseSlot).code = hiddenShorthandFrameDetails.codeContent;
            }

            // Add the frame id to its parent's childrenIds list
            listToUpdate.splice(
                indexToAdd,
                0,
                newFrame.id
            );

            // Add the new frame to the list
            // "Vue.set" is used as Vue cannot catch the change by doing : state.frameObjects[fobj.id] = fobj
            Vue.set(
                this.frameObjects,
                newFrame.id,
                newFrame
            );
        
            // As the new frame isn't yet added to the DOM, we need a list to store its navigational positions,
            // which will then be merged to the existing caret positions
            const newFramesCaretPositions: NavigationPosition[] = [];
            
            //first add the slots
            Object.entries(newFrame.labelSlotsDict).forEach(([index, element]) => {
                if(element.shown??true){
                    // we would only have 1 empty slot for this label, so its ID is "0"
                    newFramesCaretPositions.push({frameId: newFrame.id, isSlotNavigationPosition:true, labelSlotsIndex: Number(index), slotId: "0"});
                }
            });
      
      
            //now add the caret positions
            if(newFrame.frameType.allowChildren){
                newFramesCaretPositions.push({frameId: newFrame.id, isSlotNavigationPosition: false, caretPosition: CaretPosition.body});
            }
            if(!addingJointFrame){
                newFramesCaretPositions.push({frameId: newFrame.id, isSlotNavigationPosition: false, caretPosition: CaretPosition.below});
            }
            let availablePositions = getAvailableNavigationPositions();
            const indexOfCurrent = availablePositions.findIndex((e) => e.frameId===this.currentFrame.id && !e.isSlotNavigationPosition && e.caretPosition === this.currentFrame.caretPosition);
            
            // the old positions, with the new ones added at the right place
            // done here as we cannot splice while giving it as input
            availablePositions.splice(indexOfCurrent+1,0,...newFramesCaretPositions);

            if (this.selectedFrames.length > 0 && frame.allowChildren) {
                this.isWrappingFrame = true;
                this.copySelection();
                // For deleting a selection, we don't care if we simulate "delete" or "backspace" as they behave the same
                this.deleteFrames("Delete", true);
                this.pasteSelection(
                    {
                        clickedFrameId: newFrame.id,
                        caretPosition: CaretPosition.body,
                        ignoreStateBackup: true,
                    }
                );
                // Find the frame before, if any:
                const index = this.getIndexInParent(newFrame.id);
                if (index == 0) {
                    // If we have added a joint frame (like "else"), the new caret's position is the last child of the root joint element (or it's body if empty).
                    const newPos= (newFrame.frameType.isJointFrame)
                        ? ((this.frameObjects[newFrame.jointParentId].childrenIds.length > 0) 
                            ? {id: this.frameObjects[newFrame.jointParentId].childrenIds.at(-1) as number, caretPosition: CaretPosition.below}
                            : {id: newFrame.jointParentId, caretPosition: CaretPosition.body})
                        : {id: newFrame.parentId, caretPosition: CaretPosition.body};               
                    this.setCurrentFrame(newPos);
                }                
                else {
                    // If we have added a joint frame (like "else"), the new caret's position is the last child of the previous joint element (or it's body if empty).
                    const newPos= (newFrame.frameType.isJointFrame)
                        ? ((this.frameObjects[this.frameObjects[newFrame.jointParentId].jointFrameIds[index-1]].childrenIds.length > 0) 
                            ? {id: this.frameObjects[this.frameObjects[newFrame.jointParentId].jointFrameIds[index-1]].childrenIds.at(-1) as number, caretPosition: CaretPosition.below}
                            : {id: this.frameObjects[newFrame.jointParentId].jointFrameIds[index-1], caretPosition: CaretPosition.body})
                        : {id: this.frameObjects[newFrame.parentId].childrenIds[index - 1], caretPosition: CaretPosition.below};       
                    this.setCurrentFrame(newPos);
                }
                await Vue.nextTick();
                availablePositions = getAvailableNavigationPositions();
                this.isWrappingFrame = false;
            }
            else {
                this.unselectAllFrames();
            }

            this.updateNextAvailableId();
        
            // "Move" the caret along, using the newly computed positions
            await this.leftRightKey(
                {
                    key: "ArrowRight",
                    availablePositions: availablePositions,
                }
            ).then(() => {
                if(hiddenShorthandFrameDetails){
                    // When code is added from a shorthand frame, we need to position the focus (text cursor) properly
                    const newSlotCursorInfos = {...this.focusSlotCursorInfos} as SlotCursorInfos;
                    if(hiddenShorthandFrameDetails.goNextSlot){
                        // If "go next slot" is set to true, we move to the next slot
                        const nextSlot = getFlatNeighbourFieldSlotInfos(newSlotCursorInfos.slotInfos, true);
                        if(nextSlot) {
                            newSlotCursorInfos.slotInfos = nextSlot;
                        }
                        // Explicitly set the focused property to the focused slot
                        this.setFocusEditableSlot({frameSlotInfos: newSlotCursorInfos.slotInfos, 
                            caretPosition: (hiddenShorthandFrameDetails.type.allowChildren) ? CaretPosition.body : CaretPosition.below});              
                    }
                    else{
                        // Stay in the same slot, we move to end of the slot
                        newSlotCursorInfos.cursorPos = hiddenShorthandFrameDetails.codeContent.length;
                    }
                    this.setSlotTextCursors(newSlotCursorInfos, newSlotCursorInfos);
                    setDocumentSelection(newSlotCursorInfos, newSlotCursorInfos);
                }
            })
                .then(
                    () => {
                        //save state changes
                        this.saveStateChanges(stateBeforeChanges);
                        // To make sure we are showing the newly added frame, we scroll into view if needed                    
                        const targetDiv =
                            (this.currentFrame && this.currentFrame.caretPosition !== CaretPosition.none) ?
                                // If frame cursor is focused (e.g. after adding blank frame, or try), scroll to that:
                                document.getElementById(getCaretUID(this.currentFrame.caretPosition, this.currentFrame.id))
                                // Otherwise scroll to the frame header (e.g. for method call, if, while):
                                : document.getElementById(getFrameHeaderUID(newFrame.id));
                        
                        const targetBoundingRect = targetDiv?.getBoundingClientRect();
                        if (targetDiv && targetBoundingRect && (targetBoundingRect.top + targetBoundingRect.height > document.documentElement.clientHeight)) {
                            document.getElementById(getFrameHeaderUID(newFrame.id))?.scrollIntoView();
                        }
                        this.lastAddedFrameIds = newFrame.id;
                    }
                );
        },

        // Note: this will not always do the delete, for example if frozen frames are involved
        // Returns true if the deletion ocurred or false if it did not.
        deleteFrames(key: string, ignoreBackState?: boolean) : boolean {
            const stateBeforeChanges = cloneDeep(this.$state);
            
            // we remove the editable slots from the available positions
            let availablePositions = getAvailableNavigationPositions();
            availablePositions = availablePositions.filter((e) => !e.isSlotNavigationPosition);

            //we create a list of frames to delete that is either the elements of a selection OR the current frame's position
            let framesIdToDelete = [this.currentFrame.id];
            
            let beforeDelete = () => {};

            //If a selection is deleted, we don't distinguish between "del" and "backspace": 
            //We move the caret at the last element of the selection, and perform "backspace" for each element of the selection
            if(this.selectedFrames.length > 0){
                if(this.selectedFrames[this.selectedFrames.length-1] !== this.currentFrame.id){
                    beforeDelete = () => this.setCurrentFrame(
                        {
                            id: this.selectedFrames[this.selectedFrames.length-1], 
                            caretPosition: CaretPosition.below,
                        }
                    );
                }
                key = "Backspace";
                framesIdToDelete = this.selectedFrames.reverse();
            }
            else if (this.currentFrame.caretPosition == CaretPosition.below && this.frameObjects[this.currentFrame.id].jointFrameIds.length > 0 && key === "Backspace") {
                // If they backspace after a joint frame structure that has joint frames (e.g. if +else),
                // delete the last of the joint frames:
                framesIdToDelete = [this.frameObjects[this.currentFrame.id].jointFrameIds[this.frameObjects[this.currentFrame.id].jointFrameIds.length - 1]];
            }
            
            // Check if we can actually delete all frames.  If we can't, we back out and delete none.
            const canDeleteAll = framesIdToDelete.every((frameId) => {
                // A frame can be deleted if it is non-frozen, and all its parents are non-frozen:
                return !this.isEffectivelyFrozen(frameId);
            });
            
            if (!canDeleteAll) {
                return false;
            }
            
            beforeDelete();
            
            framesIdToDelete.forEach((currentFrameId) => {
                //if delete is pressed
                //  case cursor is body: cursor stay here, the first child (if exists) is deleted (*)
                //  case cursor is below: cursor stay here, the next sibling (if exists) is deleted (*)
                // In both cases, if we are in the situation of no sibling/chidren and in a joint structure, 
                // we need to delete the next joint frame that is visually below us.
                //if backspace is pressed
                //  case current frame is Container --> do nothing, a container cannot be deleted
                //  case cursor is body: cursor needs to move one level up, and the current frame's children + all siblings replace its parent (except for function definitions frames)
                //  case cursor is below: cursor needs to move to bottom of previous sibling (or body of parent if first child) and the current frame (*) is deleted
                //(*) with all sub levels children

                const currentFrame = this.frameObjects[currentFrameId];

                let frameToDelete: NavigationPosition = {frameId:-100, isSlotNavigationPosition: false};
                let deleteChildren = false;

                if(key === "Delete"){                    
                    // Where the current sits in the available positions?
                    // For disabled joint frames, since disabled frames are seen as "units", there won't have a position listed in the available positions for the next position.
                    // So in this case, we look for the frame to delete ourselves: that is the next joint sibling if any, or nothing.
                    let foundDisabledJointFrameToDelete = false;
                    if(framesIdToDelete.length == 1  
                        && ((this.currentFrame.caretPosition == CaretPosition.body && (currentFrame.frameType.isJointFrame || currentFrame.frameType.allowJointChildren) && this.frameObjects[currentFrame.id].childrenIds.length == 0) 
                            || (this.currentFrame.caretPosition == CaretPosition.below && (this.frameObjects[currentFrame.parentId].frameType.isJointFrame || this.frameObjects[currentFrame.parentId].frameType.allowJointChildren)
                                && this.frameObjects[currentFrame.parentId].childrenIds.at(-1) == currentFrame.id))){
                        // Check if visually, after the current caret, there is disabled joint that we would delete.
                        const frameToLookJointIn = (this.currentFrame.caretPosition == CaretPosition.body) ? currentFrame : this.frameObjects[currentFrame.parentId];
                        if(frameToLookJointIn.frameType.allowJointChildren && frameToLookJointIn.jointFrameIds.length > 0 && this.frameObjects[frameToLookJointIn.jointFrameIds[0]].isDisabled){
                            foundDisabledJointFrameToDelete = true;
                            frameToDelete = {frameId: frameToLookJointIn.jointFrameIds[0], isSlotNavigationPosition: false};
                        }
                        else if(frameToLookJointIn.frameType.isJointFrame){
                            const indexOfThisJoint = this.frameObjects[frameToLookJointIn.jointParentId].jointFrameIds.indexOf(frameToLookJointIn.id);
                            if(indexOfThisJoint < this.frameObjects[frameToLookJointIn.jointParentId].jointFrameIds.length - 1 && this.frameObjects[this.frameObjects[frameToLookJointIn.jointParentId].jointFrameIds[indexOfThisJoint + 1]].isDisabled){
                                foundDisabledJointFrameToDelete = true;
                                frameToDelete = {frameId: this.frameObjects[frameToLookJointIn.jointParentId].jointFrameIds[indexOfThisJoint + 1], isSlotNavigationPosition: false};
                            }
                        }                                        
                    }

                    if(!foundDisabledJointFrameToDelete) {
                        const indexOfCurrentInAvailables = availablePositions.findIndex((e)=> e.frameId === currentFrame.id && e.caretPosition === this.currentFrame.caretPosition);
                        // the "next" position of the current
                        frameToDelete = availablePositions[indexOfCurrentInAvailables+1]??{id:-100, isSlotNavigationPosition: false};
                    }
                    // The only times to prevent deletion with 'delete' is when we are inside a body that has no children (except in Joint frames)
                    // or when the next position is a joint root's below OR a strict* block frame below (* = that cannot take joint frame, like a function definition, a class definition or "with")
                    if((framesIdToDelete.length==1 && this.frameObjects[framesIdToDelete[0]]?.frameType.allowChildren && !this.frameObjects[frameToDelete.frameId]?.frameType.isJointFrame 
                            && this.currentFrame.caretPosition == CaretPosition.body && this.frameObjects[framesIdToDelete[0]]?.childrenIds.length == 0)
                        || ((this.frameObjects[frameToDelete.frameId]?.frameType.allowJointChildren  || (this.frameObjects[frameToDelete.frameId]?.frameType.allowChildren && !this.frameObjects[frameToDelete.frameId]?.frameType.allowJointChildren))
                            && (frameToDelete.caretPosition??"") === CaretPosition.below)){
                        frameToDelete.frameId = -100;
                    }
                }
                else {
                    if (currentFrame.id > 0) {
                        if(this.currentFrame.caretPosition === CaretPosition.body ){
                            //we just make sure the frame to delete isn't a function definition frame:
                            //we can't delete a function def frame with backspace in its body (unless empty) because it will result
                            //in its content put directly into the function defs container. So we just alert the users.
                            if(currentFrame.childrenIds.length === 0 || currentFrame.frameType.type !== AllFrameTypesIdentifier.funcdef){
                                //just move the cursor one level up
                                this.changeCaretWithKeyboard(key);
                            }
                            else{
                                //just show the user a message and do nothing else
                                this.showMessage(MessageDefinitions.FunctionFrameCantDelete, 7000);
                
                                return;
                            }
                        }
                        else{
                            // If the frame is a joint frame and the cursor position is below, and we are backspacing,
                            // there's actually no need to change the cursor position, because we should still be below
                            // the joint frame's parent:
                            if (!currentFrame.frameType.isJointFrame || this.currentFrame.caretPosition != CaretPosition.below) {
                                const prevFramePos = availablePositions[availablePositions.findIndex((e) => e.frameId === currentFrame.id) - 1];
                                const newCurrent = (prevFramePos) ? {id: prevFramePos.frameId, caretPosition: prevFramePos.caretPosition} as CurrentFrame : this.currentFrame;
                                this.setCurrentFrame({id: newCurrent.id, caretPosition: newCurrent.caretPosition});
                            }
                            deleteChildren = true;
                        }
                        frameToDelete.frameId = currentFrame.id;
                    }
                }

                //Delete the frame if a frame to delete has been found
                if(frameToDelete.frameId > 0){
                    this.deleteFrame(
                        {
                            key:key,
                            frameToDeleteId: frameToDelete.frameId,  
                            deleteChildren: deleteChildren,
                        }
                    );
                }
            });
            
            //clear the selection of frames
            this.unselectAllFrames();

            // Check for errors in the code that might have changed based on this deletion
            // (except if we are wrapping frames, we don't need to check at this stage, it will be done later after the user's edition)
            if(!this.isWrappingFrame){
                checkCodeErrors();
            }

            //save state changes
            if(!ignoreBackState){
                this.saveStateChanges(stateBeforeChanges);
            }
            
            return true;
        },
        
        deleteFrameFromSlot(frameId: number){      
            // Before we delete the frame, we need to "invalidate" the key events: as this action (deleteFrameFromSlot) is triggered on a key down event, 
            // when the key (backspace) is released, the key up event is fired, but since the frame is deleted, 
            // the event is caught at the window level (and since we are no more in editing mode, the deletion method is called again). So we invalidate the 
            // key event momently so that this window key up event is ignored.
            // Furthermore, we make sure that the frame hasn't been already deleted: in case a long press, we don't want to have many deletion
            // triggered from "stacked" calls to this method
            if(this.frameObjects[frameId]){
                this.deleteFrames("Backspace");  
            }
        },

        deleteOuterFrames(frameId: number){
            // Delete the outer frame(s), the frameId argument only makes sense for deletion without multi-selection
            // We delete outer frame(s) by getting inside each body, and performing a standard "backspace" delete
           
            const stateBeforeChanges = cloneDeep(this.$state);

            // Prepare a list of ids for the frame to delete
            const framesToDelete: number[] = [];
            if(this.selectedFrames.length > 0){
                framesToDelete.push(...this.selectedFrames);
            }
            else{
                framesToDelete.push(frameId);
            }

            // Now perform the deletion for each top level frames to delete
            framesToDelete.forEach((topLevelFrameId) => {
                //first position the caret at the right place: within the top of that frame's body
                this.toggleCaret({id: topLevelFrameId, caretPosition: CaretPosition.body});

                //then send a delete command
                this.deleteFrames("Backspace", true);
            });

            //clear the selection of frames
            this.unselectAllFrames();
                                
            //save state changes
            this.saveStateChanges(stateBeforeChanges);
        },

        toggleCaret(newCurrent: CurrentFrame) {
            this.setCurrentFrame(newCurrent);
            
            this.unselectAllFrames();
        },

        async leftRightKey(payload: {key: string, isShiftKeyHold?: boolean, availablePositions?: NavigationPosition[]}) {
            //  used for moving index up (+1) or down (-1)
            const directionDown = payload.key === "ArrowRight" || payload.key === "Enter" || (payload.key === "Tab" && !payload.isShiftKeyHold);
            const directionDelta = (directionDown)?+1:-1;
            // if the available positions are not passed as argument, we compute them from the DOM
            const availablePositions = payload.availablePositions??getAvailableNavigationPositions();
            let currentFramePosition: number;

            if (this.isEditing){ 
                // Retrieve the slot that currently has focus in the current frame by looking up in the DOM
                const foundSlotCoreInfos = this.focusSlotCursorInfos?.slotInfos as SlotCoreInfos;
                currentFramePosition = availablePositions.findIndex((e) => e.isSlotNavigationPosition && e.frameId === this.currentFrame.id 
                        && e.labelSlotsIndex === foundSlotCoreInfos.labelSlotsIndex && e.slotId === foundSlotCoreInfos.slotId);
                
                if (currentFramePosition == 0 && directionDelta < 0) {
                    // Nowhere to go (start of project doc slot), stay here:
                    return;
                }
                
                // Now we can effectively ask the slot to "lose focus" because we could retrieve it (and we need to get it blurred so further actions are not happening in the span)
                document.getElementById(getLabelSlotUID(foundSlotCoreInfos))?.dispatchEvent(new CustomEvent(CustomEventTypes.editableSlotLostCaret));         
            }
            else {
                currentFramePosition = availablePositions.findIndex((e) => !e.isSlotNavigationPosition && e.caretPosition === this.currentFrame.caretPosition && e.frameId === this.currentFrame.id); 
                // When we are at a frame blue caret position, shift+left/right should behaves as if shift wasn't used
                if(payload.isShiftKeyHold) {
                    payload.isShiftKeyHold = false;
                }
            }
            
            // The next position depends whether we are selection text:
            // if not, we just get to the following/previous available position
            // if so, the next position is either the following/previous available position within *a same* structure.
            let nextPosition = (availablePositions[currentFramePosition+directionDelta]??availablePositions[currentFramePosition]);    
            let multiSlotSelNotChanging = false;   
            if(payload.isShiftKeyHold && payload.key != "Tab"){
                const currentSlotInfos = this.focusSlotCursorInfos?.slotInfos as SlotCoreInfos;
                const currentSlotInfosLevel = currentSlotInfos.slotId.split(",").length;
                const anchorParent = getSlotParentIdAndIndexSplit((this.anchorSlotCursorInfos?.slotInfos.slotId)??"").parentId;
                // To find what is the next position, we need to use the slot ids: as we can only get into an editable slot and in the same level (in the tree)
                // and in the same frame label, we find the slot that matches those criteria, if any.
                // Note that if we are currently in a string, and we have reached this method, then we are at a boundary of the string and we cannot continue a selection outside this string,
                // so the current selection won't change.
                // We traverse the list of available positions in the order of the selection's direction (i.e. backwards if selecting backwards)
                // otherwise we may match an item that matches the condition, but that isn't the closest slot we are willing to select (when doing backwards.)
                const positionsList = (directionDelta > 0) ? availablePositions : [...availablePositions].reverse();
                const nextSelectionPosition = (currentSlotInfos.slotType == SlotType.string) ? undefined : positionsList.find((navigPos, index) => {
                    const isDirectionCorrect = (directionDelta > 0) ? index > currentFramePosition : index > (positionsList.length - currentFramePosition - 1);
                    return isDirectionCorrect && navigPos.frameId == currentSlotInfos.frameId && navigPos.isSlotNavigationPosition && navigPos.slotType !== SlotType.string 
                        && anchorParent == getSlotParentIdAndIndexSplit(navigPos.slotId??"").parentId && navigPos.labelSlotsIndex == currentSlotInfos.labelSlotsIndex && (navigPos.slotId??"").split(",").length == currentSlotInfosLevel;
                });    

                if(nextSelectionPosition){
                    nextPosition = nextSelectionPosition;
                }
                else{
                    // There is no possible change to the multi selection (or there is nothing to select at all)
                    // so we keep everything in the same state
                    multiSlotSelNotChanging = true;
                    nextPosition = availablePositions[currentFramePosition];
                }
            }

            // irrespective to where we are going to, we need to make sure to hide current caret
            Vue.set(
                this.frameObjects[this.currentFrame.id],
                "caretVisibility",
                CaretPosition.none
            );

            // If next position is an editable slot
            if(nextPosition.isSlotNavigationPosition){
                this.isEditing = true;

                const nextSlotCoreInfos = {
                    frameId: nextPosition.frameId,
                    labelSlotsIndex: nextPosition.labelSlotsIndex as number,
                    slotId: nextPosition.slotId as string,
                    slotType: SlotType.code, // we can only focus a code slot
                };
                const nextSlot = retrieveSlotFromSlotInfos(nextSlotCoreInfos);
                nextSlotCoreInfos.slotType = evaluateSlotType(getSlotDefFromInfos(nextSlotCoreInfos), nextSlot);

                this.setEditableFocus(
                    {
                        ...nextSlotCoreInfos,
                        focused: true,
                    }
                );
                
                // Restore the text cursor, the anchor is the same as the focus if we are not selecting text
                // (as the slot may have not yet be renderered in the UI, for example when adding a new frame, we do it later)
                // If we are reaching a comment frame, coming from the blue caret underneath, we neeed to check if there is a terminating line return:
                // if that's the case, we do not get just after it, but before it; see LabelSlot.vue onEnterOrTabKeyUp() for why.
                Vue.nextTick(() => {
                    let textCursorPos = (directionDelta == 1) ? 0 : (document.getElementById(getLabelSlotUID(nextSlotCoreInfos))?.textContent?.replace(/\u200B/, "")?.length)??0;
                    const isCommentFrame = this.frameObjects[nextSlotCoreInfos.frameId as number].frameType.type == AllFrameTypesIdentifier.comment;
                    if(isCommentFrame && (document.getElementById(getLabelSlotUID(nextSlotCoreInfos))?.textContent??"").endsWith("\n") && directionDelta == -1){
                        textCursorPos--;
                    }
                  
                    const anchorCursorInfos = (payload.isShiftKeyHold && payload.key != "Tab") ? this.anchorSlotCursorInfos : {slotInfos: nextSlotCoreInfos, cursorPos: textCursorPos};
                    const focusCursorInfos = (multiSlotSelNotChanging) ? this.focusSlotCursorInfos : {slotInfos: nextSlotCoreInfos, cursorPos: textCursorPos}; 
                    this.setSlotTextCursors(anchorCursorInfos, focusCursorInfos);
                    setDocumentSelection(anchorCursorInfos as SlotCursorInfos, focusCursorInfos as SlotCursorInfos);
                    if(focusCursorInfos){
                        document.getElementById(getLabelSlotUID(focusCursorInfos.slotInfos))?.dispatchEvent(new Event(CustomEventTypes.editableSlotGotCaret));
                    }
                });
                
                // As we may have moved from a blue caret position, we make sure that we are always setting the caret position to the next available caret position possible.
                // (which should be "below" for a statement frame, and "body" for a block frame)
                this.currentFrame.caretPosition = (this.frameObjects[nextPosition.frameId].frameType.allowChildren) ? CaretPosition.body : CaretPosition.below;
            }
            else{
                // else we set editFlag to false as we are moving to a caret position
                this.isEditing = false;
                Vue.set(
                    this.frameObjects[nextPosition.frameId],
                    "caretVisibility",
                    nextPosition.caretPosition
                );

                this.setSlotTextCursors(undefined, undefined);
       
                // The new caret
                this.currentFrame.caretPosition = nextPosition.caretPosition as CaretPosition;

                // Only frame containers (sections) are collapsable, so we don't need to check if a destination frame itself is collapsed,
                // but we do need to check if the target container is - and expand it if needed.
                const containerId = getFrameSectionIdFromFrameId(nextPosition.frameId);
                this.frameObjects[containerId].collapsedState = CollapsedState.FULLY_VISIBLE;
                
                // And since we just left a frame, we check errors
                checkCodeErrors();             
            }

            //In any case change the current frame
            this.currentFrame.id = nextPosition.frameId;
        },

        async generateStateJSONStrWithCheckpoint(compress?: boolean) {
            /** This function was defined as a getter before, check details as to why it needs to be an action:
             *  the goal of this function is to make a "copy" of the state in a JSON format, with a few extra bits like the checkpoint.
                However, if defined as a getter, the state object we get in a getter is not exactly "just" the state object as we write it: 
                pinia adds a few extra bits that are used internally. So things like checksum later don't work well later when we need to use it.
                To avoid that situation, we should move the function in the actions, because in there, the access to the state object is really 
                "just" the state object as we defined it in the store. No extra bit are addede there by pinia.
             */
            const stateCopy = JSON.parse(JSON.stringify(this.$state));
            //clear the microbit DAP infos, copy frames, message banner and undo/redo related stuff as there is no need for storing them
            stateCopy["stateBeforeChanges"] = {};
            stateCopy["copiedFrames"] = {};
            stateCopy.copiedFrameId = -100;
            stateCopy.copiedSelectionFrameIds = [];
            stateCopy["DAPWrapper"] = {};
            stateCopy["previousDAPWrapper"] = {};
            stateCopy["currentMessage"] = MessageDefinitions.NoMessage;
            stateCopy["pythonExecRunningState"] = PythonExecRunningState.NotRunning;
            
            //simplify the storage of frame types by their type names only
            Object.keys(stateCopy["frameObjects"] as EditorFrameObjects).forEach((frameId) => {
                stateCopy["frameObjects"][frameId].frameType = stateCopy["frameObjects"][frameId].frameType.type;
            });

            const checksum = await getSHA1HashForObject(stateCopy);
            //add the checksum and other backup flags in the state object to be saved
            stateCopy["checksum"] = checksum;
            stateCopy["version"] = AppVersion;
            stateCopy["platform"] = AppPlatform;
            
            // finally, we save a compressed version of this JSON state if required (on auto-backup state saving)
            if(!compress){
                return JSON.stringify(stateCopy);
            }
            else{
                return LZString.compress(JSON.stringify(stateCopy));
            }  
        },
        
        setStateFromJSONStr(payload: {stateJSONStr: string; errorReason?: string, showMessage?: boolean, readCompressed?: boolean}): Promise<void>{
            return new Promise((resolve, reject) => {
                let isStateJSONStrValid = (payload.errorReason === undefined);
                let errorDetailMessage = payload.errorReason ?? "unknown reason";
                let isVersionCorrect = false;
                let newStateObj = {} as {[id: string]: any};

                // If there is an error set because the file couldn't be retrieved
                // we don't check anything, just get to the error display.
                if(isStateJSONStrValid){
                    // If the string we read was compressed, we need to uncompress it first
                    if(payload.readCompressed){
                        this.setStateFromJSONStr({stateJSONStr: LZString.decompress(payload.stateJSONStr) as string, showMessage: payload.showMessage})
                            .then(resolve).catch(reject);
                        return;
                    }

                    const doFinaliseCheckup = () => {                        
                        // Apply the change and indicate it to the user if we detected a valid JSON string
                        // or alert the user we couldn't if we detected a faulty JSON string to represent the state
                        if(isStateJSONStrValid){  
                            const newStateStr = JSON.stringify(newStateObj);     
                            if(!isVersionCorrect) {
                                // If the version isn't correct, we ask confirmation to the user before continuing 
                                // for ease of coding, we register a "one time" event listener on the modal
                                const execSetStateFunction = (event: BvModalEvent, dlgId: string) => {
                                    if((event.trigger == "ok" || event.trigger=="event") && dlgId == getImportDiffVersionModalDlgId()){
                                        this.doSetStateFromJSONStr(newStateStr).then(() => {
                                            vm.$root.$off("bv::modal::hide", execSetStateFunction); 
                                            resolve();          
                                        });                          
                                    }
                                    else{
                                        isStateJSONStrValid = false;
                                        reject(errorDetailMessage);
                                    }
                                };
                                vm.$root.$on("bv::modal::hide", execSetStateFunction); 
                                vm.$root.$emit("bv::show::modal", getImportDiffVersionModalDlgId());
                            //
                            }
                            else{
                                this.doSetStateFromJSONStr(newStateStr).then(() => resolve());
                            }                
                        }
                        else{
                            if(payload.showMessage??true){
                                const message = cloneDeep(MessageDefinitions.UploadEditorFileError);
                                const msgObj: FormattedMessage = (message.message as FormattedMessage);
                                msgObj.args[FormattedMessageArgKeyValuePlaceholders.error.key] = msgObj.args.errorMsg.replace(FormattedMessageArgKeyValuePlaceholders.error.placeholderName, errorDetailMessage);
                                this.showMessage(message, null);
                            }
                            reject(errorDetailMessage);
                        }
                    };

                    // We need to check the JSON string is:
                    // 1) a valid JSON description of an object --> easy, we can just try to convert
                    // 2) an object that matches the state (checksum checker)
                    // 3) contains frame type names that are valid, and if so, replace the type names by the equivalent JS object (we replace the objects by the type name string to save space)
                    // 4) if the project predates having project documentation, we add this frame in.
                    // 5) if the object is valid, we just verify the version is correct (and attempt loading) + for newer versions (> 1) make sure the target Strype "platform" is the same as the source's
                    try {
                        //Check 1)
                        newStateObj = JSON.parse(payload.stateJSONStr);
                        if(!newStateObj || typeof(newStateObj) !== "object" || Array.isArray(newStateObj)){
                            //no need to go further
                            isStateJSONStrValid=false;
                            errorDetailMessage = i18n.t("errorMessage.dataNotObject") as string;
                            doFinaliseCheckup();
                        }
                        else{
                            // Check 2) as 1) is validated
                            return checkStateDataIntegrity(newStateObj)
                                .then((isIntegral) => {
                                    if(!isIntegral) {
                                        isStateJSONStrValid = false;
                                        errorDetailMessage = i18n.t("errorMessage.stateDataIntegrity") as string;
                                    } 
                                    else {
                                        // Check 3) as 2) is validated
                                        isVersionCorrect = (newStateObj["version"] == AppVersion);
                                        if(Number.parseInt(newStateObj["version"]) > 1 && newStateObj["platform"] != AppPlatform) {
                                            isStateJSONStrValid = false;
                                            errorDetailMessage = i18n.t("errorMessage.stateWrongPlatform") as string;
                                        }
                                        else{
                                            // Check 4) and 5) as 3) is validated
                                            // If missing project doc frame, copy it in from the empty state and add it as first root child:
                                            if (!newStateObj["frameObjects"][projectDocumentationFrameId]) {
                                                newStateObj["frameObjects"][projectDocumentationFrameId] = cloneDeep(emptyState[projectDocumentationFrameId]);
                                                newStateObj["frameObjects"]["0"]["childrenIds"].unshift(projectDocumentationFrameId);
                                            }
                                            
                                            if(!restoreSavedStateFrameTypes(newStateObj)){
                                                // There was something wrong with the type name (it should not happen, but better check anyway)
                                                isStateJSONStrValid = false;
                                                errorDetailMessage = i18n.t("errorMessage.stateWrongFrameTypeName") as string;
                                            }
                                        }
                                        delete newStateObj["version"];
                                        delete newStateObj["platform"];
                                    }  
                                })
                                .finally(doFinaliseCheckup);                                   
                        }
                    }
                    catch(err){
                        // We cannot use the string arguemnt to retrieve a valid state --> inform the users
                        isStateJSONStrValid = false;
                        errorDetailMessage = i18n.t("errorMessage.wrongDataFormat") as string;
                        doFinaliseCheckup();
                    }
                }            
            });
        },
        setDividerStates(newEditorCommandsSplitterPane2Size: StrypeLayoutDividerSettings | undefined, newPEALayout: StrypePEALayoutMode, newPEACommandsSplitterPane2Size: StrypeLayoutDividerSettings | undefined, newPEASplitViewSplitterPane1Size: StrypeLayoutDividerSettings | undefined, newPEAExpandedSplitterPane2Size: StrypeLayoutDividerSettings | undefined, resolve: (value: (PromiseLike<void> | void)) => void, forceSetUndefined?: boolean) {
            setTimeout(() => {
                let chainedTimeOuts = 400;
                // Now we can restore the backuped properties of the new state related to the layout.
                // If any of the properties for layout changes was updated, the PEA 4:3 ratio isn't any longer meaningful.
                if (forceSetUndefined || (newEditorCommandsSplitterPane2Size != undefined && newEditorCommandsSplitterPane2Size[newPEALayout ?? StrypePEALayoutMode.tabsCollapsed] != undefined)) {
                    this.editorCommandsSplitterPane2Size = newEditorCommandsSplitterPane2Size;
                    // If this splitter was changed, the PEA needs to be resized once the splitter has updated
                    setTimeout(() => {
                        if (this.editorCommandsSplitterPane2Size != undefined && this.editorCommandsSplitterPane2Size[newPEALayout ?? StrypePEALayoutMode.tabsCollapsed] != undefined) {
                            (vm.$children[0] as InstanceType<typeof AppComponent>).onStrypeCommandsSplitPaneResize({1: {size: this.editorCommandsSplitterPane2Size[newPEALayout ?? StrypePEALayoutMode.tabsCollapsed]}}, newPEALayout);
                        }
                    }, chainedTimeOuts);
                }
                if (this.peaLayoutMode != newPEALayout) {
                    setTimeout(() => {
                        this.peaLayoutMode = newPEALayout;
                        /* IFTRUE_isPython */
                        ((vm.$children[0].$refs[getStrypeCommandComponentRefId()] as InstanceType<typeof CommandsComponent>).$refs[getPEAComponentRefId()] as InstanceType<typeof PEAComponent>).togglePEALayout(newPEALayout);
                        /* FITRUE_isPython */
                    }, chainedTimeOuts += 200);
                }

                if (forceSetUndefined || newPEACommandsSplitterPane2Size) {
                    this.peaCommandsSplitterPane2Size = newPEACommandsSplitterPane2Size;
                    // If this splitter was changed, the PEA needs to be resized once the splitter has updated
                    if (forceSetUndefined || (newPEACommandsSplitterPane2Size && newPEACommandsSplitterPane2Size[newPEALayout] != undefined)) {
                        setTimeout(() => {
                            if (this.peaCommandsSplitterPane2Size && this.peaCommandsSplitterPane2Size[newPEALayout] != undefined) {
                                (vm.$children[0].$refs[getStrypeCommandComponentRefId()] as InstanceType<typeof CommandsComponent>).onCommandsSplitterResize({1: {size: this.peaCommandsSplitterPane2Size[newPEALayout]}});
                            }
                        }, (chainedTimeOuts += 200));
                    }
                }

                if (forceSetUndefined || (newPEASplitViewSplitterPane1Size != undefined && newPEALayout != undefined && newPEASplitViewSplitterPane1Size[newPEALayout] != undefined)) {
                    this.peaSplitViewSplitterPane1Size = newPEASplitViewSplitterPane1Size;
                }

                if (forceSetUndefined || newPEAExpandedSplitterPane2Size != undefined) {
                    this.peaExpandedSplitterPane2Size = newPEAExpandedSplitterPane2Size;
                    // If this splitter was changed, the PEA needs to be resized once the splitter has updated

                    if (forceSetUndefined || (newPEAExpandedSplitterPane2Size != undefined && newPEAExpandedSplitterPane2Size[newPEALayout] != undefined)) {
                        setTimeout(() => {
                            if (this.peaExpandedSplitterPane2Size != undefined && this.peaExpandedSplitterPane2Size[newPEALayout] != undefined) {
                                (vm.$children[0] as InstanceType<typeof AppComponent>).onExpandedPythonExecAreaSplitPaneResize({1: {size: this.peaExpandedSplitterPane2Size[newPEALayout]}});
                            }
                        }, (chainedTimeOuts += 200));
                    }
                }

                // We can resolve the promise when all the changes for the UI have been done
                setTimeout(() => {
                    resolve();
                }, chainedTimeOuts + 100);
            }, 1000);
        }, doSetStateFromJSONStr(stateJSONStr: string): Promise<void>{
            return new Promise((resolve) => {
                /* IFTRUE_isPython */
                // We check about turtle being imported as at loading a state we should reflect if turtle was added in that state.
                actOnTurtleImport();

                // Clear the Python Execution Area as it could have be run before.
                ((vm.$children[0].$refs[getStrypeCommandComponentRefId()] as Vue).$refs[getPEAComponentRefId()] as InstanceType<typeof PEAComponent>).clear(); 
                
                // With the PEA, the styling of the overall UI layout is quite complex as some things depend on the "natural"
                // default state of the layout, and we handle some styling manually. To make things clearer, we always reset 
                // back to the default layout before any layout changes need to be done. Like that we handle both the case of 
                // when some information related to the layout are not saved, and the case of being sure we start from a sound base.
                // So we first need to strip out the new state's information and keep a back up so we can use them later.
                // (note: for microbit, the styling is far less complicated so we don't do anything on its only layout prop,
                // editorCommandsSplitterPane2Size)
                const newState = JSON.parse(stateJSONStr) as typeof this.$state;
                const newEditorCommandsSplitterPane2Size = newState.editorCommandsSplitterPane2Size;
                delete newState.editorCommandsSplitterPane2Size;          
                const newPEALayout = newState.peaLayoutMode;
                delete newState.peaLayoutMode;
                const newPEACommandsSplitterPane2Size = newState.peaCommandsSplitterPane2Size;
                delete newState.peaCommandsSplitterPane2Size; // will be updated manually 
                const newPEAExpandedSplitterPane2Size = newState.peaExpandedSplitterPane2Size;
                delete newState.peaExpandedSplitterPane2Size;
                const newPEASplitViewSplitterPane1Size = newState.peaSplitViewSplitterPane1Size;
                delete newState.peaSplitViewSplitterPane1Size;  
                const commandsComponent = (vm.$children[0].$refs[getStrypeCommandComponentRefId()] as InstanceType<typeof CommandsComponent>);

                commandsComponent.resetPEACommmandsSplitterDefaultState().then(() => {
                    this.updateState(JSON.parse(JSON.stringify(newState)));
                    // Wait a bit after we have reset everything for the UI to get ready, then affect backed up changes
                    this.setDividerStates(newEditorCommandsSplitterPane2Size, newPEALayout ?? StrypePEALayoutMode.tabsCollapsed, newPEACommandsSplitterPane2Size, newPEASplitViewSplitterPane1Size, newPEAExpandedSplitterPane2Size, resolve, true);
                });
                /* FITRUE_isPython */
                /* IFTRUE_isMicrobit */
                this.updateState(JSON.parse(stateJSONStr));
                resolve();
                /* FITRUE_isMicrobit */
            });
        },

        // This method can be used to copy a frame to a position.
        // This can be a paste event or a duplicate event.
        copyFrameToPosition(payload: {frameId?: number; newParentId: number; newIndex: number}, ignoreStateBackup?: boolean) {
            const stateBeforeChanges = cloneDeep(this.$state);
            
            const isPasteOperation: boolean = (payload.frameId === undefined);
            payload.frameId = payload.frameId ?? this.copiedFrameId;

            // If it is not a paste operation, it is a duplication of the frame.
            // The nextAvailableId should be right, but for sanity check, we make sure the id is indeed available to avoid potential issues.
            let nextAvailableId = this.nextAvailableId;
            while(this.frameObjects[nextAvailableId] != undefined){
                nextAvailableId+=1;
            }
            const sourceFrameList: EditorFrameObjects = (isPasteOperation) ? this.copiedFrames : this.frameObjects;            
            const copiedFrames: EditorFrameObjects = {};
            cloneFrameAndChildren(sourceFrameList, payload.frameId, payload.newParentId, {id: nextAvailableId}, copiedFrames); 


            // Add the copied objects to the FrameObjects
            Object.keys(copiedFrames).map(Number).forEach((id: number)=> {
                Vue.set(
                    this.frameObjects,
                    id,
                    copiedFrames[id]
                );
            });
            
            const topFrame = copiedFrames[Object.keys(copiedFrames).map(Number)[0]];

            // It will be added either as a Child or as a JointChild
            const isJointFrame = sourceFrameList[payload.frameId].frameType.isJointFrame;
            const childrenListToBeAdded = (isJointFrame) ? this.frameObjects[payload.newParentId].jointFrameIds : this.frameObjects[payload.newParentId].childrenIds;

            // Add the top frame to the its new parents children list
            childrenListToBeAdded.splice(
                payload.newIndex,
                0,
                topFrame.id
            );

            // Move the cursor at the end of the pasted elements.
            // If we have pasted/duplicated a joint frame (like "elif"), the caret moves inside that joint frame, at the end of the last child, or in its body if no child exist,
            //  UNLESS that frame is disabled: then we need to find out which next sibling is enabled.
            // In other cases, we go past the last top level frame.
            const newCaretPos = cloneDeep(this.currentFrame); // starting point, just to get TS typing fine.
            if(copiedFrames[nextAvailableId].frameType.isJointFrame){
                // We cannot copy more than 1 joint frame, so there is only 1 frame to check
                const thisJointFrame = copiedFrames[nextAvailableId];
                if(thisJointFrame.isDisabled){
                    const thisJointFrameIndex = this.frameObjects[thisJointFrame.jointParentId].jointFrameIds.indexOf(thisJointFrame.id);
                    const nextJointEnabledSiblingId = (this.frameObjects[thisJointFrame.jointParentId].jointFrameIds.find((jointFrameId, index) => (index > thisJointFrameIndex && !this.frameObjects[jointFrameId].isDisabled)))??-1;
                    newCaretPos.id = (nextJointEnabledSiblingId > -1) ? nextJointEnabledSiblingId : thisJointFrame.jointParentId;
                    newCaretPos.caretPosition = (nextJointEnabledSiblingId > -1) ? CaretPosition.body : CaretPosition.below;
                }
                else{
                    const thisJointFrameLastChildId = this.frameObjects[thisJointFrame.id].childrenIds.at(-1)??-1;
                    newCaretPos.id = (thisJointFrameLastChildId > -1) ? thisJointFrameLastChildId : thisJointFrame.id;
                    newCaretPos.caretPosition = (thisJointFrameLastChildId > -1) ? CaretPosition.below : CaretPosition.body;
                }
            }
            else{
                // We need to retrieve the last top level frame that was copied.
                // We get it by screening all the copied frames: if one has a parent ID equals to the parent location of where we duplicate/paste the frames
                // it means it's a top level frame. We filter the copied frames and keep the last one of the list.
                newCaretPos.id = (Object.values(copiedFrames).filter((frameObj: FrameObject) => frameObj.parentId == payload.newParentId).map((frameObj: FrameObject) =>  frameObj.id).at(-1) as number);
                newCaretPos.caretPosition = CaretPosition.below;
            }            
            this.setCurrentFrame(newCaretPos);

            this.updateNextAvailableId();

            //save state changes
            if(!ignoreStateBackup){
                this.saveStateChanges(stateBeforeChanges);
            }
        
            this.unselectAllFrames();
        },

        // This method can be used to copy the selected frames to a position.
        // This can be a paste event or a duplicate event.
        copySelectedFramesToPosition(payload: {newParentId: number; newIndex?: number}, ignoreStateBackup?: boolean) {
            const stateBeforeChanges = cloneDeep(this.$state);
            // -100 is chosen so that TS won't complain for non-initialised variable
            let newIndex = payload.newIndex??-100;
            const areWeDuplicating = newIndex === -100;

            // If newIndex does not exist, we are talking about a duplication
            if(areWeDuplicating){
                // In that case, the duplicated selection goes below the last selected item
                newIndex = this.getIndexInParent(this.selectedFrames[this.selectedFrames.length-1])+1;
            }

            // We generate the list of frames from the selectedFrames ids
            const sourceFrameList: EditorFrameObjects = (areWeDuplicating) ? this.frameObjects : this.copiedFrames;
            const sourceFrameIds: number[] = (areWeDuplicating) ? this.selectedFrames : this.copiedSelectionFrameIds;

            const copiedFrames: EditorFrameObjects = {};

            // All the top level cloned frames need to be stored in order to then added to their new parent's list
            // The nextAvailableId should be right, but for sanity check, we make sure the id is indeed available to avoid potential issues.
            const topLevelCopiedFrames: number[] = [];
            let nextAvailableId = this.nextAvailableId;
            while(this.frameObjects[nextAvailableId] != undefined){
                nextAvailableId+=1;
            }

            Object.values(sourceFrameIds).forEach( (frame) => {
                //For each top level frame (i.e. each one on the selected list) we record its new id
                topLevelCopiedFrames.push(nextAvailableId);
                cloneFrameAndChildren(sourceFrameList, frame, payload.newParentId, {id: nextAvailableId}, copiedFrames); 
                // Find the largest id form the copied and increase it by 1
                nextAvailableId = Math.max.apply({},(Object.keys(copiedFrames).concat(Object.keys(copiedFrames))).map(Number)) + 1;
            });

            
            // Add the copied objects to the FrameObjects
            Object.keys(copiedFrames).map(Number).forEach((id: number)=> {
                Vue.set(
                    this.frameObjects,
                    id,
                    copiedFrames[id]
                );
            });
            this.updateNextAvailableId();            

            // It will be added either as a Child or as a JointChild
            const areSelectedJointFrames = sourceFrameList[sourceFrameIds[0]].frameType.isJointFrame;
            const childrenListToBeAdded = (areSelectedJointFrames) ? this.frameObjects[payload.newParentId].jointFrameIds : this.frameObjects[payload.newParentId].childrenIds;

            // Add each one of the copied frames in their new parent's list
            topLevelCopiedFrames.forEach( (id) => {
                childrenListToBeAdded.splice(
                    newIndex++,
                    0,
                    id
                );
            });

            //Make the top new frame the current frame
            this.setCurrentFrame(
                { 
                    id: topLevelCopiedFrames[topLevelCopiedFrames.length-1],
                    caretPosition: CaretPosition.below,
                }
            );

            this.updateNextAvailableId();

            //save state changes unless requested not to
            if(!ignoreStateBackup) {
                this.saveStateChanges(stateBeforeChanges);
            }
        
            this.unselectAllFrames();
        },

        pasteFrame(payload: {clickedFrameId: number; caretPosition: CaretPosition, ignoreStateBackup?: boolean}) {
            // If the copiedFrame has a JointParent, we're talking about a JointFrame
            const isCopiedJointFrame = this.copiedFrames[this.copiedFrameId].frameType.isJointFrame;

            // Are we pasting into a joint frame: that depends what we copied. If we copied a joint frame
            // then we need to check if we are in a joint frame body (because of previous checks, we know we'd be at the end of that body).
            // If we copied something else then we just check the location we want to paste to.
            const isClickedJointFrame = (isCopiedJointFrame && payload.caretPosition === CaretPosition.below) 
                || this.frameObjects[payload.clickedFrameId].frameType.isJointFrame;

            // When pasting a joint frame, the clicked frame might not be the right one to use: if we are pasting in below a joint frame's child
            // then we are actually wanting to paste after that child's parent (the joint frame after which we want to paste)
            const jointFrameAsClickedId = (payload.caretPosition == CaretPosition.below) 
                ? this.frameObjects[payload.clickedFrameId].parentId
                : payload.clickedFrameId;

            // Clicked is joint ? parent of clicked(*) is its joint parent ELSE clicked is the real parent
            // (*) unless we wanted to paste into the root of this joint structure, then the parent is joint we clicked into
            const clickedParentId = (isClickedJointFrame) 
                ? ((this.frameObjects[jointFrameAsClickedId].jointParentId > 0) ? this.frameObjects[jointFrameAsClickedId].jointParentId : jointFrameAsClickedId)
                : this.frameObjects[payload.clickedFrameId].parentId;

            // Flag indicating if we are either in a normal body not in a context of joint frames or in a the root parent in a context of joint frames
            const inBodyContext = (payload.caretPosition === CaretPosition.body && (!isCopiedJointFrame || (isCopiedJointFrame && !isClickedJointFrame)));

            // Index is 0 if we paste in the body and we are not dealing with a joint frame (i.e. pasting in the empty body of a joint frame)
            // or we are dealing with a joint frame and the frame we paste in is not a joint frame (i.e. it's the root parent)
            const index = (inBodyContext || (isClickedJointFrame && !this.frameObjects[jointFrameAsClickedId].frameType.isJointFrame))
                ? 0 
                : this.getIndexInParent((isCopiedJointFrame) ? jointFrameAsClickedId : payload.clickedFrameId)+1;

            // If the caret is below and it is not a joint frame, or caret is body and we deal with a joint frame(*), parent is the clicked's parent
            // (*) only if we are copying in another joint frame: if we are copying in the root then the parent is the root itself
            const pasteToParentId = inBodyContext
                ? ((isClickedJointFrame) ? jointFrameAsClickedId : payload.clickedFrameId)
                : clickedParentId;

            // frameId is omitted from the action call, so that the method knows we talk about the copied frame!
            this.copyFrameToPosition(
                {
                    newParentId: pasteToParentId,
                    newIndex: index,
                },
                payload.ignoreStateBackup
            );
        },

        pasteSelection(payload: {clickedFrameId: number; caretPosition: CaretPosition, ignoreStateBackup?: boolean}) {
            // If the copiedFrame has a JointParent, we're talking about a JointFrame
            const areCopiedJointFrames = this.copiedFrames[this.copiedSelectionFrameIds[0]].frameType.isJointFrame;
            
            let index;
            let pasteToParentId;
            if (areCopiedJointFrames) {
                let targetId;
                if (payload.caretPosition == CaretPosition.below) {
                    targetId = this.frameObjects[payload.clickedFrameId].parentId;
                    index = this.getIndexInParent(payload.clickedFrameId) + 1;
                }
                else {
                    targetId = payload.clickedFrameId;
                    index = 0;
                }

                // For joint frames, there's two possible positions that are valid for pasting:
                // - We are inside the body of the main parent frame (e.g. if, try).  For this, isJointFrame==false but allowJointChildren==true 
                // - We are inside the body of one of the joined frames (e.g. else, finally).  For this, isJointFrame==true
                const isClickedJointFrame = this.frameObjects[targetId].frameType.isJointFrame;
                const isClickedJointParent = this.frameObjects[targetId].frameType.allowJointChildren;
                
                // If we are a joint parent, we paste with us as parent.  If we are a joint child, we paste using our parent
                if (isClickedJointFrame) {
                    pasteToParentId = this.frameObjects[targetId].jointParentId;
                }
                else if (isClickedJointParent) {
                    pasteToParentId = this.frameObjects[targetId].id;
                }
                else {
                    // Invalid position to paste a joint frame
                    return;
                }
            }
            else {
                pasteToParentId = (payload.caretPosition === CaretPosition.body) ?
                    payload.clickedFrameId :
                    this.frameObjects[payload.clickedFrameId].parentId;
                index = (payload.caretPosition === CaretPosition.body) ?
                    0 :
                    this.getIndexInParent(payload.clickedFrameId) + 1;
            }
            // frameId is omitted from the action call, so that the method knows we talk about the copied frame!
            this.copySelectedFramesToPosition(
                {
                    newParentId: pasteToParentId,
                    newIndex: index,
                },
                payload.ignoreStateBackup            
            );
        },

        copyFrame(frameId: number) {
            // We do not use the system's clipboard for frames, so we clear any potential text to avoid interference
            navigator.clipboard.writeText("");
            this.flushCopiedFrames();
            this.doCopyFrame(frameId);
            this.updateNextAvailableId();
        },

        copySelection() {
            if (this.selectedFrames.length == 0) {
                return;
            }
            // We do not use the system's clipboard for frames, so we clear any potential text to avoid interference
            navigator.clipboard.writeText("");
            this.flushCopiedFrames();
            this.doCopySelection();
            this.updateNextAvailableId();
        },

        changeDisableFrame(payload: {frameId: number; isDisabling: boolean}) {
            const stateBeforeChanges = cloneDeep(this.$state);

            this.doChangeDisableFrame(payload);
            
            //save state changes
            this.saveStateChanges(stateBeforeChanges);
        
            this.unselectAllFrames();
        },

        changeDisableSelection(isDisabling: boolean) {
            const stateBeforeChanges = cloneDeep(this.$state);
            
            this.selectedFrames.forEach( (id) => {
                // Can't change frozen frames or children of frozen frames or comments or blanks:
                if (this.frameObjects[id].frozenState != FrozenState.FROZEN &&
                    this.frameObjects[this.frameObjects[id].parentId].frozenState != FrozenState.FROZEN &&
                    // And can't disable blanks (can enable, in case of old projects where this was allowed):
                    (!isDisabling || this.frameObjects[id].frameType.type != AllFrameTypesIdentifier.blank)) {
                    this.doChangeDisableFrame(
                        {
                            frameId: id,
                            isDisabling: isDisabling,
                        }
                    );
                }
            });
            
            //save state changes
            this.saveStateChanges(stateBeforeChanges);
        
            this.unselectAllFrames();
        },

        selectMultipleFrames(key: string) {
            const directionUp = key==="ArrowUp";
            const delta = directionUp? -1 : +1;
            const currentFrame = this.frameObjects[this.currentFrame.id];

            // we filter the payload to remove the slot positions
            let availablePositions:NavigationPosition[]  = getAvailableNavigationPositions();
            availablePositions = availablePositions.filter((e) => !e.isSlotNavigationPosition);
            
            let siblingsOrChildren: number[] = [];
            let index = 0;
            
            if(this.currentFrame.caretPosition === CaretPosition.below) {
                siblingsOrChildren = this.frameObjects[currentFrame.parentId].childrenIds;
                index = siblingsOrChildren.indexOf(currentFrame.id) + (directionUp?+1:0);
            }
            else {
                siblingsOrChildren = currentFrame.childrenIds;
                // we need to get -1 if we are not going up, so that we can select the frame we are above
                // i.e. if we are above the first child frame, we need index of current to be -1 so that when
                // adding the delta (+1) to get
                index += (!directionUp)?-1:0;
            }

            // the frame to be selected is the next towards the direction
            const frameIdToBeSelected = siblingsOrChildren[index+delta]??-100;

            // We cannot select something, so we return
            if(frameIdToBeSelected===-100){
                return; 
            }

            const availablePositionsOfSiblings: NavigationPosition[] = [];
            availablePositions.forEach((element) => {
                // we need to keep the elements which correspond to the siblingsOrChildren list
                if(!element.isSlotNavigationPosition){
                    // we only include belows
                    if(siblingsOrChildren.includes(element.frameId) &&  element.caretPosition === CaretPosition.below) {
                    // going down, we cannot select a body position
                        availablePositionsOfSiblings.push(element);
                    }
                    // except when going upwards we may need the our parent's body to be added
                    else if(directionUp && currentFrame.parentId === element.frameId && element.caretPosition == CaretPosition.body){
                        availablePositionsOfSiblings.push(element);
                    }
                }
            });
            
            // In the new list with the available positions that we could go to, we first find the index of the current
            const indexOfCurrent = availablePositionsOfSiblings.findIndex((e) => e.frameId === this.currentFrame.id && e.caretPosition === this.currentFrame.caretPosition);
            // and then we find the new current
            // NOTE here that the one to be selected and the new current can be different. i.e. I am below the first child of an if and going up
            // the one to be selected is the one I am bellow, and the current is the body of the if! (i.e. the parent)
            const newCurrent = availablePositionsOfSiblings[indexOfCurrent+delta];
          
            this.selectDeselectFrame({frameId: frameIdToBeSelected, direction: key.replace("Arrow","").toLowerCase()}); 
            this.setCurrentFrame({id:newCurrent.frameId, caretPosition: newCurrent.caretPosition} as CurrentFrame);
        },

        shiftClickSelection(payload: {clickedFrameId: number; clickedCaretPosition: CaretPosition}) {
            // Remove current selection
            this.unselectAllFrames();

            const availablePositions = getAvailableNavigationPositions();
            const listOfCaretPositions = availablePositions.filter(((e)=> !e.isSlotNavigationPosition));

            const indexOfCurrent: number = listOfCaretPositions.findIndex((item)=> item.frameId === this.currentFrame.id && item.caretPosition === this.currentFrame.caretPosition);
            const indexOfTarget: number = listOfCaretPositions.findIndex((item)=> item.frameId === payload.clickedFrameId && item.caretPosition === payload.clickedCaretPosition);

            // is the targetFrame bellow or above the origin frame
            const direction = (indexOfCurrent < indexOfTarget)?"ArrowDown" : "ArrowUp" ;

            const stopId = (direction==="ArrowUp")
                ? listOfCaretPositions[indexOfTarget+1].frameId // going up we always stop on the next of the clicked
                : payload.clickedCaretPosition === CaretPosition.below 
                    ? payload.clickedFrameId // if we go down and click bellow, we go on the clicked
                    : listOfCaretPositions[indexOfTarget-1].frameId; // down and click body, we go to the previous of clicked


            let previousFramesSelection: number[] = [];

            // Instead of writing a selection function from scratch
            do {
                previousFramesSelection = [...this.selectedFrames];
                this.selectMultipleFrames(direction);
            } while (previousFramesSelection.length !== this.selectedFrames.length && !this.selectedFrames.includes(stopId));
        },
        
        // Forces this frame and all its ancestors to be FULLY_VISIBLE, even if they are frozen
        forceExpand(frameId: number) {
            if (frameId != 0 && frameId in this.frameObjects) {
                this.frameObjects[frameId].collapsedState = CollapsedState.FULLY_VISIBLE;
                this.forceExpand(this.frameObjects[frameId].parentId);
            }
        },
    },
});

export const settingsStore = defineStore("settings", {
    state: () => {
        return {
            // The local in this store settings is to keep the language throught the session (i.e. localStorage)
            // regardless the local *of the project*. When we cannot retrieve this property, we fall back
            // on the project's locale.
            // The default state is undefined so we can detect real undefined locale to the default English...
            locale: undefined as undefined | string,
        };
    },

    actions:{
        setAppLang(lang: string) {
            // Set the language in the store first
            this.locale = lang;

            // Then change the UI via i18n
            i18n.locale = lang;

            // And also change TigerPython locale -- if Strype locale is not available in TigerPython, we use English instead
            const tpLangs = TPyParser.getLanguages();
            useStore().tigerPythonLang = (tpLangs.includes(lang)) ? lang : "en";

            // Change all frame definition types to update the localised bits
            generateAllFrameDefinitionTypes(true);

            // Change the frame command labels / details 
            generateAllFrameCommandsDefs();

            /* IFTRUE_isMicrobit */
            //change the API description content here, as we don't want to construct the textual API description every time we need it
            getAPIItemTextualDescriptions(true);
            /* FITRUE_isMicrobit */

            // Save the settings
            (vm.$children[0] as InstanceType<typeof AppComponent>).autoSaveStateToWebLocalStorage(SaveRequestReason.saveSettings);
        },
    },
});
