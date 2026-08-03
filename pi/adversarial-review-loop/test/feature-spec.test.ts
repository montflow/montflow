import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Result } from 'effect';
import {
  loadFeatureSpec,
  findActivePhase,
  getReviewLoopCounter,
  updateReviewLoopCounter,
  extractFindings,
  createRemediationTasks,
  updateFeatureTaskTable,
} from '../feature-spec';
import { runEffect, runResult, withProjectRoot, type TempDir } from './helpers';

/**
 * Creates a temp project root, runs the async callback, then cleans up.
 * @param {Record<string, string>} files Map of relative path → file contents
 * @param {(dir: TempDir) => Promise<void>} callback The test body
 * @returns A promise completing after cleanup
 */
const withRoot = async (
  files: Record<string, string>,
  callback: (dir: TempDir) => Promise<void>,
): Promise<void> => {
  const dir = withProjectRoot(files);
  try {
    await callback(dir);
  } finally {
    dir.cleanup();
  }
};

// ─── loadFeatureSpec Tests ────────────────────────────────────────────

test('loadFeatureSpec: missing feature directory fails', () =>
  withRoot({}, async ({ tmp }) => {
    const result = await runResult(loadFeatureSpec(tmp, 'nonexistent'));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isSuccess(result)) return;
    expect(result.failure.message).toContain('not found');
  }));

test('loadFeatureSpec: missing FEATURE.md fails', () =>
  withRoot({ '.agents/features/my-feature/.gitkeep': '' }, async ({ tmp }) => {
    const result = await runResult(loadFeatureSpec(tmp, 'my-feature'));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isSuccess(result)) return;
    expect(result.failure.message).toContain('FEATURE.md');
  }));

test('loadFeatureSpec: parses valid FEATURE.md with frontmatter', () =>
  withRoot(
    {
      '.agents/features/auth-flow/FEATURE.md': `---
name: auth-flow
description: User authentication flow
locked-phases: A,B
version: 1.0.0
---

# Auth Flow Feature

## Tasks

| ID | Name | Type | Status |
|----|------|------|--------|
| A001 | setup | execution | complete |
| A002 | review | review | pending |
`,
    },
    async ({ tmp }) => {
      const result = await runResult(loadFeatureSpec(tmp, 'auth-flow'));
      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isFailure(result)) return;
      const spec = result.success;
      expect(spec.featureName).toBe('auth-flow');
      expect(spec.lockedPhases).toEqual(['A', 'B']);
      expect(spec.taskTableRows.length).toBeGreaterThan(0);
    },
  ));

// ─── findActivePhase Tests ───────────────────────────────────────────

const phaseFeatureMd = `---
name: test
locked-phases:
---

# Test

| ID | Name | Type | Status |
|----|------|------|--------|
| A001 | setup | execution | complete |
| A002 | review | review | pending |
`;

test('findActivePhase: finds phase with pending tasks', () =>
  withRoot(
    {
      '.agents/features/test/FEATURE.md': phaseFeatureMd,
      '.agents/features/test/A/A001-setup/TASK.md':
        '---\nid: A001\nname: setup\ntype: execution\nstatus: complete\n---\nDone.',
      '.agents/features/test/A/A001-setup/MEMORY.md': '# MEMORY',
      '.agents/features/test/A/A002-review/TASK.md':
        '---\nid: A002\nname: review\ntype: review\nstatus: pending\n---\nReview.',
      '.agents/features/test/A/A002-review/MEMORY.md': '# MEMORY',
    },
    async ({ tmp }) => {
      const loadResult = await runResult(loadFeatureSpec(tmp, 'test'));
      expect(Result.isSuccess(loadResult)).toBe(true);
      if (Result.isFailure(loadResult)) return;

      const activePhase = await runEffect(findActivePhase(loadResult.success, []));
      expect(activePhase).toBeTruthy();
      expect(activePhase?.phase).toBe('A');
      expect(activePhase?.reviewTask).toBeTruthy();
      expect(activePhase?.reviewTask?.id).toBe('A002');
      // In feature-spec mode, review lives inside the task directory as REVIEW.md
      expect(activePhase?.reviewTask?.reviewFile).toBe(
        path.join(tmp, '.agents/features/test/A/A002-review/REVIEW.md'),
      );
    },
  ));

