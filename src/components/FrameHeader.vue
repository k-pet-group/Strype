<template>
    <div tabindex="-1" @focus="onFocus(true)" @blur="onFocus(false)" :style="'outline: none;' + (frameType == projectDocFrameType ? 'padding:10px;' : '')">
        <div :class="'frame-header-div-line' + (groupIndex > 0 ? ' frame-header-later-line' : '')"
             v-for="(group, groupIndex) in splitLabels"
             :key="groupIndex">
            <div
                :class="'next-to-eachother label-slots-struct-wrapper' + (item.label=='\'\'\'' ? ' magicdoc' : '')"
                v-for="({ item, originalIndex }) in group"
                :key="originalIndex"
            >
                <!-- the class isn't set on the parent div so the size of hidden editable slots can still be evaluated correctly -->
                <div 
                    style="font-weight: 600;"
                    :class="{['frame-header-label frame-header-label-' + frameType + ' next-to-eachother ' + scssVars.framePythonTokenClassName]: true, hidden: isLabelHidden(item), leftMargin: originalIndex > 0, rightMargin: (item.label.length > 0), [scssVars.frameColouredLabelClassName]: !isCommentFrame}"
                    v-html="item.label"
                >
                </div>
                <LabelSlotsStructure 
                    v-if="areSlotsShown(item)"
                    :isDisabled="isDisabled"
                    :default-text="item.defaultText"
                    :frameId="frameId"
                    :labelIndex="originalIndex"
                />
            </div>
            <i v-if="wasLastRuntimeError && groupIndex == splitLabels.length - 1" :class="{'fas fa-exclamation-triangle fa-xs runtime-err-icon': true, 'runtime-past-err-icon': !erroneous}"></i>
        </div>
    </div>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import Vue from "vue";
import LabelSlotsStructure from "@/components/LabelSlotsStructure.vue";
import { useStore } from "@/store/store";
import {AllFrameTypesIdentifier, FrameLabel} from "@/types/types";
import { mapStores } from "pinia";
import scssVars from "@/assets/style/_export.module.scss";

// Splits into a list of lists (each outer list is a line, with 1 or more items on it)
// by looking at the newLine flag in the FrameLabel.
function splitAtNewLines(labels : FrameLabel[]) : {item: FrameLabel, originalIndex: number}[][] {
    const result : {item: FrameLabel, originalIndex: number}[][] = [];
    let currentGroup : {item: FrameLabel, originalIndex: number}[] = [];
    labels.forEach((item, index) => {
        if (item.newLine && currentGroup.length > 0) {
            result.push(currentGroup);
            currentGroup = [];
        }
        currentGroup.push({ item, originalIndex: index });
    });
    if (currentGroup.length > 0) {
        result.push(currentGroup);
    }
    return result;
}

//////////////////////
//     Component    //
//////////////////////
export default Vue.extend({
    name: "FrameHeader",

    components: {
        LabelSlotsStructure,
    },

    props: {
        // We need an array of labels in the case there are more
        // than a label in the frame (e.g. `with` ... `as ... ) 
        labels: Array,
        frameId: Number,
        frameType: String,
        isDisabled: Boolean,
        frameAllowChildren: Boolean,
        erroneous: Boolean,
        wasLastRuntimeError: Boolean,
        onFocus: Function, // Handler for focus/blur the header (see Frame.vue)
    },

    computed:{
        ...mapStores(useStore),
        
        isCommentFrame(): boolean{
            return this.frameType===AllFrameTypesIdentifier.comment;
        },

        scssVars() {
            // just to be able to use in template
            return scssVars;
        },

        projectDocFrameType() {
            return AllFrameTypesIdentifier.projectDocumentation;
        },
        
        splitLabels() {
            return splitAtNewLines(this.labels as FrameLabel[]);
        },
    },

    methods:{
        isLabelHidden(labelDetails: FrameLabel): boolean {
            return !(labelDetails.showLabel??true);
        },

        areSlotsShown(labelDetails: FrameLabel): boolean {
            return labelDetails.showSlots??true;
        },
    },
});
</script>

<style lang="scss">
.frame-header-div-line {
    display: flex;
    width: 100%;
}
.frame-header-later-line {
    margin-left: 30px;
    margin-right: 28px;
    margin-bottom: 10px;
    width: auto !important;
}

.#{$strype-classname-frame-python-token} {
    margin-top: 1px; // to align the keyword with the slots (that has 1 px border)
}

.next-to-eachother {
    display: flex;
}

.label-slots-struct-wrapper  {
    max-width:100%;
    flex-wrap: nowrap;
}

.hidden {
    display: none !important;
}

.leftMargin {
    margin-left: 4px;
}

.rightMargin {
    margin-right: 4px;
}

.#{$strype-classname-frame-coloured-label} {
    color: rgb(2, 33, 168);
}

.runtime-err-icon {
    margin: 7px 2px 0px 2px;
    margin-left: auto;
    color:#d66;
}

.runtime-past-err-icon {
    color:#706e6e;
}
.frame-header-label:has(svg) {
    display: flex;
    align-items: center;
    justify-content: center; /* optional */
}
.frame-header-label-projectDocumentation > img, .frame-header-label-funcdef > img {
    height: 0.9em;
    align-self: center;
}
</style>
