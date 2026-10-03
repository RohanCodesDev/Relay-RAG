import os
import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

SQL_SCHEMA = """
-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tenant Configurations
CREATE TABLE IF NOT EXISTS tenants (
    tenant_id VARCHAR(50) PRIMARY KEY,
    api_key VARCHAR(128) UNIQUE,
    system_prompt TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Document Chunks & Embeddings
CREATE TABLE IF NOT EXISTS document_chunks (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding VECTOR(384), 
    content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    metadata JSONB
);

-- 4. Indexes for Performance & Isolation
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx ON document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS document_chunks_content_tsv_idx ON document_chunks USING gin (content_tsv);
CREATE INDEX IF NOT EXISTS document_chunks_tenant_id_idx ON document_chunks (tenant_id);

-- 5. Multi-Turn Chat Memory
CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(50) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    session_id UUID REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    role VARCHAR(10) CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS chat_messages_session_id_idx ON chat_messages (session_id, created_at DESC);

-- 6. Hybrid Search Function (RRF)
CREATE OR REPLACE FUNCTION hybrid_search_rrf(
    p_tenant_id VARCHAR,
    p_query_text TEXT,
    p_query_embedding VECTOR(384),
    p_match_count INT DEFAULT 5,
    p_rrf_k INT DEFAULT 60
)
RETURNS TABLE (
    id INT,
    content TEXT,
    score NUMERIC
)
LANGUAGE sql
AS $$
WITH semantic_search AS (
    SELECT id, content, ROW_NUMBER() OVER (ORDER BY embedding <=> p_query_embedding) AS rank
    FROM document_chunks
    WHERE tenant_id = p_tenant_id
    ORDER BY embedding <=> p_query_embedding
    LIMIT p_match_count * 4
),
keyword_search AS (
    SELECT id, content, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(content_tsv, plainto_tsquery('english', p_query_text)) DESC) AS rank
    FROM document_chunks
    WHERE tenant_id = p_tenant_id
      AND content_tsv @@ plainto_tsquery('english', p_query_text)
    ORDER BY ts_rank_cd(content_tsv, plainto_tsquery('english', p_query_text)) DESC
    LIMIT p_match_count * 4
)
SELECT 
    COALESCE(s.id, k.id) AS id,
    COALESCE(s.content, k.content) AS content,
    COALESCE(1.0 / (p_rrf_k + s.rank), 0.0) + COALESCE(1.0 / (p_rrf_k + k.rank), 0.0) AS score
FROM semantic_search s
FULL OUTER JOIN keyword_search k ON s.id = k.id
ORDER BY score DESC
LIMIT p_match_count;
$$;
"""

def setup_db():
    print(f"Connecting to DB...")
    # psycopg 3 connection
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            print("Executing SQL schema script...")
            cur.execute(SQL_SCHEMA)
            conn.commit()
            print("Schema executed successfully!")

if __name__ == "__main__":
    setup_db()
