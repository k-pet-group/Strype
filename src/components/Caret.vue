<template>
    <div :class="{[scssVars.invisibleClassName]: isInvisible && !areFramesDraggedOver, disabled: isPythonExecuting, 'caret-drop': areFramesDraggedOver, 'caret-drop-forbidden': areFramesDraggedOver && !areDropFramesAllowed}">
        <!-- The inner content of the caret is reserved for the cross (x) that is displayed during DnD when a location is forbidden for dropping -->
         <span v-if="!isInvisible && areFramesDraggedOver && !areDropFramesAllowed" class="caret-cross-forbidden-dnd caret-cross-forbidden-dnd-arm1"></span>
         <span v-if="!isInvisible && areFramesDraggedOver && !areDropFramesAllowed" class="caret-cross-forbidden-dnd caret-cross-forbidden-dnd-arm2"></span>
         <img  v-if="!isInvisible && areFramesDraggedOver && isDuplicateDnDAction" src="@/assets/images/plus.svg" alt="+" class="caret-plus-dnd">
    </div>
</template>

<script lang="ts">

import Vue from "vue";
import { useStore } from "@/store/store";
import { mapStores } from "pinia";
import { PythonExecRunningState } from "@/types/types";
import scssVars from "@/assets/style/_export.module.scss";

/**
 * Caret is used as a vertical cursor for browsing
 * throughout the code's frames and showing where
 * a frame will be droped when dragged.
 */

export default Vue.extend({
    name: "Caret",

    props: {
        isInvisible: Boolean,
        areFramesDraggedOver: Boolean,
        areDropFramesAllowed: Boolean,
        isDuplicateDnDAction: Boolean,
    },

    computed: {
        ...mapStores(useStore),

        isPythonExecuting(): boolean {
            return (this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning;
        },

        scssVars() {
            // just to be able to use in template
            return scssVars;
        },
    },
});
</script>

<style lang="scss">
.#{$strype-classname-caret} {
    width: $caret-width;
    background-color: #3467FE;
    border-radius: 6px;
    height: $caret-height-value + px;
    position: relative;
}

.#{$strype-classname-caret}.disabled {
    background-color: #b8bac0;
}

.caret-drop {
    background-color: #BB33FF !important;
}

.caret-drop-forbidden {
    background-color: #979799 !important;
}

.caret-cross-forbidden-dnd {
    display: block;
    width: 2px;
    height: $strype-frame-caret-forbidden-dnd-cross-height-notransform-value + px;
    background: red;
    position: absolute;
    z-index: 20;
}

.caret-cross-forbidden-dnd-arm1 {
    transform: translateY(calc((-#{$strype-frame-caret-forbidden-dnd-cross-height-notransform-value}px + #{$caret-height-value}px) / 2)) rotate(-45deg) ;
    left: 50%;
}

.caret-cross-forbidden-dnd-arm2 {
    transform: translateY(calc((-#{$strype-frame-caret-forbidden-dnd-cross-height-notransform-value}px + #{$caret-height-value}px) / 2)) rotate(45deg);
    left: 50%;
}

// Top position based on image size of 15*15
.caret-plus-dnd {
    position: relative;
    left: calc(#{$caret-width} + 1px);
    top: calc(-#{$caret-height-value}px - (15px / 2));
}

.#{$strype-classname-invisible} {
    background-color: transparent !important;
    height: 0px;
}
</style>
