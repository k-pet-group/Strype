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
                    :class="{['frame-header-label frame-header-label-' + frameType + ' next-to-eachother ' + scssVars.framePythonTokenClassName]: true, hidden: isLabelHidden(item), leftMargin: originalIndex > 0, rightMargin: (item.label.length > 0 && !item.appendSelfWhenInClass), [scssVars.frameColouredLabelClassName]: !isCommentFrame}"
                    v-html="item.label"
                >
                </div>
                <LabelSlotsStructure 
                    v-if="areSlotsShown(item)"
                    :isDisabled="isDisabled"
                    :isFrozen="isFrozenOrChildOfFrozen"
                    :default-text="item.defaultText"
                    :frameId="frameId"
                    :labelIndex="originalIndex"
                    :prependSelfWhenInClass="item.appendSelfWhenInClass"
                    @[CustomEventTypes.notifyLabelSlotInError]="onLabelSlotContainsError"
                />
                <!-- ^^ Note: append to frame label is same as prepend to slot -->
            </div>
            <div class="frame-controls-container">
                <div ref="frozenControl" :class="{'frozen-control': true, 'frozen': isFrozen}" v-if="groupIndex == 0">
                    <img class="frozen-frozen" src="@/assets/images/snowflake.svg" v-if="isFrozen">
                </div>
                <div ref="foldingControl" :class="{'folding-control': true, 'fold-doc': isFoldDoc, 'fold-header': isFoldHeader, 'fold-full': isFoldFull }" @click.stop.prevent="cycleFold" v-if="canCycleFold && groupIndex == 0">
                    <img class="folding-header" src="@/assets/images/quote-circle/quote-circle-funcdef-empty.png" v-if="isFuncDef && !isModifierHeldOnSelection">
                    <img class="folding-doc" src="@/assets/images/quote-circle/quote-circle-funcdef.png" v-if="isFuncDef && !isModifierHeldOnSelection">
                    <img class="folding-full" src="@/assets/images/quote-circle/quote-circle-funcdef-filled.png" v-if="isFuncDef && !isModifierHeldOnSelection">
                    <img class="folding-header" src="@/assets/images/quote-circle/quote-circle-class-empty.png" v-if="isClassDef && !isModifierHeldOnSelection">
                    <img class="folding-doc" src="@/assets/images/quote-circle/quote-circle-class.png" v-if="isClassDef && !isModifierHeldOnSelection">
                    <img class="folding-full" src="@/assets/images/quote-circle/quote-circle-class-filled.png" v-if="isClassDef && !isModifierHeldOnSelection">
                    <img class="folding-full" src="@/assets/images/quote-circle/quote-circle-container-filled-echoed.png" v-if="isFuncDef && isModifierHeldOnSelection">
                    <img class="folding-doc" src="@/assets/images/quote-circle/quote-circle-container-echoed.png" v-if="isFuncDef && isModifierHeldOnSelection">
                    <img class="folding-header" src="@/assets/images/quote-circle/quote-circle-container-empty-echoed.png" v-if="isFuncDef && isModifierHeldOnSelection">
                    <img class="folding-full" src="@/assets/images/quote-circle/quote-circle-class-filled-echoed.png" v-if="isClassDef && isModifierHeldOnSelection">
                    <img class="folding-doc" src="@/assets/images/quote-circle/quote-circle-class-echoed.png" v-if="isClassDef && isModifierHeldOnSelection">
                    <img class="folding-header" src="@/assets/images/quote-circle/quote-circle-class-empty-echoed.png" v-if="isClassDef && isModifierHeldOnSelection">
                </div>
            </div>
            <ChildrenFrameStateToggle v-if="isClassDef && isFoldFull && groupIndex === splitLabels.length - 1" :frames="children" :parentIsFrozen="isFrozen"/>
            <i v-if="(wasLastRuntimeError || hasErroneousSlot) && groupIndex == splitLabels.length - 1" :class="{'fas fa-exclamation-triangle fa-xs err-icon': true, 'runtime-past-err-icon': (!erroneous && !hasErroneousSlot)}"></i>            
        </div>
    </div>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import { defineComponent, PropType } from "vue";
import LabelSlotsStructure from "@/components/LabelSlotsStructure.vue";
import {useStore} from "@/store/store";
import {AllFrameTypesIdentifier, CollapsedState, FrameLabel, FrameObject, FrozenState} from "@/types/types";
import {mapStores} from "pinia";
import scssVars from "@/assets/style/_export.module.scss";
import ChildrenFrameStateToggle from "@/components/ChildrenFrameStateToggle.vue";
import { isMacOSPlatform } from "@/helpers/common";
import { calculateNextCollapseState } from "@/helpers/storeMethods";
import { CustomEventTypes } from "@/helpers/editor";

// Splits into a list of lists (each outer list is a line, with 1 or more items on it)
// by looking at the newLine flag in the FrameLabel.
// If the collapsed state is header only, only the first line is returned
function splitAtNewLines(labels : FrameLabel[], state: CollapsedState) : {item: FrameLabel, originalIndex: number}[][] {
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
    if (state == CollapsedState.ONLY_HEADER_VISIBLE) {
        // Only keep the first item:
        result.length = Math.min(result.length, 1);
    }
    return result;
}

