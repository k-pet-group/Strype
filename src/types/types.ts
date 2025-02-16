import i18n from "@/i18n";
import Compiler from "@/compiler/compiler";
import { useStore } from "@/store/store";
import scssVars  from "@/assets/style/_export.module.scss";

// Re-export types from ac-types:
// Note, important to use * here rather than individual imports, to avoid this issue with Babel:
// https://stackoverflow.com/questions/52258061/export-not-found-on-module
export * from "@/types/ac-types";

// Type Definitions

/**
 *  NOTE that all "primitive" types start with a lower-case as this is the way TS works.
 */

export interface Position {
    left?: number,
    top?: number,
    bottom?: number,
    right?: number,
}

export interface LabelSlotsContent {
    shown?: boolean; // default is true (indicate if the label/slots are currently shown at all, for example "as" part for import frame)
    slotStructures: SlotsStructure; // the root slot for that label
}

export type FieldSlot = (BaseSlot | SlotsStructure | StringSlot);
export interface SlotsStructure {
    operators: BaseSlot[];
    fields: FieldSlot[];
    openingBracketValue?: string;
}

export interface BaseSlot {
    code: string;
    // Details for working out the prompt for this slot.  Absent if not a parameter to a function.
    // If a parameter, records the context and token for autocomplete purposes, plus the index and whether
    // we are the last parameter.
    placeholderSource?: {context: string, token: string, paramIndex: number, lastParam: boolean};
    focused?: boolean; // default false
    error?: string; // default ""
    errorTitle?: string; // default ""
    isEmphasised?: boolean; // false by default
}

export interface StringSlot extends BaseSlot {
    quote: string;    
}

export interface FlatSlotBase extends BaseSlot{    
    id: string;
    type: SlotType;
}

export function isFieldStringSlot(field: FieldSlot): field is StringSlot {
    return (field as StringSlot).quote !== undefined;
}

export function isFieldBracketedSlot(field: FieldSlot): field is SlotsStructure {
    return (field as SlotsStructure).openingBracketValue !== undefined;
}

export function isFieldBaseSlot(field: FieldSlot): field is BaseSlot {
    return (!isFieldBracketedSlot(field) && !isFieldStringSlot(field));
}

// Used by the UI and in the code-behind mechanisms
// The types have "meta" categories and detailed categories, valued so we can easily
// get the meta category from a detailed category.
export enum SlotType{
    // code types
    code = 0o0007, // meta category
    string = 0o0001, // detail: a string
    // quotes for string types
    quote = 0o0070, // meta category
    openingQuote = 0o0010, // detail for the opening one
    closingQuote = 0o0020, // detail for the closing one
    // brackets type
    bracket = 0o0700, //meta category
    openingBracket = 0o0100, // detail for the opening one
    closingBracket = 0o0200,// detail for the closing one
    // operator type
    operator = 0o7000, // meta category
    // "no type", which can be used for undo/redo difference marking
    none = 0,    
}

export function isSlotCodeType(type: SlotType): boolean {
    return (type & SlotType.code) > 0;
}

export function isSlotQuoteType(type: SlotType): boolean {
    return (type & SlotType.quote) > 0;
}

export function isSlotBracketType(type: SlotType): boolean {
    return (type & SlotType.bracket) > 0;
}

export function isSlotStringLiteralType(type: SlotType): boolean {
    return (type == SlotType.string);
}

export interface EditorFrameObjects {
    [id: number]: FrameObject;
}

// Frame related interace, the highest level to describe a frame
// Note the labelSlotsDict property is an array inline with each label of the frame
// and slots are always related to 1 label (for example "for" (label 0) and "in" (label 1) in a for frame)
export interface FrameObject {
    frameType: FramesDefinitions;
    id: number;
    isDisabled: boolean;
    isSelected: boolean;
    isVisible: boolean;
    isCollapsed?: boolean;
    isBeingDragged?: boolean; //this flag is used mainly for UI purposes, so we can distinguish specific things that happens during dragging from intrisic properties of the frame
    parentId: number; //this is the ID of a parent frame (example: the if frame of a inner while frame). Value can be 0 (root), 1+ (in a level), -1 for a joint frame
    childrenIds: number[]; //this contains the IDs of the children frames
    jointParentId: number; //this is the ID of the first sibling of a joint frame (example: the if frame of a elif frame under that if), value can be -1 if none, 1+ otherwise
    jointFrameIds: number[]; //this contains the IDs of the joint frames
    caretVisibility: CaretPosition;
    labelSlotsDict: { [index: number]: LabelSlotsContent}; //this contains the label input slots data listed as a key value pairs array (key = index of the slot)
    runTimeError?: string; //this contains the error message for a runtime error, as the granularity of the Skulpt doesn't go beyond the line number
}

export interface FrameLabel {
    label: string;
    hidableLabelSlots?: boolean; // default false, true indicate that this label and associated slots can be hidden (ex: "as" in import frame)
    showLabel?: boolean; // default true, indicates if the label is showned (ex method call frame has no label text)
    showSlots?: boolean; // default true, false indicates that the label has no slot to be associated with it (for example label ":" in "if <xxx> :")
    defaultText: string;
    optionalSlot?: boolean; //default false (indicate that this label does not require at least 1 slot value)
    acceptAC?: boolean; //default true
}


