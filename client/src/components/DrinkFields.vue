<script setup>
// Champs d'une boisson (catégorie, volume, degré, nom), partagés par « Ma soirée » et « La carte ».
// v-model = objet { name, cat, cl, abv } modifié sur place.
import { CATS, MAX_CL, catOf, num } from '../api'

const drink = defineModel({ type: Object, required: true })
defineProps({
  full: { type: Boolean, default: true }, // false : seulement degré + nom (format déjà choisi)
  namePlaceholder: { type: String, default: 'Nom' },
})
const VOLUMES = [2, 4, 12, 20, 25, 33, 50]
</script>

<template>
  <div class="space-y-5">
    <template v-if="full">
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="c in CATS"
          :key="c.key"
          type="button"
          class="rounded-full border px-3 py-1 text-sm font-semibold"
          :class="drink.cat === c.key ? 'border-transparent text-paper' : 'border-line text-muted'"
          :style="drink.cat === c.key ? { background: c.hex } : {}"
          @click="drink.cat = c.key"
        >
          {{ c.icon }} {{ c.label }}
        </button>
      </div>
      <div>
        <span class="kicker">Volume (cl)</span>
        <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <input
            v-model.number="drink.cl"
            type="number" inputmode="decimal" min="0.5" :max="MAX_CL" step="0.5"
            aria-label="Volume en cl"
            class="field w-20 px-3 py-2 text-base"
          />
          <button
            v-for="v in VOLUMES"
            :key="v"
            type="button"
            class="rounded-full border px-3 py-1 font-semibold"
            :class="drink.cl === v ? 'border-hi text-hi' : 'border-line text-muted'"
            @click="drink.cl = v"
          >
            {{ v }}
          </button>
        </div>
      </div>
    </template>

    <div>
      <span class="kicker">Quel degré ?</span>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <button
          v-for="deg in catOf(drink.cat).degrees"
          :key="deg"
          type="button"
          class="min-w-14 rounded-xl border px-2.5 py-2 font-bold tabular-nums"
          :class="drink.abv === deg ? 'border-hi bg-hi text-paper' : 'border-transparent bg-white/5 hover:bg-white/10'"
          @click="drink.abv = deg"
        >
          {{ num(deg) }}°
        </button>
        <label class="flex items-center gap-1.5 text-muted">
          <input
            v-model.number="drink.abv"
            type="number" inputmode="decimal" min="0.5" max="100" step="0.1"
            aria-label="Degré"
            class="field w-20 px-3 py-2 text-base"
          />
          °
        </label>
      </div>
    </div>

    <input v-model="drink.name" maxlength="40" :placeholder="namePlaceholder" class="field w-full px-4 py-3 text-base" />
  </div>
</template>
