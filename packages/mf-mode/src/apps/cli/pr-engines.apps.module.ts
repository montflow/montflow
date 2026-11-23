import { Effect, FileSystem, Path, Result, Schema } from 'effect';
import * as Pr from '../../modules/pr/index.js';
import { Host } from '../../services/index.js';

/**
 * `mf-mode pr`: the PR body standard. `check` holds a body to it, and
 * `attach` hosts proof files so the body can show them. Images go to GitHub's
 * own attachment store (what drag-and-drop uses, access-controlled like the
 * repo), which renders them inline. Anything else (a PDF) goes to an orphan
 * assets branch, where GitHub's file viewer renders it. Nothing reaches the
 * PR's own branch.
 */

/**
 * Check a PR body file, and the title when given.
 * @param options - the body file and the title
 */
export const check = (options: {
  readonly root: string;
  readonly bodyFile: string;
  readonly title: string | undefined;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const bodyFile = path.resolve(options.root, options.bodyFile);
    const body = yield* fs
      .readFileString(bodyFile)
      .pipe(Effect.mapError((error) => 'Cannot read ' + bodyFile + ': ' + error.message));
    return Pr.check({ body, title: options.title });
  });

export interface AttachOptions {
  readonly root: string;
  readonly files: ReadonlyArray<string>;
  /** The assets branch for non-images; `assets/<current branch>` when undefined. */
  readonly branch: string | undefined;
  readonly remote: string;
  /** `owner/name`, when the remote URL is not a GitHub URL. */
  readonly repo: string | undefined;
}

export type Via = 'attachment' | 'branch';

export interface AttachedFile {
  readonly name: string;
  readonly image: boolean;
  readonly via: Via;
  /** A link GitHub renders: the image itself, or the file's viewer. */
  readonly url: string;
}

export interface Attached {
  readonly files: ReadonlyArray<AttachedFile>;
  /** The assets branch and its new commit, when any file went there. */
  readonly branch: string | undefined;
  readonly commit: string | undefined;
  /** Why an image went to the branch instead of the attachment store. */
  readonly notes: ReadonlyArray<string>;
}

/** Image types GitHub's attachment store takes, by extension. */
const MIME = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
]);
const GITHUB = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/;
const SLUG = /^[\w.-]+\/[\w.-]+$/;
const UploadReply = Schema.fromJsonString(Schema.Struct({ url: Schema.String }));

const firstLine = (text: string): string => text.trim().split('\n')[0] ?? '';
const extension = (name: string): string => (name.split('.').at(-1) ?? '').toLowerCase();

/**
 * Host proof files where a PR body can show them, and return their links.
 * @param options - files, the assets branch, the remote
 */
