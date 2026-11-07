import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwind from '@tailwindcss/vite';
import {VitePWA} from 'vite-plugin-pwa';
export default defineConfig({plugins:[vue(),tailwind(),VitePWA({registerType:'autoUpdate',manifest:{name:'AGOS Philippines',short_name:'AGOS',description:'Safe water for drinking and food preparation in Calapan City',theme_color:'#082d63',background_color:'#f3f7fb',display:'standalone',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]},workbox:{globPatterns:['**/*.{js,css,html,svg,png,json,geojson,csv}']}})]});
