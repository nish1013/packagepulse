from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from packagepulse.domain import PackageContext, ProviderResult, Vulnerability
from packagepulse.providers.base import Upstream


class OSVProvider:
    name = "osv"
    requires = frozenset({"version"})

    async def run(self, ctx: PackageContext, upstream: Upstream) -> ProviderResult:
        query = {"package": {"name": ctx.name, "ecosystem": ctx.ecosystem.osv_name}, "version": ctx.version}
        response = await upstream.request(
            "osv", "POST", "https://api.osv.dev/v1/query", ttl_s=1800, json_body=query
        )
        if response.ok and isinstance(response.data, dict):
            ctx.vulnerabilities = distinct(parse_vulnerabilities(response.data.get("vulns") or []))
        return ProviderResult.from_response(self.name, response)


def parse_vulnerabilities(raw: Iterable[dict[str, Any]]) -> list[Vulnerability]:
    return [
        Vulnerability(id=item["id"], aliases=tuple(item.get("aliases") or ()), summary=item.get("summary"))
        for item in raw
        if item.get("id")
    ]


def distinct(vulnerabilities: Iterable[Vulnerability]) -> tuple[Vulnerability, ...]:
    """Collapses records that describe the same issue under different IDs (e.g. GHSA and PYSEC)."""
    groups: list[tuple[set[str], list[Vulnerability]]] = []
    for vulnerability in vulnerabilities:
        names = {vulnerability.id, *vulnerability.aliases}
        overlapping = [group for group in groups if group[0] & names]
        merged_names = names.union(*(group[0] for group in overlapping))
        merged_members = [vulnerability, *(member for group in overlapping for member in group[1])]
        groups = [group for group in groups if group not in overlapping]
        groups.append((merged_names, merged_members))
    return tuple(_representative(members) for _, members in groups)


def _representative(members: list[Vulnerability]) -> Vulnerability:
    return min(members, key=lambda v: (v.summary is None, not v.id.startswith("GHSA"), v.id))
