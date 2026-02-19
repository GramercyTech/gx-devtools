<template>
	<slot />
</template>

<script setup>
defineOptions({ inheritAttrs: false });
defineProps({
	usrLang: { type: String, default: "" },
	portalSettings: { type: Object, default: () => ({}) },
	portalLanguage: { type: Object, default: () => ({}) },
	portalNavigation: { type: Array, default: () => [] },
	portalAssets: { type: Object, default: () => ({}) },
});
</script>
