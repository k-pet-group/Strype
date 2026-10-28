// Search and replace in the editor's code (frames' label slots), used by SearchReplaceWidget.vue.
//
// The searchable text is built per frame label (e.g. the condition of an "if", the left-hand side of an
// assignment, a comment's text), from the label's flat slots (see generateFlatSlotBases()): the text of a label
// is what the user sees for it in the editor, with these conventions:
//  - string quotes are the quote characters of the code (" or '), not the typographic quotes shown in the UI,
//  - keyword operators (and, or, not, in...) are surrounded by a space, the other operators have no spaces around
//    them (the UI spaces them more or less depending on their precedence: in the normal and extended modes, the spaces
//    around operators and brackets in the search text are optional, so the user can search the code as they see it),
//  - a media literal (image, sound, colour) counts as a single (unmatchable in practice) character.
// A match never spans 2 labels (and therefore never spans 2 frames).
//
// A replacement is applied to the state directly:
//  - if the match lies in a single string literal, comment or documentation slot, or in a single code slot
//    and the replaced code remains a simple token (identifier or number), we update that slot's code,
//  - otherwise the whole label is re-parsed from its text (with the replacement) into a new slot structure,
//    the same way it would be if the user had typed that text in the label (see checkSlotRefactoring()).
import i18n from "@/i18n";
import { useStore } from "@/store/store";
import { AllFrameTypesIdentifier, AllowedSlotContent, BaseSlot, CaretPosition, CollapsedState, FlatSlotBase, FrameObject, FrozenState, isSlotBracketType, isSlotQuoteType, SlotCoreInfos, SlotType } from "@/types/types";
import { getLabelSlotUID, parseCodeLiteral, trimmedKeywordOperators } from "@/helpers/editor";
import { getAllChildrenAndJointFramesIds, retrieveSlotFromSlotInfos } from "@/helpers/storeMethods";
import { isMacOSPlatform } from "@/helpers/common";
import { invalidateParamPromptCache } from "@/autocompletion/acManager";
import { vueComponentsAPIHandler } from "@/helpers/vueComponentAPI";

export enum SearchMode {
    normal = "normal", // the search text is used as is
    extended = "extended", // the search text (and replacement text) can contain escapes: \n, \r, \t, \0, \\, \xHH, \uHHHH
    regex = "regex", // the search text is a regular expression (JavaScript flavour); the replacement can refer to groups ($1, $<name>...)
}

export interface SearchOptions {
    mode: SearchMode;
    matchCase: boolean;
    wholeWord: boolean;
}

// The placeholder used for a media literal in a label's searchable text
const MEDIA_PLACEHOLDER = "\uFFFC";

interface SearchSegment {
    text: string; // the text this segment contributes to the label's searchable text
    start: number; // the offset of this segment in the label's searchable text
    flatSlot: FlatSlotBase | null; // the flat slot this segment represents, null for a virtual (UI-less) space
}

interface SearchableLabel {
    frameId: number;
    labelIndex: number;
    text: string;
    segments: SearchSegment[];
    // Comments, documentation and library addresses are free text: always changed as a whole
    isFreeText: boolean;
    readOnly: boolean;
}

export interface SearchMatch {
    frameId: number;
    labelIndex: number;
    // The order of the label in the document (used to compare positions of matches)
    labelOrder: number;
    start: number;
    end: number;
    readOnly: boolean;
    // The regex execution result that produced this match (used for expanding a regex replacement)
    execResult: RegExpExecArray;
    labelText: string;
}

