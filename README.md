<div align="center">

# Cellix

### AI-Powered Excel Assistant for Ecommerce Sellers

**Analyze your Shopee & Lazada data without leaving Excel.**

[![Node.js 20](https://img.shields.io/badge/Node.js-20_LTS-339933?logo=nodedotjs)](#tech-stack)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react)](#tech-stack)
[![Office Add-in](https://img.shields.io/badge/Office-Add--in-D83B01?logo=microsoftexcel)](#architecture)
[![License](https://img.shields.io/badge/License-All%20Rights%20Reserved-red)](#license)

</div>

---

Cellix is an Excel Office Add-in that brings AI-powered analytics directly into your spreadsheets. Built specifically for Shopee and Lazada sellers, it understands ecommerce KPIs, formulas, and best practices out of the box. Ask questions about your data in natural language, and Cellix will analyze, calculate, and format — all with a **preview-first** safety model where you approve every change before it happens.

## What Makes Cellix Different

**Preview Everything.** Cellix never modifies your spreadsheet without showing you exactly what will change first. Every write, formula, and format change goes through a diff view with explicit approval. No surprises.

**Domain Intelligence.** This isn't a generic AI assistant bolted onto Excel. Cellix understands ecommerce metrics — ROAS, conversion rates, ACOS, inventory turnover — and provides contextual advice specific to Southeast Asian marketplace sellers.

**Your Data Stays Local.** Only small samples (max 50 rows) are sent to the AI for context. Full sheets never leave your machine.

---

## How It Works

```
┌─────────────────────────────────────────────────────┐
│                    Excel                             │
│  ┌──────────────────────────────────────────────┐   │
│  │            Cellix Task Pane                   │   │
│  │                                               │   │
│  │  "What's my best performing product           │   │
│  │   category by ROAS this month?"               │   │
│  │                                               │   │
│  │  ┌─────────────────────────────────────────┐  │   │
│  │  │  Preview: Write to E2:E15               │  │   │
│  │  │  ┌────────┬────────┬────────┐           │  │   │
│  │  │  │ Cell   │ Before │ After  │           │  │   │
│  │  │  │ E2     │ (empty)│ 3.2x   │           │  │   │
│  │  │  │ E3     │ (empty)│ 2.8x   │           │  │   │
│  │  │  │ ...    │        │        │           │  │   │
│  │  │  └────────┴────────┴────────┘           │  │   │
│  │  │         [ Approve ]  [ Reject ]         │  │   │
│  │  └─────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

1. **Ask** — Type a question or instruction in natural language
2. **Preview** — Cellix shows a diff of every cell it wants to change
3. **Approve** — Accept, modify, or reject the proposed changes
4. **Execute** — Changes are applied to your spreadsheet with full audit logging

---

## Features

### AI Chat
- Natural language questions about your spreadsheet data
- Streaming responses via Server-Sent Events
- Token budget management to prevent runaway API costs (50k tokens/session)
- Ecommerce-specialized system prompt with Shopee/Lazada domain knowledge

### Excel Tools

| Category | Tools | Requires Preview |
|----------|-------|:---:|
| **Write** | `write_range`, `set_formula`, `format_range`, `create_sheet`, `add_table`, `highlight_cells` | Yes |
| **Read** | `read_range`, `get_selection`, `get_sheet_names`, `get_context` | No |
| **Analytics** | `explain_kpi`, `suggest_actions` | No |

### Safety Controls
- All writes require preview and approval
- Maximum 500 cells per write operation
- Extra confirmation dialog for writes > 50 cells
- No sheet deletion or workbook-level operations
- No external formula links or macros
- Formula safety validation (no INDIRECT to external sources)
- Full audit logging of every action

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Add-in UI | React 18 + TypeScript + Vite |
| Components | Fluent UI React v9 |
| State | Zustand |
| Excel API | Office.js |
| Backend | Fastify (Node.js 20) |
| AI | OpenAI GPT-4o (Azure fallback) |
| Validation | Zod |
| Monorepo | pnpm workspaces |

---

## Architecture

```
cellix/
├── apps/
│   ├── addin/              # Excel Add-in (React + Office.js)
│   │   ├── src/
│   │   │   ├── components/ #   Chat, Preview, Controls, Alerts
│   │   │   ├── hooks/      #   useExcelContext, useChat, etc.
│   │   │   ├── lib/        #   Excel helpers, API client, tools
│   │   │   ├── store/      #   Zustand state management
│   │   │   └── types/
│   │   └── manifest.xml    #   Office Add-in manifest
│   │
│   └── backend/            # Fastify API server
│       └── src/
│           ├── routes/     #   Health, chat endpoints
│           ├── services/   #   AI service, tool execution
│           └── lib/        #   Environment, token counting
│
├── packages/
│   └── shared/             # Shared TypeScript types
│
└── PRPs/                   # Phase requirement documents
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 8+
- Microsoft Excel (desktop or web)
- OpenAI API key

### Setup

```bash
# Clone
git clone https://github.com/zandietje/cellix.git
cd cellix

# Install dependencies
pnpm install

# Configure environment
cp apps/backend/.env.example apps/backend/.env
# Edit .env and add your OPENAI_API_KEY

# Run both add-in and backend
pnpm dev
```

Then sideload the add-in in Excel using the generated `manifest.xml`.

---

## Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Foundation (monorepo, add-in shell, backend) | Done |
| 2 | Excel Integration (read/write, context extraction) | Done |
| 3 | AI Chat (OpenAI streaming, tool schemas) | Done |
| 4 | Tool Execution (preview system, validation, safety) | Done |
| 5 | RAG Knowledge Base (Supabase pgvector) | Planned |
| 6 | Data Connectors (Shopee/Lazada OAuth) | Planned |
| 7 | Anomaly Detection (metric monitors) | Planned |
| 8 | Comparison Intelligence | Planned |
| 9 | Report Generation | Planned |
| 10 | Template Library | Planned |
| 11 | Notifications (Slack, Teams, Email) | Planned |
| 12 | Production Polish & AppSource | Planned |

---

## License

All rights reserved.
