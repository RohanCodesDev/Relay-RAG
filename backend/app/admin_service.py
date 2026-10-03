from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
import PyPDF2
from io import BytesIO
import secrets
from app.rag_service import embedding_model
from langchain_text_splitters import RecursiveCharacterTextSplitter

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/tenants")
async def list_tenants(db: AsyncSession = Depends(get_db)):
    # Get all tenants and their vector counts
    query = """
        SELECT t.tenant_id, t.api_key, t.created_at, COUNT(c.id) as vector_count
        FROM tenants t
        LEFT JOIN document_chunks c ON t.tenant_id = c.tenant_id
        GROUP BY t.tenant_id, t.api_key, t.created_at
        ORDER BY t.created_at DESC
    """
    result = await db.execute(text(query))
    tenants = result.fetchall()
    
    return [
        {
            "tenant_id": t.tenant_id, 
            "api_key": t.api_key or "No API Key", 
            "created_at": str(t.created_at),
            "vector_count": t.vector_count
        } for t in tenants
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
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported right now")
    
    content = await file.read()
    pdf_reader = PyPDF2.PdfReader(BytesIO(content))
    extracted_text = ""
    for page in pdf_reader.pages:
        extracted_text += page.extract_text() + "\n"
        
    if not extracted_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF")

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = splitter.split_text(extracted_text)
    
    embeddings = embedding_model.encode(chunks, convert_to_numpy=True).tolist()
    
    insert_query = text("""
        INSERT INTO document_chunks (tenant_id, content, embedding)
        VALUES (:tenant_id, :content, CAST(:embedding AS VECTOR))
    """)
    
    for chunk, emb in zip(chunks, embeddings):
        await db.execute(insert_query, {
            "tenant_id": x_tenant_id,
            "content": chunk,
            "embedding": emb
        })
    
    await db.commit()
    return {"message": f"Successfully ingested PDF ({len(chunks)} chunks) for {x_tenant_id}"}