// Interprets the escapes of the extended mode. Unknown escapes are kept as they are.
export function unescapeExtended(text: string): string {
    return text.replace(/\\(?:x([0-9a-fA-F]{2})|u([0-9a-fA-F]{4})|(.))/gs, (match, hex2: string | undefined, hex4: string | undefined, char: string | undefined) => {
        if (hex2 || hex4) {
            return String.fromCharCode(parseInt((hex2 ?? hex4) as string, 16));
        }
        switch (char) {
        case "n":
            return "\n";
        case "r":
            return "\r";
        case "t":
            return "\t";
        case "0":
            return "\0";
        case "\\":
            return "\\";
        default:
            return match;
        }
    });
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The characters of the operators and brackets, around which spaces are optional in a (normal or extended) search
const SPACE_INSENSITIVE_CHARS = ".+-/*%:&|~^<>=!,()[]{}";

// Gets the regular expression source for a literal search text, in which the spaces around operators and brackets
// are optional (see the comments at the top of this file): for example "a + b" and "a+b" both match "a+b" and "a + b".
function getLiteralSearchRegExpSource(text: string): string {
    const optionalSpaces = "[ \\t]*";
    const chars = [...text.replace(new RegExp("[ \\t]*([" + escapeRegExp(SPACE_INSENSITIVE_CHARS) + "])[ \\t]*", "g"), "$1")];
    return chars.map((char, index) => {
        if (SPACE_INSENSITIVE_CHARS.includes(char)) {
            // We don't allow spaces before the first character, or after the last one, so a match doesn't include surrounding spaces
            return ((index > 0) ? optionalSpaces : "") + escapeRegExp(char) + ((index < chars.length - 1) ? optionalSpaces : "");
        }
        return escapeRegExp(char);
    }).join("");
}

// Builds the (global) regular expression for a search, or returns an error message if the search can't be compiled
// (an invalid regular expression). An empty search returns null.
export function buildSearchRegExp(searchText: string, options: SearchOptions): RegExp | null | {error: string} {
    if (searchText.length == 0) {
        return null;
    }
    let source = (options.mode == SearchMode.regex)
        ? searchText
        : getLiteralSearchRegExpSource((options.mode == SearchMode.extended) ? unescapeExtended(searchText) : searchText);
    const flags = "gm" + (options.matchCase ? "" : "i");
    // Whole words: the match must not be preceded or followed by a "word" character.
    // We try a Unicode aware version first (identifiers can contain non-ASCII letters), but a regular expression
    // written by the user may not compile with the Unicode flag, so we fall back on ASCII word characters then.
    const tryCompile = (src: string, fl: string): RegExp | {error: string} => {
        try {
            return new RegExp(src, fl);
        }
        catch (e) {
            return {error: (e as Error).message};
        }
    };
    if (options.wholeWord) {
        const unicodeRegExp = tryCompile("(?<![\\p{L}\\p{N}_])(?:" + source + ")(?![\\p{L}\\p{N}_])", flags + "u");
        if (unicodeRegExp instanceof RegExp) {
            return unicodeRegExp;
        }
        source = "(?<!\\w)(?:" + source + ")(?!\\w)";
    }
    return tryCompile(source, flags);
}

// Gets the frames in the order they appear in the editor: depth first, a frame's body before its joint frames.
function getFramesInDocumentOrder(): FrameObject[] {
    const frameObjects = useStore().frameObjects;
    const result: FrameObject[] = [];
    const visit = (frameId: number) => {
        const frame = frameObjects[frameId];
        if (!frame) {
            return;
        }
        result.push(frame);
        frame.childrenIds.forEach(visit);
        frame.jointFrameIds.forEach(visit);
    };
    // The root frame (id 0) holds the project documentation and the sections (imports, definitions, main code)
    frameObjects[0]?.childrenIds.forEach(visit);
    return result;
}

function buildSearchableLabel(frame: FrameObject, labelIndex: number): SearchableLabel {
    const store = useStore();
    const frameLabel = frame.frameType.labels[labelIndex];
    const isFreeText = frameLabel?.allowedSlotContent == AllowedSlotContent.FREE_TEXT_DOCUMENTATION || frameLabel?.allowedSlotContent == AllowedSlotContent.LIBRARY_ADDRESS;
    const segments: SearchSegment[] = [];
    let text = "";
    const addSegment = (segmentText: string, flatSlot: FlatSlotBase | null) => {
        segments.push({text: segmentText, start: text.length, flatSlot});
        text += segmentText;
    };
    store.getFlatSlotBases(frame.id, labelIndex).forEach((flatSlot) => {
        if (flatSlot.type == SlotType.operator) {
            if (trimmedKeywordOperators.includes(flatSlot.code)) {
                addSegment(" ", null);
                addSegment(flatSlot.code, flatSlot);
                addSegment(" ", null);
            }
            else {
                addSegment(flatSlot.code, flatSlot);
            }
        }
        else if (flatSlot.type == SlotType.media) {
            addSegment(MEDIA_PLACEHOLDER, flatSlot);
        }
        else {
            // Code, strings, comments, quotes and brackets: as they are
            addSegment(flatSlot.code, flatSlot);
        }
    });
    return {frameId: frame.id, labelIndex, text, segments, isFreeText, readOnly: store.isEffectivelyFrozen(frame.id)};
}

// Gets all the labels that can be searched, in the document order.
function getSearchableLabels(): SearchableLabel[] {
    const labels: SearchableLabel[] = [];
    getFramesInDocumentOrder().forEach((frame) => {
        Object.keys(frame.labelSlotsDict).map(Number).sort((a, b) => a - b).forEach((labelIndex) => {
            const frameLabel = frame.frameType.labels[labelIndex];
            if (frameLabel == undefined || frameLabel.showSlots === false || frame.labelSlotsDict[labelIndex].shown === false) {
                return;
            }
            labels.push(buildSearchableLabel(frame, labelIndex));
        });
    });
    return labels;
}

// Finds all the (non-empty) matches of a search in the editor, in the document order.
export function findAllMatches(regExp: RegExp): SearchMatch[] {
    const matches: SearchMatch[] = [];
    getSearchableLabels().forEach((label, labelOrder) => {
        regExp.lastIndex = 0;
        let execResult: RegExpExecArray | null;
        while ((execResult = regExp.exec(label.text)) != null) {
            if (execResult[0].length == 0) {
                // We ignore empty matches (e.g. "^" or "a*") and make sure we progress in the text
                regExp.lastIndex++;
                continue;
            }
            matches.push({frameId: label.frameId, labelIndex: label.labelIndex, labelOrder, start: execResult.index, end: execResult.index + execResult[0].length,
                readOnly: label.readOnly, execResult, labelText: label.text});
        }
    });
    return matches;
}

// Expands the replacement for a match: in regex mode, $&, $1, $<name>, $`, $' and $$ are interpreted like
// in JavaScript's String.replace(); in the other modes the replacement is used literally.
export function getReplacementForMatch(match: SearchMatch, replacementText: string, options: SearchOptions): string {
    if (options.mode == SearchMode.normal) {
        return replacementText;
    }
    const unescapedReplacement = unescapeExtended(replacementText);
    if (options.mode == SearchMode.extended) {
        return unescapedReplacement;
    }
    const execResult = match.execResult;
    return unescapedReplacement.replace(/\$(\$|&|`|'|<([^>]*)>|(\d{1,2}))/g, (token, what: string, groupName: string | undefined, groupNum: string | undefined) => {
        if (what == "$") {
            return "$";
        }
        if (what == "&") {
            return execResult[0];
        }
        if (what == "`") {
            return match.labelText.substring(0, match.start);
        }
        if (what == "'") {
            return match.labelText.substring(match.end);
        }
        if (groupName != undefined) {
            return (execResult.groups) ? (execResult.groups[groupName] ?? "") : token;
        }
        if (groupNum != undefined) {
            // Like JavaScript, we use a 2 digits group if it exists, otherwise a single digit group, otherwise it's literal
            const twoDigitsGroup = parseInt(groupNum);
            if (groupNum.length == 2 && twoDigitsGroup > 0 && twoDigitsGroup < execResult.length) {
                return execResult[twoDigitsGroup] ?? "";
            }
            const oneDigitGroup = parseInt(groupNum[0]);
            if (oneDigitGroup > 0 && oneDigitGroup < execResult.length) {
                return (execResult[oneDigitGroup] ?? "") + groupNum.substring(1);
            }
        }
        return token;
    });
}

