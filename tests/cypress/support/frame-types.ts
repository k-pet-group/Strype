// Copied from src/types/types.ts
// Bit annoying that this must be copied, but it's a pain to try to share the original:

// imports the locale files we need for the locales used by this test
import en from "@/localisation/en/en_main.json";

export enum CollapsedState {
    ONLY_HEADER_VISIBLE,
    HEADER_AND_DOC_VISIBLE,
    FULLY_VISIBLE,
}

export enum StrypePEALayoutMode {
    tabsCollapsed = "tabsCollapsed", // the default layout mode where PEA is collapsed and using tabs for console/graphics (and selected mode for the micro:bit version)
    tabsExpanded = "tabsExpanded", // the layout mode where PEA is expanded and using tabs for console/graphics
    splitCollapsed = "splitCollapsed", // the layout mode where PEA is collapsed and console/graphics windows are (horizontally) split
    splitExpanded = "splitExpanded", // the layout mode where PEA is expanded and console/graphics windows are (vertically) split
}

export enum AllowedSlotContent {
    ONLY_NAMES,
    ONLY_NAMES_OR_STAR,
    ONLY_FORMAL_PARAMS,
    TERMINAL_EXPRESSION,
    FREE_TEXT_DOCUMENTATION,
    LIBRARY_ADDRESS,
}

// REQUIRED means it must have a value, and slot will always show regardless of content or focus
// HIDDEN_WHEN_UNFOCUSED_AND_BLANK means if empty and unfocused the whole slot will be hidden
// PROMPT_WHEN_UNFOCUSED_AND_BLANK means if empty and unfocused it will show the slot, and show some prompt text
export enum OptionalSlotType {
    REQUIRED,
    HIDDEN_WHEN_UNFOCUSED_AND_BLANK,
    PROMPT_WHEN_UNFOCUSED_AND_BLANK
}

export interface FrameLabel {
    label: string;
    hidableLabelSlots?: boolean; // default false, true indicate that this label and associated slots can be hidden (ex: "as" in import frame)
    showLabel?: boolean; // default true, indicates if the label is showned (ex method call frame has no label text)
    showSlots?: boolean; // default true, false indicates that the label has no slot to be associated with it (for example label ":" in "if <xxx> :")
    defaultText: string;
    optionalSlot?: OptionalSlotType; //default REQUIRED (indicates whether this label requires a value, and its hiding behaviour when empty; see OptionalSlotType)
    acceptAC?: boolean; //default true
    allowedSlotContent?: AllowedSlotContent; // default TERMINAL_EXPRESSION; what the slot accepts
    newLine?: boolean; //default false; this item starts a new line
    appendSelfWhenInClass?: boolean, // default false.  For the opening bracket in function definitions (which show "self" if inside a class)
}

export interface FramesDefinitions {
    type: string;
    labels: FrameLabel[];
    allowChildren: boolean;
    allowJointChildren: boolean;
    forbiddenChildrenTypes: string[];
    isJointFrame: boolean;
    jointFrameTypes: string[];
    colour: string;
    isImportFrame: boolean;
    allowedCollapsedStates: CollapsedState[];
    // Optional default children or joint frames (we use frame rather than definitions as we may want to have child or joint frame with content!)
    // BE SURE TO SET THE SLOT STRUCTURE AS EXPECTED BY THE FRAME DEFINITION (example: for a if, there should be 1 slot defined, even if empty)
    //defaultChildrenTypes?: FrameObject[];
    //defaultJointTypes?: FrameObject[];
}

// Identifiers of the containers
export const ContainerTypesIdentifiers = {
    root: "root",
    importsContainer: "importsContainer",
    defsContainer: "defsContainer",
    framesMainContainer: "mainContainer",
};

export const SpecialTypesIdentifiers = {
    projectDocumentation: "projectDocumentation",
};


export const CommentFrameTypesIdentifier = {
    comment: "comment",
};
// Identifiers of the frame types
export const ImportFrameTypesIdentifiers = {
    import: "import",
    fromimport: "from-import",
    library: "library",
};

export const DefIdentifiers = {
    funcdef: "funcdef",
    classdef: "classdef",
};

export const JointFrameIdentifiers = {
    elif: "elif",
    else: "else",
    except: "except",
    finally: "finally",
};

export const StandardFrameTypesIdentifiers = {
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
    ...SpecialTypesIdentifiers,
    ...ImportFrameTypesIdentifiers,
    ...DefIdentifiers,
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
    isImportFrame: false,
    allowedCollapsedStates: [CollapsedState.FULLY_VISIBLE],
};

