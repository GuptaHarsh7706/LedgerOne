"""
DNS resolver fallback module.
Ensures reliable resolution for Neon and AWS cloud endpoints across diverse network configurations.
"""
import socket
import logging

logger = logging.getLogger(__name__)

_patched = False
_orig_getaddrinfo = socket.getaddrinfo


def init_dns_resolver() -> None:
    """Initialize DNS fallback resolver if dnspython is installed."""
    global _patched
    if _patched:
        return

    try:
        import dns.resolver
    except ImportError:
        logger.warning("dnspython not installed; skipping DNS fallback resolver patch")
        return

    def custom_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
        try:
            return _orig_getaddrinfo(host, port, family, type, proto, flags)
        except socket.gaierror:
            if host and ("neon.tech" in host or "aws" in host):
                try:
                    resolver = dns.resolver.Resolver()
                    resolver.nameservers = ["8.8.8.8", "1.1.1.1", "8.8.4.4"]
                    resolver.timeout = 2.0
                    resolver.lifetime = 4.0
                    answers = resolver.resolve(host, "A")
                    results = []
                    for rdata in answers:
                        results.append(
                            (socket.AF_INET, socket.SOCK_STREAM, 6, "", (rdata.address, port))
                        )
                    if results:
                        return results
                except Exception as exc:
                    logger.debug("DNS fallback query failed for %s: %s", host, exc)
            raise

    socket.getaddrinfo = custom_getaddrinfo
    _patched = True
    logger.info("DNS fallback resolver successfully initialized for *.neon.tech and *.aws")
