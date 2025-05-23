<template>
    <div class="joint-frames">
        <Frame
            v-for="frame in jointFrames"
            :ref="setFrameRef(frame.id)"
            :key="frame.frameType.type + '-id:' + frame.id"
            :frameId="frame.id"
            :isDisabled="frame.isDisabled || isDisabled"
            :isBeingDragged="isBeingDragged"
            :frameType="frame.frameType"
            :isJointFrame="true"
            :isParentSelected="isParentSelected"
            :allowChildren="frame.frameType.allowChildren"
            :caretVisibility="frame.caretVisibility"
        />
    </div>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import Vue from "vue";
import { useStore } from "@/store/store";
import Frame from "@/components/Frame.vue";
import { FrameObject, PythonExecRunningState } from "@/types/types";
import { mapStores } from "pinia";
import { getFrameUID } from "@/helpers/editor";


//////////////////////
//     Component    //
//////////////////////
export default Vue.extend({
    name: "JointFrames",

    components: {
        Frame,
    },

    props: {
        // NOTE that type declarations here start with a Capital Letter!!! (different to types.ts!)
        jointParentId: Number, // Unique Indentifier for each Frame
        isDisabled: Boolean,
        isBeingDragged: Boolean,
        isParentSelected: Boolean,
    },

    computed: {
        ...mapStores(useStore),
        
        jointFrames: {
            get(): FrameObject[]  {
                return this.appStore.getJointFramesForFrameId(this.jointParentId);
            },
            set() {
                return;
            },    
        },

        isEditing(): boolean {
            return this.appStore.isEditing;
        },

        isPythonExecuting(): boolean {
            return (this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning;
        },
    },

    methods: {
        setFrameRef(frameId: number) {
            return getFrameUID(frameId);
        },
    },
});
</script>

<style lang="scss">
.content-children {
    margin-left: 0px;
}
</style>
