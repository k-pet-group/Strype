<template>
  <svg :class="computedCustomClass" :style="customStyle">
    <use :xlink:href="'#strype-svgicon-'+name" fill="currentColor"></use>
  </svg>
</template>

<script lang="ts">

import Vue, { PropType } from "vue";

/**
 * This SVGIcon component is a helper component to use in place
 * of fontawesome (when we don't find a proper icon), it relies
 * on a SVG containing the different named symbols we need.
 * 
 * The SVG to look for symbols is inserted in index.html (rather
 * than App.vue because we need it to be loaded ASAP).
 */

export default Vue.extend({
    name: "SVGIcon",

    props: {
        name: { type: String, required: true }, // the icon name
        customClass: {type: [String, Object] as PropType<string | Record<string, boolean>>, required: false}, // the custom class to apply to the icon
        customStyle: {type: [String, Object] as PropType<string | Record<string, string>>, required: false}, // the custom style to apply to the icon
    },

    computed: {
        computedCustomClass(): string | Record<string, boolean> {
            // The property "customClass" can be set as a string (of classes) 
            // or as Record<string, boolean>, therefore, we need to adjust the prop
            // so we can use it correctly in our component template.
            // We also add the default component's class here
            const defaultClass = "strype-svg-icon";
            if (typeof this.customClass === "string") {
                return defaultClass + " " + this.customClass;
            }
            else if (typeof this.customClass === "object") {
                return {...{defaultClass: true}, ...this.customClass };
            }
            return defaultClass;          
        },
    },
});
</script>

<style lang="scss">
    // The default style of our SVG icons
    .strype-svg-icon {
        width: 24px;
        height: 24px;
        fill: currentColor; /* Inherits text color */
    }
</style>
