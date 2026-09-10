import type { PackageTarget } from "@/lib/upstream/package-path";

export const MAX_MANIFEST_BYTES = 64_000;

export const EXAMPLE_PACKAGES: PackageTarget[] = [
  { ecosystem: "pypi", name: "fastapi" },
  { ecosystem: "npm", name: "express" },
  { ecosystem: "npm", name: "request" },
  { ecosystem: "npm", name: "left-pad" },
  { ecosystem: "pypi", name: "pycrypto" },
];

export const EXAMPLE_PACKAGE_JSON = `{
  "name": "example-app",
  "dependencies": {
    "express": "^4.17.1",
    "request": "^2.88.0",
    "left-pad": "^1.3.0",
    "axios": "^1.7.0",
    "moment": "^2.29.0"
  },
  "devDependencies": {
    "tslint": "^6.1.3",
    "typescript": "^5.6.0"
  }
}
`;

export const EXAMPLE_REQUIREMENTS = `fastapi
requests==2.19.0
pycrypto
Django==1.11
aiohttp
nose
`;
