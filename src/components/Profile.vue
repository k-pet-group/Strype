<template>
    <div class="popup-overlay">
        <div class="popup-profile-content">
            <button class="close-btn" @click="$emit('close')">x</button>
            <!-- Profile Header -->
            <h1 class="profile-title">YOUR ACHIEVEMENTS AWAIT!</h1>

            <!-- Profile Content -->
            <!-- <p class="points-text">Lines <strong>{{ line }}</strong> </p> -->
            <!-- <p class="points-text">Commands <strong>{{ commands }}</strong> </p>
            <p class="points-text">Badges <strong>{{ badges }}</strong> </p> -->
            <!-- <p class="points-text">trackData <strong>{{ data }}</strong> </p> -->
            <!-- <p class="points-text">Lines <strong>{{ lines }}</strong> </p> -->


            <!-- Current Badge Display -->
            <div class="badge-section">
                <div
                v-if="currentBadge"
                class="badge-container"
                @click="toggleBadges"
                >
                    <img
                        :src="getBadgeImage(currentBadge)"
                        alt="Current Badge"
                        class="badge-image"
                    />
                    <p>{{ currentBadge }}</p>
                </div>

                <div
                    v-else
                    class="badge-container"
                >
                    <img
                        src="@/assets/badges/Default.png"
                        alt="No Badge Assigned"
                        class="badge-image"
                    />
                    <p>No badges yet!</p>
                </div>
            </div>
            
            <div class="achievement-details">
                <!-- Left Info -->
                <div class="left-info" style="flex: 1;">
                    <p><strong>Lifetime Points:</strong> {{ points }}</p>
                    <p><strong>Current Level:</strong> {{ milestoneLabel }}</p>
                    <p><strong>Miles Crossed:</strong> {{ milestoneLevel }} / {{ miles }}</p>
                    <p><strong>Current Status:</strong> {{ pythonStatus }} </p>
                </div>
                <!-- weekendWarriorProgress	e.g., “3/4 weekends completed this month” -->

                <!-- Right Info -->
                <div class="right-info" style="flex: 1; text-align: right;">
                    <p><strong>Badges Earned:</strong> {{ badgeCount }}</p>
                    <p><strong>Streaks Earned:</strong> {{ streakCount }}</p>
                    <p><strong>Last Check-in:</strong> {{ lastCodingDay }}</p>
                    <p><strong>Longest Streak:</strong> {{ longestStreak }} days</p>
                </div>
                <!-- totalCheckIns	Cumulative number of check-ins to show dedication -->
            </div>

            <!-- Badges Section - Show when isBadgesVisible is true -->
            <div class="badge-section" v-if="isBadgesVisible">
                <Badges @close="toggleBadges" />
            </div>

            <!-- Milestone Section -->
            <div class="milestone-section">
                <!-- <h2>Milestone Reached!</h2> -->
                <p>You've reached Level {{ milestoneLevel }} - {{ milestoneLabel }}!</p>

                <div class="progress-container">
                    <!-- <div class="progress-labels">
                        <span>Beginner</span>
                        <span class="middle-label">Learner</span>
                        <span>Expert</span>
                    </div> -->
                    <div class="progress-bar">
                        <div
                        class="progress-bar-fill"
                        :style="{ width: progressPercentage + '%' }"
                        ></div>
                    </div>
                    <p class="progress-text">{{ progressPercentage }}% to next level</p>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import Badges from "@/components/Badges.vue";
