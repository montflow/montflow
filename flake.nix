{
  description = "montflow monorepo";

  # Uncomment when you set up Cachix to enable automatic binary cache
  # nixConfig = {
  #   extra-substituters = [
  #     "https://montflow.cachix.org"
  #   ];
  #   extra-trusted-public-keys = [
  #     "montflow.cachix.org-1:REPLACE_WITH_YOUR_PUBLIC_KEY"
  #   ];
  # };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config = {
            allowUnfree = true;
          };
        };

        # Toolchain for the dev shell
        nodejs = pkgs.nodejs_22;
        packages = [
          # Runtime and build tooling
          pkgs.bun
          nodejs

          # Development tools
          pkgs.git
          pkgs.curl
          pkgs.wget
        ];

      in
      {
        packages = {
          # Core package: bun workspace project producing a build output.
          core = pkgs.stdenv.mkDerivation {
            pname = "montflow-core";
            version = "3.0.0-alpha.9";
            src = ./.;

            nativeBuildInputs = [ pkgs.bun nodejs ];

            buildPhase = ''
              runHook preBuild
              # Workspace install at the root: hoists tooling + package deps.
              bun install --frozen-lockfile
              cd packages/core
              bun run build
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              cp -r build $out/
              runHook postInstall
            '';
          };

          default = self.packages.${system}.core;
        };

        devShells.default = (pkgs.mkShell.override {
          stdenv = pkgs.clangStdenv;
        }) {
          inherit packages;
          hardeningDisable = [ "fortify" ];

          shellHook = ''
            export TMPDIR="''${TMPDIR:-/tmp}"

            # Only re-enter the user's shell for interactive sessions; leave
            # `nix develop --command` / CI usage alone.
            case "$-" in
              *i*)
                if [ -z "$MONTFLOW_DEV_SHELL" ]; then
                  export MONTFLOW_DEV_SHELL=1

                  # Print welcome message
                  echo "====================================="
                  echo "montflow Development Environment"
                  echo "====================================="
                  echo "Bun: $(bun --version 2>/dev/null || echo 'not found')"
                  echo "Node: $(node --version 2>/dev/null || echo 'not found')"
                  echo "====================================="

                  # nix develop forces stdenv's bash as $SHELL, so read the
                  # user's real login shell from the account database.
                  user_shell="$(getent passwd "$USER" 2>/dev/null | cut -d: -f7)"
                  if [ -z "$user_shell" ] || [ ! -x "$user_shell" ]; then
                    user_shell="$(awk -F: -v u="$USER" '$1 == u { print $7 }' /etc/passwd 2>/dev/null)"
                  fi
                  if [ -z "$user_shell" ] || [ ! -x "$user_shell" ]; then
                    user_shell="''${SHELL:-bash}"
                  fi

                  # Re-enter the user's shell (bash → bash just re-reads ~/.bashrc;
                  # the guard above prevents any looping).
                  export SHELL="$user_shell"
                  exec "$user_shell"
                fi
                ;;
            esac
          '';
        };
      });
}