<template>
    <!-- Drawn rather than a text symbol (✔/✖), so that it is exactly centred whatever font the browser would use for one,
         and is never swapped for a coloured emoji. It takes the text colour. -->
    <svg class="test-outcome-icon" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path v-if="passed" d="M1.2 5.4 L3.9 8 L8.8 2"/>
        <path v-else d="M2 2 L8 8 M8 2 L2 8"/>
    </svg>
</template>

<script lang="ts">
import { defineComponent } from "vue";

// The tick (passed) or cross (failed) shown in the "Pass"/"Fail" badges of the test outcomes,
// in the header of a test function (FrameHeader.vue) and for the overall result (PythonExecutionArea.vue).
export default defineComponent({
    name: "TestOutcomeIcon",

    props: {
        passed: {type: Boolean, required: true},
    },
});
</script>

<style lang="scss" scoped>
.test-outcome-icon {
    width: 1em;
    height: 1em;
}
</style>
