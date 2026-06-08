# Durable Agentic Workspace (v2.0)

This workspace contains a custom, lightweight, event-driven, and durable **Agentic AI Architecture** split cleanly into a backend service and a real-time monitoring dashboard.

## Project Structure

```
Jarvis_v2.0/
├── ai-agent/                # Backend Service (Node.js + Prisma + Dockerode)
│   ├── prisma/              # Database migrations & schemas
│   ├── src/                 # Orchestrator thought-loop, sandbox & server entry
│   ├── workspace/           # Local sandbox working folder
│   └── .env                 # Backend environment variables
│
└── dashboard/               # Frontend Client (Next.js + Tailwind + WebSockets)
    ├── src/hooks/           # useAgentWebSocket stream hook
    ├── src/components/      # TaskCard visual indicator card
    ├── src/app/             # Central terminal layout grid and controller
    └── .env.local           # Frontend environment variables
```

---

## Setup & Running Guide

### 1. Requirements
- **Node.js** (v18 or higher)
- **PostgreSQL** database (e.g., via Docker or Homebrew)
- **Ollama** running locally (Note: `qwen2.5:7b` or `qwen2.5:14b` is recommended for stable JSON structures and Thai text capabilities on average CPUs/GPUs)
- **Docker Desktop / Daemon** (optional, recommended for isolated sandbox commands)

---

### 2. Backend Setup (`/ai-agent`)

1. Navigate to the backend directory:
   ```bash
   cd ai-agent
   ```
2. Configure `.env` file:
   ```env
   PORT=3000
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agentic_db?schema=public"
   OLLAMA_API_URL="http://localhost:11434"
   OLLAMA_MODEL="llama3"
   ```
3. **Docker Permissions (Linux/Ubuntu):**
   Ensure your user has permission to connect to the Docker daemon Unix socket (`/var/run/docker.sock`):
   ```bash
   sudo usermod -aG docker $USER
   ```
   *(Restart terminal or run `newgrp docker` to apply changes. Without this, backend will fallback to host execution.)*

4. **Database Initialization:**
   To initialize the database for development:
   ```bash
   npx prisma db push
   ```
   For production schema version control and migrations:
   ```bash
   npx prisma migrate dev --name init
   ```

5. **Start the backend server:**
   ```bash
   npm run dev
   ```
   *The server runs at `http://localhost:3000` with the WebSocket server active on the same port.*

---

### 3. Frontend Dashboard Setup (`/dashboard`)

1. Navigate to the frontend directory:
   ```bash
   cd dashboard
   ```
2. Start the Next.js development server:
   ```bash
   npm run dev
   ```
   *The dashboard is forced to run on port `3001` via `/dashboard/.env.local` to prevent port collisions. Access it stably at `http://localhost:3001`.*

---

## Architecture Flow

```mermaid
sequenceDiagram
    participant User as Human Browser
    participant Dashboard as Next.js Dashboard
    participant API as Express Server
    participant DB as Prisma (PostgreSQL)
    participant Agent as Orchestrator Loop
    participant Sandbox as Docker Sandbox

    User->>Dashboard: Input title & prompt
    Dashboard->>API: POST /api/tasks
    API->>DB: Save Task (Status: IDLE)
    API->>Agent: Spawn Task Loop (Async)
    API-->>Dashboard: Return Task ID (Status: RUNNING)
    
    activate Agent
    Note over Agent: Fetch state snapshot from DB
    Agent->>Agent: Call Ollama API (JSON constraint)
    Note over Agent: Parse thought, plan, and tool
    
    rect rgb(30, 27, 46)
        Note right of Agent: Tool execution
        Agent->>Sandbox: runInSandbox(command)
        Sandbox-->>Agent: return stdout / stderr
    end

    Agent->>DB: Persist state & logs (Durable State)
    Agent->>Dashboard: Emit WebSocket Event (task_update)
    deactivate Agent
    
    Note over Agent: If tool is "await_human":
    Agent->>DB: Save status: AWAITING_HUMAN
    Agent->>Dashboard: WS Event (AWAITING_HUMAN)
    Dashboard->>User: Render Amber Interruption Card
    
    User->>Dashboard: Enter feedback & approve
    Dashboard->>API: POST /api/tasks/:id/resume
    API->>Agent: Restart loop with feedback (Async)
    API-->>Dashboard: Return Status: RUNNING
```

---

## Verification & Testing
To verify sandbox security configurations (traversal protection checks, environment setup, execution fallback):
```bash
cd ai-agent
npm run test:run
```
All 3 verification tests should report **PASSED**.
