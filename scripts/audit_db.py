import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.dns import init_dns_resolver
init_dns_resolver()
from src.config import get_settings
from src.db.pool import db_manager

async def main():
    cfg = get_settings()
    await db_manager.connect(cfg.DATABASE_URL)
    async with db_manager.pool.acquire() as conn:
        print("=== DATABASE AUDIT ===")
        # Users
        users = await conn.fetch("SELECT id, email, full_name, is_platform_admin FROM users LIMIT 10")
        print(f"Total Users Sample ({len(users)}):")
        for u in users:
            print(f"  {u['id']} | {u['email']} | {u['full_name']}")
        
        # Check specific persona users
        persona_emails = [
            "ws_admin@apexcapital.internal",
            "reviewer@apexcapital.internal",
            "doc_manager@apexcapital.internal",
            "analyst@apexcapital.internal",
            "viewer@apexcapital.internal",
            "org_admin@apexcapital.internal"
        ]
        print("\nChecking persona memberships:")
        for email in persona_emails:
            u = await conn.fetchrow("SELECT id, email FROM users WHERE email = $1", email)
            if u:
                mems = await conn.fetch("""
                    SELECT om.organization_id, om.role as org_role, o.name as org_name,
                           wm.workspace_id, wm.role as ws_role, w.name as ws_name
                    FROM organization_memberships om
                    JOIN organizations o ON o.id = om.organization_id
                    LEFT JOIN workspace_memberships wm ON wm.organization_id = om.organization_id AND wm.user_id = om.user_id
                    LEFT JOIN workspaces w ON w.id = wm.workspace_id
                    WHERE om.user_id = $1
                """, u["id"])
                print(f"  {email}:")
                for m in mems:
                    print(f"    Org: {m['organization_id']} ({m['org_name']}) Role: {m['org_role']} | WS: {m['workspace_id']} ({m['ws_name']}) Role: {m['ws_role']}")

        # Check organizations
        orgs = await conn.fetch("SELECT id, name, slug FROM organizations LIMIT 5")
        print(f"\nOrganizations ({len(orgs)}):")
        for o in orgs:
            print(f"  {o['id']} | {o['name']} | {o['slug']}")
            wss = await conn.fetch("SELECT id, name, slug FROM workspaces WHERE organization_id = $1", o["id"])
            for w in wss:
                print(f"    WS: {w['id']} | {w['name']} | {w['slug']}")

        # Check documents in Production Financial Core
        apex_docs = await conn.fetch("SELECT id, filename, status, file_size_bytes FROM documents WHERE workspace_id = '9b2b92c0-56a0-4568-8d42-9d2681d30fc9' AND is_deleted = FALSE")
        print(f"\nProduction Financial Core Documents ({len(apex_docs)}):")
        for d in apex_docs:
            print(f"  {d['id']} | {d['filename']} | {d['status']} | {d['file_size_bytes']} bytes")

if __name__ == "__main__":
    asyncio.run(main())
