"""
Integration tests for Organization and Workspace management APIs, RBAC, and membership assignment.
"""
import uuid
import pytest


@pytest.mark.asyncio
async def test_organization_and_workspace_hierarchy(client, db_pool):
    # 1. Setup User 1 (Org Owner)
    u1_email = f"owner_{uuid.uuid4().hex[:6]}@example.com"
    u1_reg = await client.post(
        "/api/v1/auth/register",
        json={"email": u1_email, "password": "OwnerPassword123!", "full_name": "Org Owner"},
    )
    u1_id = uuid.UUID(u1_reg.json()["user"]["id"])
    u1_login = await client.post(
        "/api/v1/auth/login",
        json={"email": u1_email, "password": "OwnerPassword123!"},
    )
    u1_token = u1_login.json()["access_token"]
    u1_headers = {"Authorization": f"Bearer {u1_token}"}

    # 2. Setup User 2 (Standard User)
    u2_email = f"member_{uuid.uuid4().hex[:6]}@example.com"
    u2_reg = await client.post(
        "/api/v1/auth/register",
        json={"email": u2_email, "password": "MemberPassword123!", "full_name": "Regular Member"},
    )
    u2_id = uuid.UUID(u2_reg.json()["user"]["id"])
    u2_login = await client.post(
        "/api/v1/auth/login",
        json={"email": u2_email, "password": "MemberPassword123!"},
    )
    u2_token = u2_login.json()["access_token"]
    u2_headers = {"Authorization": f"Bearer {u2_token}"}

    org_slug = f"acme-{uuid.uuid4().hex[:8]}"
    org_id = None
    ws_id = None

    try:
        # 3. User 1 creates Organization
        org_res = await client.post(
            "/api/v1/organizations",
            headers=u1_headers,
            json={"name": "Acme Global", "slug": org_slug},
        )
        assert org_res.status_code == 201
        org_data = org_res.json()["organization"]
        org_id = uuid.UUID(org_data["id"])

        # 4. User 1 lists organizations -> sees Acme Global with ORGANIZATION_ADMIN
        list_res = await client.get("/api/v1/organizations", headers=u1_headers)
        assert list_res.status_code == 200
        org_list = list_res.json()
        assert any(o["id"] == str(org_id) and o["user_role"] == "ORGANIZATION_ADMIN" for o in org_list)

        # 5. User 1 creates Workspace "Engineering"
        ws_slug = f"eng-{uuid.uuid4().hex[:6]}"
        ws_res = await client.post(
            f"/api/v1/organizations/{org_id}/workspaces",
            headers={**u1_headers, "X-Organization-ID": str(org_id)},
            json={"name": "Engineering Team", "slug": ws_slug},
        )
        assert ws_res.status_code == 201
        ws_data = ws_res.json()["workspace"]
        ws_id = uuid.UUID(ws_data["id"])

        # 6. User 2 tries to create workspace without being in the org -> 403 Forbidden
        unauth_ws = await client.post(
            f"/api/v1/organizations/{org_id}/workspaces",
            headers={**u2_headers, "X-Organization-ID": str(org_id)},
            json={"name": "Rogue Workspace", "slug": "rogue-ws"},
        )
        assert unauth_ws.status_code == 403

        # 7. User 1 invites User 2 as MEMBER into Acme Global
        add_member_res = await client.post(
            f"/api/v1/organizations/{org_id}/members",
            headers={**u1_headers, "X-Organization-ID": str(org_id)},
            json={"user_id": str(u2_id), "role": "MEMBER"},
        )
        assert add_member_res.status_code == 201

        # 8. User 1 assigns User 2 to Workspace "Engineering" with role REVIEWER
        add_ws_res = await client.post(
            f"/api/v1/organizations/{org_id}/workspaces/{ws_id}/members",
            headers={**u1_headers, "X-Organization-ID": str(org_id)},
            json={"user_id": str(u2_id), "role": "REVIEWER"},
        )
        assert add_ws_res.status_code == 201
        assert add_ws_res.json()["membership"]["role"] == "REVIEWER"

        # 9. User 2 lists workspaces in Acme Global -> sees "Engineering Team" with user_role="REVIEWER"
        u2_ws_res = await client.get(
            f"/api/v1/organizations/{org_id}/workspaces",
            headers={**u2_headers, "X-Organization-ID": str(org_id)},
        )
        assert u2_ws_res.status_code == 200
        u2_workspaces = u2_ws_res.json()
        assert len(u2_workspaces) == 1
        assert u2_workspaces[0]["id"] == str(ws_id)
        assert u2_workspaces[0]["user_role"] == "REVIEWER"

    finally:
        # Cleanup
        async with db_pool.acquire() as conn:
            if ws_id and org_id:
                await conn.execute("DELETE FROM workspace_memberships WHERE organization_id = $1", org_id)
                await conn.execute("DELETE FROM workspaces WHERE id = $1", ws_id)
            if org_id:
                await conn.execute("DELETE FROM organization_memberships WHERE organization_id = $1", org_id)
                await conn.execute("DELETE FROM organizations WHERE id = $1", org_id)
            await conn.execute("DELETE FROM refresh_tokens WHERE user_id IN ($1, $2)", u1_id, u2_id)
            await conn.execute("DELETE FROM users WHERE id IN ($1, $2)", u1_id, u2_id)
