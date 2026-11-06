import {createApp} from 'vue';import {createPinia} from 'pinia';import {createRouter,createWebHashHistory} from 'vue-router';import App from './App.vue';import Workspace from './views/Workspace.vue';import './style.css';
const router=createRouter({history:createWebHashHistory(),routes:[{path:'/:page?',component:Workspace}]});createApp(App).use(createPinia()).use(router).mount('#app');