export const BlockDefinition: FramesDefinitions = {
    ...DefaultFramesDefinition,
    allowChildren: true,
    forbiddenChildrenTypes: Object.values(ImportFrameTypesIdentifiers)
        .concat(Object.values(DefIdentifiers))
        .concat([StandardFrameTypesIdentifiers.else, StandardFrameTypesIdentifiers.elif, StandardFrameTypesIdentifiers.except, StandardFrameTypesIdentifiers.finally]),
};

export const StatementDefinition: FramesDefinitions = {
    ...DefaultFramesDefinition,
    forbiddenChildrenTypes: Object.values(AllFrameTypesIdentifier),
};

// Container frames
export const RootContainerFrameDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: ContainerTypesIdentifiers.root,
};

export const ImportsContainerDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: ContainerTypesIdentifiers.importsContainer,
    labels: [
        { label: en.appMessage.importsContainer, showSlots: false, defaultText: ""},
    ],
    allowedCollapsedStates: [CollapsedState.FULLY_VISIBLE, CollapsedState.ONLY_HEADER_VISIBLE],
    forbiddenChildrenTypes: Object.values(AllFrameTypesIdentifier)
        .filter((frameTypeDef: string) => !Object.values(ImportFrameTypesIdentifiers).includes(frameTypeDef) && frameTypeDef !== CommentFrameTypesIdentifier.comment),
    colour: "#BBC6B6",
};

export const DefsContainerDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: ContainerTypesIdentifiers.defsContainer,
    labels: [
        { label: en.appMessage.defsContainer, showSlots: false, defaultText: ""},
    ],
    allowedCollapsedStates: [CollapsedState.FULLY_VISIBLE, CollapsedState.ONLY_HEADER_VISIBLE],
    forbiddenChildrenTypes: Object.values(AllFrameTypesIdentifier)
        .filter((frameTypeDef: string) => !Object.values(DefIdentifiers).includes(frameTypeDef) && frameTypeDef !== CommentFrameTypesIdentifier.comment && frameTypeDef != AllFrameTypesIdentifier.varassign),
    colour: "#BBC6B6",
};

export const MainFramesContainerDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: ContainerTypesIdentifiers.framesMainContainer,
    labels: [
        { label: en.appMessage.mainContainer, showSlots: false, defaultText: ""},
    ],
    allowedCollapsedStates: [CollapsedState.FULLY_VISIBLE, CollapsedState.ONLY_HEADER_VISIBLE],
    forbiddenChildrenTypes: BlockDefinition.forbiddenChildrenTypes.concat(Object.values(AllFrameTypesIdentifier)
        .filter((frameTypeDef: string) => !Object.values(StandardFrameTypesIdentifiers).includes(frameTypeDef))),
    colour: "#BBC6B6",
};


export const FrameContainersDefinitions = {
    RootContainerFrameDefinition,
    ImportsContainerDefinition,
    DefsContainerDefinition,
    MainFramesContainerDefinition,
};

export const ProjectDocumentationDefinition: FramesDefinitions = {
    ...StatementDefinition,
    type: AllFrameTypesIdentifier.projectDocumentation,
    labels: [
        { label: "‘‘‘", showSlots: true, acceptAC: false, optionalSlot: OptionalSlotType.PROMPT_WHEN_UNFOCUSED_AND_BLANK, defaultText: "Project description", allowedSlotContent: AllowedSlotContent.FREE_TEXT_DOCUMENTATION},
    ],
    colour: "#A00000",
};

let Definitions = {};

