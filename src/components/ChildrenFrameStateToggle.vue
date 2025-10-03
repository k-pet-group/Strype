<template>
    <div :class="{'fold-children-control': true, 'fold-doc': isFoldDoc, 'fold-header': isFoldHeader, 'fold-full': isFoldFull, 'fold-mixed': isFoldMixed }" @click.prevent.stop="cycleFoldChildren">
        <img class="fold-children-full" src="@/assets/images/quote-circle/quote-circle-container-filled-echoed.png" v-if="isContainer">
        <img class="fold-children-doc" src="@/assets/images/quote-circle/quote-circle-container-echoed.png" v-if="isContainer">
        <img class="fold-children-header" src="@/assets/images/quote-circle/quote-circle-container-empty-echoed.png" v-if="isContainer">
        <img class="fold-children-full" src="@/assets/images/quote-circle/quote-circle-class-filled-echoed.png" v-if="!isContainer">
        <img class="fold-children-doc" src="@/assets/images/quote-circle/quote-circle-class-echoed.png" v-if="!isContainer">
        <img class="fold-children-header" src="@/assets/images/quote-circle/quote-circle-class-empty-echoed.png" v-if="!isContainer">
    </div>
</template>

<script lang="ts">
import Vue from "vue";
import {CollapsedState, FrameObject} from "@/types/types";
import {mapStores} from "pinia";
import {useStore} from "@/store/store";
import {calculateNextCollapseState} from "@/helpers/editor";


export default Vue.extend({
    name: "ChildrenFrameStateToggle",
    
    props: {
        frames: Array,
        isContainer: Boolean,
    },
    
    computed: {
        ...mapStores(useStore),
        
        // If all direct children are in the same collapsed state, return it
        // If they are in a mixture of states, return undefined.
        childrenCollapsedState(): CollapsedState | undefined {
            const states = (this.frames as FrameObject[]).map((f : FrameObject) => f.collapsedState ?? CollapsedState.FULLY_VISIBLE);
            const unique = Array.from(new Set(states));
            if (unique.length == 1) {
                return unique[0];
            }
            else {
                return undefined;
            }
        },

        isFoldDoc(): boolean {
            return this.childrenCollapsedState === CollapsedState.HEADER_AND_DOC_VISIBLE;
        },
        isFoldHeader(): boolean {
            return this.childrenCollapsedState === CollapsedState.ONLY_HEADER_VISIBLE;
        },
        isFoldFull(): boolean {
            return this.childrenCollapsedState === CollapsedState.FULLY_VISIBLE;
        },
        isFoldMixed(): boolean {
            return this.childrenCollapsedState === undefined && this.frames.length > 0;
        },
    },
    
    methods: {
        cycleFoldChildren() {
            let nextState = calculateNextCollapseState(this.childrenCollapsedState, this.frames as FrameObject[]);

            (this.frames as FrameObject[]).forEach((f) => this.appStore.setCollapseStatusContainer({frameId: f.id, collapsed: nextState}));
        },
    },
});
</script>

<style lang="scss">
.fold-children-control {
    margin-left: auto;
    margin-right: 13px;
    margin-bottom: 3px;
    position: relative;
    width: 0.9em;
}
.fold-children-control > img {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 0.9em;
    height: auto;
    max-height: none;
    object-fit: cover;
    opacity: 0;
}
// Note: important the hover is on the folding control not the img, because
// the imgs are on top of each other so only the top one gets hover
.fold-children-control:hover > img {
   filter: brightness(1.25);
}

.fold-children-control.fold-header > img.fold-children-header,
.fold-children-control.fold-doc > img.fold-children-doc,
.fold-children-control.fold-mixed > img.fold-children-full,
.frame-container-header:hover .fold-children-control.fold-full > img.fold-children-full,
.frame-header-div-line:hover .fold-children-control.fold-full > img.fold-children-full {
    opacity: 0.5;
    cursor: pointer;
}
</style>
