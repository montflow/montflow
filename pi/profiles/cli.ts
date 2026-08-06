#!/usr/bin/env node
/**
 * Standalone CLI for the profiles extension.
 *
 * Runs the same option parser and Effect core as the pi `/profiles` command,
 * but prints to stdout and exits with a code — for scripting and testing
 * outside pi. Interactive flows (menu / modify wizard) require the pi TUI.
 *
 * Usage:
 *   node cli.ts --list
 *   node cli.ts --new --name code-reviewer --description="You are a code reviewer..."
 *   node cli.ts --show code-reviewer
 *   node cli.ts --delete code-reviewer --force
 */
import { Effect } from 'effect';
import { NodeRuntime } from '@effect/platform-node';
import * as Model from './model.ts';
import { USAGE, tryParseOptionsFromTokens, type ProfilesCommand } from './options.ts';
import { readTemplateSync } from './paths.ts';
import { runStore } from './runtime.ts';
import * as Skills from './skills.ts';
import * as Store from './store.ts';

const cwd = process.cwd();
const args = process.argv.slice(2);

const run = (command: ProfilesCommand): Effect.Effect<void, Error, never> =>
  Effect.gen(function* () {
    switch (command.kind) {
      case 'help':
        console.log(USAGE);
        return;
      case 'list': {
        const names = yield* Effect.tryPromise(() => runStore(Store.listProfiles(cwd)));
        if (names.length === 0) {
          console.log('No profiles yet.');
        } else {
          for (const name of names) console.log(name);
        }
        return;
      }
      case 'template':
        console.log(readTemplateSync());
        return;
      case 'show': {
        const markdown = yield* Effect.tryPromise(() => runStore(Store.readProfileFile(cwd, command.name)));
        console.log(markdown);
        return;
      }
      case 'delete': {
        if (!command.force) {
          yield* Effect.fail(new Error('Delete requires confirmation in the CLI: use --force.'));
          return;
        }
        yield* Effect.tryPromise(() => runStore(Store.deleteProfileDir(cwd, command.name)));
        console.log(`Deleted profile: ${command.name}`);
        return;
      }
      case 'new': {
        const { fields, force } = command;
        if (fields.name === undefined || fields.description === undefined) {
          yield* Effect.fail(new Error('--new requires --name <slug> and --description "<text>".'));
          return;
        }
        const name = Model.slugify(fields.name);
        if (!Model.isValidProfileName(name)) {
          yield* Effect.fail(new Error(`Invalid profile name: ${fields.name}`));
          return;
        }
        const exists = yield* Effect.tryPromise(() => runStore(Store.profileExists(cwd, name)));
        if (exists && !force) {
          yield* Effect.fail(new Error(`Profile already exists: ${name} (use --force to overwrite)`));
          return;
        }
        const profile = Model.validateProfileFields({
          name,
          description: fields.description,
          model: fields.model ?? '',
          skills: fields.skills,
          instructions: fields.instructions ?? '',
          checklist: fields.checklist,
        });
        if (profile === undefined) {
          yield* Effect.fail(new Error(`Invalid profile fields: ${fields.name}`));
          return;
        }
        const markdown = Model.renderProfileFromTemplate(readTemplateSync(), profile);
        yield* Effect.tryPromise(() => runStore(Store.writeProfileFile(cwd, name, markdown)));
        console.log(`Profile created: .agents/profiles/${name}/PROFILE.md`);
        return;
      }
      case 'menu':
      case 'edit':
        yield* Effect.fail(
          new Error(
            command.kind === 'edit'
              ? '--modify requires the pi TUI. Run /profiles --modify <name> inside pi.'
              : 'No command given. Use --list/--show/--new/--delete, or run /profiles inside pi for the interactive menu.',
          ),
        );
        return;
    }
  });

const program = Effect.gen(function* () {
  const parsed = tryParseOptionsFromTokens(args);
  if (!parsed.ok) {
    yield* Effect.fail(new Error(parsed.err instanceof Error ? parsed.err.message : String(parsed.err)));
    return;
  }
  const command = parsed.command ?? { kind: 'menu' };
  yield* run(command);
}).pipe(
  Effect.catch((error) =>
    Effect.sync(() => {
      console.error(`profiles: ${error.message}`);
      process.exitCode = 1;
    }),
  ),
);

NodeRuntime.runMain(program);
