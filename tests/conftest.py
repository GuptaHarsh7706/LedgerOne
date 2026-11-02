import os
import socket

import dns.resolver
from dotenv import load_dotenv

# Ensure robust DNS fallback for *.neon.tech endpoints if local router DNS throttles
_resolver = dns.resolver.Resolver()
_resolver.nameservers = ["8.8.8.8", "1.1.1.1"]
_orig_getaddrinfo = socket.getaddrinfo


def _custom_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    try:
        return _orig_getaddrinfo(host, port, family, type, proto, flags)
    except Exception:  # noqa: BLE001
        try:
            answers = _resolver.resolve(host, "A")
            ip = answers[0].to_text()
            return _orig_getaddrinfo(ip, port, family, type, proto, flags)
        except Exception:  # noqa: BLE001
            return _orig_getaddrinfo(host, port, family, type, proto, flags)


socket.getaddrinfo = _custom_getaddrinfo

# Load environment configuration
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(env_path)
