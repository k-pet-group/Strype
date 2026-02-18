<template>
    <div v-if="steps && steps.length" class="container-fluid tutorial-steps-panel rounded p-4 shadow gap-2">
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
import Vue from "vue";
import { mapStores } from "pinia";
import { useStore } from "@/store/store";
import * as yaml from "js-yaml";

type TutorialStep = {
    title: string;
    description: string;
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
            return this.steps[this.currentIndex] ?? { title: "", description: "" };
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