// There are three groups of draggable frames.
// You can drag from the main code to the body of a method and vice-versa, 
// but you cannot drag from/to imports or drag method signatures
export enum DraggableGroupTypes {
    imports = "imports",
    code = "code",
    functionSignatures = "functionSignatures",
    ifCompound = "ifCompound",
    tryCompound = "tryCompound",
    none = "none",
}

export enum CaretPosition {
    body = "caretBody",
    below = "caretBelow",
    none = "none",
}

export enum SelectAllFramesFuncDefScope {
    none, // inside a function body, no frame is selected at all OR some frames are selected but not all
    belowFunc, // below a function definition
    functionsContainerBody, // inside the body of the function definitions container
    wholeFunctionBody, // all frames for a function def body are selected
    frame // some function frames are selected
}

export enum FrameContextMenuActionName {
    cut,
    copy,
    downloadAsImage,
    duplicate,
    paste,
    pasteAbove,
    pasteBelow,
    delete,
    deleteOuter,
    enable,
    disable,
}

export enum ModifierKeyCode {
     ctrl = "ctrl",
     meta = "meta",
     shift = "shift",
     alt = "alt",
}
export interface FrameContextMenuShortcut {
    // This interface represent a keyboard shortcut key for our frame context menus.
    // The modifiers are set as string array in case a similar key have different names 
    // across different OS, like "ctrl" for Windows and "meta" for macOS.
    // When there are several entries for one modifier, the other modifier (if needed)
    // should have the same number of entries, even if we duplicate some keys.
    // BY CONVENTION ALL KEY NAMES ARE TO BE IN LOWER CASE HERE.
    actionName: FrameContextMenuActionName,
    firstModifierKey?: ModifierKeyCode[],
    secondModifierKey?: ModifierKeyCode[],
    mainKey: string,
}

export interface CurrentFrame {
    id: number;
    caretPosition: CaretPosition;
}

export interface LabelSlotsPositions {
    slotStarts: number[];
    slotLengths: number[];
    slotIds: string[];
    slotTypes: SlotType[];
}

export interface LabelSlotPositionsAndCode extends LabelSlotsPositions {
    code: string;
}

export interface LineAndSlotPositions {
    // Index is the line number, and for each labels, we hold the slot starts and lengths
    [line: number]: {
        frameId: number ; 
        labelSlotStartLengths: {[labelIndex: number]: LabelSlotsPositions}};
}

export interface SlotCoreInfos {
    frameId: number;
    labelSlotsIndex: number;
    slotId: string;
    slotType: SlotType;
}

export function areSlotCoreInfosEqual(slotInfos1: SlotCoreInfos, slotInfos2: SlotCoreInfos): boolean {
    // For types, we don't do a straight forward comparison: code types comparison is dont weakly, for example "SlotType.code" and "SlotType.number"
    // will be considered as equal.
    const areTypesEquivalent = (isSlotCodeType(slotInfos1.slotType)) ? isSlotCodeType(slotInfos2.slotType) : (slotInfos1.slotType == slotInfos2.slotType);
    return (slotInfos1.frameId == slotInfos2.frameId
        && slotInfos1.labelSlotsIndex == slotInfos2.labelSlotsIndex
        && slotInfos1.slotId == slotInfos2.slotId
        && areTypesEquivalent);
}

export interface SlotInfos extends SlotCoreInfos {
    code: string;
    initCode: string;
    isFirstChange: boolean;
    error?: string;
    errorTitle?: string;
}

export interface SlotCursorInfos{
    slotInfos: SlotCoreInfos;
    cursorPos: number;
}

export interface EditableFocusPayload extends SlotCoreInfos {
    focused: boolean;
}

export interface NavigationPosition {
    frameId: number;
    isSlotNavigationPosition: boolean, // flag to indicate if we are working with a slot position (change from previous version that used composite types)
    caretPosition?: string;
    labelSlotsIndex?: number;
    slotId?: string;
    slotType?: SlotType;
}
export interface AddFrameCommandDef {
    type: FramesDefinitions;
    description: string; // The label that shown next to the key shortcut button
    shortcuts: [string, string?]; // The keyboard key shortcuts to be used to add a frame (eg "i" for an if frame), usually that's a single value array, but we can have 1 hidden shortcut as well
    symbol?: string; // The symbol to show in the key shortcut button when the key it's not easily reprenstable (e.g. "⌴" for space)
    tooltip: string; // If needed, the tooltip content that explains the role of a frame - localised
    index?: number; // the index of frame type when a shortcut matches more than 1 context-distinct frames
}

export interface AddShorthandFrameCommandDef {
    type: FramesDefinitions;
    codeContent: string; // a default code content to add in the first slot of the frame (used by hidden frames)
    goNextSlot?: boolean; // indicates whether the text cursor should move to the next slot (i.e. added "print" in a function call, we want to go inside the brackets)
}

