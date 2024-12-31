#!/bin/bash

# Default word count for the short summary if no argument is passed
SUMMARY_WORDCOUNT=${1:-24}

# Collect only staged changes
STAGED_CHANGES=$(git diff --cached)

# List only staged files
STAGED_FILES=$(git diff --cached --name-status)

# Add a summary of changes for staged files
CHANGE_SUMMARY=$(git diff --cached --stat)

# Primer message
PRIMER="Write a commit message in the Conventional Commits format. The short summary should not exceed ${SUMMARY_WORDCOUNT} words. If necessary, add a body that's concise, descriptive, and readable."

# Footer message
FOOTER="Return output in plain text for easy copy-paste."

# Combine all sections
OUTPUT="${PRIMER}\n\n### Staged Changes:\n${STAGED_CHANGES}\n\n### Staged Files:\n${STAGED_FILES}\n\n### Change Summary:\n${CHANGE_SUMMARY}\n\n${FOOTER}"

# Copy to clipboard
if command -v pbcopy &> /dev/null; then
  echo -e "$OUTPUT" | pbcopy
  echo "Changes summary copied to clipboard (macOS)."
elif command -v xclip &> /dev/null; then
  echo -e "$OUTPUT" | xclip -selection clipboard
  echo "Changes summary copied to clipboard (Linux with xclip)."
elif command -v xsel &> /dev/null; then
  echo -e "$OUTPUT" | xsel --clipboard --input
  echo "Changes summary copied to clipboard (Linux with xsel)."
elif command -v clip &> /dev/null; then
  echo -e "$OUTPUT" | clip
  echo "Changes summary copied to clipboard (Windows/WSL)."
else
  echo "No clipboard utility found. Install pbcopy (macOS), xclip/xsel (Linux), or clip (Windows) to enable clipboard support."
  exit 1
fi
