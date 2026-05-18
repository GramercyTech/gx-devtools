<template>
	<slot />
</template>

<!--
	Tailwind base/utilities for development only. The layouts wrap the plugin in
	the dev runtime but are NOT part of the production build (build entry is
	src/Plugin.vue), so this CSS never ships in dist/. Remove this block if you
	don't want Tailwind defaults applied while developing.
-->
<style>
@import "tailwindcss";
</style>

<style scoped></style>

<script setup>
import { ref } from "vue"
defineOptions({
	inheritAttrs: false,
})

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
})
</script>
