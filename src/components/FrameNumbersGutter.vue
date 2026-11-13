<template>
    <div class="frame-numbers-gutter" v-if="isGutterMode">
        <span
            v-for="frameId in numberedFrameIds"
            v-show="offsets[frameId] !== undefined"
            :key="frameId"
            :class="{'frame-number-gutter-item': true, 'frame-number-selected': appStore.isFrameSelected(frameId)}"
            :style="{top: (offsets[frameId] ?? 0) + 'px'}"
        >{{ appStore.getFrameVisualNumbers[frameId] }}</span>
    </div>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import { defineComponent } from "vue";
import { mapStores } from "pinia";
import { settingsStore, useStore } from "@/store/store";
import { getFrameHeaderUID } from "@/helpers/editor";
import scssVars from "@/assets/style/_export.module.scss";

//////////////////////
//     Component    //
//////////////////////
// Renders frame numbers in a single vertical column pinned to the left edge of the editor pane,
// regardless of how deeply each numbered frame is nested. Since the numbers must stay visually
// aligned with their frame's header row despite that row being nested arbitrarily deep (and thus
// not sharing a common left edge with the gutter), we can't achieve this with pure CSS margins:
// instead we measure each header's actual position and position each number to match,
// re-measuring whenever the editor's layout could have changed.
export default defineComponent({
    name: "FrameNumbersGutter",

    data() {
        return {
            offsets: {} as Record<number, number>,
            resizeObserver: null as ResizeObserver | null,
            mutationObserver: null as MutationObserver | null,
            recomputeScheduled: false,
        };
    },

    computed: {
        ...mapStores(useStore, settingsStore),

        isGutterMode(): boolean {
            return this.settingsStore.frameNumbersEnabled;
        },

        numberedFrameIds(): number[] {
            return Object.keys(this.appStore.getFrameVisualNumbers).map(Number);
        },
    },

    watch: {
        isGutterMode: {
            immediate: true,
            handler(isGutter: boolean) {
                if (isGutter) {
                    this.$nextTick(() => this.setupObservers());
                }
                else {
                    this.teardownObservers();
                }
            },
        },

        numberedFrameIds() {
            this.scheduleRecompute();
        },
    },

    beforeUnmount() {
        this.teardownObservers();
    },

    methods: {
        setupObservers(): void {
            this.teardownObservers();
            const editorDiv = this.getEditorCodeDiv();
            if (!editorDiv) {
                return;
            }

            // Catches font/viewport-driven reflow (e.g. window resize changing where labels wrap).
            this.resizeObserver = new ResizeObserver(() => this.scheduleRecompute());
            this.resizeObserver.observe(editorDiv);

            // Catches frame add/remove/fold/edit (and, relevant to "floating" mode, the frame
            // cursor moving, which toggles the "invisible" class of caret elements), any of which
            // can shift where frames sit.
            this.mutationObserver = new MutationObserver(() => this.scheduleRecompute());
            this.mutationObserver.observe(editorDiv, {childList: true, subtree: true, attributes: true, characterData: true});

            this.scheduleRecompute();
        },

        teardownObservers(): void {
            this.resizeObserver?.disconnect();
            this.resizeObserver = null;
            this.mutationObserver?.disconnect();
            this.mutationObserver = null;
        },

        getEditorCodeDiv(): HTMLElement | null {
            return (this.$el as HTMLElement)?.closest?.(".editor-code-div") ?? null;
        },

        scheduleRecompute(): void {
            if (this.recomputeScheduled || !this.isGutterMode) {
                return;
            }
            this.recomputeScheduled = true;
            requestAnimationFrame(() => {
                this.recomputeScheduled = false;
                this.recomputeOffsets();
            });
        },

        // The frame cursor ("caret") between two frames normally occupies zero height, and only
        // grows to its visible height at the one position it currently sits at. That means moving
        // it shifts every frame between the old and new position by the caret's height, which in
        // turn would shift any gutter number measured naively from the frames' live positions.
        // Fully cancelling that (subtracting the full caret height from anything below it, as if
        // the caret were always collapsed) keeps numbers below from jittering as the cursor moves,
        // but leaves them a full caret-height out of line with their actual header row, while
        // numbers above the caret -- untouched -- stay perfectly aligned. Splitting the correction
        // in half instead (half a caret-height off below, half a caret-height off above, in
        // opposite directions) spreads that same misalignment evenly across both sides.
        getActiveCaretTopAndHeight(): {top: number, height: number} | null {
            const expandedCarets = document.querySelectorAll(`.${scssVars.caretClassName}:not(.${scssVars.invisibleClassName})`);
            if (expandedCarets.length !== 1) {
                // Either no caret is currently expanded (e.g. while editing a slot's text), or more
                // than one is (e.g. during drag-and-drop) -- in both cases we can't sensibly correct.
                return null;
            }
            const rect = (expandedCarets[0] as HTMLElement).getBoundingClientRect();
            return {top: rect.top, height: rect.height};
        },

        recomputeOffsets(): void {
            const editorDiv = this.getEditorCodeDiv();
            if (!editorDiv) {
                return;
            }
            const editorRect = editorDiv.getBoundingClientRect();
            const activeCaret = this.getActiveCaretTopAndHeight();
            const newOffsets: Record<number, number> = {};
            this.numberedFrameIds.forEach((frameId) => {
                const headerEl = document.getElementById(getFrameHeaderUID(frameId));
                // A frame in the section that is not currently showing (main code vs testing) has no layout:
                if (headerEl && headerEl.getClientRects().length > 0) {
                    const rect = headerEl.getBoundingClientRect();
                    const halfCaretHeight = (activeCaret?.height ?? 0) / 2;
                    const correctedTop = !activeCaret ? rect.top :
                        (rect.top > activeCaret.top) ? rect.top - halfCaretHeight : rect.top + halfCaretHeight;
                    // The extra -1 nudges the number up slightly so it looks better balanced
                    // against the line it's numbering, rather than sitting low against it.
                    newOffsets[frameId] = Math.round(correctedTop - editorRect.top + editorDiv.scrollTop) - 1;
                }
            });
            this.offsets = newOffsets;
        },
    },
});
</script>

<style lang="scss">
.frame-numbers-gutter {
    position: absolute;
    left: 2px;
    top: 0;
    width: 20px;
    height: 100%;
    pointer-events: none;
}

.frame-number-gutter-item {
    position: absolute;
    left: 0;
    width: 20px;
    line-height: 1.5rem;
    text-align: right;
    font-size: 0.75em;
    font-family: "Atkinson Hyperlegible Mono", monospace;
    opacity: 0.6;
    user-select: none;
}

.frame-number-gutter-item.frame-number-selected {
    font-weight: 700;
    opacity: 1;
}
</style>
