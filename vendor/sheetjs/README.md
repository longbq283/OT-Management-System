# SheetJS Community Edition 0.20.3

Browser bundle: `xlsx.full.min.js`, distributed under Apache-2.0; see `LICENSE`.

This copy was extracted from the third-party npm repack `@e965/xlsx@0.20.3` over verified HTTPS. The repack is not an official SheetJS npm publication. The official CDN destination was unavailable under the development environment's network policy; the deprecated official npm `xlsx@0.18.5` was not used.

- Upstream: https://sheetjs.com/ and https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
- Repack source: https://github.com/e965/sheetjs-npm-publisher
- Download: https://registry.npmjs.org/@e965/xlsx/-/xlsx-0.20.3.tgz
- Registry tarball integrity (verified): `sha512-703RN/3OdsRD5mtse2HBX7Um7xwaP9tlswEG6svOtjqokXoX7rJdQj7DyabD2I+xk22RgaIIU+R6BHgkpZGB/w==`
- Extracted bundle SHA-256: `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`

The checksum pins the artifact used here; it is not a claim of independent upstream attestation. For a future upgrade, obtain the official release (or review the distribution provenance), verify its integrity, replace the bundle and license together, and rerun import tests. Do not use a floating CDN URL at runtime.

The application loads this local bundle inside a Worker. The optional synthetic workbook generator loads the same bundle lazily on the main thread. No workbook is sent to a CDN.
