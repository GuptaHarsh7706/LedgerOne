"""
Main API router assembling health, metrics, auth, organizations, and workspaces.
"""
from fastapi import APIRouter
from src.api.health import router as health_router
from src.api.auth import router as auth_router
from src.api.organizations import router as organizations_router
from src.api.workspaces import router as workspaces_router
from src.api.documents import router as documents_router
from src.metrics import metrics_response

api_router = APIRouter()

# Health & Observability
api_router.include_router(health_router)

# Prometheus metrics route
api_router.add_api_route(
    "/metrics",
    metrics_response,
    methods=["GET"],
    include_in_schema=True,
    tags=["Health & Observability"],
    summary="Prometheus metrics endpoint",
)

# API v1 routes
v1_router = APIRouter(prefix="/api/v1")
v1_router.include_router(auth_router)
v1_router.include_router(organizations_router)
v1_router.include_router(workspaces_router)
v1_router.include_router(documents_router)

api_router.include_router(v1_router)