// This is an array with all the frame Definitions objects.
// Note that the slot variable of each objects tells if the
// Label needs an editable slot as well attached to it.
export interface FramesDefinitions {
    type: string;
    labels: FrameLabel[];
    allowChildren: boolean;
    allowJointChildren: boolean;
    forbiddenChildrenTypes: string[];
    isJointFrame: boolean;
    jointFrameTypes: string[];
    colour: string;
    isCollapsed?: boolean;
    draggableGroup: DraggableGroupTypes;
    innerJointDraggableGroup: DraggableGroupTypes;
    isImportFrame: boolean;
}

// Identifiers of the containers
export const ContainerTypesIdentifiers = {
    root: "root",
    importsContainer: "importsContainer",
    funcDefsContainer: "funcDefsContainer",
    framesMainContainer: "mainContainer",
};

const CommentFrameTypesIdentifier = {
    comment: "comment",
};
// Identifiers of the frame types
const ImportFrameTypesIdentifiers = {
    import: "import",
    fromimport: "from-import",
};

const FuncDefIdentifiers = {
    funcdef: "funcdef",
};

export const JointFrameIdentifiers = {
    elif: "elif",
    else: "else",
    except: "except",
    finally: "finally",
};

const StandardFrameTypesIdentifiers = {
    ...CommentFrameTypesIdentifier,
    funccall: "funccall",
    blank: "blank",
    if: "if",
    for: "for",
    while: "while",
    break: "break",
    continue: "continue",
    try: "try",
    raise: "raise",
    with: "with",
    return: "return",
    varassign: "varassign",
    global: "global",
    ...JointFrameIdentifiers,
};

export const AllFrameTypesIdentifier = {
    ...ImportFrameTypesIdentifiers,
    ...FuncDefIdentifiers,
    ...StandardFrameTypesIdentifiers,
};

export const DefaultFramesDefinition: FramesDefinitions = {
    type: StandardFrameTypesIdentifiers.funccall,
    labels: [],
    allowChildren: false,
    allowJointChildren: false,
    forbiddenChildrenTypes: [],
    isJointFrame: false,
    jointFrameTypes: [],
    colour: "",
    draggableGroup: DraggableGroupTypes.none,
    innerJointDraggableGroup: DraggableGroupTypes.none,
    isImportFrame: false,
};

export const BlockDefinition: FramesDefinitions = {
    ...DefaultFramesDefinition,
    allowChildren: true,
    forbiddenChildrenTypes: Object.values(ImportFrameTypesIdentifiers)
        .concat(Object.values(FuncDefIdentifiers))
        .concat([StandardFrameTypesIdentifiers.else, StandardFrameTypesIdentifiers.elif, StandardFrameTypesIdentifiers.except, StandardFrameTypesIdentifiers.finally]),
    draggableGroup: DraggableGroupTypes.code,
};

export const StatementDefinition: FramesDefinitions = {
    ...DefaultFramesDefinition,
    forbiddenChildrenTypes: Object.values(AllFrameTypesIdentifier),
    draggableGroup: DraggableGroupTypes.code,
};

// Container frames
export const RootContainerFrameDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: ContainerTypesIdentifiers.root,
    draggableGroup: DraggableGroupTypes.none,
};

export const ImportsContainerDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: ContainerTypesIdentifiers.importsContainer,
    labels: [
        { label: (i18n.t("appMessage.importsContainer") as string), showSlots: false, defaultText: ""},
    ],
    isCollapsed: false,
    forbiddenChildrenTypes: Object.values(AllFrameTypesIdentifier)
        .filter((frameTypeDef: string) => !Object.values(ImportFrameTypesIdentifiers).includes(frameTypeDef) && frameTypeDef !== CommentFrameTypesIdentifier.comment),
    colour: "#BBC6B6",
    draggableGroup: DraggableGroupTypes.imports,
};

export const FuncDefContainerDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: ContainerTypesIdentifiers.funcDefsContainer,
    labels: [
        { label: (i18n.t("appMessage.funcDefsContainer") as string), showSlots: false, defaultText: ""},
    ],
    isCollapsed: false,
    forbiddenChildrenTypes: Object.values(AllFrameTypesIdentifier)
        .filter((frameTypeDef: string) => !Object.values(FuncDefIdentifiers).includes(frameTypeDef) && frameTypeDef !== CommentFrameTypesIdentifier.comment),
    colour: "#BBC6B6",
    draggableGroup: DraggableGroupTypes.functionSignatures,

};

export const MainFramesContainerDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: ContainerTypesIdentifiers.framesMainContainer,
    labels: [
        { label: (i18n.t("appMessage.mainContainer") as string), showSlots: false, defaultText: ""},
    ],
    isCollapsed: false,
    forbiddenChildrenTypes: BlockDefinition.forbiddenChildrenTypes.concat(Object.values(AllFrameTypesIdentifier)
        .filter((frameTypeDef: string) => !Object.values(StandardFrameTypesIdentifiers).includes(frameTypeDef))),
    colour: "#BBC6B6",
};


