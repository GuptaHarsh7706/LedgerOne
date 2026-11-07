import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from src.dns import init_dns_resolver
init_dns_resolver()

from dotenv import load_dotenv
load_dotenv(".env")

import uvicorn
from src.main import app

if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    print(f"Starting uvicorn on {host}:{port}...")
    uvicorn.run("src.main:app", host=host, port=port, log_level="info")
