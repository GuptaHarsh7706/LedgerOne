import asyncio
import json
import os
import sys
import uuid

sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from src.config import get_settings
from src.db.pool import db_manager
from src.intelligence.embeddings import embed_texts, vector_to_pg_str
from src.services.retrieval_service import retrieval_service, RetrievalQueryRequest

async def test_seeding():
    await db_manager.connect(get_settings().DATABASE_URL)
    
    with open("benchmarks/evaluation_dataset_v4.json", "r", encoding="utf-8") as f:
        eval_ds = json.load(f)
        
    async with db_manager.pool.acquire() as conn:
        # Check/get user id for audit or nullable uploaded_by_user_id
        admin_user_id = await conn.fetchval("SELECT id FROM users LIMIT 1")
        
        # Upsert tenants and workspaces
        for t in eval_ds["metadata"]["tenants"]:
            org_id = uuid.UUID(t["id"])
            ws_id = uuid.UUID(t["workspace_id"])
            await conn.execute("""
                INSERT INTO organizations (id, name, slug)
                VALUES ($1, $2, $3)
                ON CONFLICT (id) DO UPDATE SET name = $2, slug = $3;
            """, org_id, t["name"], t["slug"])
            
            await conn.execute("""
                INSERT INTO workspaces (id, organization_id, name, slug)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (organization_id, id) DO UPDATE SET name = $3, slug = $4;
            """, ws_id, org_id, t["workspace_name"], t["slug"] + "-ws")
            
        print("Tenants and workspaces seeded.")
        
        # Seed first document
        doc0 = eval_ds["documents"][0]
        doc_id = uuid.UUID(doc0["uuid"])
        tenant_id = uuid.UUID(doc0["tenant_id"])
        ws_id = uuid.UUID(eval_ds["metadata"]["tenants"][0]["workspace_id"])
        
        await conn.execute("""
            INSERT INTO documents (
                id, organization_id, workspace_id, filename, file_size_bytes,
                mime_type, sha256_hash, s3_key, status, is_deleted, uploaded_by_user_id
            ) VALUES (
                $1, $2, $3, $4, 1024,
                'application/pdf', 'dummyhash123', 'benchmarks/doc0.pdf', 'indexed', FALSE, $5
            ) ON CONFLICT (organization_id, id) DO UPDATE SET filename = $4, status = 'indexed';
        """, doc_id, tenant_id, ws_id, doc0["name"], admin_user_id)
        
        # Split doc into chunks (e.g. lines or paragraphs)
        lines = [line.strip() for line in doc0["content"].split("\n") if line.strip()]
        embeddings = embed_texts(lines)
        
        await conn.execute("DELETE FROM document_chunks WHERE organization_id = $1 AND document_id = $2", tenant_id, doc_id)
        for idx, (line_text, emb) in enumerate(zip(lines, embeddings)):
            c_id = uuid.uuid5(doc_id, f"chunk_{idx}")
            bbox = doc0.get("bbox") if idx == 0 else {"x0": 0.1, "y0": 0.1 + idx * 0.15, "x1": 0.9, "y1": 0.2 + idx * 0.15}
            bbox_json = json.dumps(bbox)
            emb_str = vector_to_pg_str(emb)
            await conn.execute("""
                INSERT INTO document_chunks (
                    id, organization_id, workspace_id, document_id,
                    chunk_index, page_number, bounding_box, content, embedding
                ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::vector)
            """, c_id, tenant_id, ws_id, doc_id, idx, 1, bbox_json, line_text, emb_str)
            
        print(f"Doc {doc_id} with {len(lines)} chunks inserted.")
        
    # Now execute search_hybrid with actor_role='ORGANIZATION_ADMIN'
    admin_id = uuid.uuid4()
    results = await retrieval_service.search_hybrid(
        org_id=tenant_id,
        ws_id=ws_id,
        payload=RetrievalQueryRequest(query="What is the net total on Bradley-Andrade?", top_k=5, alpha=0.5),
        actor_id=admin_id,
        actor_role="ORGANIZATION_ADMIN"
    )
    
    print(f"Search returned {len(results)} chunks:")
    for r in results:
        print(f"Rank {r.rank}: chunk_id={r.chunk_id}, dense={r.dense_score:.4f}, lex={r.lexical_score:.4f}, rrf={r.rrf_score:.6f}")
        print(f"   Excerpt: {r.content[:80]}...")
        
    await db_manager.disconnect()
        
    await db_manager.disconnect()

if __name__ == "__main__":
    asyncio.run(test_seeding())
