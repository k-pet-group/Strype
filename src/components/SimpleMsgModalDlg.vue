<template>
    <ModalDlg :dlgId="dlgId" :dlgTitle="dlgTitle" :okOnly="true">
        <span v-html="dlgMsg"/>
    </ModalDlg>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import ModalDlg from "@/components/ModalDlg.vue";
import { useStore } from "@/store/store";
import { mapStores } from "pinia";
import { BvModalEvent } from "bootstrap-vue";
import { eventBus } from "@/helpers/appContext";

export default defineComponent({
    name: "SimpleMsgModalDlg",

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
        eventBus.on("bv::modal::hide", this.onHideModalDlg as any);  
    },

    beforeDestroy(){
        // Remove the event listener for the dialog here, just in case...
        eventBus.off("bv::modal::hide", this.onHideModalDlg as any);
    },

    computed:{
        ...mapStores(useStore),
        
        dlgMsg(): string{
            return this.appStore.simpleModalDlgMsg; 
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