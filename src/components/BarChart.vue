<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
const props=withDefaults(defineProps<{labels:string[];values:number[];second?:number[];firstLabel?:string;secondLabel?:string;unit?:string}>(),{firstLabel:'Quantity',secondLabel:'Confirmed delivered',unit:''});
const canvas=ref<HTMLCanvasElement>(); let chart:Chart|undefined;
function render(){
  chart?.destroy();
  if(!canvas.value)return;
  chart=new Chart(canvas.value,{type:'bar',data:{labels:props.labels,datasets:[
    {label:props.firstLabel,data:props.values,backgroundColor:'#0755a0',borderRadius:5,maxBarThickness:48},
    ...(props.second?[{label:props.secondLabel,data:props.second,backgroundColor:'#009dac',borderRadius:5,maxBarThickness:48}]:[]),
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:!!props.second,position:'bottom',labels:{color:'#59778e',boxWidth:12,font:{size:10}}},tooltip:{callbacks:{label:context=>context.dataset.label+': '+Number(context.parsed.y||0).toLocaleString('en-PH')+(props.unit?' '+props.unit:'')}}},scales:{y:{beginAtZero:true,grid:{color:'#edf2f6'},ticks:{color:'#8097a8',font:{size:10},precision:0}},x:{grid:{display:false},ticks:{color:'#718ca2',font:{size:10},maxRotation:45}}}}});
}
onMounted(render);watch(()=>[props.values,props.labels,props.second,props.firstLabel,props.secondLabel,props.unit],render,{deep:true});onBeforeUnmount(()=>chart?.destroy());
</script>
<template><div class="chart"><canvas ref="canvas" :aria-label="firstLabel+' by '+labels.join(', ')" role="img"></canvas></div></template>
