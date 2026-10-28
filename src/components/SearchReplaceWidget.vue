<!-- The search and replace widget: a popup over the top of the editor's code (see App.vue), which can be moved (by its header) so the code
     remains visible. Interacting with anything else in Strype (clicking or moving the focus outside the popup) closes it. It uses Bootstrap's popover
     classes to look like the other popups of the editor (e.g. the rename identifiers popup). The search only covers the code of the editor, see helpers/searchReplace.ts. -->
<template>
    <div
        v-if="isOpened"
        :id="widgetId"
        ref="widget"
        class="popover search-replace-widget"
        :style="widgetPositionStyle"
        role="dialog"
        :aria-label="$t('searchReplace.title')"
        @keydown.stop="onKeyDown"
        @keyup.stop="onKeyUp"
        @mousedown.stop
        @contextmenu.stop
    >
        <div class="popover-header search-replace-header" @mousedown="onHeaderMouseDown">
            <span class="search-replace-title">{{ $t("searchReplace.title") }}</span>
            <button type="button" class="search-replace-icon-btn search-replace-close-btn" :title="$t('searchReplace.close')" :aria-label="$t('searchReplace.close')" @click="close(true)">&#10005;</button>
        </div>
        <div class="popover-body search-replace-body">
            <div class="search-replace-row">
                <input
                    :id="searchInputId"
                    ref="searchInput"
                    type="text"
                    class="search-replace-input"
                    :class="{'search-replace-input-invalid': errorMessage.length > 0 || (searchText.length > 0 && matches.length == 0)}"
                    v-model="searchText"
                    :placeholder="$t('searchReplace.find')"
                    :aria-label="$t('searchReplace.find')"
                    spellcheck="false"
                    autocomplete="off"
                    @keydown="onSearchInputKeyDown"
                />
                <button type="button" class="search-replace-icon-btn" :title="$t('searchReplace.previous')" :disabled="matches.length == 0" @click="goToMatch(false)">&#8593;</button>
                <button type="button" class="search-replace-icon-btn" :title="$t('searchReplace.next')" :disabled="matches.length == 0" @click="goToMatch(true)">&#8595;</button>
            </div>
            <div class="search-replace-row">
                <input
                    :id="replaceInputId"
                    ref="replaceInput"
                    type="text"
                    class="search-replace-input"
                    v-model="replaceText"
                    :placeholder="$t('searchReplace.replace')"
                    :aria-label="$t('searchReplace.replace')"
                    spellcheck="false"
                    autocomplete="off"
                    @keydown="onReplaceInputKeyDown"
                />
            </div>
            <div class="search-replace-row">
                <button type="button" :class="{'search-replace-toggle': true, 'search-replace-toggle-on': matchCase}" :title="$t('searchReplace.matchCase')" :aria-pressed="matchCase ? 'true' : 'false'" @click="matchCase = !matchCase">Aa</button>
                <button type="button" :class="{'search-replace-toggle': true, 'search-replace-toggle-on': wholeWord}" :title="$t('searchReplace.wholeWord')" :aria-pressed="wholeWord ? 'true' : 'false'" @click="wholeWord = !wholeWord"><u>ab</u></button>
                <select :id="modeSelectId" v-model="mode" class="search-replace-mode" :title="$t('searchReplace.searchMode')" :aria-label="$t('searchReplace.searchMode')">
                    <option :value="SearchMode.normal">{{ $t("searchReplace.modeNormal") }}</option>
                    <option :value="SearchMode.extended">{{ $t("searchReplace.modeExtended") }}</option>
                    <option :value="SearchMode.regex">{{ $t("searchReplace.modeRegex") }}</option>
                </select>
                <span class="search-replace-spacer"></span>
                <span :id="statusId" class="search-replace-status" :class="{'search-replace-status-error': errorMessage.length > 0}" :title="errorMessage" aria-live="polite">{{ statusText }}</span>
            </div>
            <div class="search-replace-row search-replace-buttons-row">
                <BButton :id="replaceButtonId" variant="primary" class="search-replace-btn" :disabled="!canReplace" @click="replaceCurrent" v-html="replaceButtonLabel"></BButton>
                <BButton :id="replaceAllButtonId" variant="primary" class="search-replace-btn" :disabled="!canReplace" @click="replaceAll" v-html="replaceAllButtonLabel"></BButton>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapStores } from "pinia";
