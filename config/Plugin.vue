<template>
	<h1>{{ example }}</h1>
	<button @click="toggleExample">Click me</button>
</template>

<style scoped></style>
<script setup>
const props = defineProps({
    pluginVars: {
        type: Object,
        required: true,
    },
    sockets: {
        type: Object,
        required: true,
        default: () => { },
    },
    assetUrls: {
        type: Object,
        required: false,
        default: () => { },
    },
    dependencyList: {
        type: Object,
        required: false,
        default: () => { },
    },
    stringsList: {
        type: Object,
        required: false,
        default: () => { },
    },
    permissionFlags: {
        type: Array,
        required: false,
        default: () => [],
    },
    router: {
        type: Object,
        required: false,
        default: () => { },
    },
})

const example = Vue.ref('Hello World')

const toggleExample = () => {
	if (example.value === 'Hello World') {
		example.value = 'Hello Universe'
	} else {
		example.value = 'Hello World'
	}
}
</script>
