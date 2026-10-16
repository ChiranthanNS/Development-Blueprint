---
name: Imported artifact registration
description: Recover artifact registration when imported manifests exist but the artifact list is empty.
---

Imported artifact manifests can exist on disk while `listArtifacts()` returns an empty list. Validate an unchanged manifest through `verifyAndReplaceArtifactToml` before considering a new scaffold.

**Why:** Revalidating an existing imported manifest reconciled artifact metadata and generated its managed workflows without replacing application files.

**How to apply:** When setting up an import, inspect existing manifests first. Use the validated temporary-file replacement workflow, then list artifacts again; do not create a duplicate app or manually replace its managed workflow.
