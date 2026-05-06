#!/usr/bin/env bash
set -eo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
project_root="$repo_root/python"

cd "$project_root"
pip install -e ".[server,test]" 2>/dev/null || pip install -e ".[test]"
echo "Python deps installed. Run: python -m pytest tests/ -v"
