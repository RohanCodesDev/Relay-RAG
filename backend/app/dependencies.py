from fastapi import Header, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db

async def get_tenant_config(request: Request, x_tenant_id: str = Header(...), db: AsyncSession = Depends(get_db)):
    if not x_tenant_id:
        raise HTTPException(status_code=401, detail="X-Tenant-ID header missing")
    
    query = text("SELECT tenant_id, system_prompt, is_active, api_key, allowed_domains FROM tenants WHERE tenant_id = :tenant_id")
    result = await db.execute(query, {"tenant_id": x_tenant_id})
    tenant = result.fetchone()
    
    if not tenant:
        raise HTTPException(status_code=401, detail="Tenant not found. Please create a tenant first.")
    if not tenant.is_active:
        raise HTTPException(status_code=401, detail="Tenant is inactive")
        
    # Check Authorization (Server-to-Server)
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        if token != tenant.api_key:
            raise HTTPException(status_code=401, detail="Invalid API Key")
    else:
        # Check CORS Origin (Browser Widget)
        origin = request.headers.get("Origin")
        if origin and tenant.allowed_domains != "*":
            allowed_domains = [d.strip() for d in tenant.allowed_domains.split(",")]
            # Basic domain matching
            is_allowed = False
            for domain in allowed_domains:
                if origin.endswith(domain) or origin == domain:
                    is_allowed = True
                    break
            if not is_allowed:
                raise HTTPException(status_code=403, detail="CORS Origin not allowed for this tenant")

    return {
        "tenant_id": tenant.tenant_id,
        "system_prompt": tenant.system_prompt
    }