export const FrameContainersDefinitions = {
    RootContainerFrameDefinition,
    ImportsContainerDefinition,
    FuncDefContainerDefinition,
    MainFramesContainerDefinition,
};

let Definitions = {};

// Entry point for generating the frame definition types -- only doing so to allow dynamic localisation bits...
export function generateAllFrameDefinitionTypes(regenerateExistingFrames?: boolean): void{
    /*1) prepare all the frame definition types */
    // Blocks
    const IfDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: StandardFrameTypesIdentifiers.if,
        labels: [
            { label: "if ", defaultText: i18n.t("frame.defaultText.condition") as string},
            { label: " :", showSlots: false, defaultText: ""},
        ],
        allowJointChildren: true,
        jointFrameTypes: [StandardFrameTypesIdentifiers.elif, StandardFrameTypesIdentifiers.else],
        colour: "#E0DFE4",
        innerJointDraggableGroup: DraggableGroupTypes.ifCompound,
        forbiddenChildrenTypes: Object.values(ImportFrameTypesIdentifiers)
            .concat(Object.values(FuncDefIdentifiers))
            .concat([ StandardFrameTypesIdentifiers.except, StandardFrameTypesIdentifiers.finally]),
    };

    const ElifDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: StandardFrameTypesIdentifiers.elif,
        labels: [
            { label: "elif ", defaultText: i18n.t("frame.defaultText.condition") as string},
            { label: " :", showSlots: false, defaultText: ""},
        ],
        draggableGroup: DraggableGroupTypes.ifCompound,
        isJointFrame: true,
        jointFrameTypes: [StandardFrameTypesIdentifiers.elif, StandardFrameTypesIdentifiers.else],
    };

    const ElseDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: StandardFrameTypesIdentifiers.else,
        labels: [{ label: "else :", showSlots: false, defaultText: ""}],
        draggableGroup: DraggableGroupTypes.ifCompound,
        isJointFrame: true,
        jointFrameTypes: [StandardFrameTypesIdentifiers.finally],
    };

    const ForDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: StandardFrameTypesIdentifiers.for,
        labels: [
            { label: "for ", defaultText: i18n.t("frame.defaultText.identifier") as string, acceptAC: false},
            { label: " in ", defaultText: i18n.t("frame.defaultText.list") as string},
            { label: " :", showSlots: false, defaultText: ""},
        ],
        allowJointChildren: true,
        jointFrameTypes:[StandardFrameTypesIdentifiers.else],
        colour: "#E4D6CE",
    };

    const WhileDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: StandardFrameTypesIdentifiers.while,
        labels: [
            { label: "while ", defaultText: i18n.t("frame.defaultText.condition") as string},
            { label: " :", showSlots: false, defaultText: ""},
        ],
        colour: "#E4D5D5",
    };

    const TryDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: StandardFrameTypesIdentifiers.try,
        labels: [{ label: "try :", showSlots: false, defaultText: ""}],
        allowJointChildren: true,
        jointFrameTypes: [StandardFrameTypesIdentifiers.except, StandardFrameTypesIdentifiers.else, StandardFrameTypesIdentifiers.finally],
        colour: "#C7D9DC",
        innerJointDraggableGroup: DraggableGroupTypes.tryCompound,
    };

    const ExceptDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: StandardFrameTypesIdentifiers.except,
        labels: [
            { label: "except ", defaultText: i18n.t("frame.defaultText.exception") as string, optionalSlot: true},
            { label: " :", showSlots: false, defaultText: ""},
        ],
        jointFrameTypes: [StandardFrameTypesIdentifiers.except, StandardFrameTypesIdentifiers.else, StandardFrameTypesIdentifiers.finally],
        colour: "",
        isJointFrame: true,
        draggableGroup: DraggableGroupTypes.tryCompound,
    };

    const FinallyDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: StandardFrameTypesIdentifiers.finally,
        labels: [
            { label: "finally :", showSlots: false, defaultText: ""},
        ],
        colour: "",
        isJointFrame: true,
        draggableGroup: DraggableGroupTypes.none,
    };

    const FuncDefDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: FuncDefIdentifiers.funcdef,
        labels: [
            { label: "def ", defaultText: i18n.t("frame.defaultText.name") as string, acceptAC: false},
            { label: "(", defaultText: i18n.t("frame.defaultText.parameters") as string, optionalSlot: true, acceptAC: false},
            { label: ") :", showSlots: false, defaultText: ""},
        ],
        colour: "#ECECC8",
        draggableGroup: DraggableGroupTypes.functionSignatures,
    };

    const WithDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: StandardFrameTypesIdentifiers.with,
        labels: [
            { label: "with ", defaultText: i18n.t("frame.defaultText.expression") as string},
            { label: " as ", defaultText: i18n.t("frame.defaultText.identifier") as string},
            { label: " :", showSlots: false, defaultText: ""},
        ],
        colour: "#ede8f2",
    };

    // Statements
    const FuncCallDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: StandardFrameTypesIdentifiers.funccall,
        labels: [{ label: "", defaultText: i18n.t("frame.defaultText.funcCall") as string, showLabel: false}],
        colour: scssVars.mainCodeContainerBackground,
    };

    const BlankDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: StandardFrameTypesIdentifiers.blank,
        labels: [],
        colour: scssVars.mainCodeContainerBackground,
    };

    const ReturnDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: StandardFrameTypesIdentifiers.return,
        labels: [{ label: "return ", defaultText: i18n.t("frame.defaultText.expression") as string, optionalSlot: true}],
        colour: scssVars.mainCodeContainerBackground,
    };

    const GlobalDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: StandardFrameTypesIdentifiers.global,
        labels: [{ label: "global ", defaultText: i18n.t("frame.defaultText.variable") as string}],
        colour: scssVars.mainCodeContainerBackground,
    };

    const VarAssignDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: StandardFrameTypesIdentifiers.varassign,
        labels: [
            { label: "", defaultText: i18n.t("frame.defaultText.identifier") as string},
            { label: " &#x21D0; ", defaultText: i18n.t("frame.defaultText.value") as string},
        ],
        colour: scssVars.mainCodeContainerBackground,
    };

    const BreakDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: StandardFrameTypesIdentifiers.break,
        labels: [
            { label: "break", showSlots: false, defaultText: "" },
        ],
        colour: scssVars.mainCodeContainerBackground,
    };

    const ContinueDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: StandardFrameTypesIdentifiers.continue,
        labels: [
            { label: "continue", showSlots: false, defaultText: "" },
        ],
        colour: scssVars.mainCodeContainerBackground,
    };

    const RaiseDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: StandardFrameTypesIdentifiers.raise,
        labels: [
            { label: "raise ", defaultText: i18n.t("frame.defaultText.exception") as string, optionalSlot: true },
        ],
        colour: scssVars.mainCodeContainerBackground,
    };

    const ImportDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: ImportFrameTypesIdentifiers.import,
        labels: [
            { label: "import ", defaultText: i18n.t("frame.defaultText.modulePart") as string},
            // The as slot to be used in a future version, as it seems that Brython does not understand the shortcut the as is creating
            // and thus not giving us back any AC results on the shortcut
            //{ label: "as ", hidableLabelSlots: true, defaultText: "shortcut", acceptAC: false},
        ],    
        colour: scssVars.nonMainCodeContainerBackground,
        draggableGroup: DraggableGroupTypes.imports,
        isImportFrame: true,
    };

    const FromImportDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: ImportFrameTypesIdentifiers.fromimport,
        labels: [
            { label: "from ", defaultText: i18n.t("frame.defaultText.module") as string},
            { label: "import ", defaultText: i18n.t("frame.defaultText.modulePart") as string},
            // The as slot to be used in a future version, as it seems that Brython does not understand the shortcut the as is creating
            // and thus not giving us back any AC results on the shortcut
            //{ label: "as ", hidableLabelSlots: true, defaultText: "shortcut", acceptAC: false},
        ],    
        colour: scssVars.nonMainCodeContainerBackground,
        draggableGroup: DraggableGroupTypes.imports,
        isImportFrame: true,
    };

    const CommentDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: StandardFrameTypesIdentifiers.comment,
        labels: [{ label: "# ", defaultText: i18n.t("frame.defaultText.comment") as string, optionalSlot: true, acceptAC: false}],
        colour: scssVars.mainCodeContainerBackground,
    };

    /*2) update the Defintions variable holding all the definitions */
    Definitions = {
        IfDefinition,
        ElifDefinition,
        ElseDefinition,
        ForDefinition,
        WhileDefinition,
        BreakDefinition,
        ContinueDefinition,
        RaiseDefinition,
        TryDefinition,
        ExceptDefinition,
        FinallyDefinition,
        FuncDefDefinition,
        WithDefinition,
        FuncCallDefinition,
        BlankDefinition,
        ReturnDefinition,
        VarAssignDefinition,
        ImportDefinition,
        FromImportDefinition,
        CommentDefinition,
        GlobalDefinition,
        // also add the frame containers as we might need to retrieve them too
        ...FrameContainersDefinitions,
    };

    /*3) if required, update the types in all the frames existing in the editor (needed to update default texts and frame container labels) */
    if(regenerateExistingFrames){
        Object.values(useStore().frameObjects).forEach((frameObject: FrameObject) => {
            // For containers, we just assign the label manually again here
            switch(frameObject.frameType.type){
            case ImportsContainerDefinition.type:
                frameObject.frameType.labels[0].label = i18n.t("appMessage.importsContainer") as string;
                break;
            case FuncDefContainerDefinition.type:
                frameObject.frameType.labels[0].label = i18n.t("appMessage.funcDefsContainer") as string;
                break;
            case MainFramesContainerDefinition.type:
                frameObject.frameType.labels[0].label = i18n.t("appMessage.mainContainer") as string;
                break;
            default:
                // For all normal frames, we rely on the frame definition type                
                frameObject.frameType.labels.forEach((labelDef, index) => {
                    labelDef.defaultText = getFrameDefType(frameObject.frameType.type).labels[index].defaultText;
                });
                break;
            }
        });
    }
}

