from pydantic import BaseModel
from typing import Optional
from uuid import UUID

class IngestRequest(BaseModel):
    text: str

class ChatRequest(BaseModel):
    session_id: UUID
    message: str
