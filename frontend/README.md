# Frontend

React + TypeScript + Vite SPA. Map engine: **MapLibre GL**. State: Zustand (UI/editor) +
TanStack Query (server). See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) §8.

```
src/
├── main.tsx     # entry
├── App.tsx      # shell (feature folders arrive in WP7+)
└── setupTests.ts
```

```bash
npm install
npm run dev        # http://localhost:5173 (proxies /api -> http://localhost:8000)
npm run lint
npm run typecheck
npm test
npm run build
```
