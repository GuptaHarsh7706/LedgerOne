# ==============================================================================
# LedgerOne Core Backend & Worker Daemon — Production Dockerfile
# Python 3.11 Slim with System OCR (Tesseract), PyPDFium2, & PyTorch CPU
# ==============================================================================

FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8000 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system dependencies: Tesseract OCR, Poppler, OpenCV runtime libraries, and curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tesseract-ocr \
    libtesseract-dev \
    poppler-utils \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip and packaging tools
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Install lean CPU-optimized PyTorch wheels before requirements to avoid CUDA bloat
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Install application dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create unprivileged system user for container security
RUN groupadd -r -g 10001 ledgerone && \
    useradd -r -u 10001 -g ledgerone -m -d /home/ledgerone ledgerone

# Copy application source code with non-root ownership in a single layer
COPY --chown=ledgerone:ledgerone . .

# Switch to non-root execution
USER ledgerone

# Expose FastAPI ingress port
EXPOSE 8000

# Automated container healthcheck
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -f http://localhost:8000/health || exit 1

# Launch production server with embedded worker daemon
CMD ["python", "run_server.py"]
