from pydantic import BaseModel
from typing import Optional
from uuid import UUID

class IngestRequest(BaseModel):
    text: str

class ChatRequest(BaseModel):
    session_id: UUID
    message: str

class TenantCreate(BaseModel):
    tenant_id: str
    system_prompt: str
    primary_color: str = "#0f172a"
    widget_title: str = "AI Assistant"
    bot_avatar_url: str = ""
    allowed_domains: str = "*"

class TenantUpdate(BaseModel):
    system_prompt: str

class WidgetConfigUpdate(BaseModel):
    primary_color: str
    widget_title: str
    bot_avatar_url: str
    allowed_domains: str
