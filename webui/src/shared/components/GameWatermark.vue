<template>
  <div class="game-watermark" aria-hidden="true">{{ signature }}</div>
</template>

<script>
import { appBuildSignature } from "../buildInfo.js";

export default {
  name: "GameWatermark",
  data() {
    return {
      signature: appBuildSignature
    };
  }
};
</script>
