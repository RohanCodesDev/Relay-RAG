from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.rag_service import router as rag_router

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

@app.get("/")
async def root():
    return {"message": "Relay RAG API is running"}
