<template>
    <!-- @mousedown must be kept to avoid the click to move the focus from input text field -->
    <li
        v-show="item || itemHTML"
        :class="{[scssVars.acItemClassName]: true, [scssVars.acItemSelectedClassName]: selected, 'ac-indent-wrapped': indentWrapped}"
        :id="id"
        :data-item="item"
        @mouseover="onHover"
        @mousedown.prevent.stop
        @mouseup.self="$emit('acItemClicked',id)"
    >
        <!-- One or the other: -->
        <span v-if="itemHTML" v-html="itemHTML" @mousedown.prevent.stop @mouseup.self="$emit('acItemClicked',id)"></span>
        <span v-else @mousedown.prevent.stop @mouseup.self="$emit('acItemClicked',id)">{{ item }}</span>
        <span v-if="version > 1" class="api-item-version ac-item-version" :title="$t('apidiscovery.v2InfoMsg')">v{{version}}</span>
    </li>
</template>

<script lang="ts">
//////////////////////
import { CustomEventTypes } from "@/helpers/editor";
import Vue from "vue";
import scssVars from "@/assets/style/_export.module.scss";
//////////////////////

export default Vue.extend({
    name: "PopUpItem",

    props: {
        item: String,
        itemHTML: {
            type: String,
            default: "",
        },
        id: String,
        index: Number,
        selected: Boolean,
        isSelectable: Boolean,
        indentWrapped: Boolean,
        version: Number,
    },

    data: function () {
        return {
            scssVars, // just to be able to use in template
        };
    },

    methods: {
        onHover(): void {
            // The a/c context menu isn't exactly a context menu, it can't have focus as focus needs to be kept on the code slot,
            // so we do not use the same mechanism than the context menu to handle hovering/selecting styling.
            if(this.index !== undefined){
                this.$emit(CustomEventTypes.acItemHovered, this.index);
            }
        },
    },
});
</script>

<style lang="scss">
.newlines {
    //Nedded for understanding the formated errors that split multiple
    // lines with \n
    white-space: pre-line !important;
}

// Style related to the context menu are in App.vue

// Indent lines after the first:
.ac-indent-wrapped {
    padding-left: 20px !important;
    text-indent: -15px;
}

.ac-item-version {
    float: none !important;
}
</style>

