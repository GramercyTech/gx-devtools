<template>
	<slot />
</template>

<style scoped>

</style>

<script setup>
import { ref } from "vue";
defineOptions({
	inheritAttrs: false,
});

const props = defineProps({
    usrLang: {
        type: String,
        required: true,
    },
	portalSettings: {
		type: Object,
		required: true,
	},
	portalLanguage: {
		type: Object,
		required: true,
	},
	portalNavigation: {
		type: Array,
		required: true,
	},
	portalAssets: {
		type: Object,
		required: true,
	},
});

</script>

