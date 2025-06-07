<template>
	<GxThemeWrapper :theme="theme" class="plugin-container">
		<div class="plugin-content">
			<div v-if="assetUrls?.main_logo" class="logo-container">
				<img :src="assetUrls.main_logo" alt="Logo" class="logo" />
			</div>
			
			<h1 class="plugin-title">{{ stringsList?.welcome_text || 'Welcome to Your Plugin!' }}</h1>
			
			<div class="demo-section">
				<h2>GX UIKit Demo Components</h2>
				
				<!-- Countdown Demo -->
				<div class="component-demo">
					<h3>Countdown Timer</h3>
					<GxCountdown
						:duration="30"
						:auto-start="false"
						@finished="handleCountdownFinished"
						@tick="handleCountdownTick"
						ref="countdownRef"
					/>
					<div class="demo-controls">
						<button @click="startCountdown" class="demo-button">Start</button>
						<button @click="resetCountdown" class="demo-button">Reset</button>
					</div>
				</div>
				
				<!-- Video Player Demo -->
				<div class="component-demo" v-if="demoVideoUrl">
					<h3>Video Player</h3>
					<GxVideoPlayer
						:src="demoVideoUrl"
						:show-controls="false"
						@play="handleVideoPlay"
						@pause="handleVideoPause"
					/>
				</div>
				
				<!-- Modal Demo -->
				<div class="component-demo">
					<h3>Modal Dialog</h3>
					<button @click="showModal = true" class="demo-button">Show Modal</button>
					
					<GxModal
						v-if="showModal"
						:plugin-vars="modalConfig"
						:theme="theme"
						@close-modal="showModal = false"
					/>
				</div>
				
				<!-- Interactive Example -->
				<div class="component-demo">
					<h3>Interactive Example</h3>
					<p>Current state: <strong>{{ example }}</strong></p>
					<button @click="toggleExample" class="demo-button primary">Toggle State</button>
				</div>
			</div>
			
			<!-- Navigation -->
			<div class="navigation">
				<button @click="$emit('back')" class="nav-button secondary">
					← Back to Start
				</button>
				<button @click="$emit('complete')" class="nav-button primary">
					Complete Experience →
				</button>
			</div>
		</div>
	</GxThemeWrapper>
</template>

<style scoped>
.plugin-container {
	min-height: 100vh;
	padding: 2rem;
	background: var(--gx-background-color, #f8f9fa);
}

.plugin-content {
	max-width: 1200px;
	margin: 0 auto;
	display: flex;
	flex-direction: column;
	gap: 2rem;
}

.logo-container {
	text-align: center;
	margin-bottom: 1rem;
}

.logo {
	max-width: 200px;
	max-height: 100px;
	object-fit: contain;
}

.plugin-title {
	text-align: center;
	font-size: 2.5rem;
	font-weight: 800;
	color: var(--gx-text-color, #333);
	margin: 0 0 2rem 0;
}

.demo-section {
	background: white;
	border-radius: 12px;
	padding: 2rem;
	box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.demo-section h2 {
	text-align: center;
	color: var(--gx-primary-color, #007bff);
	margin-bottom: 2rem;
}

.component-demo {
	margin-bottom: 3rem;
	padding: 1.5rem;
	border: 1px solid #e9ecef;
	border-radius: 8px;
	background: #f8f9fa;
}

.component-demo h3 {
	margin-top: 0;
	color: #495057;
	border-bottom: 2px solid var(--gx-primary-color, #007bff);
	padding-bottom: 0.5rem;
}

.demo-controls {
	display: flex;
	gap: 1rem;
	margin-top: 1rem;
	justify-content: center;
}

.demo-button {
	padding: 0.75rem 1.5rem;
	border: 2px solid var(--gx-primary-color, #007bff);
	border-radius: 6px;
	background: white;
	color: var(--gx-primary-color, #007bff);
	font-weight: 600;
	cursor: pointer;
	transition: all 0.3s ease;
}

.demo-button:hover {
	background: var(--gx-primary-color, #007bff);
	color: white;
	transform: translateY(-1px);
}

.demo-button.primary {
	background: var(--gx-primary-color, #007bff);
	color: white;
}

.demo-button.primary:hover {
	background: #0056b3;
}

.navigation {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-top: 2rem;
	padding-top: 2rem;
	border-top: 1px solid #dee2e6;
}

.nav-button {
	padding: 1rem 2rem;
	border: 2px solid;
	border-radius: 8px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.3s ease;
	text-decoration: none;
	display: inline-flex;
	align-items: center;
	gap: 0.5rem;
}

.nav-button.primary {
	background: var(--gx-primary-color, #007bff);
	color: white;
	border-color: var(--gx-primary-color, #007bff);
}

.nav-button.primary:hover {
	background: #0056b3;
	border-color: #0056b3;
	transform: translateY(-1px);
}

.nav-button.secondary {
	background: white;
	color: #6c757d;
	border-color: #6c757d;
}

.nav-button.secondary:hover {
	background: #6c757d;
	color: white;
}

@media (max-width: 768px) {
	.plugin-container {
		padding: 1rem;
	}
	
	.plugin-title {
		font-size: 2rem;
	}
	
	.demo-section {
		padding: 1rem;
	}
	
	.navigation {
		flex-direction: column;
		gap: 1rem;
	}
	
	.nav-button {
		width: 100%;
		justify-content: center;
	}
	
	.demo-controls {
		flex-direction: column;
		align-items: center;
	}
}
</style>
<script setup>
import { ref } from 'vue';
import "@gramercytech/gx-componentkit/style.css";
import {
	GxThemeWrapper,
	GxCountdown,
	GxVideoPlayer,
	GxModal
} from '@gramercytech/gx-componentkit';

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
	theme: {
		type: Object,
		required: false,
		default: () => ({}),
	},
});

const emit = defineEmits(['back', 'complete']);

// Component state
const example = ref('Hello World');
const showModal = ref(false);
const countdownRef = ref(null);

// Demo video URL (you can replace with your own)
const demoVideoUrl = ref('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');

// Modal configuration
const modalConfig = ref({
	title: 'Demo Modal',
	messages: [
		'This is a demonstration of the GxModal component!',
		'You can customize the content, buttons, and styling.'
	],
	left_button_text: 'Cancel',
	right_button_text: 'Confirm',
	left_button_action: () => {
		showModal.value = false;
		console.log('Modal cancelled');
	},
	right_button_action: () => {
		showModal.value = false;
		console.log('Modal confirmed');
		example.value = 'Modal was confirmed!';
	}
});

// Component methods
const toggleExample = () => {
	if (example.value === 'Hello World') {
		example.value = 'Hello Universe';
	} else if (example.value === 'Hello Universe') {
		example.value = 'GX UIKit is awesome!';
	} else {
		example.value = 'Hello World';
	}
};

const startCountdown = () => {
	if (countdownRef.value) {
		countdownRef.value.start();
	}
};

const resetCountdown = () => {
	if (countdownRef.value) {
		countdownRef.value.reset();
	}
};

const handleCountdownFinished = () => {
	console.log('Countdown finished!');
	example.value = 'Countdown completed!';
};

const handleCountdownTick = (remaining) => {
	console.log(`Countdown: ${remaining} seconds remaining`);
};

const handleVideoPlay = () => {
	console.log('Video started playing');
};

const handleVideoPause = () => {
	console.log('Video paused');
};

// Log plugin configuration for debugging
console.log('Plugin initialized with:', {
	pluginVars: props.pluginVars,
	stringsList: props.stringsList,
	assetUrls: props.assetUrls,
	theme: props.theme
});
</script>
