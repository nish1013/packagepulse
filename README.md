# PackagePulse

Live health evidence for your PyPI and npm dependencies.

Look up a package, or paste a `requirements.txt` or `package.json`, and PackagePulse checks the package
registry, OSV, deps.dev, GitHub and OpenSSF Scorecard at the same time. You get the facts behind each
dependency (known vulnerabilities, how long since the last release, whether the repository is archived)
and a score that explains every point it takes off.

**Status:** early development. The API and the web app arrive in the next pull requests.

## Why

Adding a dependency is a decision you live with for years, but the signals that matter are spread across
five different places. A package can look fine on its registry page while its repository was archived two
years ago, or its latest release still carries a known vulnerability.

PackagePulse puts that evidence in one place, fetched live, so the decision is quick and the reasons are
visible.

## Licence

Apache 2.0. See [LICENSE](LICENSE).
