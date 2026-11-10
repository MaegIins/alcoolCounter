<script setup>
// Libellé d'une boisson (« 25 cl · sans alcool ») + sa caféine avec une tasse (« ☕ 80 mg »), s'il y en a.
// product = fiche de la carte : bière sans contenance ni caféine (elles dépendent du verre choisi).
import { computed } from 'vue'
import { fmtDrink, fmtProduct } from '../api'
import Icon from './Icon.vue'

const props = defineProps({ d: { type: Object, required: true }, product: Boolean })
const caf = computed(() => (props.product && props.d.cat === 'biere' ? 0 : Math.round(props.d.caffeine || 0)))
</script>

<template>
  <span>{{ product ? fmtProduct(d) : fmtDrink(d) }}<template v-if="caf"> · <span class="whitespace-nowrap" data-tip="Caféine"><Icon name="fa-mug-hot" /> {{ caf }} mg</span></template></span>
</template>
