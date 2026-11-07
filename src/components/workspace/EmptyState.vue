<script setup lang="ts">
import { Droplets } from 'lucide-vue-next';

defineProps<{ title: string; description: string; action?: string; disabled?: boolean }>();
defineEmits<{ action: [] }>();
</script>

<template>
  <div class="empty empty-state">
    <span class="empty-state-icon"><Droplets :size="30" :stroke-width="1.5" /></span>
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <button v-if="action" type="button" class="primary" :disabled="disabled" @click="$emit('action')">{{ action }}</button>
  </div>
</template>
