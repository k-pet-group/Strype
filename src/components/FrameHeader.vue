<template>
    <div tabindex="-1" @focus="onFocus(true)" @blur="onFocus(false)" style="outline: none;">
        <div class="frame-header-div">
            <div
                class="next-to-eachother label-slots-struct-wrapper"
                v-for="(item, index) in labels"
                :key="item.label + frameId"
            >
                <!-- the class isn't set on the parent div so the size of hidden editable slots can still be evaluated correctly -->
                <div 
                    style="font-weight: 600;"
                    :class="{['next-to-eachother ' + scssVars.framePythonTokenClassName]: true, hidden: isLabelHidden(item), leftMargin: index > 0, rightMargin: (item.label.length > 0), [scssVars.frameColouredLabelClassName]: !isCommentFrame}"
                    v-html="item.label"
                >
                </div>
                <LabelSlotsStructure 
                    v-if="areSlotsShown(item)"
                    :isDisabled="isDisabled"
                    :default-text="item.defaultText"
                    :frameId="frameId"
                    :labelIndex="index"
                />
            </div>
        </div>
        <i v-if="wasLastRuntimeError" :class="{'fas fa-exclamation-triangle fa-xs runtime-err-icon': true, 'runtime-past-err-icon': !erroneous}"></i>
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
.frame-header-div {
    display: flex;
    width: 100%;
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
    color:#d66;
}

.runtime-past-err-icon {
    color:#706e6e;
}
</style>
