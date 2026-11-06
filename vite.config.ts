import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwind from '@tailwindcss/vite';
import {VitePWA} from 'vite-plugin-pwa';
export default defineConfig({plugins:[vue(),tailwind(),VitePWA({registerType:'autoUpdate',manifest:{name:'AGOS Philippines',short_name:'AGOS',theme_color:'#087f86',background_color:'#f5f8fa',display:'standalone',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]},workbox:{globPatterns:['**/*.{js,css,html,svg}']}})]});
