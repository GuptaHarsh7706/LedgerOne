import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from src.config import get_settings
from src.db.pool import db_manager

async def inspect():
    await db_manager.connect(get_settings().DATABASE_URL)
    async with db_manager.pool.acquire() as conn:
        tables = await conn.fetch("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        """)
        print("Tables:", [t["table_name"] for t in tables])
        
        cols = await conn.fetch("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'document_chunks'
            ORDER BY ordinal_position;
        """)
        print("document_chunks columns:", [(c["column_name"], c["data_type"]) for c in cols])
        
        # Check if benchmark tenants exist
        orgs = await conn.fetch("SELECT id, name, slug FROM organizations")
        print("Existing organizations:", [(str(o["id"]), o["name"], o["slug"]) for o in orgs])
        
        chunk_count = await conn.fetchval("SELECT COUNT(*) FROM document_chunks")
        print("Total existing chunks in document_chunks:", chunk_count)
    await db_manager.disconnect()

if __name__ == "__main__":
    asyncio.run(inspect())
