<script setup>
// Champs d'une boisson (catégorie, volume, degré, nom), partagés par le « + » et la carte.
// v-model = objet { name, cat, cl, abv } modifié sur place. Sans alcool : pas de degré (0).
import { watch } from 'vue'
import { CATS, MAX_CL, catOf, num } from '../api'
import Icon from './Icon.vue'

const drink = defineModel({ type: Object, required: true })
defineProps({
  full: { type: Boolean, default: true }, // false : seulement degré + nom (format déjà choisi)
  namePlaceholder: { type: String, default: 'Nom' },
})
const VOLUMES = [4, 12, 25, 33, 50]
watch(() => drink.value.cat, (c) => {
  if (!catOf(c).alco) drink.value.abv = 0
  else if (!(drink.value.abv > 0)) drink.value.abv = catOf(c).degrees.find((d) => d > 0)
})
const chip = 'rounded-full px-3 py-1 text-sm font-medium transition-colors'
</script>

<template>
  <div class="space-y-5">
    <input v-model="drink.name" maxlength="40" :placeholder="namePlaceholder" class="field w-full px-3.5 py-2.5 text-base" />

    <div v-if="full" class="flex flex-wrap gap-1.5">
      <button
        v-for="c in CATS"
        :key="c.key"
        type="button"
        :class="[chip, drink.cat === c.key ? 'text-paper' : 'bg-raised text-muted hover:text-ink']"
        :style="drink.cat === c.key ? { background: c.hex } : {}"
        @click="drink.cat = c.key"
      >
        <Icon :name="c.fa" /> {{ c.label }}
      </button>
    </div>

    <div v-if="full">
      <span class="kicker">Volume</span>
      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <label class="flex items-center gap-1.5 text-muted">
          <input
            v-model.number="drink.cl"
            type="number" inputmode="decimal" min="0.5" :max="MAX_CL" step="0.5"
            aria-label="Volume en cl"
            class="field w-20 px-3 py-1.5 text-base text-ink"
          />
          cl
        </label>
        <button
          v-for="v in VOLUMES"
          :key="v"
          type="button"
          :class="[chip, drink.cl === v ? 'bg-ink text-paper' : 'bg-raised text-muted hover:text-ink']"
          @click="drink.cl = v"
        >
          {{ v }}
        </button>
      </div>
    </div>

    <div v-if="catOf(drink.cat).alco">
      <span class="kicker">Degré</span>
      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          v-for="deg in catOf(drink.cat).degrees"
          :key="deg"
          type="button"
          :class="[chip, 'tabular-nums', drink.abv === deg ? 'bg-ink text-paper' : 'bg-raised text-muted hover:text-ink']"
          @click="drink.abv = deg"
        >
          {{ deg ? `${num(deg)}°` : '0.0' }}
        </button>
        <label class="flex items-center gap-1.5 text-muted">
          <input
            v-model.number="drink.abv"
            type="number" inputmode="decimal" min="0" max="100" step="0.1"
            aria-label="Degré"
            class="field w-20 px-3 py-1.5 text-base text-ink"
          />
          °
        </label>
      </div>
    </div>
  </div>
</template>