// Methods to access the dynamic frame definition types
export function getFrameDefType(key: string): FramesDefinitions{
    if(Object.values(Definitions).length == 0){
        generateAllFrameDefinitionTypes();
    }

    return Object.values(Definitions).find((frameDefinition) => ((frameDefinition as FramesDefinitions).type === key)) as FramesDefinitions;
}

export function getLoopFramesTypeIdentifiers(): string[] {
    return [StandardFrameTypesIdentifiers.for, StandardFrameTypesIdentifiers.while];
}

export const EmptyFrameObject: FrameObject = {
    frameType: DefaultFramesDefinition,
    id: -101, //default non-meaningful value - this will be overriden when frames are created
    isDisabled: false,
    isSelected: false,
    isVisible: true,
    parentId: -101, //default non-meaningful value - this will be overriden when frames are created
    childrenIds: [], //this contains the IDs of the children frames
    jointParentId: -101, //default non-meaningful value - this will be overriden when frames are created
    jointFrameIds: [], //this contains the IDs of the joint frames
    caretVisibility: CaretPosition.none,
    labelSlotsDict: { },
};

/**
 * Types for Bootstrap related stuff
 **/ 
export type BootstrapDlgSize = ("sm" | "lg" | "xl");

export type BootstrapDlgAutoFocusButton = ("ok" | "cancel");

