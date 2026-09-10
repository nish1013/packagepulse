from __future__ import annotations

import re
from collections.abc import Iterable

_GITHUB_URL = re.compile(r"github\.com[/:]([\w.-]+)/([\w.-]+?)(?:\.git)?(?:[/#?]|$)", re.IGNORECASE)
_SHORTHAND = re.compile(r"(?:github:)?([\w.-]+)/([\w.-]+)")
_NOT_REPOSITORIES = {"sponsors", "orgs", "features", "marketplace", "apps", "topics"}


def github_repo_from_urls(urls: Iterable[str | None]) -> str | None:
    for url in urls:
        if not url:
            continue
        match = _GITHUB_URL.search(url)
        if match and match.group(1).lower() not in _NOT_REPOSITORIES:
            return f"{match.group(1)}/{match.group(2)}"
    return None


def github_repo_from_npm(repository: object, homepage: object) -> str | None:
    url = repository.get("url") if isinstance(repository, dict) else repository
    if isinstance(url, str) and (shorthand := _SHORTHAND.fullmatch(url.strip())):
        return f"{shorthand.group(1)}/{shorthand.group(2)}"
    return github_repo_from_urls(value for value in (url, homepage) if isinstance(value, str))
