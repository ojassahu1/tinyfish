from dataclasses import dataclass

import httpx

from .settings import Settings, get_settings
from .urls import UnsafeUrl, validate_public_https_url


class TinyFishError(RuntimeError):
    def __init__(self, code: str, retryable: bool = False):
        super().__init__(code)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True)
class FetchResult:
    url: str
    final_url: str
    title: str | None
    text: str
    metadata: dict
    not_modified: bool = False


class TinyFishClient:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()

    def _headers(self) -> dict[str, str]:
        if not self.settings.tinyfish_api_key:
            raise TinyFishError("tinyfish_not_configured")
        return {"X-API-Key": self.settings.tinyfish_api_key}

    async def fetch(self, url: str) -> FetchResult:
        try:
            validate_public_https_url(url)
        except UnsafeUrl as error:
            raise TinyFishError("unsafe_target_url") from error

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(40.0)) as client:
                response = await client.post(
                    self.settings.tinyfish_fetch_url,
                    headers={**self._headers(), "Content-Type": "application/json"},
                    json={"urls": [url], "format": "markdown", "ttl": 0},
                )
        except httpx.TimeoutException as error:
            raise TinyFishError("tinyfish_timeout", retryable=True) from error
        except httpx.RequestError as error:
            raise TinyFishError("tinyfish_unavailable", retryable=True) from error

        if response.status_code == 429 or response.status_code >= 500:
            raise TinyFishError("tinyfish_temporary_error", retryable=True)
        if response.status_code >= 400:
            raise TinyFishError("tinyfish_request_rejected")

        try:
            payload = response.json()
        except ValueError as error:
            raise TinyFishError("tinyfish_invalid_response", retryable=True) from error
        result = next((item for item in payload.get("results", []) if item.get("url") == url), None)
        if result is None:
            errors = payload.get("errors", [])
            raise TinyFishError("tinyfish_page_fetch_failed" if errors else "tinyfish_empty_response", retryable=not bool(errors))

        final_url = result.get("final_url") or result.get("url") or url
        try:
            validate_public_https_url(final_url)
        except (UnsafeUrl, TypeError) as error:
            raise TinyFishError("unsafe_redirect_target") from error

        text = result.get("text")
        if result.get("not_modified") is True:
            return FetchResult(url, final_url, result.get("title"), "", {"format": result.get("format"), "not_modified": True}, True)
        if not isinstance(text, str) or not text.strip():
            raise TinyFishError("tinyfish_incomplete_extraction", retryable=True)

        metadata = {
            "provider": "tinyfish_fetch",
            "format": result.get("format", "markdown"),
            "language": result.get("language"),
            "description": result.get("description"),
        }
        return FetchResult(url, final_url, result.get("title"), text, metadata)

    async def search(self, query: str) -> dict:
        if not query.strip() or len(query) > 500:
            raise TinyFishError("invalid_search_query")
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(20.0)) as client:
                response = await client.get(
                    self.settings.tinyfish_search_url,
                    headers=self._headers(),
                    params={"query": query.strip()},
                )
        except httpx.TimeoutException as error:
            raise TinyFishError("tinyfish_timeout", retryable=True) from error
        except httpx.RequestError as error:
            raise TinyFishError("tinyfish_unavailable", retryable=True) from error
        if response.status_code == 429 or response.status_code >= 500:
            raise TinyFishError("tinyfish_temporary_error", retryable=True)
        if response.status_code >= 400:
            raise TinyFishError("tinyfish_request_rejected")
        payload = response.json()
        if not isinstance(payload.get("results"), list):
            raise TinyFishError("tinyfish_invalid_response", retryable=True)
        return payload