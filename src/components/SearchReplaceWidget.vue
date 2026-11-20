<!-- The search and replace widget: a popup over the top of the editor's code (see App.vue), which can be moved (by its header) so the code
     remains visible. Interacting with anything else in Strype (clicking or moving the focus outside the popup) closes it. It uses Bootstrap's popover
     classes to look like the other popups of the editor (e.g. the rename identifiers popup). The search only covers the code of the editor, see helpers/searchReplace.ts.
     The replace part can be folded: it is when the popup is opened to find (Ctrl/Cmd+F), and isn't when it is opened to find and replace (Ctrl/Cmd+Shift+F).
     The keyboard and clipboard events are kept within the popup, so the editor doesn't act on them (e.g. the frame cursor's paste, see CaretContainer.vue). -->
<template>
    <div
        v-if="isOpened"
        :id="widgetId"
        ref="widget"
        class="popover search-replace-widget"
        :style="widgetPositionStyle"
        role="dialog"
        :aria-label="titleText"
        @keydown.stop="onKeyDown"
        @keyup.stop="onKeyUp"
        @paste.stop
        @copy.stop
        @cut.stop
        @mousedown.stop
        @contextmenu.stop
    >
        <div class="popover-header search-replace-header" @mousedown="onHeaderMouseDown">
            <span class="search-replace-title">{{ titleText }}</span>
            <button type="button" class="search-replace-icon-btn search-replace-close-btn" :title="$t('searchReplace.close')" :aria-label="$t('searchReplace.close')" @click="close(true)">&#10005;</button>
        </div>
        <div class="popover-body search-replace-body">
            <div class="search-replace-row search-replace-input-row">
                <input
                    :id="searchInputId"
                    ref="searchInput"
                    type="text"
                    class="search-replace-input"
                    :class="{'search-replace-input-invalid': searchText.length > 0 && matches.length == 0}"
                    v-model="searchText"
                    :placeholder="$t('searchReplace.find')"
                    :aria-label="$t('searchReplace.find')"
                    spellcheck="false"
                    autocomplete="off"
                    @keydown="onSearchInputKeyDown"
                />
                <BButton :id="previousButtonId" variant="primary" class="search-replace-btn" :title="$t('searchReplace.previousTooltip')" :disabled="matches.length == 0" @click="goToMatch(false)">{{ $t("searchReplace.previous") }}</BButton>
                <BButton :id="nextButtonId" variant="primary" class="search-replace-btn" :title="$t('searchReplace.nextTooltip')" :disabled="matches.length == 0" @click="goToMatch(true)">{{ $t("searchReplace.next") }}</BButton>
            </div>
            <div class="search-replace-row">
                <label class="search-replace-option">
                    <input :id="matchCaseCheckboxId" type="checkbox" v-model="matchCase" />
                    {{ $t("searchReplace.matchCase") }}
                </label>
                <label class="search-replace-option">
                    <input :id="wholeWordCheckboxId" type="checkbox" v-model="wholeWord" />
                    {{ $t("searchReplace.wholeWord") }}
                </label>
                <span class="search-replace-spacer"></span>
                <span :id="statusId" class="search-replace-status" aria-live="polite">{{ statusText }}</span>
            </div>
            <div class="search-replace-row">
                <button
                    :id="toggleReplaceButtonId"
                    type="button"
                    class="search-replace-fold-btn"
                    :aria-expanded="isReplaceUnfolded ? 'true' : 'false'"
                    :aria-controls="replacePartId"
                    @click="toggleReplace"
                >
                    <span :class="{'search-replace-fold-chevron': true, 'search-replace-fold-chevron-unfolded': isReplaceUnfolded}">&#9656;</span>
                    {{ $t("searchReplace.replace") }}
                </button>
            </div>
            <div v-if="isReplaceUnfolded" :id="replacePartId" class="search-replace-replace-part">
                <div class="search-replace-row search-replace-input-row">
                    <input
                        :id="replaceInputId"
                        ref="replaceInput"
                        type="text"
                        class="search-replace-input"
                        v-model="replaceText"
                        :placeholder="$t('searchReplace.replaceWith')"
                        :aria-label="$t('searchReplace.replaceWith')"
                        spellcheck="false"
                        autocomplete="off"
                        @keydown="onReplaceInputKeyDown"
                    />
                    <BButton :id="replaceButtonId" variant="primary" class="search-replace-btn" :disabled="!canReplace" @click="replaceCurrent" v-html="replaceButtonLabel"></BButton>
                    <BButton :id="replaceAllButtonId" variant="primary" class="search-replace-btn" :disabled="!canReplace" @click="replaceAll" v-html="replaceAllButtonLabel"></BButton>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapStores } from "pinia";
