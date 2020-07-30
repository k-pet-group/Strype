// Type Definitions

/**
 *  NOTE that all types start with a lower-case as this is the way TS works.
 */

export interface FrameObject {
    frameType: FramesDefinitions;
    id: number;
    parentId: number; //this is the ID of a parent frame (example: the if frame of a inner while frame). Value can be 0 (root), 1+ (in a level), -1 for a joint frame
    childrenIds: number[]; //this contains the IDs of the children frames
    jointParentId: number; //this is the ID of the first sibling of a joint frame (example: the if frame of a elseif frame under that if), value can be -1 if none, 1+ otherwise
    jointFrameIds: number[]; //this contains the IDs of the joint frames
    caretVisibility: CaretPosition;
    contentDict: { [id: number]: string }; //this contains the label input slots data listed as a key value pairs array (key = index of the slot)
}

export interface FrameLabel {
    label: string;
    slot: boolean;
}

export enum CaretPosition {
    body = "caretBody",
    below = "caretBelow",
    none = "none"
}

export interface CurrentFrame {
    id: number;
    caretPosition: CaretPosition;
}

export interface ErrorSlotPayload {
    frameId: number;
    slotId: number;
    code: string;
}
export interface FrameCommand {
    type: FramesDefinitions;
    description: string;
    shortcut: string;
    symbol?: string;
}

// This is an array with all the frame Definitions objects.
// Note that the slot variable of each objects tells if the
// Label needs an editable slot as well attached to it.
export interface FramesDefinitions {
    type: string;
    labels: FrameLabel[];
    allowChildren: boolean;
    forbiddenChildrenTypes: string[];
    jointFrameTypes: string[];
    colour: string;
}

//all the indentifiers of the types
const typesIdentification = {
    empty: "",
    root: "rootFrame",
    if: "if",
    elseif: "elseif",
    else: "else",
    for: "for",
    while: "while",
    try: "try",
    except: "except",
    finally: "finally",
    funcdef: "funcdef",
    with: "with",
    return: "return",
    varassign: "varassign",
    import: "import",
    fromimport: "fromimport",
    comment: "comment",
}

export const DefaultFramesDefinition: FramesDefinitions = {
    type: typesIdentification.empty,
    labels: [],
    allowChildren: false,
    forbiddenChildrenTypes: [],
    jointFrameTypes: [],
    colour: "",
};

export const BlockDefinition: FramesDefinitions = {
    ...DefaultFramesDefinition,
    allowChildren: true,
    forbiddenChildrenTypes:[typesIdentification.else, typesIdentification.elseif, typesIdentification.except, typesIdentification.finally],
};

export const StatementDefinition: FramesDefinitions = {
    ...DefaultFramesDefinition,
    forbiddenChildrenTypes: Object.values(typesIdentification),
};

// Container frames
export const RootFrameDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: typesIdentification.root,
}

// Blocks
export const IfDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: typesIdentification.if,
    labels: [
        { label: "if", slot: true },
        { label: ":", slot: false },
    ],
    jointFrameTypes: [typesIdentification.elseif, typesIdentification.else],
    colour: "#EA9C72",
};

export const ElseIfDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: typesIdentification.elseif,
    labels: [
        { label: "elif", slot: true },
        { label: ":", slot: false },
    ],
};

export const ElseDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: typesIdentification.else,
    labels: [{ label: "else:", slot: false }],
};

export const ForDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: typesIdentification.for,
    labels: [
        { label: "for", slot: true },
        { label: "in", slot: true },
        { label: ":", slot: false },
    ],
    jointFrameTypes:[typesIdentification.else],
    colour: "#EA72C0",
};

export const WhileDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: typesIdentification.while,
    labels: [
        { label: "while", slot: true },
        { label: ":", slot: false },
    ],
    colour: "#9C72EA",
};

export const TryDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: typesIdentification.try,
    labels: [{ label: "try:", slot: true }],
    jointFrameTypes: [typesIdentification.except, typesIdentification.else, typesIdentification.finally],
    colour: "#EA0000",
};

export const ExceptDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: typesIdentification.except,
    labels: [
        { label: "except", slot: true },
        { label: ":", slot: false },
    ],
    colour: "",
};

export const FinallyDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: typesIdentification.finally,
    labels: [
        { label: "finally", slot: true },
        { label: ":", slot: false },
    ],
    colour: "",
};

export const FuncDefDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: typesIdentification.funcdef,
    labels: [
        { label: "def:", slot: true },
        { label: "(", slot: true },
        { label: ")", slot: false },
    ],
    colour: "#0C3DED",
};

export const WithDefinition: FramesDefinitions = {
    ...BlockDefinition,
    type: typesIdentification.with,
    labels: [
        { label: "with", slot: true },
        { label: "as", slot: true },
        { label: ":", slot: false },
    ],
    colour: "#0C3DED",
};

// Statements
export const ReturnDefinition: FramesDefinitions = {
    ...StatementDefinition,
    type: typesIdentification.return,
    labels: [{ label: "return", slot: true }],
    colour: "#EFF779",
};

export const VarAssignDefinition: FramesDefinitions = {
    ...StatementDefinition,
    type: typesIdentification.varassign,
    labels: [
        { label: "var", slot: true },
        { label: "=", slot: true },
    ],
    colour: "#72EAC0",
};

export const ImportDefinition: FramesDefinitions = {
    ...StatementDefinition,
    type: typesIdentification.import,
    labels: [{ label: "import", slot: true }],
    colour: "#FFFFFF",
};

export const FromImportDefinition: FramesDefinitions = {
    ...StatementDefinition,
    type: typesIdentification.fromimport,
    labels: [
        { label: "from", slot: true },
        { label: "import", slot: true },
    ],
    colour: "#FFFFFF",
};

export const CommentDefinition: FramesDefinitions = {
    ...StatementDefinition,
    type: typesIdentification.comment,
    labels: [{ label: "Comment:", slot: true }],
    colour: "#AAAAAA",
};

export const Definitions = {
    RootFrameDefinition,
    IfDefinition,
    ElseIfDefinition,
    ElseDefinition,
    ForDefinition,
    WhileDefinition,
    TryDefinition,
    ExceptDefinition,
    FinallyDefinition,
    FuncDefDefinition,
    WithDefinition,
    ReturnDefinition,
    VarAssignDefinition,
    ImportDefinition,
    FromImportDefinition,
    CommentDefinition,
};
