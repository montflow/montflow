## Phase 1: Discovery

- [ ] Structural role of the target file/module is explicitly named
- [ ] Proximity neighbors (same directory, parent, siblings) were read
- [ ] At least one analogous module (same role, different domain) was located and read
- [ ] If no analogous module exists, reliance on proximity neighbors alone is documented

## Phase 2: Convention Extraction

- [ ] Filesystem layout conventions extracted (naming, structure, test placement, barrel files)
- [ ] Internal code patterns extracted (exports, error handling, naming, composition, imports)

## Phase 3: Mimicry

- [ ] New or edited code matches the filesystem layout of analogous modules
- [ ] New or edited code matches internal patterns (export style, naming, error handling, composition)
- [ ] No external patterns introduced that the codebase does not already use
- [ ] Code is indistinguishable in style from the analogous modules reviewed
