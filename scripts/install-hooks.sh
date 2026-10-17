#!/bin/sh
# Run once after cloning: sh scripts/install-hooks.sh
cp scripts/pre-commit.sh .git/hooks/pre-commit
cp scripts/commit-msg.sh .git/hooks/commit-msg
chmod +x .git/hooks/pre-commit .git/hooks/commit-msg
echo "Git safety hooks installed."
