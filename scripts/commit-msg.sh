#!/bin/sh
# Strip any AI co-author / "Generated with" attribution lines from commit messages.
sed -i -E '/^Co-Authored-By: .*(Claude|anthropic)/Id; /Generated with \[?Claude/Id' "$1"
