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
import { defineAsyncComponent, defineComponent } from "vue";
import { useStore } from "@/store/store";
import { FrameObject, PythonExecRunningState } from "@/types/types";
import { mapStores } from "pinia";
import { getFrameUID } from "@/helpers/editor";


//////////////////////
//     Component    //
//////////////////////
export default defineComponent({
    name: "JointFrames",

    components: {
        Frame: defineAsyncComponent(() => import("@/components/Frame.vue")), // lazy umport as we have a circular reference with this component.
    },

    props: {
        // NOTE that type declarations here start with a Capital Letter!!! (different to types.ts!)
        jointParentId: {type: Number, required: true}, // Unique Indentifier for each Frame
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