test('findActivePhase: skips locked phases', () =>
  withRoot(
    {
      '.agents/features/test/FEATURE.md': `---
name: test
locked-phases: A
---

# Test

| ID | Name | Type | Status |
|----|------|------|--------|
| A001 | done | execution | complete |
| B001 | pending | execution | pending |
`,
      '.agents/features/test/A/A001-done/TASK.md':
        '---\nid: A001\nname: done\ntype: execution\nstatus: complete\n---\nDone.',
      '.agents/features/test/B/B001-pending/TASK.md':
        '---\nid: B001\nname: pending\ntype: execution\nstatus: pending\n---\nPending.',
    },
    async ({ tmp }) => {
      const loadResult = await runResult(loadFeatureSpec(tmp, 'test'));
      expect(Result.isSuccess(loadResult)).toBe(true);
      if (Result.isFailure(loadResult)) return;

      const activePhase = await runEffect(findActivePhase(loadResult.success, ['A']));
      expect(activePhase).toBeTruthy();
      expect(activePhase?.phase).toBe('B');
    },
  ));

test('findActivePhase: null when all phases complete or locked', () =>
  withRoot(
    {
      '.agents/features/test/FEATURE.md': `---
name: test
locked-phases:
---

# Test

| ID | Name | Type | Status |
|----|------|------|--------|
| A001 | done | execution | complete |
`,
      '.agents/features/test/A/A001-done/TASK.md':
        '---\nid: A001\nname: done\ntype: execution\nstatus: complete\n---\nDone.',
    },
    async ({ tmp }) => {
      const loadResult = await runResult(loadFeatureSpec(tmp, 'test'));
      expect(Result.isSuccess(loadResult)).toBe(true);
      if (Result.isFailure(loadResult)) return;

      const activePhase = await runEffect(findActivePhase(loadResult.success, []));
      expect(activePhase).toBeNull();
    },
  ));

// ─── Review Loop Counter Tests ───────────────────────────────────────

test('getReviewLoopCounter: returns 0 when file does not exist', () =>
  withRoot({}, async ({ tmp }) => {
    const counter = await runEffect(
      getReviewLoopCounter(path.join(tmp, 'nonexistent', 'MEMORY.md')),
    );
    expect(counter).toBe(0);
  }));

test('getReviewLoopCounter: returns max iteration from existing section', () =>
  withRoot(
    {
      'MEMORY.md': `# MEMORY

## Prior Work
Some notes here.

## Review Loop Counter
- Iteration 1: 3 findings found, 3 remediation tasks created
- Iteration 2: 1 findings found, 1 remediation task(s) created
`,
    },
    async ({ tmp }) => {
      const counter = await runEffect(getReviewLoopCounter(path.join(tmp, 'MEMORY.md')));
      expect(counter).toBe(2);
    },
  ));

test('updateReviewLoopCounter: creates section if missing', () =>
  withRoot({}, async ({ tmp }) => {
    const memoryPath = path.join(tmp, 'MEMORY.md');
    await runEffect(updateReviewLoopCounter(memoryPath, 1, 3, 3));
    const content = fs.readFileSync(memoryPath, 'utf8');
    expect(content).toContain('## Review Loop Counter');
    expect(content).toContain('Iteration 1: 3 finding(s) found, 3 remediation task(s) created');
  }));

test('updateReviewLoopCounter: appends to existing section in chronological order', () =>
  withRoot(
    {
      'MEMORY.md': `# MEMORY

## Review Loop Counter
- Iteration 1: 3 finding(s) found, 3 remediation task(s) created
`,
    },
    async ({ tmp }) => {
      const memoryPath = path.join(tmp, 'MEMORY.md');
      await runEffect(updateReviewLoopCounter(memoryPath, 2, 1, 1));
      const content = fs.readFileSync(memoryPath, 'utf8');
      const lines = content.split('\n');
      const iterationLines = lines.filter((line) => line.startsWith('- Iteration'));
      expect(iterationLines.length).toBe(2);
      expect(iterationLines[0]).toContain('Iteration 1');
      expect(iterationLines[1]).toContain('Iteration 2');
    },
  ));

// ─── extractFindings Tests ───────────────────────────────────────────

test('extractFindings: parses findings from review file', () =>
  withRoot(
    {
      '.agents/reviews/test/001.md': `# Adversarial Review: test

## Review Metadata
- **Max Attempts**: 3

## Findings

### Critical

#### F1 — Null pointer dereference
- **Severity**: Critical
- **Location**: \`src/auth.ts:42\`
- **Problem**: Accessing user without null check
- **Impact**: Crash on unauthenticated requests
- **Suggestion**: Add null guard before access
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion
<!-- Empty -->

### Major

#### F2 — Missing input validation
- **Severity**: Major
- **Location**: \`src/api.ts:15\`
- **Problem**: No validation on email field
- **Impact**: Malformed data stored in database
- **Suggestion**: Add email regex validation
- **Status**: In Review
- **Attempts**: 1
- **First Seen**: 1

### Discussion
[Fixer] added validation

## Summary
- **Open**: 1
- **In Review**: 1
- **Resolved**: 0
- **Won't Fix**: 0
- **Escalated**: 0
`,
    },
    async ({ tmp }) => {
      const findings = await runEffect(
        extractFindings(path.join(tmp, '.agents/reviews/test/001.md')),
      );
      expect(findings.length).toBe(2);
      expect(findings[0]?.id).toBe('F1');
      expect(findings[0]?.severity).toBe('Critical');
      expect(findings[0]?.status).toBe('Open');
      expect(findings[1]?.id).toBe('F2');
      expect(findings[1]?.severity).toBe('Major');
      expect(findings[1]?.status).toBe('In Review');
    },
  ));

