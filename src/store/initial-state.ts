import { EditorFrameObjects, CaretPosition, RootContainerFrameDefinition, ImportsContainerDefinition, FuncDefContainerDefinition, MainFramesContainerDefinition, WhileDefinition, EmptyDefinition, CommentDefinition, FromImportDefinition, IfDefinition, ElseIfDefinition, ElseDefinition, ForDefinition, VarAssignDefinition } from "@/types/types";

const initialState: EditorFrameObjects = {
    0: {
        id: 0,
        frameType : RootContainerFrameDefinition,
        parentId: 0,
        childrenIds: [-1, -2, -3],
        jointParentId: 0,
        jointFrameIds: [],
        contentDict: { },
        caretVisibility: CaretPosition.none,
    },
    "-1": {
        id: -1,
        frameType : ImportsContainerDefinition,
        parentId: 0,
        childrenIds: [2],
        jointParentId: 0,
        jointFrameIds: [],
        contentDict: {},
        caretVisibility: CaretPosition.body,
    },
    "-2": {
        id: -2,
        frameType : FuncDefContainerDefinition,
        parentId: 0,
        childrenIds: [],
        jointParentId: 0,
        jointFrameIds: [],
        contentDict: { 0: "This is a comment" },
        caretVisibility: CaretPosition.none,
    },
    "-3": {
        id: -3,
        frameType : MainFramesContainerDefinition,
        parentId: 0,
        childrenIds: [1,3],
        jointParentId: 0,
        jointFrameIds: [],
        contentDict: {},
        caretVisibility: CaretPosition.none,
    },
    1: {
        frameType: CommentDefinition,
        id: 1,
        parentId: -3,
        childrenIds: [],
        jointParentId: 0,
        jointFrameIds: [],
        contentDict: { 0: "Add your Python code here. E.g." },
        caretVisibility: CaretPosition.none,
    },
    2: {
        frameType: FromImportDefinition,
        id: 2,
        parentId: -1,
        childrenIds: [],
        jointParentId: 0,
        jointFrameIds: [],
        contentDict: { 0: "microbit", 1: "*" },
        caretVisibility: CaretPosition.none,
    },
    3: {
        frameType: WhileDefinition,
        id: 3,
        parentId: -3,
        childrenIds: [4, 5, 6],
        jointParentId: 0,
        jointFrameIds: [],
        contentDict: { 0: "True" },
        caretVisibility: CaretPosition.none,
    },
    4: {
        frameType: EmptyDefinition,
        id: 4,
        parentId: 3,
        childrenIds: [],
        jointParentId: 0,
        jointFrameIds: [],
        contentDict: {0: "display.scroll('Hello, World!')"},
        caretVisibility: CaretPosition.none,
    },
    5: {
        frameType: VarAssignDefinition,
        id: 5,
        parentId: 3,
        childrenIds: [],
        jointParentId: 0,
        jointFrameIds: [],
        contentDict: {0: "x", 1:"2"},
        caretVisibility: CaretPosition.none,
    },
    6: {
        frameType: IfDefinition,
        id: 6,
        parentId: 3,
        childrenIds: [11],
        jointParentId: -1,
        jointFrameIds: [7,8],
        contentDict: {0: "x < 0"},
        caretVisibility: CaretPosition.none,
    },
    11: {
        frameType: EmptyDefinition,
        id: 11,
        parentId: 6,
        childrenIds: [],
        jointParentId: -1,
        jointFrameIds: [],
        contentDict: {0: "print (\"test A\")"},
        caretVisibility: CaretPosition.none,
    },
    7: {
        frameType: ElseIfDefinition,
        id: 7,
        parentId: 0,
        childrenIds: [9],
        jointParentId: 6,
        jointFrameIds: [],
        contentDict: {0: "x > 5"},
        caretVisibility: CaretPosition.none,
    },
    8: {
        frameType: ElseDefinition,
        id: 8,
        parentId: 0,
        childrenIds: [12],
        jointParentId: 6,
        jointFrameIds: [],
        contentDict: {},
        caretVisibility: CaretPosition.none,
    },
    12: {
        frameType: EmptyDefinition,
        id: 12,
        parentId: 8,
        childrenIds: [],
        jointParentId: -1,
        jointFrameIds: [],
        contentDict: {0: "print (\"test C\")"},
        caretVisibility: CaretPosition.none,
    },
    9: {
        frameType: ForDefinition,
        id: 9,
        parentId: 7,
        childrenIds: [13],
        jointParentId: 0,
        jointFrameIds: [10],
        contentDict: {0: "val", 1: "range(1,10)"},
        caretVisibility: CaretPosition.none,
    },
    13: {
        frameType: EmptyDefinition,
        id: 13,
        parentId: 9,
        childrenIds: [],
        jointParentId: -1,
        jointFrameIds: [],
        contentDict: {0: "print (\"test B\" + str(val))"},
        caretVisibility: CaretPosition.none,
    },
    10: {
        frameType: ElseDefinition,
        id: 10,
        parentId: 0,
        childrenIds: [14],
        jointParentId: 9,
        jointFrameIds: [],
        contentDict: {},
        caretVisibility: CaretPosition.none,
    },
    14: {
        frameType: EmptyDefinition,
        id: 14,
        parentId: 10,
        childrenIds: [],
        jointParentId: -1,
        jointFrameIds: [],
        contentDict: {0: "print(\"You will never get here :)\")"},
        caretVisibility: CaretPosition.none,
    },
};

export default initialState;
