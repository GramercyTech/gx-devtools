<template>
    <Plugin :plugin-vars="pluginVars" :dependency-list="dependencyList" :asset-urls="assetList" :sockets="sockets" :strings-list="stringsList" :permission-flags="permissionFlags"  />
</template>

<style scoped></style>
<script setup>

import { io } from "socket.io-client";
import Plugin from "/src/Plugin.vue";
const socket = io("http://localhost:3069");

//Update pluginVars with all the variables that will be set through the custom admin panel in dashboard
const pluginVars = {
    "primary_color": "#FFD600", //This key automatically provided by GxP
    "projectId": 39, //This key automatically provided by GxP
    "apiPageAuthId": "46|j7vCLmx2KG70Ig8R5mtUcNMFcHExvFPZEOv31kKGe1033f2b", //This key automatically provided by GxP
    "apiBaseUrl": "https://api.efcloud.app", //This key automatically provided by GxP
}
//Update assetList with all the assets that will be selected through the custom admin panel in dashboard, GxP will return signed urls for each key
const assetList = {
    "background_image": "https://dashboard.eventfinity.test/storage/assets/69/2HyPwh1692319982.png",
}

//Update stringsList with all the strings that will be set through the custom admin panel in dashboard, language selection will be handled by GxP
const stringsList = {
    "welcome_text": "Hello World",
}

//Update dependencyList with all the dependencies that will be set through the custom admin panel in dashboard, GxP will return the id of the selected dependency
const dependencyList = {
    "project_location": 4
}

//Update permissionFlags with all the permissions that will be set through the custom admin panel in dashboard, GxP will generate this array of flags based on settings set in the dashboard
const permissionFlags = [];

//Do Not Edit Below
const sockets = {};
sockets['primary'] = {
    broadcast: function (event, data) {
        socket.emit(event, data);
    },
    listen: function (event, callback) {
        return socket.on(event, callback);
    },
};
//add additional sockets here
sockets['project_location'] = {
    created: {
        listen: function (event, data) {
            return {};
        },
    },
    updated: {
        listen: function (event, callback) {
            return {};
        },
    },
    deleted: {
        listen: function (event, callback) {
            return {};
        },
    },
};
</script>

