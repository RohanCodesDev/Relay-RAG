import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgresql://"):
    # SQLAlchemy requires postgresql+asyncpg:// for the asyncpg driver
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
    
    # asyncpg expects 'ssl=require' instead of 'sslmode=require' and doesn't support 'channel_binding'
    DATABASE_URL = DATABASE_URL.replace("sslmode=require", "ssl=require")
    DATABASE_URL = DATABASE_URL.replace("&channel_binding=require", "")
    DATABASE_URL = DATABASE_URL.replace("channel_binding=require", "")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