import { useStore } from "@/store/store";
import { CaretPosition, CriticalActionPositioning, PythonExecRunningState, SlotCoreInfos, SlotCursorInfos } from "@/types/types";
import { vueComponentsAPIHandler } from "@/helpers/vueComponentAPI";
import { buildSearchRegExp, findAllMatches, getEditorCaretSearchAnchor, getMatchDOMRanges, getMatchSingleSlot, getSearchReplaceShortcut, replaceAllMatches, replaceMatch, revealFrame, revealFrameSection, SearchMatch, SearchOptions } from "@/helpers/searchReplace";
import { CustomEventTypes, getFrameLabelSlotsStructureUID, getLabelSlotUID, isFullyInViewport, setDocumentSelection } from "@/helpers/editor";
import { checkCodeErrors } from "@/helpers/storeMethods";
import { isMacOSPlatform } from "@/helpers/common";
import { BButton } from "bootstrap-vue-next";

// The names of the CSS custom highlights (see the style section) used to show the matches in the editor
const ALL_MATCHES_HIGHLIGHT = "strype-search-match";
const CURRENT_MATCH_HIGHLIGHT = "strype-search-current-match";

// The CSS Custom Highlight API lets us show the matches without changing the editor's DOM (which Vue manages).
// It's supported by all the browsers we target, but we stay safe if it isn't.
const highlightRegistry = (typeof CSS !== "undefined" && "highlights" in CSS) ? (CSS as any).highlights as Map<string, unknown> : null;

// The gap kept between the popup and the edges of the editor's column (when the user moves it)
const WIDGET_MARGIN = 8;

// Checks if a mouse event happened on the scrollbars of an element (rather than on its content)
function isOnElementScrollbar(element: Element, event: MouseEvent): boolean {
    const rect = element.getBoundingClientRect();
    return (element.clientWidth > 0 && event.clientX >= rect.left + element.clientLeft + element.clientWidth && event.clientX < rect.right)
        || (element.clientHeight > 0 && event.clientY >= rect.top + element.clientTop + element.clientHeight && event.clientY < rect.bottom);
}

