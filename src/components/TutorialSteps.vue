<template>
    <div :id="tutorialPanelUID" v-if="steps && steps.length" class="tutorial-steps-panel container-fluid rounded p-4 shadow gap-2">
        <div class="tutorial-steps-header">
            <div class="tutorial-steps-progress">
                <span>{{ currentIndex + 1 }} / {{ steps.length }}</span>
            </div>
        </div>
        <div class="tutorial-step-list">
            <button class="tutorial-steps-list-btn btn btn-outline-secondary rounded-circle d-inline-flex align-items-center justify-content-center p-0 m-1"
                v-for="(s, i) in steps"
                :key="i"
                :class="{ active: i === currentIndex }"
                :disabled="(i > currentIndex + 1) || (i === currentIndex + 1 && !requiredComponentsReached)"
                @click="goTo(i)">
                {{ i + 1 }}
            </button>
        </div>
        <div class="tutorial-step-body">
            <div class="tutorial-step-title bold">{{ currentStep.title }}</div>
            <div class="tutorial-step-desc" v-html="currentStep.description"></div>
        </div>
        <div class="tutorial-step-counts mb-2" v-if="requiredComponentsList && requiredComponentsList.length">
            <div class="counts-title bold mb-2">{{ $t("tutorials.requiredComponentsTitle") }}</div>
            <ul class="list-group">
                <li v-for="component in requiredComponentsList" :key="component.type" :class="['list-group-item', { 'list-group-item-success': component.met }]" class="d-flex justify-content-between p-2 align-items-center">
                    <div>
                        <div class="component-description">{{ component.description || component.type }}</div>
                    </div>
                    <span class="badge badge-primary badge-pill">{{ component.actual }} / {{ component.required }}</span>
                </li>
            </ul>
        </div>
        <div class="tutorial-step-message alert alert-warning p-2 mb-2" role="alert" v-if="componentMessage">
            {{ componentMessage }}
        </div>
        <div class="tutorial-nav">
            <button type="button" class="btn btn-secondary" @click="prevStep" :disabled="currentIndex <= 0">Prev</button>
            <button type="button" class="btn btn-primary ml-2" @click="nextStep" :disabled="(currentIndex < steps.length - 1 && !requiredComponentsReached)">
                {{ currentIndex === steps.length - 1 ? 'Finish' : 'Next' }}
            </button>
        </div>
    </div>
</template>

<script lang="ts">
import App from "@/App.vue";
import Vue from "vue";
import { mapStores } from "pinia";
import { useStore } from "@/store/store";
import * as yaml from "js-yaml";
import { getTutorialPanelUID, getAddCommandsDefs } from "@/helpers/editor";
import { componentCounts } from "@/helpers/storeMethods";

type TutorialStep = {
    title: string;
    description: string;
    stencil: string;
    requiredComponents?: Record<string, number>;
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
            currentIndex: 0 as number,
            componentMessage: "" as string,
            requiredComponentsList: [] as { type: string; description?: string; required: number; actual: number; met: boolean }[] ,
            requiredComponentsReached: false as boolean,
        };
    },


    watch: {
        steps(): void {
            this.currentIndex = 0;
        },

        currentIndex(): void {
            // When step index has changed, reapply stencil and re-evaluate required components for the new step.
            this.applyStencilForCurrentStep();
            this.evaluaterequiredComponents();
        },

        "appStore.frameObjects": {
            // When frame objects changes (insertion or deletion), re-evaluate count for required components.
            handler(): void {
                this.evaluaterequiredComponents();
            },
            deep: true,
        },
    },

    mounted() {
        try {
            const parsed: any = yaml.load(this.tutorialRaw.replaceAll("\t","  ")) as any;
            if (parsed && parsed.expectedOutput) {
                this.appStore.expectedOutput = String(parsed.expectedOutput || "");
                this.appStore.expectedOutputMessage = parsed.expectedOutputMessage ?? null;   
            }
            else {
                // Clear any previous expected output when absent
                this.appStore.expectedOutput = "";
                this.appStore.expectedOutputMessage = "";
            }
            this.appStore.expectedOutcomeReached = false;
            // Apply stencil for the initial step when initially loading tutorial
            this.applyStencilForCurrentStep();
            // Evaluate required components for initial step
            this.evaluaterequiredComponents();
            // Ensure tutorial panel is scrolled into view once the component is mounted and DOM updated
            this.$nextTick(() => {
                setTimeout(() => document.getElementById(this.tutorialPanelUID)?.scrollIntoView({"behavior": "smooth"}), 200);
            });
            
        }
        catch (e) {
            console.log("Error loading tutorial:", e);
        }
    },

    methods: {
        prevStep(): void {
            if (this.currentIndex > 0) {
                this.currentIndex -= 1;
            }
        },

        /**
         * Builds a list of required components with descriptions for display.
         */
        buildrequiredComponentsList(details: Record<string, {required:number; actual:number}>){
            const allCommandDefs = Object.values(getAddCommandsDefs()).flat();
            return Object.entries(details).map(([type,entry]) => {
                const command = allCommandDefs.find((element: any) => element && element.type && element.type.type === type);
                return {
                    type,
                    description: command?.description || type,
                    required: entry.required,
                    actual: entry.actual,
                    met: entry.actual >= entry.required,
                };
            });
        },
        /**
         * Evaluates whether the required components for the current step are reached, updating messages and lists.
         */
        evaluaterequiredComponents(): void {
            const details: Record<string, { required: number; actual: number }> = {};
            // No required components, immediately mark as reached
            if (!this.currentStep.requiredComponents || Object.keys(this.currentStep.requiredComponents).length === 0) {
                this.requiredComponentsReached = true;
                this.requiredComponentsList = [];
                this.componentMessage = "";
                return;
            }

            const actualCounts = componentCounts();
            this.requiredComponentsReached = true; // assume reached until we find any that aren't
            for (const [component, count] of Object.entries(this.currentStep.requiredComponents)) {
                const actual = actualCounts[component] ?? 0;
                details[component] = { required: count, actual };
                if (actual < count ) {
                    this.componentMessage = this.$t("tutorials.missingComponents") as string;
                    this.requiredComponentsReached = false;
                }
            }

            // Build list of required components to render to user
            this.requiredComponentsList = this.buildrequiredComponentsList(details);

            // When all required components are met, set message to empty and mark as reached to enable next step
            if (this.requiredComponentsReached) {
                this.componentMessage = "";
                this.requiredComponentsReached = true;
            }  
        },

        nextStep(): void {
            // On final step, load open tutorial dialog
            if (this.currentIndex === this.steps.length - 1) {
                // Emit an event to request opening the Load Tutorial dialog from the Menu component
                this.$root.$emit("open-load-tutorial");
                return;
            }

            if (this.currentIndex < this.steps.length - 1) {
                this.currentIndex += 1;
            }
        },

        goTo(i: number): void {
            // Prevent jumping more than one step ahead
            if (i > this.currentIndex + 1) {
                return;
            }

            // If attempting to advance forward by one step, ensure requirements are met.
            if (i > this.currentIndex && !this.requiredComponentsReached) {
                return;
            }

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