export const attach = (options: AttachOptions) =>
  Effect.gen(function* () {
    const host = yield* Host.Host;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const run = (binary: string, args: ReadonlyArray<string>, stdin?: string) =>
      host
        .exec(binary, args, { cwd: options.root, stdin, timeoutMs: 300_000 })
        .pipe(
          Effect.flatMap((done) =>
            done.code === 0
              ? Effect.succeed(done.stdout.trim())
              : Effect.fail(
                  binary +
                    ' ' +
                    (args[0] ?? '') +
                    ' failed: ' +
                    firstLine(done.stderr || done.stdout),
                ),
          ),
        );
    const git = (args: ReadonlyArray<string>, stdin?: string) => run('git', args, stdin);

    const files = options.files.map((file) => path.resolve(options.root, file));
    for (const file of files) {
      if (!(yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false)))) {
        return yield* Effect.fail('No such file: ' + file);
      }
    }
    const names = files.map((file) => path.basename(file));
    const twice = names.find((name, index) => names.indexOf(name) !== index);
    if (twice !== undefined) {
      return yield* Effect.fail("Two files are named '" + twice + "'. Rename one.");
    }

    let slug = options.repo;
    if (slug === undefined) {
      const url = yield* git(['remote', 'get-url', options.remote]);
      const match = GITHUB.exec(url);
      if (match === null) {
        return yield* Effect.fail(
          'Remote ' + options.remote + ' is not on GitHub (' + url + '). Pass --repo owner/name.',
        );
      }
      slug = match[1] + '/' + match[2];
    }
    if (!SLUG.test(slug)) {
      return yield* Effect.fail("--repo must be owner/name, got '" + slug + "'.");
    }

    const attached: Array<AttachedFile> = [];
    const notes: Array<string> = [];
    const toBranch: Array<number> = [];
    const images = files.flatMap((_, index) =>
      MIME.get(extension(names[index] ?? '')) === undefined ? [] : [index],
    );
    for (const [index] of files.entries()) if (!images.includes(index)) toBranch.push(index);

    if (images.length > 0) {
      const auth = yield* Effect.all([
        run('gh', ['auth', 'token']),
        run('gh', ['api', 'repos/' + slug, '--jq', '.id']),
      ]).pipe(Effect.result);
      for (const index of images) {
        const name = names[index] ?? '';
        const file = files[index] ?? '';
        if (Result.isFailure(auth)) {
          notes.push(name + ' went to the branch: ' + auth.failure);
          toBranch.push(index);
          continue;
        }
        const [token, repoId] = auth.success;
        const upload = yield* run(
          'curl',
          [
            '--silent',
            '--show-error',
            '--fail-with-body',
            '-X',
            'POST',
            '--header',
            '@-',
            '-H',
            'Accept: application/json',
            '--data-binary',
            '@' + file,
            'https://uploads.github.com/user-attachments/assets?name=' +
              encodeURIComponent(name) +
              '&content_type=' +
              encodeURIComponent(MIME.get(extension(name)) ?? '') +
              '&repository_id=' +
              repoId,
          ],
          'Authorization: Bearer ' + token + '\n',
        ).pipe(Effect.result);
        const reply = Result.isSuccess(upload)
          ? Schema.decodeUnknownResult(UploadReply)(upload.success)
          : undefined;
        if (reply !== undefined && Result.isSuccess(reply)) {
          attached.push({ name, image: true, via: 'attachment', url: reply.success.url });
        } else {
          notes.push(
            name +
              ' went to the branch: upload failed' +
              (Result.isFailure(upload) ? ' (' + upload.failure + ')' : ''),
          );
          toBranch.push(index);
        }
      }
    }

    if (toBranch.length === 0) {
      return { files: attached, branch: undefined, commit: undefined, notes } satisfies Attached;
    }

    let branch = options.branch;
    if (branch === undefined) {
      const current = yield* git(['rev-parse', '--abbrev-ref', 'HEAD']);
      if (current === 'HEAD') return yield* Effect.fail('HEAD is detached. Pass --branch.');
      branch = 'assets/' + current;
    }
    const branchNames = toBranch.map((index) => names[index] ?? '');
    const listed = yield* git(['ls-remote', options.remote, 'refs/heads/' + branch]);
    const parent = listed.split(/\s/)[0] ?? '';
    const kept: Array<string> = [];
    if (parent !== '') {
      yield* git(['fetch', '--no-tags', '--quiet', options.remote, 'refs/heads/' + branch]);
      for (const entry of (yield* git(['ls-tree', parent])).split('\n')) {
        const name = entry.split('\t')[1];
        if (name !== undefined && !branchNames.includes(name)) kept.push(entry);
      }
    }
    const added: Array<string> = [];
    for (const index of toBranch) {
      const blob = yield* git(['hash-object', '-w', files[index] ?? '']);
      added.push('100644 blob ' + blob + '\t' + (names[index] ?? ''));
    }
    const tree = yield* git(['mktree'], [...kept, ...added].join('\n') + '\n');
    const commit = yield* git([
      'commit-tree',
      tree,
      ...(parent === '' ? [] : ['-p', parent]),
      '-m',
      'assets: ' + branchNames.join(', '),
    ]);
    yield* git(['push', '--quiet', options.remote, commit + ':refs/heads/' + branch]);
    for (const name of branchNames) {
      const image = MIME.get(extension(name)) !== undefined;
      const url =
        'https://github.com/' +
        slug +
        '/blob/' +
        commit +
        '/' +
        encodeURIComponent(name) +
        (image ? '?raw=true' : '');
      attached.push({ name, image, via: 'branch', url });
    }
    const order = (file: AttachedFile) => names.indexOf(file.name);
    return {
      files: attached.toSorted((a, b) => order(a) - order(b)),
      branch,
      commit,
      notes,
    } satisfies Attached;
  });

/** One markdown line per attached file: an inline image or a link. */
export const markdown = (attached: Attached): ReadonlyArray<string> =>
  attached.files.map((file) =>
    file.image ? '![' + file.name + '](' + file.url + ')' : '[' + file.name + '](' + file.url + ')',
  );