test('extractFindings: parses Resolved findings with their status', () =>
  withRoot(
    {
      '.agents/reviews/test/001.md': `# Adversarial Review: test

## Findings

### Critical

#### F1 — Fixed bug
- **Severity**: Critical
- **Location**: \`src/main.ts:10\`
- **Problem**: Bug was here
- **Impact**: Crash
- **Suggestion**: Fix it
- **Status**: Resolved
- **Attempts**: 2
- **First Seen**: 1

### Discussion
[Fixer] fixed it
[Reviewer] confirmed

## Summary
- **Open**: 0
- **In Review**: 0
- **Resolved**: 1
- **Won't Fix**: 0
- **Escalated**: 0
`,
    },
    async ({ tmp }) => {
      const findings = await runEffect(
        extractFindings(path.join(tmp, '.agents/reviews/test/001.md')),
      );
      expect(findings.length).toBe(1);
      expect(findings[0]?.status).toBe('Resolved');
    },
  ));

test('extractFindings: returns empty array for non-existent file', async () => {
  const findings = await runEffect(
    extractFindings('/tmp/nonexistent-file-that-does-not-exist.md'),
  );
  expect(findings).toEqual([]);
});

// ─── createRemediationTasks Tests ────────────────────────────────────

test('createRemediationTasks: creates task directories with correct structure', () =>
  withRoot({}, async ({ tmp }) => {
    const findings = [
      {
        id: 'F1',
        severity: 'Critical',
        problem: 'Null pointer',
        status: 'Open',
        location: 'src/x.ts:1',
      },
      {
        id: 'F2',
        severity: 'Major',
        problem: 'Missing validation',
        status: 'In Review',
        location: 'src/y.ts:5',
      },
    ];

    const { taskDirs, taskIds } = await runEffect(
      createRemediationTasks(
        findings,
        'A',
        'A099',
        'A098',
        path.join(tmp, '.agents/features/test'),
        '.agents/reviews/test/001.md',
      ),
    );

    expect(taskIds.length).toBe(2);
    expect(taskIds[0]).toBe('A100');
    expect(taskIds[1]).toBe('A101');
    expect(taskDirs.length).toBe(2);
    expect(taskDirs[0]).toMatch(/A100-remediate-f1$/);
    expect(taskDirs[1]).toMatch(/A101-remediate-f2$/);

    // Verify TASK.md exists and has correct content
    const task1Md = fs.readFileSync(path.join(taskDirs[0] ?? '', 'TASK.md'), 'utf8');
    expect(task1Md).toContain('id: A100');
    expect(task1Md).toContain('name: remediate-f1');
    expect(task1Md).toContain('type: defect');
    expect(task1Md).toContain('finding-ref: F1');
    expect(task1Md).toContain('depends-on: A098');
    expect(task1Md).toContain('originator: defect:A098');

    // Verify MEMORY.md exists
    const memoryMd = fs.readFileSync(path.join(taskDirs[0] ?? '', 'MEMORY.md'), 'utf8');
    expect(memoryMd).toContain('**Finding**: F1');
    expect(memoryMd).toContain('**Severity**: Critical');
  }));

// ─── updateFeatureTaskTable Tests ────────────────────────────────────

test('updateFeatureTaskTable: appends rows to task table', () =>
  withRoot(
    {
      'FEATURE.md': `---
name: test
---

# Test

| ID | Name | Type | Status |
|----|------|------|--------|
| A001 | setup | execution | complete |
| A002 | review | review | pending |
`,
    },
    async ({ tmp }) => {
      const newTasks = [
        { id: 'A100', name: 'remediate-f1' },
        { id: 'A101', name: 'remediate-f2' },
      ];
      const updated = await runEffect(
        updateFeatureTaskTable(path.join(tmp, 'FEATURE.md'), newTasks),
      );
      expect(updated).toBe(true);

      const content = fs.readFileSync(path.join(tmp, 'FEATURE.md'), 'utf8');
      expect(content).toContain('| A100 | remediate-f1 | defect | pending |');
      expect(content).toContain('| A101 | remediate-f2 | defect | pending |');
    },
  ));

test('updateFeatureTaskTable: returns false for non-existent file', async () => {
  const result = await runEffect(updateFeatureTaskTable('/tmp/nonexistent-feature.md', []));
  expect(result).toBe(false);
});
