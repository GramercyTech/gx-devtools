<template>
    <!-- Your Custom Plugin Content -->
    <DemoPage
        :router="mockRouter"
    />
  </template>
  
  <style scoped>
  #app {
    font-family: Avenir, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  </style>
  
  <script setup>
  import { ref, shallowRef } from "vue";
  import DemoPage from "@/DemoPage.vue";
  import {
    GxPageStart,
    GxPageFinal,
    GxPageLoading
  } from "@gramercytech/gx-componentkit";

  // Initialize the GxP store
  // This import is externalized to window.useGxpStore during build for platform compatibility
  import { useGxpStore } from "@/stores/gxpPortalConfigStore";
  

  
  const gxpStore = useGxpStore();
  gxpStore.sockets?.primary.listenForStateChange((event) => {
    console.log('🔗 GXP Store: State change event received', event);
  })
 


  </script> 