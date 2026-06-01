# vendor/ — local no-op stubs for unused Google-Cloud deps

`@google/adk` statically imports four Google-Cloud packages at module load to
*define* its `GcsArtifactService` / GCP-OTel-exporter classes. **Domia never
instantiates any of them** — persistence is 100% local (SQLite +
`FileSystemStorage` + `trace.jsonl`), and the ADK `Runner` is created with no
artifact service.

Rather than ship the real (heavy, cloud) SDKs just to satisfy those imports,
each is replaced by a tiny stub exporting only the symbol ADK imports:

| package | stub exports |
|---|---|
| `@google-cloud/storage` | `class Storage` |
| `@google-cloud/opentelemetry-cloud-monitoring-exporter` | `class MetricExporter` |
| `@google-cloud/opentelemetry-cloud-trace-exporter` | `class TraceExporter` |
| `@opentelemetry/resource-detector-gcp` | `const gcpDetector` |

`package.json` points these deps at `file:./vendor/*`, so the stub *is* the
package in `node_modules` — works across CLI/desktop/tests/build with no build
aliases. ADK loads fine (the classes are imported, never `new`-ed). If you ever
need real Google-Cloud artifact storage, restore the real versions in
`package.json` and wire a `GcsArtifactService` into the `Runner`.
