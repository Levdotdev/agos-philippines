<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { FeatureCollection, Feature } from 'geojson';
import type { Barangay, Report } from '../types';

const props = defineProps<{ reports: Report[]; needs: number[]; barangays?: Barangay[]; selectedBarangay?: string }>();
const element = ref<HTMLElement>();
const tilesUnavailable = ref(false), boundariesUnavailable = ref(false);
let map: L.Map | undefined, markers: L.LayerGroup | undefined, boundaries: L.GeoJSON | undefined;
let geometry: FeatureCollection | undefined, disposed = false;
const locatedReports = computed(() => props.reports.filter(report => Number.isFinite(report.lat) && Number.isFinite(report.lng)));
const number = (value: unknown) => Number(value || 0).toLocaleString('en-PH');
function node(tag: string, content: string) { const element = document.createElement(tag); element.textContent = content; return element; }
function verifiedIn(name: string) { return props.reports.filter(report => report.barangay === name && report.status === 'Verified'); }
function reportNeed(report: Report) { const index = props.reports.findIndex(row => row.id === report.id); return Math.max(0, props.needs[index] || 0); }
function popup(feature: Feature) {
  const data = feature.properties || {}, name = String(data.name || data.adm4_en || '');
  const container = document.createElement('div');
  container.append(node('strong', name));
  container.append(node('p', number(data.population) + ' residents · ' + number(data.households) + ' households (2024 census)'));
  const reports = verifiedIn(name);
  container.append(node('p', reports.length ? reports.length + ' verified request(s) · ' + number(reports.reduce((total,report) => total + reportNeed(report),0)) + ' L outstanding' : 'No verified shortage report in the current workspace.'));
  container.append(node('small', 'Indicative barangay boundary. The label point is not a verified delivery address.'));
  return container;
}
function render() {
  if (!map || !markers) return;
  markers.clearLayers();
  boundaries?.remove();
  if (geometry) boundaries = L.geoJSON(geometry, {
    style: feature => {
      const name = String(feature?.properties?.name || feature?.properties?.adm4_en || '');
      const reports = verifiedIn(name), selected = !props.selectedBarangay || name === props.selectedBarangay;
      return { color: selected ? '#638ca9' : '#a5b7c6', weight: name === props.selectedBarangay ? 3 : 1,
        fillColor: reports.some(report => report.urgency) ? '#d69540' : reports.length ? '#087fb4' : '#b9d3dd',
        fillOpacity: selected ? reports.length ? .38 : .13 : .05 };
    },
    onEachFeature: (feature, layer) => { layer.bindPopup(popup(feature)); layer.bindTooltip(String(feature.properties?.name || feature.properties?.adm4_en || '')); },
  }).addTo(map);
  for (const report of locatedReports.value) {
    if (report.status !== 'Verified') continue;
    const content = document.createElement('div');
    content.append(node('strong', report.barangay));
    content.append(node('p', number(report.population) + ' reported affected people · ' + number(reportNeed(report)) + ' L outstanding'));
    content.append(node('p', 'Planning period: ' + report.planningDate + ' · ' + report.planningDays + ' day(s)'));
    content.append(node('small', report.urgency ? 'Elevated urgency reported and reviewed.' : 'Standard reported urgency.'));
    content.append(node('p', 'Barangay area reference point; confirm the exact handover location before dispatch.'));
    L.circleMarker([report.lat!, report.lng!], { radius: 9, color: '#fff', weight: 3,
      fillColor: report.urgency ? '#d69540' : '#0755a0', fillOpacity: 1 }).bindPopup(content).addTo(markers);
  }
}
function focusSelection() {
  if (!map || !geometry) return;
  const selected = geometry.features.filter(feature => !props.selectedBarangay || feature.properties?.name === props.selectedBarangay);
  const bounds = L.geoJSON({type:'FeatureCollection',features:selected} as FeatureCollection).getBounds();
  if (bounds.isValid()) map.fitBounds(bounds.pad(.13), {maxZoom:14});
}
onMounted(async () => {
  map = L.map(element.value!, {scrollWheelZoom:false}).setView([13.39,121.18],11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:18,
  }).on('tileerror',()=>tilesUnavailable.value=true).addTo(map);
  map.attributionControl.addAttribution('Boundaries: NAMRIA / PSA via OCHA; conversion James Faeldon');
  markers = L.layerGroup().addTo(map); render();
  try {
    const response = await fetch('/data/calapan-barangays.geojson');
    if (!response.ok) throw new Error('Boundary data unavailable');
    const data = await response.json() as FeatureCollection;
    if (disposed) return;
    geometry = data; render(); focusSelection();
  } catch { if (!disposed) boundariesUnavailable.value = true; }
});
watch(() => [props.reports, props.needs], render, {deep:true});
watch(() => props.selectedBarangay, () => {render();focusSelection();});
onBeforeUnmount(() => {disposed=true;map?.remove();});
</script>
<template>
  <div class="map-wrap"><div ref="element" class="map" aria-label="Calapan barangay reference boundaries and verified water requests"></div><span class="map-tag">CALAPAN CITY · {{selectedBarangay || '62 BARANGAYS'}}</span></div>
  <div class="map-legend"><span><i class="legend-dot" style="background:#b9d3dd"></i>Reference area</span><span><i class="legend-dot" style="background:#0755a0"></i>Verified request</span><span><i class="legend-dot" style="background:#d69540"></i>Elevated urgency</span></div>
  <p class="map-footnote">Boundaries and label points are indicative area references, not surveyed delivery addresses. <a href="https://github.com/faeldon/philippines-json-maps" target="_blank" rel="noreferrer">Boundary source & attribution</a>.</p>
  <p v-if="tilesUnavailable" class="map-footnote">Street-map tiles are unavailable. Local barangay boundaries and the request list remain available.</p>
  <p v-if="boundariesUnavailable" class="map-footnote">Barangay outlines could not be loaded. Verified request markers and the list remain available.</p>
</template>
