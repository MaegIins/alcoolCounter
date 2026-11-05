<script setup>
// Infos d'une boisson (toutes facultatives) : producteur, origine, style, description.
// v-model = objet modifié sur place. `locked` = champs déjà remplis qu'on ne peut pas changer (pas l'auteur).
defineProps({ locked: { type: Array, default: () => [] } })
const info = defineModel({ type: Object, required: true })
const FIELDS = [
  { k: 'maker', l: 'Producteur', ph: "Brasserie d'Achouffe, Monster Energy…", max: 60 },
  { k: 'origin', l: 'Origine', ph: 'Belgique, Bretagne…', max: 40 },
  { k: 'style', l: 'Style', ph: 'Triple, IPA, rouge fruité, sans sucre…', max: 40 },
]
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm text-muted">Tout est facultatif, et modifiable après.</p>
    <label v-for="f in FIELDS" :key="f.k" class="block">
      <span class="kicker">{{ f.l }}</span>
      <input
        v-model="info[f.k]"
        :maxlength="f.max"
        :placeholder="f.ph"
        :disabled="locked.includes(f.k)"
        class="field mt-1 w-full px-3.5 py-2 text-base disabled:opacity-50"
      />
    </label>
    <label class="block">
      <span class="kicker">Description</span>
      <textarea
        v-model="info.description"
        rows="3"
        maxlength="1000"
        placeholder="Goût, histoire, où la trouver…"
        :disabled="locked.includes('description')"
        class="field mt-1 w-full resize-y px-3.5 py-2 text-base disabled:opacity-50"
      />
    </label>
  </div>
</template>
