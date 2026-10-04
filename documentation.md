# Relay: Dynamic Multi-Tenant RAG API & Chat Interfaces

**Project Lead:** Rohan Chakraborti

## 1. System Architecture & Scope
This project establishes a completely dynamic, multi-tenant Retrieval-Augmented Generation (RAG) system. It allows an arbitrary number of websites (tenants) to share a highly scalable LLM engine (Groq with local Ollama fallback) while strictly isolating their data and business logic.

The architecture is divided into three layers:
- **AI Backend (Python/FastAPI):** A stateless microservice handling embedding, database retrieval, and LLM text generation.
- **Persistence Layer (Neon DB):** A unified PostgreSQL database using `pgvector` for semantic search, `tsvector` for keyword search, and relational tables for tenant configurations and chat session memory.
- **Frontend (Next.js & Vanilla JS):** A Next.js admin dashboard for tenant management, and a lightweight, embeddable Vanilla JS widget for the client-facing chat interface.

## 2. Tech Stack & Prerequisites
- **LLM Engine:** Groq (`openai/gpt-oss-20b`) as primary via API, with local Ollama (`http://localhost:11434` running `tinyllama`) as seamless fallback.
- **Database:** Neon Serverless PostgreSQL.
- **Backend Environment:** Python 3.12+ virtual environment.
- **Python Dependencies:** `fastapi uvicorn sqlalchemy asyncpg pgvector langchain langchain-postgres langchain-ollama langchain-groq sentence-transformers pydantic`

## 3. Unified Database Schema (Neon DB)
Enforces tenant isolation, handles multi-turn memory, and establishes a Reciprocal Rank Fusion (RRF) function for hybrid vector + keyword search. (SQL Schema is documented in the original plan and to be executed during setup).

## 4. Python FastAPI Backend Implementation
The API must enforce statelessness in memory, routing all contextual state through Neon DB.

**Directory Structure:**
```text
backend/
├── app/
│   ├── main.py              # FastAPI entry point & routers
│   ├── models.py            # Pydantic schemas
│   ├── database.py          # SQLAlchemy async engine setup
│   ├── dependencies.py      # Extract X-Tenant-ID header and validate in DB
│   └── rag_service.py       # Embedding generation, SQL execution, LLM streaming
└── requirements.txt
```

**Core Security & Pipeline Logic:**
- **Header Validation (`dependencies.py`):** The API must never extract the `tenant_id` from a JSON body. It must extract it exclusively from the `X-Tenant-ID` HTTP header. Validate this ID against the `tenants` table; if it is missing or inactive, raise an HTTP 401 Unauthorized exception.
- **Ingestion Pipeline (`rag_service.py`):**
  - Endpoint: `POST /ingest`
  - Split documents using LangChain's `RecursiveCharacterTextSplitter`.
  - Embed text using `sentence-transformers` locally.
  - Execute an `INSERT` into `document_chunks`, ensuring `tenant_id` is explicitly mapped.
- **Retrieval & Streaming Generation (`rag_service.py`):**
  - Endpoint: `POST /chat`
  - Accepts `session_id` and `message`.
  - Retrieve the last 4 messages for the `session_id` from the `chat_messages` table.
  - Embed the new user message.
  - Execute the `hybrid_search_rrf` Postgres function using the embedding, query string, and extracted `tenant_id`.
  - Assemble a LangChain prompt containing the tenant's `system_prompt`, retrieved SQL context, past chat history, and the new query.
  - Utilize LangChain's `.astream()` method integrated with FastAPI's `StreamingResponse`. The async generator must yield chunks natively formatted for Server-Sent Events (SSE) (e.g., `yield f"data: {chunk}\n\n"`) to ensure the frontend receives words in real-time.

## 5. Frontend Interfaces
Two distinct web frontends communicating with the Python backend.

### A. The Embeddable Chat Widget (Client-Facing)
- **Framework:** Vanilla JavaScript or Preact bundled into a single minified `widget.js` file.
- **Initialization:** The widget injects itself into any DOM when a script tag is present. It reads the `data-tenant-id` attribute from its own script tag to know which tenant it belongs to.
- **Execution:**
  - Creates a floating chat UI.
  - Assigns a UUID as the `session_id` on load.
  - Sends requests using the browser's `fetch` API, explicitly appending `X-Tenant-ID: [id_from_script]` to the headers.
  - Processes the Server-Sent Events (SSE) stream to display text dynamically without waiting for the full response.

### B. The Admin Dashboard (Internal)
- **Framework:** Next.js (App Router), Tailwind CSS, shadcn/ui.
- **Database Connection:** Connect directly to Neon DB using `pg` or Drizzle ORM.
- **Features:**
  - **Tenant Management:** A CRUD interface to add new websites, generate their `tenant_id`, and write/edit their unique `system_prompt` stored in the `tenants` table.
  - **Knowledge Base Uploads:** A file upload interface that sends PDFs or text directly to the Python FastAPI `POST /ingest` endpoint, passing the selected `tenant_id` in the header.
  - **Chat Logs:** A dashboard view executing a SQL query on the `chat_messages` table to review user conversations across tenants.
