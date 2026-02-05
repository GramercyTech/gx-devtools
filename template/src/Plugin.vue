<template>
    <!-- Your Custom Plugin Content -->
    <DemoPage
        :router="mockRouter"
    />
  </template>
  
  
  
  <script setup>
  import { ref, shallowRef } from "vue";
  import DemoPage from "@/DemoPage.vue";

  // Initialize the GxP store
  // This import is externalized to window.useGxpStore during build for platform compatibility
  import { useGxpStore } from "@/stores/gxpPortalConfigStore";
  
  
  const gxpStore = useGxpStore();
  gxpStore.sockets?.primary.listenForStateChange((event) => {
    console.log('🔗 GXP Store: State change event received', event);
  })
 


  </script> 

  <style>
  #app {
    font-family: Avenir, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  
  /* Primary Color */
  .primary {
    color: var(--primary, #000000);
  }

  /* Page Styles */
  .page {
    background-color: var(--page_background_color, #000466);
    color: var(--page_text_color, #FFFFFF);
  }

  /* Input Field Styles */
  .input-field {
    background-color: var(--input_field_background_color, #03054a);
    color: var(--input_field_text_color, #FFFFFF);
    border-color: var(--input_field_border_color, #888C92);
  }

  /* Primary Button Styles */
  .primary-button {
    background-color: var(--primary_button_background_color, #FFFFFF);
    color: var(--primary_button_text_color, #000596);
    border-color: var(--primary_button_border_color, #FFFFFF);
  }

  /* Secondary Button Styles */
  .secondary-button {
    background-color: var(--secondary_button_background_color, #000466);
    color: var(--secondary_button_text_color, #FFFFFF);
    border-color: var(--secondary_button_border_color, #FFFFFF);
  }

  /* Tertiary Button Styles */
  .tertiary-button {
    background-color: var(--tertiary_button_background_color, #FFFFFF00);
    color: var(--tertiary_button_text_color, #FFFFFF);
    border-color: var(--tertiary_button_border_color, #FFFFFF00);
  }

  /* Spinner Styles */
  .spinner {
    background-color: var(--spinner_background_color, #03054A);
    color: var(--spinner_color, #FFFFFF);
  }

  /* Modal Styles */
  .modal {
    background-color: var(--modal_background_color, #FFFFFF);
    color: var(--modal_text_color, #222222);
  }

  /* Modal Primary Button Styles */
  .modal-primary-button {
    background-color: var(--modal_primary_button_background_color, #000596);
    color: var(--modal_primary_button_text_color, #FFFFFF);
    border-color: var(--modal_primary_button_border_color, #000596);
  }

  /* Modal Secondary Button Styles */
  .modal-secondary-button {
    background-color: var(--modal_secondary_button_background_color, #FFFFFF);
    color: var(--modal_secondary_button_text_color, #000596);
    border-color: var(--modal_secondary_button_border_color, #000596);
  }

  </style>