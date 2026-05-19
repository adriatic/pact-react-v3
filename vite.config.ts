// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net
// Copyright © 2026 Pact Research LLC. All rights reserved.\n// pactresearch.net
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    assetsDir: "assets",
  },
});