export default defineComponent({
    name: "SearchReplaceWidget",

    components: {
        BButton,
    },

    data: function() {
        return {
            isOpened: false,
            searchText: "",
            replaceText: "",
            // When the replace part is folded, the popup only finds (and nothing can be replaced)
            isReplaceUnfolded: false,
            matchCase: false,
            wholeWord: false,
            matches: [] as SearchMatch[],
            currentMatchIndex: -1,
            // A message replacing the matches count for a short while after an action (e.g. "5 replaced")
            actionMessage: "",
            searchTimeoutHandle: -1,
            // The position of the popup within the editor's column once the user has moved it (null: the default position, at the top right).
            // It's kept when the popup is closed, so it opens again where the user left it.
            position: null as {left: number, top: number} | null,
            dragStart: null as {mouseX: number, mouseY: number, left: number, top: number} | null,
            // Where the caret goes back in the editor when the popup is closed after a replacement (the end of the last replacement done
            // while the popup was opened, when it is in an editable slot), so the user can carry on editing there. After a single replacement,
            // that's only when the current match (the next one) can't be selected in the editor (e.g. there is none left); after replacing all
            // the matches, it's preferred to the current match, until the user moves to another match or changes the search.
            caretAfterReplacement: null as SlotCursorInfos | null,
            isCaretAfterReplacementPreferred: false,
        };
    },

    created() {
        vueComponentsAPIHandler.searchReplaceWidgetComponentAPI = {
            open: this.open,
            isOpened: () => this.isOpened,
        };
    },

    beforeUnmount() {
        this.clearHighlights();
        this.setOutsideInteractionListened(false);
        this.onDragEnd();
    },

    computed: {
        ...mapStores(useStore),

        widgetId(): string {
            return "searchReplaceWidget";
        },

        searchInputId(): string {
            return "searchReplaceSearchInput";
        },

        replaceInputId(): string {
            return "searchReplaceReplaceInput";
        },

        matchCaseCheckboxId(): string {
            return "searchReplaceMatchCaseCheckbox";
        },

        wholeWordCheckboxId(): string {
            return "searchReplaceWholeWordCheckbox";
        },

        toggleReplaceButtonId(): string {
            return "searchReplaceToggleReplaceButton";
        },

        replacePartId(): string {
            return "searchReplaceReplacePart";
        },

        previousButtonId(): string {
            return "searchReplacePreviousButton";
        },

        nextButtonId(): string {
            return "searchReplaceNextButton";
        },

        statusId(): string {
            return "searchReplaceStatus";
        },

        replaceButtonId(): string {
            return "searchReplaceReplaceButton";
        },

        replaceAllButtonId(): string {
            return "searchReplaceReplaceAllButton";
        },

        widgetPositionStyle(): Record<string, string> {
            return (this.position) ? {left: this.position.left + "px", top: this.position.top + "px", right: "auto"} : {};
        },

        searchOptions(): SearchOptions {
            return {matchCase: this.matchCase, wholeWord: this.wholeWord};
        },

        titleText(): string {
            return this.$t((this.isReplaceUnfolded) ? "searchReplace.title" : "searchReplace.titleFind");
        },

        isPythonExecuting(): boolean {
            return (this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning;
        },

        replaceButtonLabel(): string {
            return this.$t("searchReplace.replaceOneWithShortcut");
        },

        replaceAllButtonLabel(): string {
            return this.$t("searchReplace.replaceAllWithShortcut", {modifierkey: (isMacOSPlatform()) ? "⌘" : this.$t("contextMenu.ctrl") + "+"});
        },

        canReplace(): boolean {
            return this.isReplaceUnfolded && !this.isPythonExecuting && this.matches.some((match) => !match.readOnly);
        },

        statusText(): string {
            if (this.actionMessage.length > 0) {
                return this.actionMessage;
            }
            if (this.searchText.length == 0) {
                return "";
            }
            if (this.matches.length == 0) {
                return this.$t("searchReplace.noResults");
            }
            const currentMatch = this.matches[this.currentMatchIndex];
            const status = this.$t("searchReplace.matchCount", {current: (currentMatch) ? this.currentMatchIndex + 1 : "?", total: this.matches.length});
            return (currentMatch?.readOnly) ? status + " " + this.$t("searchReplace.readOnly") : status;
        },
    },

    watch: {
        searchText() {
            this.scheduleSearch(true);
        },

        searchOptions() {
            this.scheduleSearch(true);
        },

        // When the code changes (by the user typing, undo/redo, loading a project...), we refresh the search,
        // trying to keep the current match where it was.
        "appStore.editorLastModificationAt"() {
            if (this.isOpened) {
                this.scheduleSearch(false);
            }
        },

        "appStore.frameObjects"() {
            if (this.isOpened) {
                this.scheduleSearch(false);
            }
        },
    },

    methods: {
        // Opens the widget, with the replace part folded (to find) or not (to find and replace), and the focus in the search field.
        // The search text is the given text (e.g. the text selected in the editor) or, when there is none, the previous search text (empty the first time).
        open(withReplace: boolean, initialSearchText?: string) {
            if (initialSearchText != undefined && initialSearchText.length > 0) {
                this.searchText = initialSearchText;
            }
            const wasOpened = this.isOpened;
            this.isOpened = true;
            this.isReplaceUnfolded = withReplace;
            this.setOutsideInteractionListened(true);
            this.actionMessage = "";
            this.caretAfterReplacement = null;
            this.isCaretAfterReplacementPreferred = false;
            this.$nextTick(() => {
                // (the editor may have been resized since the popup was moved)
                this.keepWithinEditor();
                this.focusSearchInput();
                if (!wasOpened || initialSearchText) {
                    this.doSearch(true);
                }
            });
        },

        close(restoreEditorFocus: boolean) {
            if (!this.isOpened) {
                return;
            }
            const currentMatch = this.matches[this.currentMatchIndex];
            // The current match can be selected in the editor when it's in a single editable slot
            const currentMatchSlot = (currentMatch && !currentMatch.readOnly && !this.isCaretAfterReplacementPreferred) ? getMatchSingleSlot(currentMatch) : null;
            const caretAfterReplacement = this.caretAfterReplacement;
            this.isOpened = false;
            this.setOutsideInteractionListened(false);
            this.onDragEnd();
            this.clearHighlights();
            window.clearTimeout(this.searchTimeoutHandle);
            this.matches = [];
            this.currentMatchIndex = -1;
            this.caretAfterReplacement = null;
            this.isCaretAfterReplacementPreferred = false;
            if (restoreEditorFocus && currentMatchSlot) {
                // We leave the editor with the current match selected, so the user can carry on from there
                this.$nextTick(() => this.selectInEditor(currentMatchSlot.slotInfos, currentMatchSlot.start, currentMatchSlot.end));
            }
            else if (restoreEditorFocus && caretAfterReplacement) {
                // We leave the editor in the slot of the last replacement, after it, so the user can carry on editing there
                this.$nextTick(() => this.selectInEditor(caretAfterReplacement.slotInfos, caretAfterReplacement.cursorPos, caretAfterReplacement.cursorPos));
            }
        },

        // Folds or unfolds the replace part, moving the focus to the replace field when it's unfolded (and to the search field otherwise)
        toggleReplace() {
            this.isReplaceUnfolded = !this.isReplaceUnfolded;
            this.$nextTick(() => {
                if (this.isReplaceUnfolded) {
                    (this.$refs.replaceInput as HTMLInputElement | undefined)?.focus();
                }
                else {
                    this.focusSearchInput();
                }
            });
        },

        // The rest of Strype remains usable while the popup is opened, but interacting with it closes the popup:
        // we listen (in the capture phase, before anything else reacts) to the mouse down and focus changes outside the popup.
        setOutsideInteractionListened(listened: boolean) {
            ["mousedown", "focusin"].forEach((eventType) => {
                if (listened) {
                    window.addEventListener(eventType, this.onOutsideInteraction, true);
                }
                else {
                    window.removeEventListener(eventType, this.onOutsideInteraction, true);
                }
            });
        },

        onOutsideInteraction(event: Event) {
            const target = event.target;
            if (!(target instanceof Node) || (this.$refs.widget as HTMLElement | undefined)?.contains(target)) {
                return;
            }
            // Using a scrollbar (e.g. the editor's, to look at the code) doesn't close the popup
            if (event instanceof MouseEvent && target instanceof Element && isOnElementScrollbar(target, event)) {
                return;
            }
            // The interaction itself decides where the focus goes, so we don't select the current match in the editor
            this.close(false);
        },

        // The popup can be moved by dragging its header, within the editor's column
        onHeaderMouseDown(event: MouseEvent) {
            const widget = this.$refs.widget as HTMLElement | undefined;
            if (event.button != 0 || !widget || (event.target instanceof Element && event.target.closest("button"))) {
                return;
            }
            // (we don't want to start a text selection, or move the focus out of the inputs)
            event.preventDefault();
            this.dragStart = {mouseX: event.clientX, mouseY: event.clientY, left: widget.offsetLeft, top: widget.offsetTop};
            window.addEventListener("mousemove", this.onDragMove);
            window.addEventListener("mouseup", this.onDragEnd);
        },

        onDragMove(event: MouseEvent) {
            if (this.dragStart) {
                this.setPosition(this.dragStart.left + event.clientX - this.dragStart.mouseX, this.dragStart.top + event.clientY - this.dragStart.mouseY);
            }
        },

        onDragEnd() {
            this.dragStart = null;
            window.removeEventListener("mousemove", this.onDragMove);
            window.removeEventListener("mouseup", this.onDragEnd);
        },

        // Sets the popup's position, keeping it within the editor's column (as long as it fits)
        setPosition(left: number, top: number) {
            const widget = this.$refs.widget as HTMLElement | undefined;
            const container = widget?.offsetParent as HTMLElement | null | undefined;
            if (!widget || !container) {
                return;
            }
            const maxLeft = container.clientWidth - widget.offsetWidth - WIDGET_MARGIN;
            const maxTop = container.clientHeight - widget.offsetHeight - WIDGET_MARGIN;
            this.position = {
                left: Math.max(WIDGET_MARGIN, Math.min(left, maxLeft)),
                top: Math.max(WIDGET_MARGIN, Math.min(top, maxTop)),
            };
        },

        keepWithinEditor() {
            if (this.position) {
                this.setPosition(this.position.left, this.position.top);
            }
        },

        // Puts the editor into edition in a slot, with the [start, end) part of its code selected (the caret is at end)
        selectInEditor(slotInfos: SlotCoreInfos, start: number, end: number) {
            if (this.isPythonExecuting) {
                return;
            }
            const slotElement = document.getElementById(getLabelSlotUID(slotInfos));
            if (!slotElement) {
                return;
            }
            const anchorCursorInfos: SlotCursorInfos = {slotInfos, cursorPos: start};
            const focusCursorInfos: SlotCursorInfos = {slotInfos, cursorPos: end};
            // The DOM focus, when editing, is held by the label's container (see LabelSlot.vue's onGetCaret()), then the slot is notified
            // it gets the caret (which gets the editor into edition), and when that's done, we can set the selection.
            document.getElementById(getFrameLabelSlotsStructureUID(slotInfos.frameId, slotInfos.labelSlotsIndex))?.focus();
            slotElement.dispatchEvent(new Event(CustomEventTypes.editableSlotGotCaret));
            setTimeout(() => {
                setDocumentSelection(anchorCursorInfos, focusCursorInfos);
                this.appStore.setSlotTextCursors(anchorCursorInfos, focusCursorInfos);
            }, 50);
        },

        scheduleSearch(searchChanged: boolean) {
            window.clearTimeout(this.searchTimeoutHandle);
            this.searchTimeoutHandle = window.setTimeout(() => this.doSearch(searchChanged), 100);
        },

        // Searches the editor's code: if the search itself has changed, the current match is the first one from the editor's caret,
        // otherwise (when the code has changed) the first one from the current match.
        doSearch(searchChanged: boolean, anchor?: {labelOrder: number, offset: number}) {
            window.clearTimeout(this.searchTimeoutHandle);
            if (!this.isOpened) {
                return;
            }
            if (searchChanged) {
                this.actionMessage = "";
                this.isCaretAfterReplacementPreferred = false;
            }
            const previousMatch = this.matches[this.currentMatchIndex];
            const regExp = buildSearchRegExp(this.searchText, this.searchOptions);
            if (regExp == null) {
                this.matches = [];
                this.currentMatchIndex = -1;
                this.updateHighlights(false);
                return;
            }
            this.matches = findAllMatches(regExp);
            const startFrom = anchor ?? ((searchChanged || !previousMatch) ? getEditorCaretSearchAnchor() : {labelOrder: previousMatch.labelOrder, offset: previousMatch.start});
            this.currentMatchIndex = this.getFirstMatchIndexFrom(startFrom);
            // We only move the editor to the current match if the search was requested, not if the code changed under us (the user may be typing in the editor)
            this.updateHighlights(searchChanged || anchor != undefined);
        },

        // Gets the index of the first match at or after a position, wrapping around to the first match of the document
        getFirstMatchIndexFrom(position: {labelOrder: number, offset: number}): number {
            if (this.matches.length == 0) {
                return -1;
            }
            const index = this.matches.findIndex((match) => match.labelOrder > position.labelOrder || (match.labelOrder == position.labelOrder && match.start >= position.offset));
            return (index > -1) ? index : 0;
        },

        goToMatch(next: boolean) {
            this.actionMessage = "";
            this.isCaretAfterReplacementPreferred = false;
            if (this.matches.length == 0) {
                this.doSearch(true);
                return;
            }
            // Wrap around in both directions
            this.currentMatchIndex = (this.currentMatchIndex < 0)
                ? 0
                : (this.currentMatchIndex + (next ? 1 : -1) + this.matches.length) % this.matches.length;
            this.updateHighlights(true);
        },

        replaceCurrent() {
            if (!this.canReplace) {
                return;
            }
            const match = this.matches[this.currentMatchIndex];
            if (!match || match.readOnly) {
                // Nothing (that can be changed) is selected: we just go to the next match
                this.goToMatch(true);
                return;
            }
            const stateBeforeChanges = this.appStore.cloneStateForUndo([match.frameId]);
            const positioningBeforeChanges = this.getUndoRedoPositioningAt(match.frameId, match.labelIndex, match.end);
            const nextSearchOffset = replaceMatch(match, this.replaceText);
            if (nextSearchOffset < 0) {
                this.goToMatch(true);
                return;
            }
            // Save the changes for undo/redo (undo [resp. redo] puts the text cursor after the replaced text [resp. the replacement]):
            // this also marks the project as modified
            const positioningAfterChanges = this.getUndoRedoPositioningAt(match.frameId, match.labelIndex, nextSearchOffset);
            this.appStore.saveStateChanges(stateBeforeChanges, {beforeChanges: positioningBeforeChanges, afterChanges: positioningAfterChanges});
            checkCodeErrors([match.frameId]);
            this.caretAfterReplacement = positioningAfterChanges?.lastCriticalSlotCursorInfos ?? null;
            this.isCaretAfterReplacementPreferred = false;
            this.$nextTick(() => {
                // The next match is searched from the end of the replacement (so the replacement itself isn't matched again)
                this.doSearch(false, {labelOrder: match.labelOrder, offset: nextSearchOffset});
                this.actionMessage = "";
            });
        },

        replaceAll() {
            if (!this.canReplace) {
                return;
            }
            const stateBeforeChanges = this.appStore.cloneStateForUndo();
            // Undo [resp. redo] puts the text cursor after the first replaced text [resp. replacement]
            // (the first replacement of a label isn't shifted by the others, but if the label is re-parsed, its position may not be exact)
            const firstMatch = this.matches.find((match) => !match.readOnly);
            const positioningBeforeChanges = (firstMatch) ? this.getUndoRedoPositioningAt(firstMatch.frameId, firstMatch.labelIndex, firstMatch.end) : undefined;
            const {count, frameIds, lastReplacementEnd} = replaceAllMatches(this.matches, this.replaceText);
            if (count > 0) {
                // A single undo/redo step for all the replacements: this also marks the project as modified
                const positioningAfterChanges = (firstMatch) ? this.getUndoRedoPositioningAt(firstMatch.frameId, firstMatch.labelIndex, firstMatch.start + this.replaceText.length) : undefined;
                this.appStore.saveStateChanges(stateBeforeChanges, {beforeChanges: positioningBeforeChanges, afterChanges: positioningAfterChanges});
                checkCodeErrors(frameIds);
                // Closing the popup puts the caret after the last replacement
                const slotAfterLastReplacement = (lastReplacementEnd)
                    ? getMatchSingleSlot({frameId: lastReplacementEnd.frameId, labelIndex: lastReplacementEnd.labelIndex, start: lastReplacementEnd.offset, end: lastReplacementEnd.offset})
                    : null;
                this.caretAfterReplacement = (slotAfterLastReplacement) ? {slotInfos: slotAfterLastReplacement.slotInfos, cursorPos: slotAfterLastReplacement.end} : null;
                this.isCaretAfterReplacementPreferred = true;
            }
            this.$nextTick(() => {
                this.doSearch(false);
                this.actionMessage = this.$t("searchReplace.replacedCount", {count});
            });
        },

        // Gets the position for undo/redo to restore (see the store's saveStateChanges()) to have the text cursor at a position of a label's text,
        // when it is in an editable slot (otherwise, undo/redo restores the default position)
        getUndoRedoPositioningAt(frameId: number, labelIndex: number, offset: number): CriticalActionPositioning | undefined {
            const slot = getMatchSingleSlot({frameId, labelIndex, start: offset, end: offset});
            if (!slot) {
                return undefined;
            }
            // (when editing a slot, the frame caret is in the body of the slot's frame, or below it: see LabelSlot.vue)
            return {
                lastCriticalCaretPosition: {id: frameId, caretPosition: (this.appStore.getAllowedChildren(frameId)) ? CaretPosition.body : CaretPosition.below},
                lastCriticalSlotCursorInfos: {slotInfos: slot.slotInfos, cursorPos: slot.end},
            };
        },

        onKeyDown(event: KeyboardEvent) {
            // All the keys are kept within the widget (the editor mustn't react to them, see the template's ".stop"),
            // apart from a few shortcuts that are relevant in the widget itself.
            const searchReplaceShortcut = getSearchReplaceShortcut(event);
            if (searchReplaceShortcut) {
                // (we also stop the browser's own find)
                event.preventDefault();
                this.isReplaceUnfolded = (searchReplaceShortcut == "replace");
                this.focusSearchInput();
            }
            else if (event.key == "Escape") {
                // We close on the key up (see onKeyUp())
                event.preventDefault();
            }
            else if (event.key == "F3") {
                event.preventDefault();
                this.goToMatch(!event.shiftKey);
            }
        },

        focusSearchInput() {
            const input = this.$refs.searchInput as HTMLInputElement | undefined;
            input?.focus();
            input?.select();
        },

        onKeyUp(event: KeyboardEvent) {
            // Escape closes the widget on the key up rather than the key down: closing gives the focus back to the editor,
            // and the editor would otherwise get the key up, and act on it (e.g. a slot leaves the edition on Escape).
            if (event.key == "Escape") {
                this.close(true);
            }
        },

        onSearchInputKeyDown(event: KeyboardEvent) {
            if (event.key == "Enter") {
                event.preventDefault();
                this.goToMatch(!event.shiftKey);
            }
        },

        onReplaceInputKeyDown(event: KeyboardEvent) {
            if (event.key == "Enter") {
                event.preventDefault();
                if (event.ctrlKey || event.metaKey) {
                    this.replaceAll();
                }
                else {
                    this.replaceCurrent();
                }
            }
        },

        clearHighlights() {
            highlightRegistry?.delete(ALL_MATCHES_HIGHLIGHT);
            highlightRegistry?.delete(CURRENT_MATCH_HIGHLIGHT);
        },

        // Shows the matches in the editor, and if requested, makes sure the current match can be seen
        // (which may require switching between the main code and the testing code, expanding collapsed frames, and scrolling).
        updateHighlights(showCurrentMatch: boolean) {
            const currentMatch = this.matches[this.currentMatchIndex];
            // (the section that isn't showing is still rendered, so we can't rely on the match's elements being found to know if it can be seen)
            if (showCurrentMatch && currentMatch) {
                // Switching the section clears the document's selection, which leaves the popup's field that has the focus (the user may be typing
                // the search) without a text cursor: the browser no longer inserts what is typed. We put the field's text cursor (or selection) back.
                const focusedInput = (document.activeElement instanceof HTMLInputElement && (this.$refs.widget as HTMLElement | undefined)?.contains(document.activeElement))
                    ? document.activeElement : null;
                const inputSelection = (focusedInput) ? {start: focusedInput.selectionStart, end: focusedInput.selectionEnd, direction: focusedInput.selectionDirection} : null;
                if (revealFrameSection(currentMatch.frameId)) {
                    if (focusedInput && inputSelection && inputSelection.start != null && inputSelection.end != null) {
                        focusedInput.focus();
                        focusedInput.setSelectionRange(inputSelection.start, inputSelection.end, inputSelection.direction ?? undefined);
                    }
                    this.$nextTick(() => this.updateHighlights(showCurrentMatch));
                    return;
                }
            }
            if (showCurrentMatch && currentMatch && getMatchDOMRanges(currentMatch) == null && revealFrame(currentMatch.frameId)) {
                // The editor needs to be updated after expanding frames before we can find the match's elements
                this.$nextTick(() => this.updateHighlights(showCurrentMatch));
                return;
            }
            if (highlightRegistry) {
                const HighlightClass = (window as any).Highlight;
                const allRanges = this.matches.filter((match) => match != currentMatch).flatMap((match) => getMatchDOMRanges(match) ?? []);
                highlightRegistry.set(ALL_MATCHES_HIGHLIGHT, new HighlightClass(...allRanges));
                highlightRegistry.set(CURRENT_MATCH_HIGHLIGHT, new HighlightClass(...((currentMatch) ? (getMatchDOMRanges(currentMatch) ?? []) : [])));
            }
            if (showCurrentMatch && currentMatch) {
                const firstRange = getMatchDOMRanges(currentMatch)?.[0];
                const element = (firstRange?.startContainer instanceof Element) ? firstRange.startContainer : firstRange?.startContainer.parentElement;
                if (element && !isFullyInViewport(element)) {
                    element.scrollIntoView({block: "center"});
                }
            }
        },
    },
});
</script>

<style lang="scss">
.search-replace-widget {
    // The look is Bootstrap's popover (classes "popover", "popover-header" and "popover-body"), we only position it over the code,
    // by default at the top right of the editor's column (see App.vue), out of the way of the scrollbar.
    // When the user moves it, the position is set in the element's style (see widgetPositionStyle).
    position: absolute !important;
    top: 8px;
    right: 24px;
    width: 36rem;
    max-width: calc(100% - 16px) !important;
}

.search-replace-header {
    display: flex;
    align-items: center;
    padding: 2px 4px 2px 12px;
    cursor: move;
    user-select: none;
}

.search-replace-title {
    flex-grow: 1;
    font-weight: 600;
}

.search-replace-close-btn {
    cursor: pointer;
}

.search-replace-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.search-replace-row {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
}

.search-replace-spacer {
    flex-grow: 1;
}

// A text input with its buttons on its right: they stay on the same line (the input shrinks if needed)
.search-replace-input-row {
    flex-wrap: nowrap;
}

// (the buttons are thinner than Bootstrap's default, so they're about as high as the inputs)
.search-replace-input-row .search-replace-btn {
    flex-shrink: 0;
    padding: 0 8px;
    line-height: 1.5;
    white-space: nowrap;
}

.search-replace-input {
    flex: 1 1 8rem;
    min-width: 6rem;
    padding: 1px 4px;
    border: 1px solid #a0a0a0;
    border-radius: 2px;
}

.search-replace-input-invalid {
    border-color: #d9534f;
    outline-color: #d9534f;
}

.search-replace-icon-btn {
    min-width: 1.8rem;
    padding: 0 4px;
    border: 1px solid transparent;
    border-radius: 3px;
    background: transparent;
    line-height: 1.5;
}

.search-replace-icon-btn:hover {
    background-color: #dcdcdc;
}

.search-replace-option {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-right: 8px;
    white-space: nowrap;
    cursor: pointer;
}

// The button folding/unfolding the replace part is plain text, with a chevron pointing right (folded) or down (unfolded)
.search-replace-fold-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 4px 0 0;
    border: none;
    background: transparent;
    color: black;
}

.search-replace-fold-chevron {
    display: inline-block;
    transition: transform 0.15s;
}

.search-replace-fold-chevron-unfolded {
    transform: rotate(90deg);
}

.search-replace-replace-part {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.search-replace-status {
    text-align: right;
    white-space: nowrap;
    color: #555555;
}

// Same as the rename identifiers popup's button (see LabelSlotsStructure.vue)
.search-replace-btn .kb-shortcut {
    font-size: 0.7em;
}

// The matches shown in the editor (CSS Custom Highlight API)
::highlight(strype-search-match) {
    background-color: rgba(255, 213, 0, 0.45);
}

::highlight(strype-search-current-match) {
    background-color: rgba(255, 140, 0, 0.75);
}
</style>
