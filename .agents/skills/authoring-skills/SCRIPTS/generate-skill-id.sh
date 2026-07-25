#!/usr/bin/env bash
set -euo pipefail

# Generate a 16-character hex ID (lowercase) from /dev/urandom
ID=$(od -A n -t x1 -N 8 /dev/urandom | tr -d ' \n')
echo "$ID"
