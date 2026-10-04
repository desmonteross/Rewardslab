#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# RentRewards — run it.
#
# Double-click this in Finder, or from Terminal:   bash run.command
#
# This is start.command in production mode: it installs what is missing, gets
# a database going, applies the schema, loads the demo data if there is none,
# builds once, and serves the app at http://localhost:3000.
#
# Everything it does is safe to repeat. A second run skips whatever has not
# changed and starts in seconds.
# ---------------------------------------------------------------------------
cd "$(dirname "$0")" || exit 1
PROD=1 exec bash ./start.command "$@"