// Entry point for generating the frame definition types -- only doing so to allow dynamic localisation bits...
export function generateAllFrameDefinitionTypes(): void{
    /*1) prepare all the frame definition types */
    // Statements
    const FuncCallDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: StandardFrameTypesIdentifiers.funccall,
        labels: [{ label: "", defaultText: en.frame.defaultText.funcCall, showLabel: false}],
    };

    const BlankDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: StandardFrameTypesIdentifiers.blank,
        labels: [],
    };

    const ReturnDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: StandardFrameTypesIdentifiers.return,
        labels: [{ label: "return ", defaultText: en.frame.defaultText.expression, optionalSlot: OptionalSlotType.HIDDEN_WHEN_UNFOCUSED_AND_BLANK}],
    };

    const GlobalDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: StandardFrameTypesIdentifiers.global,
        labels: [{ label: "global ", defaultText: en.frame.defaultText.variable, allowedSlotContent: AllowedSlotContent.ONLY_NAMES}],
    };

    const VarAssignDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: StandardFrameTypesIdentifiers.varassign,
        labels: [
            { label: "", defaultText: en.frame.defaultText.identifier},
            { label: " &#x21D0; ", defaultText: en.frame.defaultText.value},
        ],
    };

    const BreakDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: StandardFrameTypesIdentifiers.break,
        labels: [
            { label: "break", showSlots: false, defaultText: "" },
        ],
    };

    const ContinueDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: StandardFrameTypesIdentifiers.continue,
        labels: [
            { label: "continue", showSlots: false, defaultText: "" },
        ],
    };

    const RaiseDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: StandardFrameTypesIdentifiers.raise,
        labels: [
            { label: "raise ", defaultText: en.frame.defaultText.exception, optionalSlot: OptionalSlotType.HIDDEN_WHEN_UNFOCUSED_AND_BLANK },
        ],
    };

    const ImportDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: ImportFrameTypesIdentifiers.import,
        labels: [
            { label: "import ", defaultText: en.frame.defaultText.modulePart, allowedSlotContent: AllowedSlotContent.ONLY_NAMES },
            // The as slot to be used in a future version, as it seems that Brython does not understand the shortcut the as is creating
            // and thus not giving us back any AC results on the shortcut
            //{ label: "as ", hidableLabelSlots: true, defaultText: "shortcut", acceptAC: false},
        ],
        isImportFrame: true,
    };

    const FromImportDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: ImportFrameTypesIdentifiers.fromimport,
        labels: [
            { label: "from ", defaultText: en.frame.defaultText.module, allowedSlotContent: AllowedSlotContent.ONLY_NAMES },
            { label: "import ", defaultText: en.frame.defaultText.modulePart, allowedSlotContent: AllowedSlotContent.ONLY_NAMES_OR_STAR },
            // The as slot to be used in a future version, as it seems that Brython does not understand the shortcut the as is creating
            // and thus not giving us back any AC results on the shortcut
            //{ label: "as ", hidableLabelSlots: true, defaultText: "shortcut", acceptAC: false},
        ],
        isImportFrame: true,
    };

    const LibraryDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: ImportFrameTypesIdentifiers.library,
        labels: [
            { label: "library ", defaultText: en.frame.defaultText.libraryAddress, acceptAC: false, allowedSlotContent: AllowedSlotContent.LIBRARY_ADDRESS },
        ],
    };

    const CommentDefinition: FramesDefinitions = {
        ...StatementDefinition,
        type: StandardFrameTypesIdentifiers.comment,
        labels: [{ label: "# ", defaultText: en.frame.defaultText.comment, optionalSlot: OptionalSlotType.HIDDEN_WHEN_UNFOCUSED_AND_BLANK, acceptAC: false, allowedSlotContent: AllowedSlotContent.FREE_TEXT_DOCUMENTATION}],
    };

    // Blocks
    const IfDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: StandardFrameTypesIdentifiers.if,
        labels: [
            { label: "if ", defaultText: en.frame.defaultText.condition},
            { label: " :", showSlots: false, defaultText: ""},
        ],
        allowJointChildren: true,
        jointFrameTypes: [StandardFrameTypesIdentifiers.elif, StandardFrameTypesIdentifiers.else],
        colour: "#E0DFE4",
        forbiddenChildrenTypes: Object.values(ImportFrameTypesIdentifiers)
            .concat(Object.values(DefIdentifiers))
            .concat([ StandardFrameTypesIdentifiers.except, StandardFrameTypesIdentifiers.finally]),
    };

    const ElifDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: StandardFrameTypesIdentifiers.elif,
        labels: [
            { label: "elif ", defaultText: en.frame.defaultText.condition},
            { label: " :", showSlots: false, defaultText: ""},
        ],
        isJointFrame: true,
        jointFrameTypes: [StandardFrameTypesIdentifiers.elif, StandardFrameTypesIdentifiers.else],
    };

    const ElseDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: StandardFrameTypesIdentifiers.else,
        labels: [{ label: "else :", showSlots: false, defaultText: ""}],
        isJointFrame: true,
        jointFrameTypes: [StandardFrameTypesIdentifiers.finally],
    };

    const ForDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: StandardFrameTypesIdentifiers.for,
        labels: [
            { label: "for ", defaultText: en.frame.defaultText.identifier, acceptAC: false},
            { label: " in ", defaultText: en.frame.defaultText.list},
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
            { label: "while ", defaultText: en.frame.defaultText.condition},
            { label: " :", showSlots: false, defaultText: ""},
        ],
        allowJointChildren: true,
        jointFrameTypes: [StandardFrameTypesIdentifiers.else],
        colour: "#E4D5D5",
    };

    const ExceptDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: StandardFrameTypesIdentifiers.except,
        labels: [
            { label: "except ", defaultText: en.frame.defaultText.exception, optionalSlot: OptionalSlotType.HIDDEN_WHEN_UNFOCUSED_AND_BLANK, allowedSlotContent: AllowedSlotContent.ONLY_NAMES},
            { label: " :", showSlots: false, defaultText: ""},
        ],
        jointFrameTypes: [StandardFrameTypesIdentifiers.except, StandardFrameTypesIdentifiers.else, StandardFrameTypesIdentifiers.finally],
        colour: "",
        isJointFrame: true,
    };

    const FinallyDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: StandardFrameTypesIdentifiers.finally,
        labels: [
            { label: "finally :", showSlots: false, defaultText: ""},
        ],
        colour: "",
        isJointFrame: true,
    };

    const TryDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: StandardFrameTypesIdentifiers.try,
        labels: [{ label: "try :", showSlots: false, defaultText: ""}],
        allowJointChildren: true,
        jointFrameTypes: [StandardFrameTypesIdentifiers.except, StandardFrameTypesIdentifiers.else, StandardFrameTypesIdentifiers.finally],
        //defaultJointTypes: [{...EmptyFrameObject, frameType: ExceptDefinition, labelSlotsDict: {0: {slotStructures:{fields:[{code:""}], operators: []}}}}],
        colour: "#C7D9DC",
    };

    const FuncDefDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: DefIdentifiers.funcdef,
        labels: [
            { label: "def ", defaultText: en.frame.defaultText.name, acceptAC: false, allowedSlotContent: AllowedSlotContent.ONLY_NAMES },
            { label: "(", defaultText: en.frame.defaultText.parameters, optionalSlot: OptionalSlotType.HIDDEN_WHEN_UNFOCUSED_AND_BLANK, acceptAC: false, allowedSlotContent: AllowedSlotContent.ONLY_FORMAL_PARAMS },
            { label: ") :", showSlots: false, defaultText: ""},
            { label: "‘‘‘", newLine: true, showSlots: true, acceptAC: false, optionalSlot: OptionalSlotType.PROMPT_WHEN_UNFOCUSED_AND_BLANK, defaultText: "Describe the function", allowedSlotContent: AllowedSlotContent.FREE_TEXT_DOCUMENTATION},
        ],
        colour: "#ECECC8",
    };
    
    const ClassDefinition : FramesDefinitions = {
        ...BlockDefinition,
        type: DefIdentifiers.classdef,
        labels: [
            { label: "class ", defaultText: en.frame.defaultText.name, acceptAC: false},
            { label: " :", showSlots: false, defaultText: ""},
            { label: "'''", newLine: true, showSlots: true, acceptAC: false, optionalSlot: OptionalSlotType.PROMPT_WHEN_UNFOCUSED_AND_BLANK, defaultText: en.frame.defaultText.classDescription, allowedSlotContent: AllowedSlotContent.FREE_TEXT_DOCUMENTATION},
        ],
        colour: "#baded3",
        forbiddenChildrenTypes: Object.values(ImportFrameTypesIdentifiers)
            .concat(Object.values(StandardFrameTypesIdentifiers).filter((f) => f != CommentFrameTypesIdentifier.comment && f != StandardFrameTypesIdentifiers.varassign))
            .concat([DefIdentifiers.classdef]),

    };

    const WithDefinition: FramesDefinitions = {
        ...BlockDefinition,
        type: StandardFrameTypesIdentifiers.with,
        labels: [
            { label: "with ", defaultText: en.frame.defaultText.expression},
            { label: " as ", defaultText: en.frame.defaultText.identifier, allowedSlotContent: AllowedSlotContent.ONLY_NAMES },
            { label: " :", showSlots: false, defaultText: ""},
        ],
        colour: "#ede8f2",
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
        ClassDefinition,
        WithDefinition,
        FuncCallDefinition,
        BlankDefinition,
        ReturnDefinition,
        VarAssignDefinition,
        ImportDefinition,
        FromImportDefinition,
        LibraryDefinition,
        CommentDefinition,
        GlobalDefinition,
        ProjectDocumentationDefinition,
        // also add the frame containers as we might need to retrieve them too
        ...FrameContainersDefinitions,
    };
}

