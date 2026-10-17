#!/bin/sh
# Safety net: refuse commits that include private files or anything that looks like a secret.
# Installed as .git/hooks/pre-commit (see scripts/install-hooks.sh).

PRIVATE='^(analysis/|data/|src/ai\.ts$|server/mcp\.ts$|server/claude-bridge\.ts$|CLAUDE\.md$|plan\.md$|resume\.md$|NEXT-SESSION-PROMPT\.md$|\.claude/|\.env)'
bad=$(git diff --cached --name-only --diff-filter=ACMR | grep -E "$PRIVATE")
if [ -n "$bad" ]; then
  echo "pre-commit: refusing to commit private files:" >&2
  echo "$bad" | sed 's/^/  /' >&2
  exit 1
fi

# API keys / tokens (Anthropic, OpenAI, Google, GitHub, generic bearer/session tokens)
SECRETS='(sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|"(access|refresh)Token"\s*:|sessionKey)'
hits=$(git diff --cached -U0 --diff-filter=ACMR -- . ':(exclude)scripts/pre-commit.sh' | grep '^+' | grep -v '^+++' | grep -nE "$SECRETS")
if [ -n "$hits" ]; then
  echo "pre-commit: possible secret in staged changes — commit blocked:" >&2
  echo "$hits" | cut -c1-120 >&2
  exit 1
fi

# No AI co-author / attribution trailers: commits belong to the repo owner only.
exit 0
