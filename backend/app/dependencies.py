from fastapi import Header, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db

async def get_tenant_config(x_tenant_id: str = Header(...), db: AsyncSession = Depends(get_db)):
    if not x_tenant_id:
        raise HTTPException(status_code=401, detail="X-Tenant-ID header missing")
    
    query = text("SELECT tenant_id, system_prompt, is_active FROM tenants WHERE tenant_id = :tenant_id")
    result = await db.execute(query, {"tenant_id": x_tenant_id})
    tenant = result.fetchone()
    
    if not tenant:
        raise HTTPException(status_code=401, detail="Tenant not found. Please create a tenant first.")
    if not tenant.is_active:
        raise HTTPException(status_code=401, detail="Tenant is inactive")
        
    return {
        "tenant_id": tenant.tenant_id,
        "system_prompt": tenant.system_prompt
    }
