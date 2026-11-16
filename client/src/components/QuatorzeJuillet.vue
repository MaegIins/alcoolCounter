<script setup>
// 14 juillet : feux d'artifice bleu, blanc, rouge derrière le contenu, lueur tricolore. Décoratif.
import Fireworks from './Fireworks.vue'
const TRICOLORE = ['#3a6ab0', '#e4dcc3', '#c43c2a']
</script>

<template>
  <Fireworks :colors="TRICOLORE" :seed="1407" :count="7" />
</template>