/**
 *  Types for the messages banner
 **/

export interface MessageButton {
    label: string;
    action: VoidFunction | string;
}

export interface FormattedMessageArgKeyValuePlaceholder {
    key: string;
    placeholderName: string;
}

export const FormattedMessageArgKeyValuePlaceholders: {[id: string]: FormattedMessageArgKeyValuePlaceholder} = {
    error: {key:"errorMsg", placeholderName : "{error_placeholder}"},
    list: {key:"list", placeholderName : "{list_placeholder}"},
    file: {key: "file", placeholderName: "{file_name}"},
};

export interface FormattedMessage {
    path: string;
    args: { [id: string]: string};
}

export const DefaultFormattedMessage: FormattedMessage = {
    path: "",
    args: {},
};

export const MessageDefinedActions = {
    closeBanner: "close",
    undo: "undo",
};

export enum imagePaths {
    empty = "",
    transferHexFile = "transferHexFile.svg",
}

export interface MessageDefinition {
    type: string;
    message: string | FormattedMessage;
    buttons: MessageButton[];
    path: imagePaths;
}

export const MessageTypes = {
    noMessage: "none",
    largeDeletion: "largeDeletion",
    imageDisplay: "imageDisplay",
    uploadSuccessMicrobit:"uploadSuccessMicrobit",
    noUndo: "noUndo",
    noRedo: "noRedo",
    uploadEditorFileError: "uploadEditorFileError",
    uploadEditorFileNotSupported: "uploadEditorFileNotSupported",
    uploadEditorFileSucces: "uploadEditorFileSuccess",
    forbiddenFramePaste: "forbiddenFramePaste",
    functionFrameCantDelete: "functionFrameCantDelete",
    gdriveConnectToSaveFailed: "gdriveConnectToSaveFailed",
    gdriveCantCreateStrypeFolder:"gdriveCantCreateStrypeFolder",
    gdriveFileAlreadyExists: "gdriveFileAlreadyExists",
    invalidPythonParseImport: "invalidPythonParseImport",
    invalidPythonParsePaste: "invalidPythonParsePaste",
};

//empty message
const NoMessage: MessageDefinition = {
    type: MessageTypes.noMessage,
    message: "",
    buttons: [],
    path: imagePaths.empty,
};

//message for large deletation (undo)
const LargeDeletion: MessageDefinition = {
    ...NoMessage,
    type: MessageTypes.largeDeletion,
    message: "messageBannerMessage.deleteLargeCode",
    buttons:[{label: "buttonLabel.undo", action:MessageDefinedActions.undo}],
};

//download hex message
const DownloadHex: MessageDefinition = {
    type: MessageTypes.imageDisplay,
    message: "",
    buttons: [],
    path: imagePaths.transferHexFile,
};

//message for upload code success in microbit progress
const UploadSuccessMicrobit: MessageDefinition = {
    ...NoMessage,
    type: MessageTypes.uploadSuccessMicrobit,
    message: "messageBannerMessage.uploadSuccessMicrobit",
};

//message for upload code failure in microbit progress
const UploadFailureMicrobit: MessageDefinition = {
    ...NoMessage,
    type: MessageTypes.uploadSuccessMicrobit,
    message: {
        path: "messageBannerMessage.uploadFailureMicrobit",
        args: {
            [FormattedMessageArgKeyValuePlaceholders.error.key]: FormattedMessageArgKeyValuePlaceholders.error.placeholderName,
        },
    },
};

