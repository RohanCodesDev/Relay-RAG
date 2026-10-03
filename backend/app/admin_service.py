from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
import PyPDF2
from io import BytesIO
import secrets
from app.rag_service import embedding_model
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.models import TenantCreate, TenantUpdate, WidgetConfigUpdate
import json

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/tenants")
async def list_tenants(db: AsyncSession = Depends(get_db)):
    # Get all tenants and their vector counts
    query = """
        SELECT t.tenant_id, t.api_key, t.created_at, t.system_prompt, 
               t.primary_color, t.widget_title, t.bot_avatar_url, t.allowed_domains,
               COUNT(c.id) as vector_count
        FROM tenants t
        LEFT JOIN document_chunks c ON t.tenant_id = c.tenant_id
        GROUP BY t.tenant_id, t.api_key, t.created_at, t.system_prompt, t.primary_color, t.widget_title, t.bot_avatar_url, t.allowed_domains
        ORDER BY t.created_at DESC
    """
    result = await db.execute(text(query))
    tenants = result.fetchall()
    
    return [
        {
            "tenant_id": t.tenant_id, 
            "api_key": t.api_key or "No API Key", 
            "created_at": str(t.created_at),
            "system_prompt": t.system_prompt,
            "primary_color": t.primary_color,
            "widget_title": t.widget_title,
            "bot_avatar_url": t.bot_avatar_url,
            "allowed_domains": t.allowed_domains,
            "vector_count": t.vector_count
        } for t in tenants
    ]

@router.post("/tenants")
async def create_tenant(tenant: TenantCreate, db: AsyncSession = Depends(get_db)):
    # Check if tenant exists
    check_query = text("SELECT tenant_id FROM tenants WHERE tenant_id = :tid")
    res = await db.execute(check_query, {"tid": tenant.tenant_id})
    if res.fetchone():
        raise HTTPException(status_code=400, detail="Tenant already exists")
    
    query = text("""
        INSERT INTO tenants (tenant_id, system_prompt, primary_color, widget_title, bot_avatar_url, allowed_domains) 
        VALUES (:tid, :prompt, :pcolor, :wtitle, :avatar, :domains)
    """)
    await db.execute(query, {
        "tid": tenant.tenant_id, 
        "prompt": tenant.system_prompt,
        "pcolor": tenant.primary_color,
        "wtitle": tenant.widget_title,
        "avatar": tenant.bot_avatar_url,
        "domains": tenant.allowed_domains
    })
    await db.commit()
    return {"message": f"Tenant {tenant.tenant_id} created successfully."}

@router.put("/tenants/{tenant_id}")
async def update_tenant(tenant_id: str, update: TenantUpdate, db: AsyncSession = Depends(get_db)):
    query = text("UPDATE tenants SET system_prompt = :prompt WHERE tenant_id = :tid")
    res = await db.execute(query, {"prompt": update.system_prompt, "tid": tenant_id})
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Tenant not found")
    await db.commit()
    return {"message": f"Tenant {tenant_id} updated successfully."}

@router.put("/tenants/{tenant_id}/widget")
async def update_widget_config(tenant_id: str, update: WidgetConfigUpdate, db: AsyncSession = Depends(get_db)):
    query = text("""
        UPDATE tenants 
        SET primary_color = :pcolor, widget_title = :wtitle, bot_avatar_url = :avatar, allowed_domains = :domains 
        WHERE tenant_id = :tid
    """)
    res = await db.execute(query, {
        "pcolor": update.primary_color,
        "wtitle": update.widget_title,
        "avatar": update.bot_avatar_url,
        "domains": update.allowed_domains,
        "tid": tenant_id
    })
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Tenant not found")
    await db.commit()
    return {"message": f"Widget config for {tenant_id} updated."}

@router.get("/documents")
async def list_documents(db: AsyncSession = Depends(get_db)):
    query = """
        SELECT tenant_id, metadata->>'filename' as filename, COUNT(id) as chunks
        FROM document_chunks
        WHERE metadata->>'filename' IS NOT NULL
        GROUP BY tenant_id, metadata->>'filename'
    """
    result = await db.execute(text(query))
    docs = result.fetchall()
    return [
        {
            "tenant_id": d.tenant_id,
            "filename": d.filename,
            "chunks": d.chunks
        } for d in docs
    ]

@router.delete("/documents/{tenant_id}/{filename}")
async def delete_document(tenant_id: str, filename: str, db: AsyncSession = Depends(get_db)):
    query = text("DELETE FROM document_chunks WHERE tenant_id = :tid AND metadata->>'filename' = :fname")
    res = await db.execute(query, {"tid": tenant_id, "fname": filename})
    await db.commit()
    return {"message": f"Deleted {res.rowcount} chunks for {filename} from {tenant_id}"}


@router.get("/chats")
async def get_chats(db: AsyncSession = Depends(get_db)):
    query = """
        SELECT c.id, c.session_id, c.role, c.content, c.created_at, s.tenant_id
        FROM chat_messages c
        JOIN chat_sessions s ON c.session_id = s.session_id
        ORDER BY c.created_at DESC
        LIMIT 100
    """
    result = await db.execute(text(query))
    messages = result.fetchall()
    
    return [
        {
            "id": m.id,
            "session_id": str(m.session_id),
            "role": m.role,
            "content": m.content,
            "created_at": str(m.created_at),
            "tenant_id": m.tenant_id
        } for m in messages
    ]

@router.post("/tenants/{tenant_id}/api-key")
async def generate_api_key(tenant_id: str, db: AsyncSession = Depends(get_db)):
    # Generate a secure 32-character API key
    new_key = f"relay_{secrets.token_urlsafe(24)}"
    
    query = text("UPDATE tenants SET api_key = :key WHERE tenant_id = :tid")
    await db.execute(query, {"key": new_key, "tid": tenant_id})
    await db.commit()
    return {"message": "API Key generated", "api_key": new_key}

@router.delete("/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, db: AsyncSession = Depends(get_db)):
    # Cascades will delete all vectors and chats
    query = text("DELETE FROM tenants WHERE tenant_id = :tid")
    await db.execute(query, {"tid": tenant_id})
    await db.commit()
    return {"message": f"Tenant {tenant_id} and all data purged."}

@router.post("/ingest/file")
async def ingest_file(
    file: UploadFile = File(...), 
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    db: AsyncSession = Depends(get_db)
):
    if file.filename.endswith(".pdf"):
        content = await file.read()
        pdf_reader = PyPDF2.PdfReader(BytesIO(content))
        extracted_text = ""
        for page in pdf_reader.pages:
            extracted_text += page.extract_text() + "\n"
    elif file.filename.endswith((".md", ".txt")):
        content = await file.read()
        extracted_text = content.decode("utf-8")
    else:
        raise HTTPException(status_code=400, detail="Only PDF, MD, or TXT files are supported")
        
    if not extracted_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF")

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = splitter.split_text(extracted_text)
    
    embeddings = embedding_model.encode(chunks, convert_to_numpy=True).tolist()
    
    insert_query = text("""
        INSERT INTO document_chunks (tenant_id, content, embedding, metadata)
        VALUES (:tenant_id, :content, CAST(:embedding AS VECTOR), :metadata)
    """)
    
    for chunk, emb in zip(chunks, embeddings):
        await db.execute(insert_query, {
            "tenant_id": x_tenant_id,
            "content": chunk,
            "embedding": emb,
            "metadata": json.dumps({"filename": file.filename})
        })
    
    await db.commit()
    return {"message": f"Successfully ingested PDF ({len(chunks)} chunks) for {x_tenant_id}"}