function getSlotCoreInfos(frameId: number, labelIndex: number, flatSlot: FlatSlotBase): SlotCoreInfos {
    return {frameId, labelSlotsIndex: labelIndex, slotId: flatSlot.id, slotType: flatSlot.type};
}

// Gets the slot of a match if that match lies entirely in a single (directly) editable slot,
// with the positions of the match inside that slot's code.
export function getMatchSingleSlot(match: {frameId: number, labelIndex: number, start: number, end: number}): {slotInfos: SlotCoreInfos, start: number, end: number} | null {
    const frame = useStore().frameObjects[match.frameId];
    if (!frame || !frame.labelSlotsDict[match.labelIndex]) {
        return null;
    }
    const label = buildSearchableLabel(frame, match.labelIndex);
    const segment = label.segments.find((seg) => seg.flatSlot != null && match.start >= seg.start && match.end <= seg.start + seg.text.length);
    if (segment && segment.flatSlot && segment.flatSlot.type != SlotType.operator && segment.flatSlot.type != SlotType.media
        && !isSlotBracketType(segment.flatSlot.type) && !isSlotQuoteType(segment.flatSlot.type)) {
        return {slotInfos: getSlotCoreInfos(match.frameId, match.labelIndex, segment.flatSlot), start: match.start - segment.start, end: match.end - segment.start};
    }
    return null;
}

