<template>
    <ModalDlg
            :dlgId="dlgId"
            :dlg-title="$t('tutorials.dialogTitle')"
            showCloseBtn
            :autoFocusButton="'ok'"
            css-class="tutorial-dlg"
            :ok-disabled="!(selectedTutorialCategoryIndex >= 0 && selectedTutorialCategoryIndex < availableTutorials.length && selectedTutorialItemIndex >= 0 && selectedTutorialItemIndex < tutorialsInCurrentCategory.length)" >
        <div class="d-flex" style="height: 400px;">
            <!-- Left Pane: List Group -->
            <b-list-group class="flex-column" style="width: 30% !important;">
                <b-list-group-item
                    v-for="(item, index) in availableTutorials"
                    :key="index"
                    :active="selectedTutorialCategoryIndex === index && availableTutorials.length > 1"
                    @click="changeTutorialDialogCategory(index, item.tutorials)"
                    button
                >
                    <span class="tutorial-dlg-tutorial-group-type" v-if="item.type">{{item.type}}</span>
                    {{ item.name }}
                </b-list-group-item>
            </b-list-group>

            <!-- Right Pane: Dynamic Grid -->
            <div class="flex-grow-1 p-3 overflow-auto">
                <div class="d-flex flex-column">
                    <button
                        v-for="(item, i) in tutorialsInCurrentCategory"
                        :key="i"
                        :class="{'d-flex': true, 'tutorial-dlg-tutorial-item': true, 'tutorial-dlg-selected-tutorial-item': selectedTutorialItemIndex === i}"
                        type="button"
                        @click="selectedTutorialItemIndex = i"
                        @dblclick="onDblClick"
                        @keydown.space.self="selectedTutorialItemIndex = i"
                    >
                        <!-- 1x1 transparent image if image is missing: -->
                        <img :src="item.imgURL || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII='" alt="Preview" class="tutorial-dlg-preview flex-shrink-0"/>
                        <div class="d-flex flex-column flex-fill">
                            <span class="tutorial-dlg-name">{{item.name}}</span>
                            <span class="tutorial-dlg-description" v-html="item.description" />
                        </div>
                    </button>
                </div>
            </div>
        </div>
    </ModalDlg>    
</template>
<script lang="ts">

import Vue from "vue";
import MenuComponent from "@/components/Menu.vue";
import ModalDlg from "@/components/ModalDlg.vue";
import {Tutorial, TutorialGroup, getBuiltinTutorials} from "@/helpers/tutorials";
import { BvModalEvent } from "bootstrap-vue";
import { getMenuLeftPaneUID } from "@/helpers/editor";

export default Vue.extend({
    components: {ModalDlg},
    
    props: {
        dlgId: String,
    },
    
    data: function() {
        return {
            availableTutorials: [] as TutorialGroup[],
            selectedTutorialCategoryIndex: 0, // LHS, always a selection
            selectedTutorialItemIndex: 0, // RHS, -1 if no selection
            tutorialsInCurrentCategory: [] as { name: string, description: string | undefined, imgURL: string | undefined, tutorialFile: () => Promise<string | undefined> }[],
        };
    },
    
    methods: {       
        updateAvailableTutorials() {
            // We must update the available tutorials based on the code.
            // Our built-in tutorials are always available:
            this.availableTutorials = [
                /* IFTRUE_isPython */
                {name: this.$i18n.t("tutorials.builtinOnboarding") as string, tutorials: getBuiltinTutorials("onboarding")},
                {name: this.$i18n.t("tutorials.builtinExample") as string, tutorials: getBuiltinTutorials("example")},
                /* FITRUE_isPython */
            ];
        },

        async changeTutorialDialogCategory(index: number, itemPromise: Promise<Tutorial[]>) {
            this.selectedTutorialCategoryIndex = index;
            this.tutorialsInCurrentCategory = [];
            const tutorials = await itemPromise;
            const r = [];
            // Note async: will run each in background
            for (const tutorial of tutorials) {
                let img : Promise<string | undefined>;
                if ("imgURL" in tutorial.image) {
                    img = Promise.resolve(tutorial.image.imgURL);
                }
                else {
                    img = Promise.resolve<string | undefined>(undefined);
                }
                const details = {
                    name: tutorial.name,
                    description: tutorial.description,
                    imgURL: undefined as (string | undefined),
                    tutorialFile: tutorial.tutorialFile,
                };
                r.push(details);
                img.then((url) => {
                    Vue.set(details, "imgURL", url);
                });
            }
            this.tutorialsInCurrentCategory = r;

        },
        
        // Called by Menu component when we are shown:
        shown() {
            this.changeTutorialDialogCategory(0, this.availableTutorials.length > 0 ? this.availableTutorials[0].tutorials: Promise.resolve([]));
        },

        getSelectedTutorial() : ({ name : string, tutorialFile: Promise<string | undefined> } | undefined) {
            if (this.selectedTutorialItemIndex >= 0 && this.selectedTutorialItemIndex < this.tutorialsInCurrentCategory.length) {
                const d = this.tutorialsInCurrentCategory[this.selectedTutorialItemIndex];
                return {name: d.name, tutorialFile: d.tutorialFile()};
            }
            return undefined;
        },

        onDblClick(){
            // Triggers the modal's OK event to load the selected example. The click event is fired before the double-click event:
            // selectedTutorialItemIndex is already set to the right value.
            // We first close the dialog, than simulate a "close with action" in the Menu (since we can't close with "OK" status.)
            this.$root.$emit("bv::hide::modal", this.dlgId);
            (this.$root.$children[0].$refs[getMenuLeftPaneUID()] as InstanceType<typeof MenuComponent>).onStrypeMenuHideModalDlg({trigger: "ok"} as BvModalEvent, this.dlgId);
        },
    },
});
</script>
<style>
.tutorial-dlg > .modal-md {
  width: auto; /* important to let content control size */
  min-width: min(800px, 80vw);
}

.tutorial-dlg-tutorial-item {
  padding: 10px 20px 10px 20px;
  background-color: white;
  border: 0px;
  text-align: left;
}

.tutorial-dlg-tutorial-item:hover {
  background-color: #f8f9fa;
}

.tutorial-dlg-selected-tutorial-item, .tutorial-dlg-selected-tutorial-item:hover {
    background-color: #007bff;
}

img.tutorial-dlg-preview {
    width: 120px;
    height: 100px;
    object-fit: contain;
    display: block;
    margin-right: 30px;
}

span.tutorial-dlg-name {
    font-weight: bold;
    font-size: 125%;
}

.tutorial-dlg-selected-tutorial-item span.tutorial-dlg-name {
    color: white;
}

span.tutorial-dlg-description {
    color: #777;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2; /* 2 lines of text at most */
    -webkit-box-orient: vertical;
}

.tutorial-dlg-selected-tutorial-item span.tutorial-dlg-description {
  color: #eee;
}

.tutorial-dlg-selected-tutorial-item span.tutorial-dlg-description a {
    color: white;
}

.tutorial-dlg-tutorial-group-type {
    display: block;
    color: #999;
    font-size: 80%;
}

.tutorial-dlg-add-library-panel {
    margin-top: 50px;
}

.tutorial-dlg-add-library-panel input {
    margin-top: 10px;
    margin-bottom: 10px;
}
</style>