import { useStore } from "@/store/store";
import { PythonExecRunningState, SlotCoreInfos, SlotCursorInfos } from "@/types/types";
import { vueComponentsAPIHandler } from "@/helpers/vueComponentAPI";
import { buildSearchRegExp, findAllMatches, getEditorCaretSearchAnchor, getMatchDOMRanges, getMatchSingleSlot, isSearchReplaceShortcut, replaceAllMatches, replaceMatch, revealFrame, SearchMatch, SearchMode, SearchOptions } from "@/helpers/searchReplace";
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
            mode: SearchMode.normal,
            matchCase: false,
            wholeWord: false,
            matches: [] as SearchMatch[],
            currentMatchIndex: -1,
            errorMessage: "",
            // A message replacing the matches count for a short while after an action (e.g. "5 replaced")
            actionMessage: "",
            SearchMode,
            searchTimeoutHandle: -1,
            // The position of the popup within the editor's column once the user has moved it (null: the default position, at the top right).
            // It's kept when the popup is closed, so it opens again where the user left it.
            position: null as {left: number, top: number} | null,
            dragStart: null as {mouseX: number, mouseY: number, left: number, top: number} | null,
            // Where the caret goes back in the editor when the popup is closed after a replacement (the end of the replacement,
            // when it is in an editable slot), so the user can carry on editing there. Moving to another match, or changing the search, forgets it.
            caretAfterReplacement: null as SlotCursorInfos | null,
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

        modeSelectId(): string {
            return "searchReplaceModeSelect";
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
            return {mode: this.mode, matchCase: this.matchCase, wholeWord: this.wholeWord};
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
            return !this.isPythonExecuting && this.matches.some((match) => !match.readOnly);
        },

        statusText(): string {
            if (this.errorMessage.length > 0) {
                return this.$t("searchReplace.invalidRegex");
            }
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
        // Opens the widget, with the focus in the search field. The search text is the given text (e.g. the text selected in the editor)
        // or, when there is none, the previous search text (empty the first time).
        open(initialSearchText?: string) {
            if (initialSearchText != undefined && initialSearchText.length > 0) {
                this.searchText = initialSearchText;
            }
            const wasOpened = this.isOpened;
            this.isOpened = true;
            this.setOutsideInteractionListened(true);
            this.actionMessage = "";
            this.caretAfterReplacement = null;
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
            const caretAfterReplacement = this.caretAfterReplacement;
            this.isOpened = false;
            this.setOutsideInteractionListened(false);
            this.onDragEnd();
            this.clearHighlights();
            window.clearTimeout(this.searchTimeoutHandle);
            this.matches = [];
            this.currentMatchIndex = -1;
            this.caretAfterReplacement = null;
            if (restoreEditorFocus && caretAfterReplacement) {
                // We leave the editor in the slot of the last replacement, after it, so the user can carry on editing there
                this.$nextTick(() => this.selectInEditor(caretAfterReplacement.slotInfos, caretAfterReplacement.cursorPos, caretAfterReplacement.cursorPos));
            }
            else if (restoreEditorFocus && currentMatch) {
                // We leave the editor with the current match selected (when it's in a single editable slot), so the user can carry on from there
                this.$nextTick(() => this.selectMatchInEditor(currentMatch));
            }
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

        selectMatchInEditor(match: SearchMatch) {
            const singleSlot = getMatchSingleSlot(match);
            if (singleSlot && !match.readOnly) {
                this.selectInEditor(singleSlot.slotInfos, singleSlot.start, singleSlot.end);
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
                this.caretAfterReplacement = null;
            }
            const previousMatch = this.matches[this.currentMatchIndex];
            const regExp = buildSearchRegExp(this.searchText, this.searchOptions);
            this.errorMessage = (regExp != null && !(regExp instanceof RegExp)) ? regExp.error : "";
            if (!(regExp instanceof RegExp)) {
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
            this.caretAfterReplacement = null;
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
            const nextSearchOffset = replaceMatch(match, this.replaceText, this.searchOptions);
            if (nextSearchOffset < 0) {
                this.goToMatch(true);
                return;
            }
            // Save the changes for undo/redo: this also marks the project as modified
            this.appStore.saveStateChanges(stateBeforeChanges);
            checkCodeErrors([match.frameId]);
            const slotAfterReplacement = getMatchSingleSlot({frameId: match.frameId, labelIndex: match.labelIndex, start: nextSearchOffset, end: nextSearchOffset});
            this.caretAfterReplacement = (slotAfterReplacement) ? {slotInfos: slotAfterReplacement.slotInfos, cursorPos: slotAfterReplacement.end} : null;
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
            const {count, frameIds} = replaceAllMatches(this.matches, this.replaceText, this.searchOptions);
            this.caretAfterReplacement = null;
            if (count > 0) {
                // A single undo/redo step for all the replacements: this also marks the project as modified
                this.appStore.saveStateChanges(stateBeforeChanges);
                checkCodeErrors(frameIds);
            }
            this.$nextTick(() => {
                this.doSearch(false);
                this.actionMessage = this.$t("searchReplace.replacedCount", {count});
            });
        },

        onKeyDown(event: KeyboardEvent) {
            // All the keys are kept within the widget (the editor mustn't react to them, see the template's ".stop"),
            // apart from a few shortcuts that are relevant in the widget itself.
            if (isSearchReplaceShortcut(event)) {
                event.preventDefault();
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
        // (which may require expanding collapsed frames, and scrolling).
        updateHighlights(showCurrentMatch: boolean) {
            const currentMatch = this.matches[this.currentMatchIndex];
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
    width: 26rem;
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

.search-replace-buttons-row {
    justify-content: flex-end;
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

.search-replace-toggle, .search-replace-icon-btn {
    min-width: 1.8rem;
    padding: 0 4px;
    border: 1px solid transparent;
    border-radius: 3px;
    background: transparent;
    line-height: 1.5;
}

.search-replace-toggle:hover, .search-replace-icon-btn:hover:not(:disabled) {
    background-color: #dcdcdc;
}

.search-replace-toggle-on {
    border-color: #0d6efd;
    background-color: #d6e6ff;
}

.search-replace-icon-btn:disabled {
    opacity: 0.4;
}

.search-replace-mode {
    padding: 1px 2px;
    border: 1px solid #a0a0a0;
    border-radius: 2px;
    background-color: white;
}

.search-replace-status {
    text-align: right;
    white-space: nowrap;
    color: #555555;
}

.search-replace-status-error {
    color: #d9534f;
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