// Gets the DOM ranges covering a match in the editor (several ranges if the match spans several slots).
// Returns null if (part of) the match isn't currently rendered (e.g. inside a collapsed frame).
export function getMatchDOMRanges(match: SearchMatch): Range[] | null {
    const frame = useStore().frameObjects[match.frameId];
    if (!frame || !frame.labelSlotsDict[match.labelIndex]) {
        return null;
    }
    const label = buildSearchableLabel(frame, match.labelIndex);
    const ranges: Range[] = [];
    for (const segment of label.segments) {
        const segmentEnd = segment.start + segment.text.length;
        if (segment.flatSlot == null || segment.text.length == 0 || segmentEnd <= match.start || segment.start >= match.end) {
            continue;
        }
        const element = document.getElementById(getLabelSlotUID(getSlotCoreInfos(match.frameId, match.labelIndex, segment.flatSlot)));
        if (element == null) {
            return null;
        }
        if (segment.flatSlot.type == SlotType.media) {
            // A media literal is an image element (inside the slot's container)
            const mediaElement = element.parentElement?.querySelector("img") ?? element;
            const range = document.createRange();
            range.selectNode(mediaElement);
            ranges.push(range);
            continue;
        }
        const range = createRangeInElementText(element, Math.max(match.start, segment.start) - segment.start, Math.min(match.end, segmentEnd) - segment.start);
        if (range) {
            ranges.push(range);
        }
    }
    return (ranges.length > 0) ? ranges : null;
}

// Creates a range for the [start, end) offsets of the text of an element (which may contain several text nodes)
function createRangeInElementText(element: HTMLElement, start: number, end: number): Range | null {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let offset = 0, startSet = false;
    let node: Node | null;
    while ((node = walker.nextNode()) != null) {
        const length = node.textContent?.length ?? 0;
        if (!startSet && start <= offset + length) {
            range.setStart(node, start - offset);
            startSet = true;
        }
        if (startSet && end <= offset + length) {
            range.setEnd(node, end - offset);
            return range;
        }
        offset += length;
    }
    return null;
}

interface LabelEdit {
    start: number;
    end: number;
    replacement: string;
}

