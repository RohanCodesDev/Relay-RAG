import os
import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def insert_test_tenant():
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO tenants (tenant_id, system_prompt) 
                VALUES ('demo_tenant', 'You are a helpful and polite AI assistant for a demo application. Use the provided context to answer questions.')
                ON CONFLICT (tenant_id) DO NOTHING;
            """)
            conn.commit()
            print("Demo tenant 'demo_tenant' created successfully.")

if __name__ == "__main__":
    insert_test_tenant()
