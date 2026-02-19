# Agentic SOC - AI-Powered Security Operations

Intelligent security orchestration and automated response platform powered by multi-provider AI support.

## Quick Start

### Prerequisites

- Docker and Docker Compose (for containerized setup)
- Node.js 20+ and npm (for local development)
- PostgreSQL 15+ (if not using Docker)

### Development Setup

#### Option 1: Database Only (Recommended for Development)

Run PostgreSQL in Docker while developing the app locally:

```bash
# Start only the PostgreSQL database
docker-compose up postgres -d

# Copy environment variables
cp .env.example .env.local

# Edit .env.local and add your API keys
# DATABASE_URL is already set for local Docker PostgreSQL

# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Push database schema (creates tables)
npm run db:push

# Start development server
npm run dev
```

The app will be available at http://localhost:3000

#### Option 2: Full Stack with Docker

Run both the database and app in Docker:

```bash
# Copy environment variables
cp .env.example .env

# Edit .env and add your API keys

# Build and start all services
docker-compose --profile full-stack up --build

# Or run in detached mode
docker-compose --profile full-stack up -d --build
```

### Docker Commands

```bash
# Start only database
docker-compose up postgres -d

# Stop database
docker-compose down

# Start full stack (db + app)
docker-compose --profile full-stack up -d

# View logs
docker-compose logs -f

# View app logs only
docker-compose logs -f app

# View database logs only
docker-compose logs -f postgres

# Stop all services
docker-compose --profile full-stack down

# Remove volumes (deletes database data)
docker-compose down -v
```

### Database Management

```bash
# Generate Prisma client
npm run db:generate

# Push schema changes (development)
npm run db:push

# Create migration (production)
npm run db:migrate

# Open Prisma Studio (database GUI)
npm run db:studio
```

## Environment Variables

Copy `.env.example` to `.env.local` (for development) or `.env` (for Docker) and configure:

### Required
- `DATABASE_URL` - PostgreSQL connection string
- At least one AI provider API key (GLM_API_KEY, OPENAI_API_KEY, etc.)

### Optional AI Providers
- **GLM 4.6** (Primary): `GLM_API_KEY`, `GLM_BASE_URL`, `GLM_MODEL`
- **OpenAI**: `OPENAI_API_KEY`
- **Azure OpenAI**: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`
- **OpenRouter**: `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`

### Optional Splunk Integration
- **Splunk Host**: `SPLUNK_HOST` - Your Splunk server hostname or IP
- **Splunk Port**: `SPLUNK_PORT` - REST API port (default: 8089)
- **Splunk Scheme**: `SPLUNK_SCHEME` - http or https (default: https)
- **Authentication** (choose one):
  - API Token (recommended): `SPLUNK_API_TOKEN`
  - Username/Password: `SPLUNK_USER`, `SPLUNK_PASSWORD`

When configured, agents will automatically execute relevant Splunk queries during investigations and include the results in their analysis.

## Project Structure

```
app/
├── app/                    # Next.js pages
│   ├── layout.tsx         # Root layout with sidebar
│   ├── page.tsx           # Dashboard homepage
│   ├── alerts/            # Alert management pages
│   ├── investigations/    # Investigation pages
│   ├── reports/           # Report pages
│   └── settings/          # Settings pages
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── app-sidebar.tsx   # Navigation sidebar
│   └── theme-provider.tsx # Dark mode provider
├── lib/                   # Utilities and services
│   ├── ai/               # AI provider abstraction
│   │   ├── client.ts     # Unified AI client
│   │   ├── types.ts      # Type definitions
│   │   └── index.ts      # Exports
│   ├── agents/           # Agent execution services
│   │   ├── config-loader.ts  # YAML config loader
│   │   ├── executor.ts   # Agent execution engine
│   │   └── types.ts      # Agent type definitions
│   ├── splunk/           # Splunk integration
│   │   └── client.ts     # Splunk REST API client
│   └── db.ts             # Prisma client
├── prisma/
│   └── schema.prisma     # Database schema
├── docker-compose.yml    # Docker services configuration
├── Dockerfile            # App container configuration
└── .env.local            # Environment variables (local)
```

## Database Schema

- **Alert** - Security alerts from various sources
- **Investigation** - AI-powered investigation workflows
- **AgentExecution** - Individual agent execution logs
- **Report** - Generated investigation reports
- **AIProvider** - Configured AI model providers

## Features

### Current (MVP)
- ✅ Dashboard with statistics
- ✅ Multi-AI provider support (GLM 4.6, OpenAI, Azure, OpenRouter)
- ✅ Alert management (create, view, filter)
- ✅ Investigation workflow with AI agents
- ✅ AI agent execution system (12 specialized agents)
- ✅ Splunk integration (automatic query execution)
- ✅ AI-powered report generation
- ✅ AI provider settings UI
- ✅ Dark/light mode
- ✅ Responsive UI with shadcn/ui
- ✅ PostgreSQL database with Prisma ORM
- ✅ Docker Compose setup

### Specialized Agents
- **General Investigation**: Orchestrator, Context Enrichment, Timeline Correlation
- **Threat Detection**: Authentication Investigation, Endpoint Behavior, Malware Analysis
- **AWS Security**: CloudTrail Investigation, CloudWatch Logs, CloudWatch Metrics, VPC Flow Logs
- **Analysis & Reporting**: Report Generation, Case Correlation

### Planned
- 📋 Real-time investigation updates (WebSocket)
- 📋 Advanced correlation algorithms
- 📋 User authentication and RBAC
- 📋 Email/Slack notifications
- 📋 Investigation playbooks
- 📋 Custom agent creation UI

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **UI**: shadcn/ui, Tailwind CSS, Radix UI
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL 15, Prisma ORM
- **AI**: Multi-provider (GLM 4.6, OpenAI, Azure, OpenRouter)
- **Deployment**: Docker, Docker Compose

## Development Workflow

1. Start database: `docker-compose up postgres -d`
2. Update schema: Edit `prisma/schema.prisma`
3. Push changes: `npm run db:push`
4. Start dev server: `npm run dev`
5. Make changes and test at http://localhost:3000

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running: `docker-compose ps`
- Check DATABASE_URL in `.env.local`
- Verify port 5432 is not in use

### Prisma Errors
- Regenerate client: `npm run db:generate`
- Reset database: `docker-compose down -v && docker-compose up postgres -d`
- Push schema: `npm run db:push`

### Build Errors
- Clear Next.js cache: `rm -rf .next`
- Reinstall dependencies: `rm -rf node_modules && npm install`

## License

MIT
