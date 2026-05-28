# Vendor Manifest

Third-party JavaScript libraries vendored into this site. All files are
unmodified copies of the upstream release artifacts.

Vendored on: 2026-05-27
Vendored by: T7-F (Wave 2 implementer)

## Files

### d3-hierarchy.min.js

- **Filename:** `d3-hierarchy.min.js`
- **Version:** 3.1.2
- **Source URL:** https://cdn.jsdelivr.net/npm/d3-hierarchy@3/dist/d3-hierarchy.min.js
- **Upstream repo:** https://github.com/d3/d3-hierarchy
- **Size:** 14,828 bytes
- **SHA-256:** `a8771380454be89ec5ffe9a6396ba7c247081e348ae740dc9cb9629abd4c0e43`
- **License:** ISC (Copyright 2010-2021 Mike Bostock)
- **Header:** `// https://d3js.org/d3-hierarchy/ v3.1.2 Copyright 2010-2021 Mike Bostock`
- **Purpose:** Treemap / hierarchical layout algorithms (squarify, treemap,
  partition, pack, tree). Used for the squarified treemap visualization.

### d3-selection.min.js

- **Filename:** `d3-selection.min.js`
- **Version:** 3.0.0
- **Source URL:** https://cdn.jsdelivr.net/npm/d3-selection@3/dist/d3-selection.min.js
- **Upstream repo:** https://github.com/d3/d3-selection
- **Size:** 13,522 bytes
- **SHA-256:** `45daab9cf677901bcae102f3f23ca2930db3c0fb8ff9e3dbed087d9c4de921ca`
- **License:** ISC (Copyright 2010-2021 Mike Bostock)
- **Header:** `// https://d3js.org/d3-selection/ v3.0.0 Copyright 2010-2021 Mike Bostock`
- **Purpose:** DOM selection and data-binding primitives for D3-style
  visualizations (select, selectAll, data, enter/update/exit, attr/style).

## Integrity verification

Reproduce the hashes locally:

```bash
cd outputs/demo/site/assets/vendor
sha256sum d3-hierarchy.min.js d3-selection.min.js
```

Expected output:

```
a8771380454be89ec5ffe9a6396ba7c247081e348ae740dc9cb9629abd4c0e43  d3-hierarchy.min.js
45daab9cf677901bcae102f3f23ca2930db3c0fb8ff9e3dbed087d9c4de921ca  d3-selection.min.js
```

## Safety checks performed

- Confirmed each file starts with the official D3 UMD wrapper and Mike Bostock
  copyright header.
- Scanned for `eval`, `new Function`, and `document.write` — zero occurrences
  in either file.
- Files are minified but well-formed JS (no base64 blobs, no obfuscated
  payloads).

## License

Both d3-hierarchy and d3-selection are released under the ISC License
(equivalent to BSD-2-Clause / MIT for practical purposes). The full license
text is available in each upstream repository's `LICENSE` file. Attribution
is preserved in the file header comments.