// Applies replacements (edits, which don't overlap, sorted by position) to a label (of the store). Returns the length of the
// text that the last edit has inserted in the label's searchable text, or -1 if the replacements couldn't be done.
// The caller is responsible for saving the state changes for undo/redo (and marking the project modified, done by saveStateChanges()).
function replaceInLabel(frameId: number, labelIndex: number, edits: LabelEdit[]): number {
    const store = useStore();
    const frame = store.frameObjects[frameId];
    if (edits.length == 0 || !frame || !frame.labelSlotsDict[labelIndex] || store.isEffectivelyFrozen(frameId)) {
        return -1;
    }
    const label = buildSearchableLabel(frame, labelIndex);
    const lastEdit = edits[edits.length - 1];

    // If all the edits can be done directly in the slots, we do so.
    // Strings, comments, docs... take any text; a code slot can only directly take a simple token,
    // anything else could need splitting the slot (operators, brackets...) so we let the label be re-parsed below.
    const directEdits = edits.map((edit) => {
        const singleSlot = getMatchSingleSlot({frameId, labelIndex, start: edit.start, end: edit.end});
        if (singleSlot) {
            const slot = retrieveSlotFromSlotInfos(singleSlot.slotInfos) as BaseSlot;
            const newCode = slot.code.substring(0, singleSlot.start) + edit.replacement + slot.code.substring(singleSlot.end);
            if (label.isFreeText || singleSlot.slotInfos.slotType == SlotType.string || /^[\p{L}\p{N}_]*$/u.test(newCode)) {
                return {slot, start: singleSlot.start, end: singleSlot.end, replacement: edit.replacement};
            }
        }
        return null;
    });
    if (directEdits.every((directEdit) => directEdit != null)) {
        // From the last to the first, so the positions of the edits in a same slot remain valid
        [...directEdits].reverse().forEach((directEdit) => {
            if (directEdit) {
                directEdit.slot.code = directEdit.slot.code.substring(0, directEdit.start) + directEdit.replacement + directEdit.slot.code.substring(directEdit.end);
            }
        });
        return lastEdit.replacement.length;
    }
    if (label.isFreeText) {
        // Shouldn't happen (a free text label has a single slot), but just in case we don't re-parse free text.
        return -1;
    }

    // Re-parse the whole label with the replacements. We need the code of the label: the searchable text with the
    // media literals placeholders replaced back by the media literals' code (the media literals within a match are removed)
    const mediaSegments = label.segments.filter((seg) => seg.flatSlot?.type == SlotType.media);
    const keptMediaSlots = mediaSegments.filter((seg) => !edits.some((edit) => seg.start >= edit.start && seg.start < edit.end)).map((seg) => seg.flatSlot as FlatSlotBase & {mediaType?: string});
    let newText = "", lastPos = 0;
    edits.forEach((edit) => {
        newText += label.text.substring(lastPos, edit.start) + edit.replacement.replaceAll(MEDIA_PLACEHOLDER, "");
        lastPos = edit.end;
    });
    newText += label.text.substring(lastPos);
    let mediaIndex = 0;
    const imageLiterals: {code: string, mediaType: string}[] = [];
    const newCode = newText.replace(new RegExp(MEDIA_PLACEHOLDER, "g"), () => {
        const mediaSlot = keptMediaSlots[mediaIndex++];
        if (mediaSlot) {
            imageLiterals.push({code: mediaSlot.code, mediaType: mediaSlot.mediaType ?? ""});
            return mediaSlot.code;
        }
        return "";
    });
    const parsedCodeRes = parseCodeLiteral(newCode, {frameType: frame.frameType.type, isInsideString: false, imageLiterals});
    frame.labelSlotsDict[labelIndex].slotStructures = parsedCodeRes.slots;
    if (frame.frameType.labels[labelIndex].allowedSlotContent == AllowedSlotContent.ONLY_FORMAL_PARAMS) {
        // Same as in checkSlotRefactoring(): the parameters of a function may have changed, the prompts must be updated
        invalidateParamPromptCache();
    }
    // The text of the label after re-parsing may differ a bit (spaces, closed brackets...): to find out what the last
    // replacement has become, we look where the end of the text (after the last match) starts in the new text, if we can find it.
    const newLabelText = buildSearchableLabel(frame, labelIndex).text;
    const textAfterLastMatch = label.text.substring(lastEdit.end);
    const lastEditStartInNewText = newText.length - (label.text.length - lastEdit.start) - lastEdit.replacement.length;
    if (newLabelText.endsWith(textAfterLastMatch) && newLabelText.length - textAfterLastMatch.length >= lastEditStartInNewText) {
        return newLabelText.length - textAfterLastMatch.length - lastEditStartInNewText;
    }
    return lastEdit.replacement.length;
}

// Replaces a single match. Returns the offset (in the label's searchable text) where the search for the next match should start, or -1 if the replacement wasn't done.
export function replaceMatch(match: SearchMatch, replacementText: string, options: SearchOptions): number {
    const insertedLength = replaceInLabel(match.frameId, match.labelIndex, [{start: match.start, end: match.end, replacement: getReplacementForMatch(match, replacementText, options)}]);
    return (insertedLength < 0) ? -1 : match.start + insertedLength;
}

// Replaces all the matches (that are not read-only). Returns the number of replacements done and the ids of the modified frames.
export function replaceAllMatches(matches: SearchMatch[], replacementText: string, options: SearchOptions): {count: number, frameIds: number[]} {
    let count = 0;
    const frameIds = new Set<number>();
    // The edits are grouped by label, so each label is changed once (matches are in the document order already)
    const editsPerLabel = new Map<string, {frameId: number, labelIndex: number, edits: LabelEdit[]}>();
    matches.filter((match) => !match.readOnly).forEach((match) => {
        const key = match.frameId + "_" + match.labelIndex;
        if (!editsPerLabel.has(key)) {
            editsPerLabel.set(key, {frameId: match.frameId, labelIndex: match.labelIndex, edits: []});
        }
        editsPerLabel.get(key)?.edits.push({start: match.start, end: match.end, replacement: getReplacementForMatch(match, replacementText, options)});
    });
    editsPerLabel.forEach((labelEdits) => {
        if (replaceInLabel(labelEdits.frameId, labelEdits.labelIndex, labelEdits.edits) >= 0) {
            count += labelEdits.edits.length;
            frameIds.add(labelEdits.frameId);
        }
    });
    return {count, frameIds: [...frameIds]};
}

