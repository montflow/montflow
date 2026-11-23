# Flake dev shell

A Nix flake gives you a dev shell with `git` and `bun` at pinned versions,
without installing them globally. montflow's own [`flake.nix`](../flake.nix)
is a working example. Use it as the model for your repository.

Nix is optional. Anything that gives you `git` and `bun 1.3.13` on your `PATH`
works for montflow.

## Requirements

- Nix with flakes enabled (`nix --version`, and `nix flake --help` runs without
  an "experimental feature" error).
- A git checkout of your repository. Nix reads only tracked and staged files, so
  `git add flake.nix flake.lock` before you run `nix develop`.

## The example

This is the part of montflow's `flake.nix` that matters for setup:

```nix
{
  description = "my repository";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.bun
            pkgs.git
          ];

          shellHook = ''
            export TMPDIR="''${TMPDIR:-/tmp}"
            echo "bun $(bun --version) · git $(git --version | cut -d' ' -f3)"
          '';
        };
      });
}
```

- `inputs` pins nixpkgs and flake-utils. `flake.lock` records the exact
  revisions, so every machine gets the same `bun` and `git`.
- `eachDefaultSystem` builds the shell for your platform (macOS or Linux, Intel
  or ARM).
- `packages` lists what the shell puts on `PATH`. Add tools here, not to your
  global environment.

Montflow's real `flake.nix` also pins Node, adds `curl` and `wget`, and, in
interactive shells, re-enters your login shell so your prompt and aliases work
inside the dev shell. Copy those parts if you want them.

## Use it

```bash
nix develop            # enter the dev shell
bun --version          # expect 1.3.13
nix develop --command bun --version   # run one command without entering
```

Commit `flake.nix` and `flake.lock`. Do not commit `result` or `.direnv`.

## Setup prompt

Paste this into your coding agent from the root of the repository:

````text
Set up a Nix flake dev shell in this repository. Run every command from the
repository root. Stop at the first failure and show me its output; never work
around it.

1. Check that `nix` is installed and that flakes work: `nix flake --help`.
   If not, stop and tell me how to enable flakes. Do not install Nix yourself.
2. If `flake.nix` does not exist, create it with the example in
   guides/flake.md. Use `nixpkgs` `nixos-unstable` and `flake-utils`. Keep the
   `packages` list to `bun` and `git`.
3. Run `git add flake.nix` (`flake.lock` too, once it exists) so Nix can see
   the files.
4. Run `nix develop --command bun --version`. It must print 1.3.13, the version
   montflow pins. If it prints another version, stop and report it. Do not
   change the pin without asking me.
5. Run `nix develop --command git --version`.
6. Show me `git status`. Do not commit; I will decide what to commit.
````
