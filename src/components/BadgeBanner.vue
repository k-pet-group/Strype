<template>
    <transition name="fade">
    <div v-if="isBadgeVisible" class="badge-popup">
        <div class="badge-content">
        <div class="congrats-section">
            <p class="congrats-text">🎉 Congrats!</p>

            <div class="badge-container">
            <img 
                :src="getBadgeImage()" 
                alt="Current Badge" 
                class="badge-image" 
            />
            </div>
            <p class="message">{{ badgeMessage }}</p>
        </div>

        </div>
        <button @click="close" class="badge-popup-close-btn">×</button>
    </div>
    </transition>
</template>

<script lang="ts">
import Vue from "vue";

import { useStore } from "@/store/store";
import { mapStores } from "pinia";


export default Vue.extend({
    name: "BadgePopUp",

    computed: {
        ...mapStores(useStore),

        isBadgeVisible() : boolean {
            return this.appStore.badgeBannerVisible;
        },

        badgeMessage() : string {
            const currentBadge = this.appStore.trackingData.userProgress.currentBadge;
            return this.appStore.badges[currentBadge].message;
        },
    },

    methods: {
        close() {
            this.appStore.badgeBannerVisible = false;
        },

        getBadgeImage(): string {
            try {
                return require(`@/assets/badges/${this.appStore.trackingData.userProgress.currentBadge}.png`);
            } 
            catch (error) {
                console.error("Error loading badge image:", error);
                return require("@/assets/badges/Hello From Python.png"); // Fallback to default badge
            }
        },
    },

});
</script>

<style scoped>
.slide-down-enter-active, .slide-down-leave-active {
    transition: transform 0.4s ease-out, opacity 0.4s;
}
.slide-down-enter, .slide-down-leave-to {
    transform: translateY(-100%);
    opacity: 0;
}
/* Main badge popup */
.badge-popup {
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background-color: black;
    color: #fff;
    border-radius: 8px;
    padding: 20px;
    width: 80%;
    max-width: 800px;
    z-index: 1000;
    box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.2);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: 'Arial', sans-serif;
}
.badge-popup-close-btn {
    background: none;
    border: none;
    color: white;
    font-size: 22px;
    cursor: pointer;
    padding: 5px;
    position: absolute;
    top: 10px; 
    right: 10px; 
}
.badge-popup-close-btn:hover {
    opacity: 0.8;
}

.congrats-text {
    font-size: 22px;
    font-weight: bold;
    margin: 0;
}
.message {
    font-size: 16px;
    margin-top: 5px;
}

</style>
