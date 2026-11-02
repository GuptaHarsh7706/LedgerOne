"""
Integration tests for authentication API endpoints, token rotation, and reuse detection.
"""
import uuid
import pytest


@pytest.mark.asyncio
async def test_auth_registration_and_login_flow(client, db_pool):
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    password = "StrongPassword123!"
    full_name = "Test Engineer"

    # 1. Register User
    reg_res = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
    )
    assert reg_res.status_code == 201
    reg_data = reg_res.json()
    assert reg_data["status"] == "success"
    user_id = reg_data["user"]["id"]
    assert reg_data["user"]["email"] == email

    try:
        # 2. Duplicate Registration Rejection
        dup_res = await client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": password, "full_name": full_name},
        )
        assert dup_res.status_code == 409
        dup_data = dup_res.json()
        assert dup_data["error"]["code"] == "RESOURCE_CONFLICT"

        # 3. Invalid Password Login Attempt
        fail_res = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "WrongPassword!"},
        )
        assert fail_res.status_code == 401
        assert fail_res.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"

        # 4. Successful Login
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        assert login_res.status_code == 200
        tokens = login_res.json()
        assert "access_token" in tokens
        assert "refresh_token" in tokens
        assert tokens["token_type"] == "bearer"
        access_token = tokens["access_token"]
        refresh_token_1 = tokens["refresh_token"]

        # 5. Access /auth/me with Bearer Token
        me_res = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["id"] == user_id
        assert me_data["email"] == email

        # 6. Rotate Refresh Token
        rot_res = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token_1},
        )
        assert rot_res.status_code == 200
        new_tokens = rot_res.json()
        refresh_token_2 = new_tokens["refresh_token"]
        assert refresh_token_2 != refresh_token_1

        # 7. SECURITY: Token Reuse Detection
        # Presenting the old (already consumed) refresh_token_1 must trigger theft detection!
        reuse_res = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token_1},
        )
        assert reuse_res.status_code == 401
        reuse_data = reuse_res.json()
        assert "reuse detected" in reuse_data["error"]["message"].lower()

        # 8. Token Family Invalidation Verification
        # Because reuse was detected, the second refresh token must ALSO be revoked!
        invalidated_res = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token_2},
        )
        assert invalidated_res.status_code == 401

    finally:
        # Cleanup
        async with db_pool.acquire() as conn:
            await conn.execute("DELETE FROM refresh_tokens WHERE user_id = $1", uuid.UUID(user_id))
            await conn.execute("DELETE FROM users WHERE id = $1", uuid.UUID(user_id))


@pytest.mark.asyncio
async def test_auth_logout(client, db_pool):
    email = f"logout_{uuid.uuid4().hex[:8]}@example.com"
    password = "Password123!"

    reg_res = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": "Logout User"},
    )
    user_id = reg_res.json()["user"]["id"]

    try:
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        tokens = login_res.json()
        refresh_token = tokens["refresh_token"]

        # Explicit Logout
        logout_res = await client.post(
            "/api/v1/auth/logout",
            json={"refresh_token": refresh_token},
        )
        assert logout_res.status_code == 200

        # Attempt to use revoked refresh token -> 401
        reuse_res = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert reuse_res.status_code == 401

    finally:
        async with db_pool.acquire() as conn:
            await conn.execute("DELETE FROM refresh_tokens WHERE user_id = $1", uuid.UUID(user_id))
            await conn.execute("DELETE FROM users WHERE id = $1", uuid.UUID(user_id))
