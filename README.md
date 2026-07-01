# AstraOS

[![CI Status](https://github.com/OmkarBiradarpatil/astraOS/actions/workflows/ci.yml/badge.svg)](https://github.com/OmkarBiradarpatil/astraOS/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React Version](https://img.shields.io/badge/React-19.2.6-cyan.svg)](https://react.dev)
[![Node Version](https://img.shields.io/badge/Node-%3E%3D22.12.0-green.svg)](https://nodejs.org)
[![Express Version](https://img.shields.io/badge/Express-5.2.1-orange.svg)](https://expressjs.com)
[![Mongoose Version](https://img.shields.io/badge/Mongoose-9.6.3-red.svg)](https://mongoosejs.com)

AstraOS is an advanced, production-grade web application platform serving as "The Operating System for Every Mind." It pairs a custom-designed, desktop-style monolithic dashboard with a high-performance Express backend to orchestrate schedule coordination, private vault storage, AI copilot assistance, and health metrics.

---

## 🌟 Key Features

* **Command Center Dashboard**: Custom desktop-style user interface managing tasks, deadlines, focus windows, reference links, and entertainment widgets.
* **Modern Express API**: Secure RESTful backend providing complete user profile synchronization, rate-limiting, and idempotency protection.
* **Resilient AI Copilot (AYNTK)**: Smart assistant integrating with OpenRouter, featuring configurable timeouts, token limits, and local fallback rules.
* **Secure AI Vault Space**: Media upload hub leveraging signed Cloudinary upload tokens and MongoDB file catalog syncing.
* **Performance Optimizations**: Redis caching layer utilizing Upstash REST connections with automatic Map-based local fallback mechanisms.
* **Production Validation**: Pre-release smoke scripts verifying infrastructure integrity under high loads.

---

## 🏗️ Repository Architecture

AstraOS is organized as a clean, decoupled monorepo structure:

```text
AstraOS/
├── apps/
│   ├── web/                 # React 19 / TypeScript 6 / Vite 8 Frontend client
│   ├── admin/               # (Reserved) Future administration dashboard
│   └── future-mobile/       # (Reserved) Future cross-platform mobile client
├── backend/                 # Express 5 / Node 22 API Server application
├── packages/
│   ├── shared-types/        # Shared domain types and validation interfaces
│   ├── shared-utils/        # Common utility helpers
│   └── shared-ui/           # (Reserved) Cross-app React component library
├── docs/                    # Standardized documentation contracts
│   ├── api/                 # API endpoint contracts and envelopes
│   ├── architecture/        # Database designs and target structures
│   └── deployment/          # Environment parameters and cloud guides
├── infrastructure/          # Standard deployment configurations
│   ├── vercel/              # Vercel-specific routing settings
│   ├── render/              # Render web service environment configurations
│   ├── mongodb/             # MongoDB Atlas index definitions
│   ├── redis/               # Upstash rate limit namespaces
│   └── cloudinary/          # Upload folder rules
├── scripts/                 # Maintenance scripts (e.g. artifact cleaning)
└── tests/                   # Monorepo integration configurations
```

---

## 💻 Tech Stack

* **Frontend**: React 19, Vanilla CSS, TypeScript 6, Vite 8, Zustand, TanStack Query, Clerk React, Vitest.
* **Backend**: Express 5, Node 22, Mongoose 9 (MongoDB), Upstash Redis, Helmet, Morgan, Vitest, Supertest.
* **Integrations**: Clerk Auth, Upstash, Cloudinary API, OpenRouter AI API.
* **Deployment**: Vercel (Client App), Render (Web API Service).

---

## 📸 Interface Screenshots

| Dashboard Interface | Focus Engine (FocusTube) | Private Vault Space |
| :---: | :---: | :---: |
| ![Dashboard Mockup](https://raw.githubusercontent.com/OmkarBiradarpatil/AstraOS/main/docs/assets/dashboard_mockup.png) | ![FocusTube Mockup](https://raw.githubusercontent.com/OmkarBiradarpatil/AstraOS/main/docs/assets/focustube_mockup.png) | ![Vault Mockup](https://raw.githubusercontent.com/OmkarBiradarpatil/AstraOS/main/docs/assets/vault_mockup.png) |

*(Note: Screen mockups serve as placeholders; replace URLs with actual dashboard captures once live.)*

---

## 🚀 Getting Started

### Prerequisites
* Node.js version **>= 22.12.0**
* npm version **>= 11.6.0**

### 1. Installation & Bootstrapping
Clone the repository and run the bootstrap script to install dependencies across all workspaces:
```bash
git clone https://github.com/OmkarBiradarpatil/AstraOS.git
cd AstraOS
npm run bootstrap
```

### 2. Environment Setup
Create environment files in the client and server directories. Use the templates provided:
* Root Template: Copy [.env.example](.env.example)
* Frontend: Copy `apps/web/.env.example` to `apps/web/.env.local`
* Backend: Copy `backend/.env.example` to `backend/.env`

Update variables in `backend/.env` with your active cloud secrets (MongoDB URI, Upstash Token, Clerk API keys, Cloudinary credentials, OpenRouter key).

### 3. Running Locally
Start the React frontend application:
```bash
npm run dev
```

Start the Express backend server:
```bash
npm run backend:dev
```

---

## 🧪 Verification & Release Check

AstraOS enforces strict release verification gates before code is deployed.

### Test Execution
Run the complete automated test suite (lint, typecheck, frontend tests, and backend endpoints):
```bash
npm run verify:release
```

Run Playwright E2E browser tests:
```bash
npm run verify:release:e2e
```

### Database Synchronization
Ensure MongoDB indexes are explicitly created before routing production traffic (since auto-indexing is disabled in production):
```bash
npm --prefix backend run db:sync-indexes
```

### Smoke Verification
Validate live cloud integrations on staging/production environments:
```bash
npm run smoke:providers
```

---

## 🗺️ Future Roadmap

* **Complete RBAC Enforcements**: Bind roles (`student`, `teacher`, `parent`, `admin`) directly to API routes using middleware.
* **Background Scheduler**: Set up a robust worker queue (e.g. BullMQ) to run deadline email reminders.
* **Single-Resource APIs**: Expose discrete GET endpoints (`GET /api/tasks/:id`) to avoid full list loads on detail screens.
* **Structured Telemetry**: Add JSON structured logging (Winston/Pino) and OpenTelemetry tracing.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Author

**Omkar Biradarpatil**
* GitHub: [@OmkarBiradarpatil](https://github.com/OmkarBiradarpatil)
* Repository: [AstraOS](https://github.com/OmkarBiradarpatil/AstraOS)