//messages to inform the user there is no undo/redo to perfom
const NoUndo: MessageDefinition = {
    ...NoMessage,
    type: MessageTypes.noUndo,
    message: "messageBannerMessage.noUndo",
};

const NoRedo: MessageDefinition = {
    ...NoMessage,
    type: MessageTypes.noRedo,
    message: "messageBannerMessage.noRedo",
};

const UploadEditorFileError: MessageDefinition = {
    type: MessageTypes.uploadEditorFileError,
    message: {
        path: "messageBannerMessage.uploadEditorFileError",
        args: {
            [FormattedMessageArgKeyValuePlaceholders.error.key]: FormattedMessageArgKeyValuePlaceholders.error.placeholderName,
        },
    },
    buttons:[{label: "buttonLabel.ok", action:MessageDefinedActions.closeBanner}],
    path: imagePaths.empty,
};

const UploadEditorFileNotSupported: MessageDefinition = {
    type: MessageTypes.uploadEditorFileNotSupported,
    message: {
        path: "messageBannerMessage.uploadEditorFileNotSupported",
        args: {
            [FormattedMessageArgKeyValuePlaceholders.list.key]: FormattedMessageArgKeyValuePlaceholders.list.placeholderName,
        },
    },
    buttons:[{label: "buttonLabel.ok", action:MessageDefinedActions.closeBanner}],
    path: imagePaths.empty,
};

const UploadEditorFileSuccess: MessageDefinition = {
    ...NoMessage,
    type: MessageTypes.noRedo,
    message: "messageBannerMessage.uploadEditorFileSuccess",
};

const ForbiddenFramePaste: MessageDefinition = {
    ...NoMessage,
    type: MessageTypes.forbiddenFramePaste,
    message: "messageBannerMessage.forbiddenFramePaste",
};

const FunctionFrameCantDelete: MessageDefinition = {
    ...NoMessage,
    type: MessageTypes.functionFrameCantDelete,
    message: "messageBannerMessage.functionFrameCantDelete",
};

const GDriveConnectToSaveFailed: MessageDefinition = {
    type: MessageTypes.gdriveConnectToSaveFailed,
    message: "messageBannerMessage.gdriveConnectToSaveFailed",
    buttons:[{label: "buttonLabel.ok", action:MessageDefinedActions.closeBanner}],
    path: imagePaths.empty,    
};

const GDriveCantCreateStrypeFolder: MessageDefinition = {
    ...NoMessage,
    type: MessageTypes.gdriveCantCreateStrypeFolder,
    message: "messageBannerMessage.gdriveCantCreateStrypeFolder",
};

const InvalidPythonParseImport: MessageDefinition = {
    ...NoMessage,
    type: MessageTypes.invalidPythonParseImport,
    message: {
        path: "messageBannerMessage.invalidPythonParseImport",
        args: {
            [FormattedMessageArgKeyValuePlaceholders.error.key]: FormattedMessageArgKeyValuePlaceholders.error.placeholderName,
        },
    },
};

const InvalidPythonParsePaste: MessageDefinition = {
    ...NoMessage,
    type: MessageTypes.invalidPythonParsePaste,
    message: {
        path: "messageBannerMessage.invalidPythonParsePaste",
        args: {
            [FormattedMessageArgKeyValuePlaceholders.error.key]: FormattedMessageArgKeyValuePlaceholders.error.placeholderName,
        },
    },
};


export const MessageDefinitions = {
    NoMessage,
    LargeDeletion,
    UploadSuccessMicrobit,
    UploadFailureMicrobit,
    DownloadHex,
    NoUndo,
    NoRedo,
    UploadEditorFileError,
    UploadEditorFileNotSupported,
    UploadEditorFileSuccess,
    ForbiddenFramePaste,
    FunctionFrameCantDelete,
    GDriveConnectToSaveFailed,
    GDriveCantCreateStrypeFolder,
    InvalidPythonParseImport,
    InvalidPythonParsePaste,
};

//WebUSB listener
export interface WebUSBListener {
    //Callback functions called on the listener by the webUSB.ts file
    onUploadProgressHandler: {(percent: number): void};
    onUploadSuccessHandler: VoidFunction;
    onUploadFailureHandler: {(errorMsg: string): void};
}

//Object difference
export interface ObjectPropertyDiff {
    //The property path is formatted as "level1_<bool>.level2_<bool>. ... .levelN" 
    //where <bool> is a boolean flag value indicating if the corresponding level is for an array or not.
    propertyPathWithArrayFlag: string;
    //value is set to "null" to notify a deletion.
    value: any;
}

//Event at application level that requests the application "freeze"
export interface AppEvent {
    requestAttention: boolean;
    message?: string;
}

//Object that holds information on changes to perform on a frame's property
export interface ChangeFramePropInfos {
    //indicated whether the propery should be changed
    changeDisableProp: boolean;
    //indicates what value the property should be changed to (one flag per type)
    newBoolPropVal?: boolean;
    newNumberPropVal?: number;
    newStringPropVal?: string;
}

