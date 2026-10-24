/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativa: o build funciona em qualquer subcaminho ou domínio
// (ex.: financeiro.associapec.com.br) sem reconfiguração.
export default defineConfig({
  base: './',
  plugins: [react()],
  // portas fixas: a URL de desenvolvimento precisa coincidir com a Site URL / Redirect URLs do Supabase
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
