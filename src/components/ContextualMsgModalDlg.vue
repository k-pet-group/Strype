<template>
    <ModalDlg :dlgId="dlgId" :dlgTitle="prefixedDlgTitle" :okOnly="true">
        <span v-html="dlgMsg"/>
        <img v-if="dlgGIF" :src="dlgGIF" style="max-width: 100%; max-height: 300px; margin-top: 10px;"/>
    </ModalDlg>
</template>

<script lang="ts">
import Vue from "vue";
import ModalDlg from "@/components/ModalDlg.vue";
import { useStore } from "@/store/store";
import { mapStores } from "pinia";
import { BvModalEvent } from "bootstrap-vue";

export default Vue.extend({
    name: "ContextualMsgModalDlg",

    components:{
        ModalDlg,
    },

    props:{
        dlgId: String,
        dlgTitle: String,
        hideActionListener:{type: Function},
    },

    created() {        
        // Register the event listener for the dialog here
        this.$root.$on("bv::modal::hide", this.onHideModalDlg);  
    },

    beforeDestroy(){
        // Remove the event listener for the dialog here, just in case...
        this.$root.$off("bv::modal::hide", this.onHideModalDlg);
    },

    computed:{
        ...mapStores(useStore),
        
        dlgMsg(): string{
            return this.appStore.contextualModalDlgMsg; 
        },
        
        dlgGIF(): string{
            return this.appStore.contextualModalDlgGIF; 
        },

        prefixedDlgTitle(): string {
            return `Help: ${this.appStore.contextualModalDlgTitle ?? ""}`;
        },
    },

    methods:{
        onHideModalDlg(event: BvModalEvent, id: string){
            if(id == this.dlgId && this.hideActionListener != undefined){
                this.hideActionListener();
            }
        },
    },
});
</script>

<style lang="scss">
</style>