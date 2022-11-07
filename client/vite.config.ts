import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../", "");
  const appId = process.env.APP_ID ?? env.APP_ID;

  return {
    build: { target: "esnext" },
    server: { host: "0.0.0.0" },
    clearScreen: false,
    define: {
      "process.env": {
        APP_ID: appId,
        COORDINATOR_HOST: process.env.COORDINATOR_HOST ?? env.COORDINATOR_HOST,
      },
    },
  };
});
