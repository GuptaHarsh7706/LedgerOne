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
    print("Starting uvicorn on 127.0.0.1:8000...")
    uvicorn.run("src.main:app", host="127.0.0.1", port=8000, log_level="info")
