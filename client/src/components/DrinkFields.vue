<script setup>
// Champs d'une boisson (catégorie, volume, degré, nom), partagés par le « + » et la carte.
// v-model = objet { name, cat, cl, abv, caffeine } modifié sur place. Sans alcool : pas de degré (0).
// Caféine (mg) : estimée d'après le nom, la catégorie et le volume tant qu'on n'y a pas touché.
import { ref, watch } from 'vue'
import { CATS, MAX_CL, MAX_CAFFEINE, catOf, num, guessCaffeine } from '../api'
import Icon from './Icon.vue'

const drink = defineModel({ type: Object, required: true })
defineProps({
  full: { type: Boolean, default: true }, // false : seulement degré + nom (format déjà choisi)
  namePlaceholder: { type: String, default: 'Nom' },
  // Fiche de la carte : une bière n'a pas de volume fixe (le format se choisit à chaque verre)
  carte: { type: Boolean, default: false },
})
const VOLUMES = [4, 12, 25, 33, 50]
watch(() => drink.value.cat, (c) => {
  if (!catOf(c).alco) drink.value.abv = 0
  else if (!(drink.value.abv > 0)) drink.value.abv = catOf(c).degrees.find((d) => d > 0)
})
// Valeur déjà donnée (fiche qu'on modifie) différente de l'estimation : c'est un choix, on n'y touche plus
const autoCaf = ref(drink.value.caffeine == null || drink.value.caffeine === guessCaffeine(drink.value))
if (drink.value.caffeine == null) drink.value.caffeine = guessCaffeine(drink.value)
watch(() => [drink.value.name, drink.value.cat, drink.value.cl], () => {
  if (autoCaf.value || !catOf(drink.value.cat).caf) drink.value.caffeine = guessCaffeine(drink.value)
})
const setCaf = (mg) => {
  autoCaf.value = false
  drink.value.caffeine = mg
}
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

    <div v-if="full && !(carte && drink.cat === 'biere')">
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

    <div v-if="catOf(drink.cat).caf">
      <span class="kicker">Caféine</span>
      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          v-for="mg in catOf(drink.cat).caf"
          :key="mg"
          type="button"
          :class="[chip, 'tabular-nums', drink.caffeine === mg ? 'bg-ink text-paper' : 'bg-raised text-muted hover:text-ink']"
          @click="setCaf(mg)"
        >
          {{ mg ? `${mg} mg` : 'Aucune' }}
        </button>
        <label class="flex items-center gap-1.5 text-muted">
          <input
            :value="drink.caffeine"
            type="number" inputmode="numeric" min="0" :max="MAX_CAFFEINE" step="1"
            aria-label="Caféine en mg"
            class="field w-20 px-3 py-1.5 text-base text-ink"
            @input="setCaf($event.target.value === '' ? 0 : Math.min(MAX_CAFFEINE, Math.max(0, Math.round(Number($event.target.value)) || 0)))"
          />
          mg
        </label>
      </div>
    </div>
  </div>
</template>
