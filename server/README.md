# Server API (Agent Mode)

Production-oriented Express + TypeScript API for classroom simulation and teacher-led debate practice with deterministic mock LLM fallback.

`LLM_API_KEY` is treated as OpenAI API key. With key configured the backend uses OpenAI `gpt-4.1-mini` (or `LLM_MODEL`), without key it falls back to deterministic mock text.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Default base URL: `http://localhost:3001/api`
Socket.IO endpoint: `http://localhost:3001` (path: `/socket.io`)

### Example curl commands

```bash
curl -X POST http://localhost:3001/api/sessions \
  -H 'content-type: application/json' \
  -d '{"mode":"classroom","topic":"Photosynthesis"}'
```

```bash
curl -X POST http://localhost:3001/api/sessions/<SESSION_ID>/turn \
  -H 'content-type: application/json' \
  -d '{"teacherOrUserMessage":"Explain why leaves are green."}'
```

```bash
curl http://localhost:3001/api/health
```

### Socket.IO realtime

Connect:

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  path: '/socket.io',
  query: {
    sessionId: '<SESSION_ID>',
  },
});
```

Or subscribe later:

```ts
socket.emit('subscribe', { sessionId: '<SESSION_ID>' });
```

Main pushed event types:

- `simulation.turn_processed`
- `simulation.graph_updated`
- `simulation.student_states_updated`
