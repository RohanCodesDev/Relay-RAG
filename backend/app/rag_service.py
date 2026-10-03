import json
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from langchain_ollama import ChatOllama
from langchain_groq import ChatGroq
import os
from app.database import get_db, AsyncSessionLocal
from app.models import IngestRequest, ChatRequest
from app.dependencies import get_tenant_config

router = APIRouter()

print("Loading SentenceTransformer model...")
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

# 1. Primary Model (Groq - openai/gpt-oss-20b)
# (If key is missing, we pass a dummy so it doesn't crash on startup)
primary_llm = ChatGroq(model="openai/gpt-oss-20b", api_key=os.getenv("GROQ_API_KEY", "missing_key"))

# 2. Fallback Model (Local Ollama - TinyLlama)
fallback_llm = ChatOllama(model="tinyllama", base_url="http://localhost:11434")

# 3. LangChain automatically handles rate limits, timeouts, and auth errors by switching to the fallback!
llm = primary_llm.with_fallbacks([fallback_llm])

@router.post("/ingest")
async def ingest_document(
    request: IngestRequest, 
    tenant_config: dict = Depends(get_tenant_config),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = tenant_config["tenant_id"]
    
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = splitter.split_text(request.text)
    
    embeddings = embedding_model.encode(chunks)
    
    insert_query = text("""
        INSERT INTO document_chunks (tenant_id, content, embedding, metadata)
        VALUES (:tenant_id, :content, CAST(:embedding AS VECTOR), :metadata)
    """)
    
    for chunk, emb in zip(chunks, embeddings):
        await db.execute(insert_query, {
            "tenant_id": tenant_id,
            "content": chunk,
            "embedding": str(emb.tolist()),
            "metadata": json.dumps({})
        })
    
    await db.commit()
    
    return {"message": f"Successfully ingested {len(chunks)} chunks for tenant {tenant_id}"}

@router.post("/chat")
async def chat(
    request: ChatRequest,
    tenant_config: dict = Depends(get_tenant_config),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = tenant_config["tenant_id"]
    session_id = str(request.session_id)
    
    # Ensure session exists
    session_check_query = text("SELECT session_id FROM chat_sessions WHERE session_id = :session_id AND tenant_id = :tenant_id")
    res = await db.execute(session_check_query, {"session_id": session_id, "tenant_id": tenant_id})
    if not res.fetchone():
        create_session_query = text("INSERT INTO chat_sessions (session_id, tenant_id) VALUES (:session_id, :tenant_id)")
        await db.execute(create_session_query, {"session_id": session_id, "tenant_id": tenant_id})
        await db.commit()

    # 1. Embed user query
    query_emb = embedding_model.encode([request.message])[0].tolist()
    
    # 2. Hybrid search via RRF
    search_query = text("""
        SELECT content FROM hybrid_search_rrf(
            :tenant_id, :query_text, CAST(:query_embedding AS VECTOR), 5, 60
        )
    """)
    search_res = await db.execute(search_query, {
        "tenant_id": tenant_id,
        "query_text": request.message,
        "query_embedding": str(query_emb) # pgvector string format
    })
    
    context_chunks = [row[0] for row in search_res.fetchall()]
    context_str = "\n\n".join(context_chunks)
    
    # 3. Retrieve chat history
    history_query = text("""
        SELECT role, content FROM chat_messages 
        WHERE session_id = :session_id
        ORDER BY created_at DESC LIMIT 4
    """)
    history_res = await db.execute(history_query, {"session_id": session_id})
    history_rows = history_res.fetchall()[::-1]
    
    chat_history = []
    for row in history_rows:
        if row[0] == 'user':
            chat_history.append(HumanMessage(content=row[1]))
        elif row[0] == 'assistant':
            chat_history.append(AIMessage(content=row[1]))

    # 4. Save user message to DB
    insert_msg_query = text("""
        INSERT INTO chat_messages (session_id, role, content)
        VALUES (:session_id, 'user', :content)
    """)
    await db.execute(insert_msg_query, {"session_id": session_id, "content": request.message})
    await db.commit()
    
    # 5. Prepare LLM Prompt
    prompt = ChatPromptTemplate.from_messages([
        ("system", "{system_prompt}\n\nContext information is below.\n---------------------\n{context}\n---------------------"),
        MessagesPlaceholder(variable_name="chat_history"),
        ("human", "{question}")
    ])
    
    chain = prompt | llm
    
    async def generate_sse():
        full_response = ""
        async for chunk in chain.astream({
            "system_prompt": tenant_config["system_prompt"],
            "context": context_str,
            "chat_history": chat_history,
            "question": request.message
        }):
            token = chunk.content
            if token:
                full_response += token
                yield f"data: {json.dumps({'text': token})}\n\n"
        
        # Save assistant message
        insert_assistant_msg = text("""
            INSERT INTO chat_messages (session_id, role, content)
            VALUES (:session_id, 'assistant', :content)
        """)
        async with AsyncSessionLocal() as new_db:
            await new_db.execute(insert_assistant_msg, {"session_id": session_id, "content": full_response})
            await new_db.commit()
            
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate_sse(), media_type="text/event-stream")
