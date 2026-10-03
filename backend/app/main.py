from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.rag_service import router as rag_router
from app.admin_service import router as admin_router
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db

app = FastAPI(title="Relay RAG API")

# Add CORS middleware to allow requests from the frontend widget and dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to specific domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rag_router)
app.include_router(admin_router)

@app.get("/")
async def root():
    return {"message": "Relay RAG API is running"}

@app.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    vector_count = await db.execute(text("SELECT COUNT(*) FROM document_chunks"))
    tenant_count = await db.execute(text("SELECT COUNT(*) FROM tenants"))
    return {
        "vectors": vector_count.scalar() or 0,
        "tenants": tenant_count.scalar() or 0
    }
