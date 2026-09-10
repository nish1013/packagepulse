import json

import pytest

from packagepulse.domain import Ecosystem
from packagepulse.errors import ProblemError
from packagepulse.manifests import Dependency, ManifestKind, parse_manifest


def test_parses_requirements_txt() -> None:
    manifest = parse_manifest(
        """
        # web
        FastAPI[standard]>=0.115
        uvicorn==0.30.1 ; python_version >= "3.12"
        Django_REST.framework
        -r base.txt
        -e .
        git+https://github.com/org/private.git
        internal @ https://example.com/internal.whl
        fastapi
        """
    )

    assert manifest.kind is ManifestKind.REQUIREMENTS
    assert [dep.name for dep in manifest.dependencies] == ["fastapi", "uvicorn", "django-rest-framework"]
    assert all(dep.ecosystem is Ecosystem.PYPI for dep in manifest.dependencies)


def test_parses_package_json_and_marks_dev_dependencies() -> None:
    manifest = parse_manifest(
        json.dumps(
            {
                "dependencies": {"express": "^5.0.0", "@types/node": "^22", "local": "file:../local"},
                "devDependencies": {"typescript": "^5.4.0", "shared": "workspace:*", "express": "^5"},
            }
        )
    )

    assert manifest.kind is ManifestKind.PACKAGE_JSON
    assert manifest.dependencies == (
        Dependency(Ecosystem.NPM, "express"),
        Dependency(Ecosystem.NPM, "@types/node"),
        Dependency(Ecosystem.NPM, "typescript", dev=True),
    )


@pytest.mark.parametrize(
    ("text", "status", "code"),
    [
        ("# nothing here\n", 422, "empty_manifest"),
        ('{"dependencies": ', 422, "invalid_manifest"),
        ('{"dependencies": {}}', 422, "empty_manifest"),
        ("\n".join(f"package{i}" for i in range(101)), 422, "too_many_packages"),
        ("a" * 64_001, 413, "manifest_too_large"),
    ],
)
def test_rejects_unusable_manifests(text: str, status: int, code: str) -> None:
    with pytest.raises(ProblemError) as caught:
        parse_manifest(text)

    assert caught.value.problem.status == status
    assert caught.value.problem.code == code
