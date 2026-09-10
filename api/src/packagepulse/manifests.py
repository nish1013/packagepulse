from __future__ import annotations

import json
import re
from dataclasses import dataclass
from enum import StrEnum

from packagepulse.domain import Ecosystem
from packagepulse.errors import ProblemError

MAX_MANIFEST_BYTES = 64_000
MAX_PACKAGES = 100

_REQUIREMENT = re.compile(r"^([A-Za-z0-9][A-Za-z0-9._-]*)")
_NON_REGISTRY_SPECS = ("file:", "link:", "workspace:", "portal:", "git", "http:", "https:", "github:", "npm:")


class ManifestKind(StrEnum):
    REQUIREMENTS = "requirements.txt"
    PACKAGE_JSON = "package.json"


@dataclass(frozen=True, slots=True)
class Dependency:
    ecosystem: Ecosystem
    name: str
    dev: bool = False


@dataclass(frozen=True, slots=True)
class Manifest:
    kind: ManifestKind
    dependencies: tuple[Dependency, ...]


def parse_manifest(text: str) -> Manifest:
    size = len(text.encode())
    if size > MAX_MANIFEST_BYTES:
        raise ProblemError(
            413,
            "manifest_too_large",
            "Manifest too large",
            f"Manifests are limited to {MAX_MANIFEST_BYTES // 1000} KB",
        )

    if text.lstrip().startswith("{"):
        kind, dependencies = ManifestKind.PACKAGE_JSON, _package_json(text)
    else:
        kind, dependencies = ManifestKind.REQUIREMENTS, _requirements(text)

    if not dependencies:
        raise ProblemError(
            422, "empty_manifest", "No dependencies found", "Paste a requirements.txt or a package.json"
        )
    if len(dependencies) > MAX_PACKAGES:
        raise ProblemError(
            422,
            "too_many_packages",
            "Too many packages",
            f"Scans are limited to {MAX_PACKAGES} packages, and this manifest has {len(dependencies)}",
        )
    return Manifest(kind, tuple(dependencies))


def normalise_pypi_name(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def _requirements(text: str) -> list[Dependency]:
    seen: set[str] = set()
    dependencies = []
    for raw_line in text.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line or line.startswith(("-", "git+", "http:", "https:")) or " @ " in line:
            continue
        match = _REQUIREMENT.match(line)
        if match is None:
            continue
        name = normalise_pypi_name(match.group(1))
        if name not in seen:
            seen.add(name)
            dependencies.append(Dependency(Ecosystem.PYPI, name))
    return dependencies


def _package_json(text: str) -> list[Dependency]:
    try:
        document = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ProblemError(
            422, "invalid_manifest", "Invalid package.json", f"{exc.msg} on line {exc.lineno}"
        ) from exc
    if not isinstance(document, dict):
        raise ProblemError(422, "invalid_manifest", "Invalid package.json", "Expected a JSON object")

    seen: set[str] = set()
    dependencies = []
    for section, dev in (("dependencies", False), ("devDependencies", True)):
        entries = document.get(section) or {}
        if not isinstance(entries, dict):
            continue
        for name, spec in entries.items():
            if name in seen or (isinstance(spec, str) and spec.startswith(_NON_REGISTRY_SPECS)):
                continue
            seen.add(name)
            dependencies.append(Dependency(Ecosystem.NPM, name, dev))
    return dependencies
