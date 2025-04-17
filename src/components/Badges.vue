<template>
    <div class="popup-overlay">
        <div class="popup-badge-content">
            <button class="close-btn" @click="$emit('close')">x</button>

            <div class="robot-eyes">
                <div class="eye"></div>
                <div class="eye"></div>
            </div>

            <!-- Badges Content -->
            <h3 class="badge-title">🏅 BADGES</h3>

            <!-- Display all badges -->
            <div class="badges-container">
                <div 
                    v-for="badge in allBadges" 
                    :key="badge.name" 
                    :class="['badge', { locked: !badge.earned }]"
                    @mouseover="setHoveredBadge(badge)"
                    @mouseleave="clearHoveredBadge"
                >
                    <div class="badge-image-wrapper">
                        <img 
                            :src="require(`@/assets/badges/${badge.name}.png`)" 
                            :alt="badge.name" 
                            class="badge-image" 
                        />
                        <span v-if="badge.earned !== true" class="lock-icon">🔒</span>
                    </div>
                    <p 
                        class="badge-label"
                        :class="{ 'earned': badge.earned, 'unearned': badge.earned !== true }"
                    >
                        {{ badge.name }}
                    </p>

                    <!-- Show description only for the hovered badge -->
                    <div 
                        v-if="hoveredBadge && hoveredBadge.name === badge.name" 
                        class="badge-description"
                        :class="{ 'earned': badge.earned === true, 'unearned': badge.earned !== true }"
                    >
                        <p>{{ hoveredBadge.description }}</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import { initialBadges } from "@/store/progress";
import { useStore } from "@/store/store";
import { mapStores } from "pinia";
import Vue from "vue";

interface Badge {
    points: number;
    message: string;
    description: string;
    earned: number;
}

interface BadgesDictionary {
    [key: string]: Badge;
}

export default Vue.extend({
    name: "Badges",

    data() {
        return {
            activeBadge: "",
            hoveredBadge: "",
            currentPage: 1,
            badgesPerPage: 9,
        };
    },
    created() {
        if(!this.appStore.isFirstExecutionDone){
            this.appStore.badges = initialBadges;
            this.appStore.saveToLocalStorage("badges", initialBadges);
        }
    },
    computed: {
        ...mapStores(useStore),
        earnedBadges(): { name: string; points: number; message: string; description: string; earned: number }[] {
            // Filter badges that are earned and map to the desired format
            return Object.entries(this.appStore.badges as BadgesDictionary)
                .filter(([_, badge]) => badge.earned === 1)
                .map(([badgeName, badge]) => ({
                    name: badgeName,
                    ...badge,
                }));
        },

        allBadges(): { name: string; points: number; message: string; description: string; earned: number }[] {
            // Filter badges that are earned and map to the desired format
            return Object.entries(this.appStore.badges as BadgesDictionary)
                .map(([badgeName, badge]) => ({
                    name: badgeName,
                    ...badge,
                }));
        },
    },
    methods: {
        toggleDescription(badgeName: string) {
            // If the clicked badge is already active, hide its description; otherwise, show it
            this.activeBadge = this.activeBadge === badgeName ? "" : badgeName;
        },

        setHoveredBadge(badge: string) {
            this.hoveredBadge = badge;
        },
        clearHoveredBadge() {
            this.hoveredBadge = "";
        },
    },
});
</script>

<style lang="scss">

.popup-overlay {
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);  
    position: fixed;
    top: 0; left: 0;
    width: 100%;
    height: 100%;
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
}

.popup-badge-content {
    background: #2c3e50;
    border: 5px solid #7f8c8d;
    border-radius: 30px;
    padding: 2rem;
    width: 80%;
    max-height: 85%;
    box-shadow: inset 0 0 10px #95a5a6, 0 0 20px #34495e;
    font-family: 'Orbitron', sans-serif;
    color: #ecf0f1;
    position: relative;
    overflow-y: auto;
}

.badge-title {
    text-align: center; 
    font-size: 36px;
    font-weight: bold; 
    color: #ffffff;
    text-transform: uppercase; 
    text-shadow: 2px 2px 0 #000000, 
                4px 4px 0 #555555;
    position: relative;
}

.badge-title::after {
    content: attr(data-text);
    position: absolute;
    top: 100%; 
    left: 0;
    width: 100%;
    height: 100%;
    color: #ffffff;
    text-shadow: 2px 2px 0 #000000,
                4px 4px 0 #555555;
    transform: rotateX(180deg); 
    opacity: 0.5;
}

.badges-container {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-top: 20px;
    width: 100%;
    max-width: 600px; 
    margin-left: auto;
    margin-right: auto;
}

.badge {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px;
    border-radius: 12px;
    width: 100%;
    max-width: 180px;
    background-color: rgba(255, 255, 255, 0.05); 
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: transform 0.3s ease;
    word-wrap: break-word;
    overflow-wrap: break-word;
    backdrop-filter: blur(3px); 
}

.badge-image-wrapper {
    position: relative;
}

.badge:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
}

.badge-image {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    object-fit: cover;
    margin-bottom: 10px;
}

.badge.locked .badge-image {
    opacity: 0.4;
    filter: grayscale(100%);
}

.lock-icon {
    position: absolute;
    top: 0.25rem;
    right: 0.25rem;
    font-size: 1.2rem;
    color: #888;
}

.badge-label {
    font-size: 14px;
    font-weight: bold;
    text-transform: uppercase;
    margin-top: 8px;
}

.badge-label.earned,
.badge-description.earned {
    color: white;
}

.badge-label.unearned,
.badge-description.unearned {
    color: grey;
}

.badge-description {
    font-size: 0.6rem;
    color: #666;
    word-wrap: break-word;
    white-space: normal;
    margin: 0 auto;
}

.close-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    color: white;
    border: none;
    border-radius: 50%;
    padding: 1px 10px;
    cursor: pointer;
    font-size: 14px;
}

.close-btn:hover {
    background-color: grey;
}

.robot-eyes {
    display: flex;
    justify-content: center;
    gap: 2rem;
    margin-bottom: 1rem;
}
.eye {
    width: 30px;
    height: 30px;
    background: #00ffcc;
    border-radius: 50%;
    box-shadow: 0 0 10px #00ffcc;
}

</style>
