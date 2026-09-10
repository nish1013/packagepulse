import pytest

from packagepulse.registries.repo_url import github_repo_from_npm, github_repo_from_urls


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://github.com/fastapi/fastapi", "fastapi/fastapi"),
        ("https://github.com/fastapi/fastapi/issues", "fastapi/fastapi"),
        ("git+ssh://git@github.com/stevemao/left-pad.git", "stevemao/left-pad"),
        ("git@github.com:expressjs/express.git", "expressjs/express"),
        ("https://github.com/psf/requests#readme", "psf/requests"),
        ("https://gitlab.com/group/project", None),
        ("https://github.com/sponsors/someone", None),
    ],
)
def test_finds_github_repositories_in_urls(url: str, expected: str | None) -> None:
    assert github_repo_from_urls([url]) == expected


def test_skips_urls_until_a_repository_is_found() -> None:
    urls = [None, "https://fastapi.tiangolo.com/", "https://github.com/fastapi/fastapi"]

    assert github_repo_from_urls(urls) == "fastapi/fastapi"


@pytest.mark.parametrize(
    ("repository", "homepage", "expected"),
    [
        ({"type": "git", "url": "git+https://github.com/expressjs/express.git"}, None, "expressjs/express"),
        ("github:npm/cli", None, "npm/cli"),
        ("npm/cli", None, "npm/cli"),
        (None, "https://github.com/lodash/lodash#readme", "lodash/lodash"),
        (None, None, None),
    ],
)
def test_reads_npm_repository_fields(repository: object, homepage: object, expected: str | None) -> None:
    assert github_repo_from_npm(repository, homepage) == expected
