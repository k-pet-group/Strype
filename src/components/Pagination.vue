<template>
    <div class="pagination">
        <button @click="prevPage" :disabled="currentPage <= 1">Previous</button>
        <span>Page {{ currentPage }} of {{ totalPages }}</span>
        <button @click="nextPage" :disabled="currentPage >= totalPages">Next</button>
    </div>
</template>

<script lang="ts">
import Vue from "vue";

export default Vue.extend({
    name: "Pagination",
    props: {
        totalItems: {
            type: Number,
            required: true,
        },
        itemsPerPage: {
            type: Number,
            required: true,
        },
        value: {
            type: Number,
            required: true,
        },
    },
    computed: {
        currentPage: {
            get(): number {
                return this.value;
            },
            set(newPage: number): void {
                this.$emit("input", newPage);
            },
        },
        totalPages(): number {
            return Math.ceil(this.totalItems / this.itemsPerPage);
        },
    },
    methods: {
        nextPage(): void {
            if (this.currentPage < this.totalPages) {
                this.currentPage += 1;
            }
        },
        prevPage(): void {
            if (this.currentPage > 1) {
                this.currentPage -= 1;
            }
        },
    },
});
</script>

<style scoped>
.pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
}
button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
</style>
