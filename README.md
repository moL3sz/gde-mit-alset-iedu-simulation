# GDE + MIT IEDU Simulation Platform

[![Project Status](https://img.shields.io/badge/status-active-16a34a?style=for-the-badge)](./)
[![License: MIT](https://img.shields.io/badge/license-MIT-2563eb?style=for-the-badge)](./LICENSE)
[![Monorepo](https://img.shields.io/badge/monorepo-client%20%2B%20server-7c3aed?style=for-the-badge)](./)
[![Realtime](https://img.shields.io/badge/realtime-socket.io-f59e0b?style=for-the-badge)](./server/src/core/realtime)
[![AI Provider](https://img.shields.io/badge/AI-Azure%20OpenAI-0ea5e9?style=for-the-badge)](./server/src/core/tools/llm.ts)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111827&style=flat-square)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white&style=flat-square)](https://vitejs.dev/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white&style=flat-square)](https://expressjs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?logo=socketdotio&logoColor=white&style=flat-square)](https://socket.io/)
[![TypeORM](https://img.shields.io/badge/TypeORM-0.3-E83524?logo=typeorm&logoColor=white&style=flat-square)](https://typeorm.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white&style=flat-square)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white&style=flat-square)](https://www.docker.com/)

## Project Goal

This project is an **agent-mode education simulation platform** with:

- real-time classroom interactions via Socket.IO,
- teacher + student agent behavior modeling,
- communication graph visualization,
- live state and metric charts,
- supervised and unsupervised simulation modes.

The core goal is to realistically simulate how classroom dynamics, attention, and knowledge transfer evolve during a full lesson.

## Main Features

- **Dual simulation mode**
  - `supervised`: a human supervisor can intervene (teacher whisper, task assignment).
  - `unsupervised`: the teacher agent adapts the lesson autonomously.
- **Realtime classroom graph**
  - nodes: teacher + students
  - edges: teacher broadcast, teacher->student, student->teacher, student<->student
- **Live bubbles & action stream**
  - communication bubbles near avatars
  - student state-driven live actions
- **Metrics and analytics**
  - attention/boredom/emotion timelines
  - “How well did they grasp the material?” percentage summary
- **Production-ready backend baseline**
  - typed Express API, request id, structured logging, middleware chain, health endpoint
- **Azure OpenAI integration**
  - Azure OpenAI support
  - deterministic mock fallback behavior

## Repository Layout

```text
.
├── client/                     # React + Vite frontend (PrimeReact + charts + graph)
├── server/                     # Express + TypeScript backend (Socket.IO + TypeORM)
├── nginx/                      # reverse-proxy config (/api + /socket.io -> server)
├── docker-compose.yml          # local postgres helper
├── docker-compose.prod.yml     # full production stack
└── deploy.sh                   # Docker Hub build/push script
```

## Architecture Snapshot

```mermaid
flowchart LR
    UI[React Client] -->|HTTP /api| API[Express API]
    UI -->|Socket.IO /supervised /unsupervised| WS[Socket Gateway]
    API --> ORCH[Orchestrator]
    ORCH --> MEM[Session Memory / Runtime State]
    ORCH --> LLM[Azure OpenAI / Mock LLM]
    API --> DB[(PostgreSQL via TypeORM)]
    WS --> UI
```

## API Overview

Base URL: `http://localhost:3000/api` (or your configured `PORT`).

### Health

- `GET /api/health`

### Simulation Sessions

- `POST /api/sessions` - create session
- `GET /api/sessions/:id` - get session summary
- `POST /api/sessions/:id/turn` - process simulation turn
- `POST /api/sessions/:id/task-assignment` - submit supervised task assignment
- `GET /api/sessions/:id/stream` - SSE placeholder (currently `501`)

### Classroom & Student Management

- `GET|POST /api/classrooms`
- `GET|PUT|DELETE /api/classrooms/:id`
- `GET /api/classrooms/:id/students`
- `GET|POST /api/students`
- `GET|PUT|DELETE /api/students/:id`

## Realtime (Socket.IO)

Path: `/socket.io`  
Namespaces:

- `/supervised`
- `/unsupervised`

Client -> server:

- `subscribe`
- `unsubscribe`
- `ping`
- `command`
- `supervisor.whisper` (supervised only)

Server -> client:

- `connection.ready`
- `subscription.confirmed`
- `subscription.removed`
- `system.pong`
- `system.error`
- `simulation.session_created`
- `simulation.turn_processed`
- `simulation.graph_updated`
- `simulation.student_states_updated`
- `simulation.agent_turn_emitted`
- `simulation.task_assignment_required`
- `simulation.supervisor_hint`

## Local Development

### 1. Prerequisites

- Node.js 20+
- npm
- Docker (recommended for PostgreSQL)

### 2. Start PostgreSQL (local)

```bash
docker compose up -d postgres
```

### 3. Backend setup

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

Note: the server automatically runs migrations at startup.

### 4. Frontend setup

```bash
cd client
npm install
npm run dev
```

Recommended `client/.env`:

```bash
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
```

Frontend URL: `http://localhost:5173`

### 5. Run TypeORM migration manually

```bash
cd server
npm run typeorm:migrate
```

## Production Deployment

### Build and push Docker images

```bash
./deploy.sh <dockerhub_username> [tag] [vite_api_url]
```

Example:

```bash
./deploy.sh mydockeruser v1.2.0 https://mydomain.com/api
```

### Start full production stack

```bash
docker compose -f docker-compose.prod.yml up -d
```

Important env vars for `docker-compose.prod.yml`:

- `DOCKERHUB_USERNAME` (required)
- `IMAGE_TAG` (optional, default: `latest`)
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`

Reverse proxy routing:

- `/api/*` -> `server`
- `/socket.io/*` -> `server`
- everything else -> `client`

## Tech Notes

- Backend: `Express + TypeScript + TypeORM + Socket.IO + Zod`
- Frontend: `React + Vite + PrimeReact + Chart.js + Tailwind`
- Logging: request id + structured logs
- Security baseline: safety guardrails + centralized error middleware
- Auth: currently placeholder-only (MVP phase)

## License

MIT - see [LICENSE](./LICENSE)
