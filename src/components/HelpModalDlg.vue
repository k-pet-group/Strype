<template>
    <ModalDlg :dlgId="dlgId" :dlgTitle="currentTitle" :okOnly="true">
        <div class="help-content">
            <div v-html="currentContent"></div>
            <img v-if="currentGif" :src="currentGif" style="max-width: 100%; margin-top: 10px;"/>
        </div>
            <template #modal-footer-content="{ ok }">
                <div class="d-flex align-items-center justify-content-between w-100">
                    <div>
                        <button class="help-nav-btn btn btn-sm btn-light mr-2" @click="prevEntry" aria-label="Previous">◀</button>
                        <span class="help-nav-counter">{{ displayIndex }} / {{ entries.length }}</span>
                        <button class="help-nav-btn btn btn-sm btn-light ml-2" @click="nextEntry" aria-label="Next">▶</button>
                    </div>
                    <div>
                        <button class="btn btn-primary" @click="ok">OK</button>
                    </div>
                </div>
            </template>
    </ModalDlg>
</template>

<script lang="ts">
import Vue from "vue";
import ModalDlg from "@/components/ModalDlg.vue";
import { mapStores } from "pinia";
import { useStore } from "@/store/store";

type HelpEntry = { key: string; title: string; content: string; gif: string };

export default Vue.extend({
    name: "HelpModalDlg",

    components:{
        ModalDlg,
    },

    props:{
        dlgId: String,
        dlgTitle: String,
        hideActionListener:{type: Function},
    },

    data() {
        return {
            index: 0,
        } as { index: number };
    },

    computed: {
        ...mapStores(useStore),

        entries(): HelpEntry[] {
            try {
                const locale = this.$i18n.locale as string;
                const msgs = (this.$i18n.getLocaleMessage(locale) as any) ?? {};
                const help = (msgs.help as Record<string, any>) ?? {};
                const keys = Object.keys(help || {});
                if(keys.length === 0) {
                    return [];
                }
                return keys.map((k) => {
                    const title = this.$t(`help.${k}.title`) as string;
                    const raw = this.$t(`help.${k}.content`) as string;
                    const content = (raw ?? "").toString().replace(/\n/g, "<br/>");
                    const gif = `graphics_images/${k}.gif`;
                    return { key: k, title, content, gif } as HelpEntry;
                });
            }
            catch (e) {
                return [];
            }
        },

        currentEntry(): HelpEntry {
            const es = this.entries as HelpEntry[];
            return es[this.index] ?? { key: "", title: "", content: "", gif: "" };
        },

        currentTitle(): string {
            return "Help: " + (this.currentEntry.title || (this.dlgTitle ?? "Help"));
        },

        currentContent(): string {
            return this.currentEntry.content || "";
        },

        currentGif(): string {
            return this.currentEntry.gif || "";
        },

        displayIndex(): number {
            const len = (this.entries as HelpEntry[]).length;
            return Math.min(Math.max(1, this.index + 1), Math.max(1, len));
        },
    },

    methods: {
        onHideModalDlg(event: any, id: string){
            if(id == this.dlgId && this.hideActionListener != undefined){
                this.hideActionListener();
            }
        },

        prevEntry() {
            const len = (this.entries as HelpEntry[]).length;
            if (len === 0) {
                return;
            }
            this.index = (this.index - 1 + len) % len;
        },

        nextEntry() {
            const len = (this.entries as HelpEntry[]).length;
            if (len === 0) {
                return;
            }
            this.index = (this.index + 1) % len;
        },
    },

    mounted(){
        this.$root.$on("bv::modal::hide", this.onHideModalDlg);
        // When the modal is shown, if a title is set we try to open at that entry
        this.$root.$on("bv::modal::shown", (event: any, id: string) => {
            if(id !== (this.dlgId as string)){
                return;
            }
            const requestedTitle = (this as any).appStore?.helpModalDlgTitle as string | undefined;
            if(requestedTitle){
                const arr = this.entries as HelpEntry[];
                const found = arr.findIndex((e) => e.title === requestedTitle || e.key === requestedTitle.toLowerCase());
                if(found >= 0){
                    this.index = found;
                }
            }
        });
    },

    beforeDestroy(){
        this.$root.$off("bv::modal::hide", this.onHideModalDlg);
        this.$root.$off("bv::modal::shown");
    },
});
</script>

<style lang="scss">
.help-nav{
    display:flex;
    align-items:center;
    gap:8px;
    margin-bottom:8px;
}
.help-nav-btn{
    border:none;
    background:#eee;
    padding:4px 8px;
    border-radius:4px;
    cursor:pointer;
}
.help-nav-counter{
    font-size:0.9em;
    color:#333;
}
</style>