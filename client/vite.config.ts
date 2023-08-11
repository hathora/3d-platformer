import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../", "");
  const appId = process.env.HATHORA_APP_ID ?? env.HATHORA_APP_ID;
  return {
    build: { target: "esnext" },
    server: { host: "0.0.0.0" },
    clearScreen: false,
    define: { "process.env": { HATHORA_APP_ID: appId } },
  };
});
