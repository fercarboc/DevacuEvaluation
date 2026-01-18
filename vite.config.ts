import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Carga variables de entorno (.env, .env.local, .env.[mode], etc.)
  // Prefijo '' => carga todas, pero OJO: al cliente solo deben llegar las VITE_*
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"), // ✅ limpio
      },
    },

    /**
     * ⚠️ Si tienes código legacy que usa process.env.GEMINI_API_KEY,
     * lo mantenemos para no romper nada.
     *
     * RECOMENDADO: migrar a import.meta.env.VITE_GEMINI_API_KEY
     */
    define: {
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY ?? ""),
      "process.env.API_KEY": JSON.stringify(env.GEMINI_API_KEY ?? ""),
    },
  };
});
