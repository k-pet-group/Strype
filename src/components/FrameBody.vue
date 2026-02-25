<template>
    <div
        :class="{'frame-body-container frame-container-minheight':true, 'body-deletable': bodyDeletable}"
        :id="UID"
    >
        <div>
            <CaretContainer
            v-if="!isDisabled"
            :ref="getCaretContainerRef"
            :frameId="frameId"
            :caretVisibility="caretVisibility"
            :caretAssignedPosition="caretPosition.body"
            :isFrameDisabled="isDisabled"
            />  
            <div class="frame-container-minheight">      
                <Frame
                    v-for="frame in frames"
                    :ref="setFrameRef(frame.id)"
                    :key="frame.frameType.type  + '-id:' + frame.id"
                    :frameId="frame.id"
                    :isDisabled="frame.isDisabled"
                    :isBeingDragged="isBeingDragged"
                    :frameType="frame.frameType"
                    :isJointFrame="false"
                    :caretVisibility="frame.caretVisibility"
                    :allowChildren="frame.frameType.allowChildren"
                    class="frame content-children"
                />
            </div>
        </div>
    </div>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import { defineComponent } from "vue";
import { useStore } from "@/store/store";
import Frame from "@/components/Frame.vue";
import CaretContainer from "@/components/CaretContainer.vue";
import { AllFrameTypesIdentifier, CaretPosition, FrameObject, PythonExecRunningState } from "@/types/types";
import { mapStores } from "pinia";
import { getCaretContainerRef, getCaretUID, getFrameBodyUID, getFrameUID } from "@/helpers/editor";

//////////////////////
//     Component    //
//////////////////////
export default defineComponent({
    name: "FrameBody",

    components: {
        Frame,
        CaretContainer,
    },
    
    props: {
        frameId: {type: Number, required: true},
        isDisabled: Boolean,
        isBeingDragged: Boolean,
        caretVisibility: String, //Flag indicating this caret is visible or not
    },

    mounted() {
        // Register the caret container component at the upmost level for drag and drop
        this.$root.$refs[getCaretUID(this.caretPosition.body, this.frameId)] = this.$refs[getCaretContainerRef()];
    },

    destroyed() {
        // Remove the registration of the caret container component at the upmost level for drag and drop
        delete this.$root.$refs[getCaretUID(this.caretPosition.body, this.frameId)];
    },

    computed: {
        ...mapStores(useStore),
        
        frames: {
            get(): FrameObject[] {
                // gets the frames objects which are nested in here (i.e. have this frameID as parent)
                return this.appStore.getFramesForParentId(this.frameId);
            },
            set() {
                return;
            },    
        },

        hasDisabledOrCommentFrames(): boolean {
            return (this.frames).filter((frame) => frame.isDisabled || frame.frameType.type === AllFrameTypesIdentifier.comment).length > 0;
        },

        // Needed in order to use the `CaretPosition` type in the v-show
        caretPosition(): typeof CaretPosition {
            return CaretPosition;
        }, 

        isEditing(): boolean {
            return this.appStore.isEditing;
        },

        UID(): string {
            return getFrameBodyUID(this.frameId);
        },

        getCaretContainerRef(): string {
            return getCaretContainerRef();
        },

        bodyDeletable(): boolean{
            // We need to get the body background at the deletable colour only if this frame is deletable
            // and we are not deleting the outer frames
            if(this.appStore.potentialDeleteFrameIds){
                return this.appStore.potentialDeleteFrameIds.includes(this.frameId) 
                    && !this.appStore.potentialDeleteIsOuter; 
            }
            // For compatibility with previous versions of the store
            return false;                       
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

.frame-body-container {
    background-color: $strype-main-code-container-background;
    margin-bottom: 4px;
    margin-top: 4px;
    margin-right: 4px;
    border-color: #000 !important;
    border-radius: 8px;
}
.frame-div[data-frametype="classdef"] > .frame-body-container {
    background-color: rgba(255, 255, 255, 0.35);
}

.body-deletable {
    background-color: transparent !important;
}
</style>
