"""
Main API router assembling health and metrics routes.
"""
from fastapi import APIRouter
from ledgerone.api.health import router as health_router
from ledgerone.metrics import metrics_response

api_router = APIRouter()

# Attach health routes
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
