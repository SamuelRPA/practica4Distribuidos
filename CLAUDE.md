# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

University distributed systems course — Practice 4. The repository is currently empty and being initialized.

Based on the course pattern (see Practica3Aerolineas), projects in this course typically use:
- **Backend**: Node.js + Express (ES modules), port 3001
- **Frontend**: Next.js 14 + React 18, port 3000
- **Databases**: Distributed multi-node setup (MongoDB + SQL Server)
- **Infrastructure**: Docker + Docker Compose

## Expected Commands (once project is initialized)

```bash
# Backend (from /backend)
npm run dev

# Frontend (from /frontend)
npm run dev

# Start all services
docker-compose up -d
```

## Architecture Pattern

This course implements distributed systems concepts such as:
- Geographic data partitioning across multiple database nodes
- Lamport Clocks / Vector Clocks for transaction ordering
- Optimistic locking for concurrent access control
- Multi-node synchronization and conflict resolution

Update this file once the actual project structure is established.
