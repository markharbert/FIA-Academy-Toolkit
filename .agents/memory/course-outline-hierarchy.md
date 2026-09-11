---
name: Course outline hierarchy
description: Usability rules for course navigation with imported modules, sub-modules, and deeper nesting.
---

Nested course navigation must communicate hierarchy through multiple cues, not indentation alone. Use explicit hierarchical numbering, distinct section treatments by depth, connector rails, section/lesson counts, and a strong active-lesson state.

**Why:** Imported courses can contain several module levels. When every level uses similar typography and only shifts slightly to the right, learners cannot quickly tell whether an item is a section, sub-section, or lesson.

**How to apply:** Preserve the imported tree, but present it as a guided roadmap. Keep lesson rows visually different from section headers, maintain high contrast, and ensure completion remains secondary to the current location.

Opening a lesson must expand every ancestor section in its path without closing sections the learner opened manually.

**Why:** A direct link or next-lesson action can land inside a deeply nested section. Hiding the active lesson inside collapsed ancestors makes the navigation appear disconnected from the page.

**How to apply:** Resolve the active lesson against the full flattened module tree for breadcrumbs and navigation, then add its ancestor IDs to the expanded set.