//Autocompletion
export interface LanguageDef {
    builtin: ElementDef[];
    libraries: ElementDef[];
    userDefinitions: ElementDef[];
}

export interface AliasesPath {
    //return a hash of alias name / path in modules definitions
    [alias: string]: string;
     //light = module_moduleA.module_moduleB.moduleC.methodA
}
export interface ElementDef {
    name: string;
    kind: "module" | "class" | "method" | "variable" | "constructor" | "keyword";
    elements?: ElementDef[];
    argsNum?: number;
    argsName?: string[];
    argsOptional?: boolean[];
    type?: string; //return type for methods, type of obj for variables
    needNS?: boolean; // this flag indicates if a module name needs to be used within the code (ex for "import microbit", users need to write "microbit.xxxx" in code)
    hide?: boolean; //if this flag is true for a class, the class name cannot appear in AC, but its methods/variables can.
    super?: string[]; //for classes, the super classes' paths of that class.
    target?: string; //for objects that are referred without namespace: gets the full path
}

export interface LibraryPath {
    name: string;
    aliasFor: string;
}

export interface CursorPosition {
    top: number;
    left: number;
    height: number;
}

export const DefaultCursorPosition: CursorPosition = {
    top: 0,
    left: 0,
    height: 0,
};

export interface EditableSlotReachInfos {
    isKeyboard: boolean;
    direction: -1 | 1;
}

export interface StateAppObject {
    debugging: boolean;
    initialState: EditorFrameObjects;
    showKeystroke: boolean;
    nextAvailableId: number;
}

export interface StateAppObjects {
    [id: string]: StateAppObject;
}

export enum StrypePlatform {
    standard = "std",
    microbit = "mb",
}

// This enum represents the different possible states the user code Python execution can take
export enum PythonExecRunningState {
    NotRunning,
    Running,
    RunningAwaitingStop,
}

export enum StrypeSyncTarget {
    none, // Nothing set up (note that auto save is always available on WebStores)
    fs, // The local file system (note that this is only for us to know saving has been requested once, there is NO auto-sync to the local FS)
    gd, // Google Drive
}

export enum SaveRequestReason {
    autosave,
    saveProjectAtLocation, // explicit save at the given location in the dialog
    saveProjectAtOtherLocation, // explicit save with a change of the given location in the dialog
    overwriteExistingProject, // explicit save overwerwriting an existing file/project (used for Google Drive only)
    loadProject,
    unloadPage,
}

export interface SaveExistingGDProjectInfos {
    existingFileId: string,
    existingFileName: string
    isCopyFileRequested: boolean,
    resumeProcessCallback: VoidFunction,
}

export interface AutoSaveFunction {
    name: "WS" | "GD", // The autosave destination: "WS" for the webstore, or "GD" for Google Drive.
    function: (saveReason: SaveRequestReason) => void;
}

export interface UserDefinedElement {
    name: string;
    isFunction: boolean;
}
export interface VoidFunction {
    (): void;
}

//Representation of an item of the (microbit) API using a coded identifier with its potential children
/* IFTRUE_isMicrobit */
export interface APICodedItem {
    name: string, //a UUID coded name that represent a single item of the API description (** do not use "." in the coded names, it messes i18n **)
    codePortion: string, //the code portion that will builds an example use in the editor (code builder)
    extraCodePortion?: string, //the optional full code portion to be shown in extra doc -- this code portion isn't used in the code builder
    version?: number, //the version of the API for this element (for instance 2 for microbit v2) if not provided, 1 is assumed
    children?: APICodedItem[];
}

//Representation of an item of the (microbit) API textual description based on a coded indentifier
export interface APIItemTextualDescription {
    name: string; //a UUID coded name that represent a single item of the API description
    label: string; //the textual value of the item
    doc: string; //the documentation for this item (short and always visible)
    extradoc: string; //the rest of the documentation for this item (visible on demand);
    codePortion: string, //the code portion that will builds an example use in the editor (code builder)
    extraCodePortion: string, //the full code portion to be shown in extra doc (or empty string if none) -- this code portion isn't used in the code builder
    version: number, //the version of the API for this element (for instance 2 for microbit v2)
    level: number; //the level of the item in the API hierarchy
    isFinal: boolean; //indicates if that is a termination item
    immediateParentName: string; //the name of the immediate parent of this item - empty string if level 1
}
/* FITRUE_isMicrobit */

//Object containing the different elements produced when parsing the code, to be used by parsing callers
export interface ParserElements {
    parsedOutput : string, //the python code generated by the parser
    hasErrors: boolean, //indicates the the code contains errors (precompiled & TigerPython errors)
    compiler: Compiler, //the compiler associated with this parser, that allow access to more complex objects generated after parsing code (i.e. blob, hex...)
}

// utility types
export interface MIMEDesc {
    description: string,
    accept: {[MIME: string]: string[]}
}

export type ProjectLocation = (undefined | string | FileSystemFileHandle);

export interface Locale {
    code: string, // a 2 letter code idenitifying the locale (e.g.: "en")
    name: string, // the user-friendly locale's name (e.g.: "English")
}