import { initialTrackingData, trackCommands, trackLinesOfCode, trackOperators } from "@/store/badges";
import { useStore } from "@/store/store";
import { mapStores } from "pinia";
import Vue from "vue";
export default Vue.extend({
    name: "Profile",

    components: {
        Badges,
    },

    data: function() {
        return {
            isBadgesVisible: false,
            thresholds: [1000, 500, 300, 100, 0] as number[],
            levels: { 1000: 5, 500: 4, 300: 3, 100: 2, 0: 1 } as {[key: number]: number},
            milestoneNames: {
                1: "Spark ✨",
                2: "Flame 🔥",
                3: "Ignite 🚀",
                4: "Blaze 🔥💨",
                5: "Inferno 🔥🌪️",
            } as { [key: number]: string },
            totalMiles: 5,
        };
    },

    created() {
        if(!this.appStore.isFirstExecutionDone){
            this.appStore.trackingData = initialTrackingData;
            this.appStore.linesOfCode = trackLinesOfCode;
            this.appStore.commands = trackCommands;
            this.appStore.operators = trackOperators;
            this.appStore.updateLocalStorage();
        }
    },

    computed: {
        ...mapStores(useStore),

        points(): number {
            return this.appStore.points;
        },

        badges(): any {
            return this.appStore.badges;
        },

        currentBadge(): string {
            return this.appStore.trackingData.userProgress.currentBadge;
        },

        badgeCount(): number {
            return this.appStore.trackingData.userProgress.badgeCount;
        },

        streakCount(): number {
            return this.appStore.trackingData.codingStreakTracker.streakCount;
        },

        longestStreak(): number {
            return this.appStore.trackingData.codingStreakTracker.longestStreak;
        },

        lastCodingDay(): string {
            const lastCodingDate = new Date(this.appStore.trackingData.codingStreakTracker.lastCodingDay);
            const day = lastCodingDate.getDate().toString().padStart(2, "0"); 
            const month = (lastCodingDate.getMonth() + 1).toString().padStart(2, "0");
            const year = lastCodingDate.getFullYear();
            return `${day}.${month}.${year}`;
        },

        // lines(): number{
        //     return this.appStore.linesOfCode;
        // },

        // line(): number{
        //     return this.appStore.linesExecuted;
        // },

        // commands(): any{
        //     return this.appStore.commands;
        // },

        data(): any {
            return this.appStore.trackingData;
        },

        pythonStatus(): string {
            return this.appStore.trackingData.userProgress.status;
        },

        miles(): number{
            return this.totalMiles;
        },

        milestoneLevel(): number{
            const matched = this.thresholds.find((t) => this.appStore.points >= t);
            return matched !== undefined ? this.levels[matched] : 1;
        },

        milestoneLabel(): string {
            return this.milestoneNames[this.appStore.trackingData.userProgress.level];
        },

        progressPercentage() {
            // Calculate the progress towards the next level
            const currentLevelThreshold = this.thresholds.find((t) => this.appStore.points >= t);
            if (currentLevelThreshold) {
                const nextLevelThreshold = this.thresholds[this.thresholds.indexOf(currentLevelThreshold) - 1];

                if (nextLevelThreshold !== undefined) {
                    const progress = ((this.appStore.points - currentLevelThreshold) / (nextLevelThreshold - currentLevelThreshold)) * 100;
                    return Math.min(progress, 100);
                }
            }
            return 0;
        },

    },

    methods: {
        getBadgeImage(currentBadge: string): string {
            try {
                return require(`@/assets/badges/${currentBadge}.png`);
            } 
            catch (error) {
                console.error("Error loading badge image:", error);
                return require("@/assets/badges/Default.png"); // Fallback to default badge
            }
        },

        toggleBadges() {
            this.isBadgesVisible = !this.isBadgesVisible;
        },

        currentLevel() {
            this.appStore.trackingData.userProgress.level = this.milestoneLevel;
        },
    },
});
</script>

<style lang="scss">
/* Overlay styling */
.popup-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5); /* Semi-transparent background */
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000; /* Make sure it's on top */
}

// /* Content styling */
.popup-profile-content {
    width: 80%; /* Responsive width */
    max-width: 550px; /* Maximum width */
    max-height: 800px;
    background-color: rgba(240, 240, 240, 0.9);
    border-radius: 50px; /* Pill-shaped corners */
    padding: 20px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    text-align: center;
    position: relative;
    margin: auto;
    overflow-y: auto;
}

.content-wrapper {
    height: 80%;
    overflow-y: auto;
    padding-right: 10px;
}

.profile-title {
    font-size: 1.5em;
    font-weight: bold;
}

.achievement-details {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-top: 1rem;
    padding: 1rem;
    gap: 3rem;
//     font-family: Arial, sans-serif;
//     font-size: 14px;
}

.left-info {
    width: 45%;
    text-align: left;
    padding: 2rem;
}

.right-info {
    margin-top: 2rem;
    text-align: left !important;
}


.badge-section {
    margin-top: 2rem; /* Adjust as needed */
}

.default-badge {
    display: inline-block;
}

.badge-message {
    margin-top: 8px;
    font-size: 14px;
    color: #666;
}

.milestone-section {
    margin-top: 30px;
}

.milestone-section h2 {
    font-size: 28px;
    margin-bottom: 15px;
}

/* Close button styling */
.close-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    // background-color: black;
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

/* Progress bar styling */
.progress-bar-container {
    margin-top: 20px;
    text-align: center;
}

.progress-bar {
    width: 100%;
    height: 25px;
    background-color: #e0e0e0;
    border-radius: 12px;
    overflow: hidden;
    margin-top: 10px;
}

.progress-bar-fill {
    height: 100%;
    background-color: #4caf50;
    width: 0; /* Will be set dynamically */
    transition: width 0.5s ease-in-out;
}

.progress-text {
    font-size: 16px;
    margin-top: 5px;
}

</style>