//////////////////////
//     Component    //
//////////////////////
export default defineComponent({
    name: "FrameHeader",

    components: {
        ChildrenFrameStateToggle,
        LabelSlotsStructure,
    },

    props: {
        // We need an array of labels in the case there are more
        // than a label in the frame (e.g. `with` ... `as ... ) 
        labels: {
            type: Array as PropType<FrameLabel[]>,
            required: true,
        },
        frameId: {type: Number, required: true},
        frameType: {type: String, required: true},
        isDisabled: Boolean,
        frameAllowChildren: Boolean,
        frameCollapsedState: Number, // Index in the enum CollapsedState
        frameFrozenState: Number,  // Index in the enum FrozenState
        frameAllowedCollapsedStates: {type: Array as PropType<CollapsedState[]>, required: true},
        frameAllowedFrozenStates: {type: Array as PropType<FrozenState[]>},
        erroneous: Boolean,
        wasLastRuntimeError: Boolean,
        onFocus: {type: Function, required: true}, // Handler for focus/blur the header (see Frame.vue)
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
        
        splitLabels(): { item: FrameLabel, originalIndex: number }[][] {
            return splitAtNewLines(this.labels as FrameLabel[], this.frameCollapsedState as CollapsedState);
        },
        
        canCycleFold(): boolean {
            return this.frameAllowedCollapsedStates.length > 1;
        },
        
        isFuncDef(): boolean {
            return this.frameType===AllFrameTypesIdentifier.funcdef;
        },

        isClassDef(): boolean {
            return this.frameType===AllFrameTypesIdentifier.classdef;
        },
        
        isFoldDoc(): boolean {
            return (this.frameCollapsedState as CollapsedState) == CollapsedState.HEADER_AND_DOC_VISIBLE;
        },

        isFoldHeader(): boolean {
            return (this.frameCollapsedState as CollapsedState) == CollapsedState.ONLY_HEADER_VISIBLE;
        },

        isFoldFull(): boolean {
            return (this.frameCollapsedState as CollapsedState) == CollapsedState.FULLY_VISIBLE;
        },
        
        isFrozen(): boolean {
            return (this.frameFrozenState as FrozenState) == FrozenState.FROZEN;
        },

        isFrozenOrChildOfFrozen(): boolean {
            return this.appStore.isEffectivelyFrozen(this.frameId);
        },
        
        isModifierHeldOnSelection(): boolean | undefined {
            return this.appStore.selectedFrames.includes(this.frameId) && (isMacOSPlatform() ? this.appStore.keyModifierStates?.meta : this.appStore.keyModifierStates?.ctrl);
        },

        children: {
            get(): FrameObject[] {
                // gets the frames objects which are nested in here (i.e. have this frameID as parent)
                return this.appStore.getFramesForParentId(this.frameId);
            },
            set() {
                return;
            },
        },
    },

    data(){
        return {
            CustomEventTypes, // just to be able to use in template
            hasErroneousSlot: false,
        };
    },

    methods:{
        isLabelHidden(labelDetails: FrameLabel): boolean {
            return !(labelDetails.showLabel??true);
        },

        areSlotsShown(labelDetails: FrameLabel): boolean {
            return labelDetails.showSlots??true;
        },

        cycleFold(): void {
            if (this.isModifierHeldOnSelection) {
                const selected = this.appStore.selectedFrames.map((id) => this.appStore.frameObjects[id]);
                const nextStates = calculateNextCollapseState(selected, this.appStore.frameObjects[this.appStore.frameObjects[this.frameId].parentId].frozenState == FrozenState.FROZEN);
                this.appStore.setCollapseStatuses(nextStates.individual);
            }
            else {
                // Just cycle this frame:
                this.appStore.cycleFrameCollapsedState(this.frameId);
            }
        },

        onLabelSlotContainsError(): void {            
            this.hasErroneousSlot = true;
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

.err-icon {
    margin: 7px 2px 0px 2px;
    margin-left: auto;
    color:#d66;
}
.runtime-past-err-icon {
    color:#706e6e;
}
.frame-header-label-projectDocumentation > img, .frame-header-label-funcdef > img, .frame-header-label-classdef > img {
    height: 0.9em;
    margin-top: 0.3em;
}

.frame-controls-container {
    margin-left: auto; /* pushes the group to the right */
    display: flex;
    gap: 7px; /* space between icons */
    margin-right: 7px;
    margin-top: 0px;
    align-items: center;
    height: 1.5rem;
}

.folding-control, .frozen-control {
    position: relative;
    overflow: visible;
    width: 0.9em;
    height: 0.9em;
    cursor: pointer;
}
.folding-control > img, .frozen-control > img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: auto;
    max-height: none;
    object-fit: cover;
    opacity: 0;
}
// Note: important the hover is on the folding control not the img, because
// the imgs are on top of each other so only the top one gets hover
.folding-control:hover > img, .frozen-control:hover > img {
    filter: brightness(1.25);
}
.folding-control.fold-header > img.folding-header,
.folding-control.fold-doc > img.folding-doc,
.frame-div:hover > .frame-header .folding-control.fold-full > img.folding-full {
    opacity: 0.5;
}
.frozen-control.frozen > img.frozen-frozen {
    opacity: 1;
}
.frame-div:hover:has(.caret-container:hover) > .frame-header .folding-control.fold-full > img.folding-full,
.frame-div:hover:has(.frame-div:hover) > .frame-header .folding-control.fold-full > img.folding-full{
    opacity: 0;
}
</style>
