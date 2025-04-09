<template>
    <div :class="{'frame-cmd-container': true, disabled: isPythonExecuting || appStore.isDraggingFrame}" @click="onClick">
        <button :class="{'frame-cmd-btn': true, 'frame-cmd-btn-large': isLargerShorcutSymbol}" :disabled="isPythonExecuting || appStore.isDraggingFrame">{{ (!isSVGIconSymbol) ? symbol : '' }}
            <SVGIcon v-if="isSVGIconSymbol" :name="symbol" customClass="add-frame-command-symbol-svg-icon" />
        </button>
        <span>{{ description }}</span>
    </div>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import Vue from "vue";
import { useStore } from "@/store/store";
import { mapStores } from "pinia";
import { findAddCommandFrameType } from "@/helpers/editor";
import { PythonExecRunningState } from "@/types/types";
import SVGIcon from "@/components/SVGIcon.vue";

//////////////////////
//     Component    //
//////////////////////
export default Vue.extend({
    name: "AddFrameCommand",

    components: {
        SVGIcon,
    },

    props: {
        type: String, //Type of the Frame Command
        shortcut: String, //the keyboard shortcut to add the frame 
        symbol: String, //the displayed shortcut in the UI, it can be a symbolic representation or (if specified) a SVGIcon name
        isSVGIconSymbol: Boolean, // if true, the symbol property is the name of a SVGIcon
        description: String, //the description of the frame
        index: Number, //when more than 1 frame is assigned to a shortcut, the index tells which frame definition should be used
    },

    computed: {
        ...mapStores(useStore),

        isLargerShorcutSymbol() {
            return this.symbol.length > 1 && !this.isSVGIconSymbol;
        },

        isPythonExecuting(): boolean {
            return (useStore().pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning;
        },
    },

    methods: {
        onClick(): void {
            //add the frame in the editor if the panel is not disabled
            if(!this.isPythonExecuting) {
                const addFrameCommandType = findAddCommandFrameType(this.shortcut, this.index);
                if(addFrameCommandType != null){
                    this.appStore.addFrameWithCommand(addFrameCommandType);
                }
            }
        },
    },
});
</script>

<style lang="scss">
.frame-cmd-container {
    margin: 2px 5px;
    cursor: pointer;
}

.frame-cmd-container.disabled {
    cursor: default;
    color: rgb(180, 180, 180);
}

.frame-cmd-btn {
    margin-right: 5px;
    cursor: pointer;
    width: 24px;
    background-color: #fefefe;
    border-radius: 4px;
    border: 1px solid #d0d0d0;
}

.frame-cmd-btn-large {
    width: auto;
    font-stretch: 50% !important;
    font-family: 'Inconsolata', sans-serif !important;
}

.frame-cmd-btn:disabled {
    cursor: default;
    color: rgb(180, 180, 180);
}

.add-frame-command-symbol-svg-icon {
    color: black;
    width: 10px;
    height: 12px;
}
</style>
