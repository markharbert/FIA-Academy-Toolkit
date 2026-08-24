---
name: Readable training URLs
description: URL convention and compatibility behavior for learner-facing course, module, and lesson links.
---

Learner-facing training links must use readable title slugs in this format:
`/training/<course>/<module>/<lesson>`. Duplicate titles receive only a deterministic ordinal suffix, such as `-2`, so URLs remain human-readable.

**Why:** Course content is shared and navigated directly; opaque database identifiers make those links difficult to recognize and trust.

**How to apply:** Generate and maintain slugs whenever course-builder or import titles change. Preserve old ID-based links as compatibility inputs, then replace them with the canonical readable URL once the destination resolves.