// The keyboard shortcut for opening the search and replace widget: Ctrl+Shift+F (Cmd+Shift+F on macOS).
// (A simple "find" is left to the browser's own Ctrl/Cmd+F.)
export function isSearchReplaceShortcut(event: KeyboardEvent): boolean {
    const isModifierKey = (isMacOSPlatform()) ? (event.metaKey && !event.ctrlKey) : (event.ctrlKey && !event.metaKey);
    return isModifierKey && event.shiftKey && !event.altKey && event.key.toLowerCase() == "f";
}

export function getSearchReplaceShortcutLabel(): string {
    return (isMacOSPlatform()) ? "⌘⇧F" : i18n.global.t("shortcut.ctrlPlus") + i18n.global.t("shortcut.shiftPlus") + "F";
}

// Gets the position (label order, offset in the label's text) of the editor's caret, as a starting point for a search
export function getEditorCaretSearchAnchor(): {labelOrder: number, offset: number} {
    const store = useStore();
    const labels = getSearchableLabels();
    const focusSlotInfos = (store.isEditing) ? store.focusSlotCursorInfos : undefined;
    if (focusSlotInfos) {
        const labelOrder = labels.findIndex((label) => label.frameId == focusSlotInfos.slotInfos.frameId && label.labelIndex == focusSlotInfos.slotInfos.labelSlotsIndex);
        if (labelOrder > -1) {
            const segment = labels[labelOrder].segments.find((seg) => seg.flatSlot?.id == focusSlotInfos.slotInfos.slotId && seg.flatSlot?.type == focusSlotInfos.slotInfos.slotType);
            return {labelOrder, offset: (segment) ? segment.start + focusSlotInfos.cursorPos : 0};
        }
    }
    // With the frame caret, the search starts with the first label after the caret: in the frame's body (if the caret is
    // in the body), or after the frame and all its content (if the caret is below the frame)
    const frames = getFramesInDocumentOrder();
    let frameIndex = frames.findIndex((frame) => frame.id == store.currentFrame.id);
    if (frameIndex < 0) {
        return {labelOrder: 0, offset: 0};
    }
    if (store.currentFrame.caretPosition == CaretPosition.below) {
        const descendantIds = new Set(getAllChildrenAndJointFramesIds(store.currentFrame.id));
        frameIndex++;
        while (frameIndex < frames.length && descendantIds.has(frames[frameIndex].id)) {
            frameIndex++;
        }
    }
    else {
        frameIndex++;
    }
    const nextFrameIds = new Set(frames.slice(frameIndex).map((frame) => frame.id));
    const labelOrder = labels.findIndex((label) => nextFrameIds.has(label.frameId));
    return {labelOrder: (labelOrder > -1) ? labelOrder : labels.length, offset: 0};
}

// Makes sure a frame is visible in the editor (i.e. not hidden by a collapsed ancestor or itself collapsed): we expand what needs to be.
// Returns true if something was expanded.
export function revealFrame(frameId: number): boolean {
    const store = useStore();
    const statuses: Record<number, CollapsedState> = {};
    let currentFrameId = frameId;
    while (currentFrameId != 0 && store.frameObjects[currentFrameId]) {
        const frame = store.frameObjects[currentFrameId];
        const isFrozenFuncDef = frame.frameType.type == AllFrameTypesIdentifier.funcdef && frame.frozenState == FrozenState.FROZEN;
        if ((frame.collapsedState ?? CollapsedState.FULLY_VISIBLE) != CollapsedState.FULLY_VISIBLE && !isFrozenFuncDef
            && frame.frameType.allowedCollapsedStates.includes(CollapsedState.FULLY_VISIBLE)) {
            statuses[currentFrameId] = CollapsedState.FULLY_VISIBLE;
        }
        currentFrameId = (frame.jointParentId > 0) ? frame.jointParentId : frame.parentId;
    }
    if (Object.keys(statuses).length > 0) {
        store.setCollapseStatuses(statuses);
        return true;
    }
    return false;
}

// Opens the search and replace widget from a context menu (frames, frame caret)
export function openSearchReplaceFromContextMenu(): void {
    // The context menu is closing: we let it finish so it doesn't take the focus back from the widget
    setTimeout(() => vueComponentsAPIHandler.searchReplaceWidgetComponentAPI?.open(), 0);
}