// Methods to access the dynamic frame definition types
export function getFrameDefType(key: string): FramesDefinitions{
    if(Object.values(Definitions).length == 0){
        generateAllFrameDefinitionTypes();
    }

    return Object.values(Definitions).find((frameDefinition) => ((frameDefinition as FramesDefinitions).type === key)) as FramesDefinitions;
}

// Copied from src/helpers/editor.ts
export const allFrameCommandsDefs = {
    " ": [{
        type: getFrameDefType(AllFrameTypesIdentifier.funccall),
        description: en.frame.funccall_desc,
        shortcuts: [" "],
        symbol: en.buttonLabel.spaceBar,
    }],
    "=": [{
        type: getFrameDefType(AllFrameTypesIdentifier.varassign),
        description: en.frame.varassign_desc,
        shortcuts: ["="],
    }],
    "g": [{
        type: getFrameDefType(AllFrameTypesIdentifier.global),
        description: "global",
        shortcuts: ["g"],
    }],
    "i": [
        {
            type: getFrameDefType(AllFrameTypesIdentifier.if),
            description: "if",
            shortcuts: ["i"],
            index: 0,
        },
        {
            type: getFrameDefType(AllFrameTypesIdentifier.import),
            description: "import",
            shortcuts: ["i"],
            index:1,
        },
    ],
    "l": [{
        type: getFrameDefType(AllFrameTypesIdentifier.elif),
        description: "elif",
        shortcuts: ["l"],
        index: 0,
    }, {
        type: getFrameDefType(AllFrameTypesIdentifier.library),
        description: "library",
        shortcuts: ["l"],
        index: 1,
    }],
    "e": [{
        type: getFrameDefType(AllFrameTypesIdentifier.else),
        description: "else",
        shortcuts: ["e"],
    }],
    "f": [
        {
            type: getFrameDefType(AllFrameTypesIdentifier.for),
            description: "for",
            shortcuts: ["f"],
            index: 0,
        },
        {
            type: getFrameDefType(AllFrameTypesIdentifier.funcdef),
            description: en.frame.funcdef_desc,
            shortcuts: ["f"],
            index: 1,
        },
        {
            type: getFrameDefType(AllFrameTypesIdentifier.fromimport),
            description: "from...import",
            shortcuts: ["f"],
            index:2,
        },
    ],
    "c": [{
        type: getFrameDefType(AllFrameTypesIdentifier.classdef),
        description: en.frame.classdef_desc,
        shortcuts: ["c"],
    }],
    "w": [{
        type: getFrameDefType(AllFrameTypesIdentifier.while),
        description: "while",
        shortcuts: ["w"],
    }],
    "r": [{
        type: getFrameDefType(AllFrameTypesIdentifier.return),
        description: "return",
        shortcuts: ["r"],
    }],
    "b" : [{
        type: getFrameDefType(AllFrameTypesIdentifier.break),
        description: "break",
        shortcuts: ["b"],
    }],
    "u" : [{
        type: getFrameDefType(AllFrameTypesIdentifier.continue),
        description: "continue",
        shortcuts: ["u"],
    }],
    "#": [{
        type: getFrameDefType(AllFrameTypesIdentifier.comment),
        description: en.frame.comment_desc,
        shortcuts: ["#"],
    }],
    "enter": [{
        type: getFrameDefType(AllFrameTypesIdentifier.blank),
        description: en.frame.blank_desc,
        shortcuts: ["\x13"],
        symbol: "enter",
        isSVGIconSymbol: true,
    }],
    "t": [{
        type: getFrameDefType(AllFrameTypesIdentifier.try),
        description: "try",
        shortcuts: ["t"],
    }],
    "x": [{
        type: getFrameDefType(AllFrameTypesIdentifier.except),
        description: "except",
        shortcuts: ["x"],
    }],
    "n": [{
        type: getFrameDefType(AllFrameTypesIdentifier.finally),
        description: "finally",
        shortcuts: ["n"],
    }],
    "a" : [{
        type: getFrameDefType(AllFrameTypesIdentifier.raise),
        description: "raise",
        shortcuts: ["a"],
    }],
    "h": [{
        type: getFrameDefType(AllFrameTypesIdentifier.with),
        description: "with",
        shortcuts: ["h"],
    }],
};
