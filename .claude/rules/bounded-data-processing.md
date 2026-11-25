---
description: Mandatory bounded-memory processing for growing datasets, uploads, imports, exports, reports, syncs and background jobs
alwaysApply: true
---

# Bounded data processing

## Required invariant

For any workload whose input can grow, peak application memory must be bounded by the working batch, largest permitted record and admitted concurrency, rather than total dataset size. A streamed first step is insufficient if a later step retains everything.

Apply this rule when creating or changing uploads, imports, exports, backups, restores, reports, syncs, rebuilds, repairs and bulk jobs. A small lookup may use an in-memory array only when a server-enforced bound and its worst-case payload fit the documented budget.

## Design the complete pipeline before implementation

Map `receive → authenticate/validate → parse → transform → write → verify → publish outcome`. For each stage identify:

- Maximum live bytes, record size and concurrent work; include copies, expanded/compressed data, native buffers and database serialization.
- Where cross-batch state lives, how downstream backpressure reaches the producer, and when memory and temporary storage are released.
- Memory, temporary disk and execution-time limits, admission behavior, cancellation and recovery after interruption.

The combined web process, workers and concurrent jobs must fit the existing deployment budget with headroom. Raising heap, container memory, upload limits or proxy timeouts is not a substitute for bounded processing. A background job still needs a bounded working set.

## Bound every stage

- Stream file uploads and downloads to/from private storage. Check the entire request path for framework, middleware, proxy and adapter buffering; avoid whole-file `arrayBuffer()`, base64 conversion and `Buffer.concat()` in scalable paths.
- Parse, authenticate/checksum, serialize, compress, encrypt and transfer incrementally. Verify original payload integrity before accepting or importing data with omitted rebuildable cache fields.
- Query only required columns. Use deterministic cursor/keyset pagination with a unique tie-breaker; preserve tenant filters and projections. Use database aggregates for summaries. Increasing `skip`/OFFSET rescans earlier rows and is unsuitable for growing jobs.
- Bound batches by both bytes and row count. A row limit alone cannot bound variable-sized JSON or attachments. Use conservative reads, a per-record limit and isolation where a query can materialize a large record before its size is known. Never choose a larger page solely because earlier rows were small.
- Await each batch or use explicitly bounded concurrency. Do not use dataset-wide `Promise.all`, append every batch to an array, clone the full dataset, or build an unbounded `Map`/`Set` for joins, deduplication or ID remapping. Store growing state in indexed temporary/database storage.
- Apply the same limits to safety exports, migrations, deferred hooks, verification readbacks, audit evidence, errors and progress/results. Logs and job history retain bounded metadata, not duplicate payloads or secrets.
- Use private temporary directories and explicit disk-space checks/limits. Clean owned files on success, rejection and cancellation; have the supervising process clean them when a child fails. Define how abandoned files are reclaimed after a host restart without deleting active work or recovery copies.

## Preserve correctness across batches

- Keep authentication, company scope, permissions, reference identity, business dates, precision and deletion audit requirements at the shared mutation boundary. Batching must not weaken these checks.
- Preserve ID maps across all batches. Resolve forward/self references after the required identities exist, then verify saved links against original-to-new mappings.
- Keep workflows requiring all-or-nothing writes transactional. Do not commit partial batches merely to lower memory or bypass a timeout. Workflows intentionally using checkpoints need explicit idempotency, resumable state and a defined partial-completion contract.
- Save the successful outcome atomically with the business commit. Keep live progress on separate storage from the completion row while a Serializable transaction is active; outside progress writes to that same row can make final commit fail.

## Isolate expensive work and fail clearly

- Work that can exceed an HTTP deadline uses short acceptance/status requests and a durable job reference. Polling, reconnecting and retrying must not duplicate execution; never automatically replay an uncertain destructive operation.
- Potentially memory-intensive work runs behind an explicit admission/concurrency limit and an isolated worker with heap **and RSS/native-memory** limits. Reserve capacity for the web process; a V8 heap cap alone does not cover total memory.
- Reject insufficient memory/disk capacity, oversized records and invalid input with a bounded, actionable error. Roll back uncommitted business changes, preserve any confirmed committed outcome and keep status available when a worker exits.
- Measure the full operation, including final verification and commit. A decode-only test or a smaller/excluded fixture does not establish that the full workflow succeeds.

## Required verification before claiming a growing path is safe

1. Exercise the actual pipeline with a representative large input and a larger variant under explicit process limits. Measure peak RSS as well as heap; retained memory must not grow with total input. Generate/read fixtures incrementally so the test harness does not become the memory failure.
2. Cover variable record sizes, an oversized single record, references/deduplication spanning batches, and bounded database/export reads.
3. Force a late failure and worker budget exhaustion. Verify rollback or the declared checkpoint contract, correct saved outcome, temporary-file cleanup and a responsive web process.
4. Report the measured input size, expanded size where relevant, memory limits, peak RSS, runtime, concurrency and exclusions. Use isolated databases for destructive rehearsals.

Run checks scoped to the changed path; this rule does not authorize memory-heavy full-project type checking. Rules guide future changes and reviews; they are not proof that every existing path is compliant or that all failures are impossible.

## Existing implementation to reuse

The backup pipeline demonstrates the pattern; search the reusable-classes registry before adding another implementation:

- `src/modules/backup/storage/streamed-upload.ts`: backpressured multipart upload to private disk.
- `src/modules/backup/storage/disk-dataset.ts`: disk-backed rows, indexed identities, ID maps and byte/row-bounded batches.
- `src/modules/backup/storage/paged-source.ts`: cursor-based source export preserving filters and transformations.
- `src/modules/backup/encryption/disk-backup.ts` and `file-encryption.ts`: incremental archive input/output and original checksum verification.
- `src/lib/backup/restore-worker.ts` and `restore-jobs.ts`: isolated worker limits, admission, durable status and transactional outcome.

The backup reference configuration uses a 384 MiB worker heap, 768 MiB RSS ceiling, 4 MiB/256-row import batches and a 32 MiB per-record limit within the existing 4 GiB shared budget. These are ceilings for that implementation, not a reason to allocate the same allowance to every concurrent job. Select limits for other workloads from their measured worst case and actual deployment capacity.
