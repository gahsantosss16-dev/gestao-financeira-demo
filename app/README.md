# App — ASSOCIAPEC Gestão Financeira

```bash
npm install
npm run dev        # http://localhost:5173 — modo demonstração se não houver .env.local
npm test           # testes unitários e de interface
npm run typecheck
npm run build      # gera dist/ estático (caminhos relativos)
```

Para usar o Supabase, copie `.env.example` para `.env.local` e preencha **apenas** a URL e a chave pública
(anon) do projeto autorizado. Nunca coloque service_role, certificado ou senhas no frontend.
