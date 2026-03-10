<template>
    <div :id="tutorialPanelUID" v-if="steps && steps.length" class="tutorial-steps-panel container-fluid rounded p-4 shadow gap-2">
        <div class="tutorial-steps-header">
            <div class="tutorial-steps-progress">
                <span>{{ currentIndex + 1 }} / {{ steps.length }}</span>
            </div>
        </div>
        <div class="tutorial-step-list">
            <button class="tutorial-steps-list-btn rounded-circle d-inline-flex align-items-center justify-content-center p-0 m-1 w-4 h-4"
                v-for="(s, i) in steps"
                :key="i"
                :class="{ active: i === currentIndex }"
                @click="goTo(i)">
                {{ i + 1 }}
            </button>
        </div>
        <div class="tutorial-step-body">
            <div class="tutorial-step-title bold">{{ currentStep.title }}</div>
            <div class="tutorial-step-desc" v-html="currentStep.description"></div>
        </div>
        <div class="tutorial-nav">
            <button type="button" @click="prevStep" :disabled="currentIndex <= 0">Prev</button>
            <button type="button" @click="nextStep" :disabled="currentIndex >= steps.length - 1">Next</button>
        </div>
    </div>
</template>

<script lang="ts">
import App from "@/App.vue";
import Vue from "vue";
import { mapStores } from "pinia";
import { useStore } from "@/store/store";
import * as yaml from "js-yaml";
import { getTutorialPanelUID } from "@/helpers/editor";

type TutorialStep = {
    title: string;
    description: string;
    stencil: string;
};
export default Vue.extend({
    name: "TutorialSteps",
    computed: {
        ...mapStores(useStore),

        tutorialRaw(): string {
            return this.appStore.tutorialRaw ?? "";
        },

        steps(): TutorialStep[] {
            if (!this.tutorialRaw) {
                return [];
            }

            try {
                const parsed: any = yaml.load(this.tutorialRaw) as any;
                if (parsed && Array.isArray(parsed.steps)) {
                    return parsed.steps as TutorialStep[];
                }

                if (Array.isArray(parsed)) {
                    return parsed as TutorialStep[];
                }
            }
            catch (e) {
                // ignore parse errors
            }

            return [];
        },

        currentStep(): TutorialStep {
            return this.steps[this.currentIndex] ?? { title: "", description: "", stencil: "" };
        },

        tutorialPanelUID(): string {
            return getTutorialPanelUID();
        },
    },

    data() {
        return {
            currentIndex: 0,
        } as { currentIndex: number };
    },


    watch: {
        steps(): void {
            this.currentIndex = 0;
        },
        currentIndex(): void {
            // Apply stencil when curent step index has changed
            this.applyStencilForCurrentStep();
        },
    },

    mounted() {
        // Apply stencil for the initial step when initially loading tutorial
        this.applyStencilForCurrentStep();
    },

    methods: {
        prevStep(): void {
            if (this.currentIndex > 0) {
                this.currentIndex -= 1;
            }
        },

        nextStep(): void {
            if (this.currentIndex < this.steps.length - 1) {
                this.currentIndex += 1;
            }
        },

        goTo(i: number): void {
            this.currentIndex = i;
        },
        
        applyStencilForCurrentStep(): void {
            
            const rootApp = (this.$root.$children[0] as InstanceType<typeof App>);

            // Firstly clear any existing stencil
            rootApp.clearStencil();

            if (this.currentStep && this.currentStep.stencil != "") {
                try {
                    rootApp.applyStencil(this.currentStep.stencil); 
                }
                catch (e) {
                    console.error("Error applying stencil:", e);
                }
            }
        },
    },
});
</script>

<style lang="scss">

.tutorial-steps-panel {
    background-color: $strype-main-code-container-background;
}

.tutorial-steps-list-btn{
    background-color: #9aa99a;
    color: white;
    width: 44px;
    height: 44px;
    font-weight: 600;
}

.tutorial-steps-list-btn.active {
    background-color: #006600;
}
</style>
