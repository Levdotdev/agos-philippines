<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{ title: string; wide?: boolean; busy?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement>();
let previousFocus: HTMLElement | null = null;

function close() {
  if (!props.busy) emit('close');
}

function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
  }
  if (event.key !== 'Tab' || !panel.value) return;
  const controls = Array.from(panel.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
  )).filter(element => element.getClientRects().length > 0);
  const first = controls[0];
  const last = controls.at(-1);
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(async () => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.addEventListener('keydown', keyboard);
  await nextTick();
  panel.value?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', keyboard);
  previousFocus?.focus();
});
</script>

<template>
  <div class="modal-backdrop">
    <section ref="panel" :class="['modal', { wide }]" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1">
      <div class="card-heading modal-heading">
        <div><h2>{{ title }}</h2><slot name="subtitle" /></div>
        <button type="button" class="close" aria-label="Close dialog" :disabled="busy" @click="close">×</button>
      </div>
      <slot />
    </section>
  </div>
</template>
