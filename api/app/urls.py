import ipaddress
import socket
from urllib.parse import urlsplit


class UnsafeUrl(ValueError):
    pass


def validate_public_https_url(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise UnsafeUrl("Only public HTTPS URLs without embedded credentials are allowed.")

    hostname = parsed.hostname.rstrip(".").lower()
    if hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal")) or hostname == "metadata.google.internal":
        raise UnsafeUrl("Local and metadata hostnames are not allowed.")

    try:
        address = ipaddress.ip_address(hostname)
        addresses = [address]
    except ValueError:
        try:
            addresses = [ipaddress.ip_address(item[4][0]) for item in socket.getaddrinfo(hostname, parsed.port or 443, type=socket.SOCK_STREAM)]
        except (OSError, ValueError) as error:
            raise UnsafeUrl("The target hostname could not be safely resolved.") from error

    if not addresses or any(not address.is_global for address in addresses):
        raise UnsafeUrl("The target must resolve only to public IP addresses.")
    return value