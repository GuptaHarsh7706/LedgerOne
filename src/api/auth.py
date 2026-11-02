"""
Authentication API endpoints: registration, login, refresh rotation, logout, and current user inspection.
"""
from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel, EmailStr, Field
from fastapi import APIRouter, Depends, status

from src.auth.dependencies import get_current_user
from src.auth.service import auth_service

router = APIRouter(prefix="/auth", tags=["Authentication & Identity"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, description="Password (minimum 8 characters)")
    full_name: str = Field(min_length=2, max_length=255)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    is_platform_admin: bool
    created_at: Optional[datetime] = None


@router.post("/register", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED, summary="Register user")
async def register(payload: RegisterRequest) -> Dict[str, Any]:
    """Register a new user account with Argon2id password hashing."""
    user = await auth_service.register_user(
        email=payload.email,
        password=payload.password,
        full_name=payload.full_name,
    )
    return {
        "status": "success",
        "message": "User registered successfully",
        "user": {
            "id": str(user["id"]),
            "email": user["email"],
            "full_name": user["full_name"],
            "is_platform_admin": user["is_platform_admin"],
            "created_at": user["created_at"].isoformat() if user.get("created_at") else None,
        },
    }


@router.post("/login", response_model=AuthResponse, summary="Authenticate user & issue tokens")
async def login(payload: LoginRequest) -> Dict[str, Any]:
    """Authenticate user with email and password and return access and refresh tokens."""
    user = await auth_service.authenticate_user(email=payload.email, password=payload.password)
    return await auth_service.issue_token_pair(
        user_id=user["id"],
        email=user["email"],
        is_platform_admin=user["is_platform_admin"],
    )


@router.post("/refresh", response_model=AuthResponse, summary="Rotate refresh token with reuse detection")
async def refresh_token(payload: RefreshRequest) -> Dict[str, Any]:
    """Rotate refresh token. Detects token reuse and revokes entire family if compromise occurs."""
    return await auth_service.rotate_refresh_token(payload.refresh_token)


@router.post("/logout", summary="Revoke refresh token and terminate session")
async def logout(payload: RefreshRequest) -> Dict[str, str]:
    """Revoke refresh token upon logout."""
    await auth_service.revoke_refresh_token(payload.refresh_token)
    return {"status": "success", "message": "Logged out successfully"}


@router.get("/me", summary="Get currently authenticated user")
async def get_me(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Return profile of the currently authenticated user."""
    return {
        "id": str(user["id"]),
        "email": user["email"],
        "full_name": user["full_name"],
        "is_platform_admin": user["is_platform_admin"],
    }
