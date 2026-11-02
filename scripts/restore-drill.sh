#!/usr/bin/env bash
# WI-138: the recovery drill. Times how long it takes to get the newest CI backup back into a
# working database: download the artifact, decrypt it with the owner's key, and restore it into
# a scratch database that db:restore:verify checks and drops. Nothing touches production.
#
#   KEY=~/.config/silsila/backup-key.txt \
#   RESTORE_VERIFY_SERVER_URL=postgresql://careeros:careeros@127.0.0.1:5433/careeros \
#   bash scripts/restore-drill.sh
#
# Needs gh (signed in), age, and pg_restore 17 or newer on PATH (brew install libpq).
set -euo pipefail
KEY="${KEY:-$HOME/.config/silsila/backup-key.txt}"
: "${RESTORE_VERIFY_SERVER_URL:?Set RESTORE_VERIFY_SERVER_URL to a local PostgreSQL 17 server}"
[ -r "$KEY" ] || { echo "No age key at $KEY"; exit 1; }
work=$(mktemp -d)
# The plain dump holds every personal record: it is shredded on any exit.
trap 'find "$work" -type f -exec rm -P {} + 2>/dev/null; rm -rf "$work"' EXIT
start=$(date +%s)
run=$(gh run list --workflow backup.yml --status success --limit 1 --json databaseId --jq '.[0].databaseId')
[ -n "$run" ] || { echo "No successful Backup run found"; exit 1; }
gh run download "$run" --dir "$work"
downloaded=$(date +%s)
enc=$(find "$work" -name '*.dump.age' | head -1)
age --decrypt -i "$KEY" -o "$work/careeros.dump" "$enc"
decrypted=$(date +%s)
pnpm db:restore:verify "$work/careeros.dump"
done=$(date +%s)
echo
echo "Drill finished: run $run"
echo "  download  $((downloaded - start)) s"
echo "  decrypt   $((decrypted - downloaded)) s"
echo "  restore   $((done - decrypted)) s"
echo "  total     $((done - start)) s"
echo "Write the total, the date and the data age above into docs/engineering/backup-restore.md."
