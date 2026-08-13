#!/usr/bin/env bash
# Downloads the licensed media used by CPR Coach into assets/img/.
# Run from the repo root:  bash fetch-media.sh
#
# BEFORE ADDING ANY NEW FILE: open its Wikimedia Commons page, confirm the licence
# allows commercial and derivative use (CC BY, CC BY-SA, CC0 or public domain),
# and record the author and licence in CREDITS.md. Do not add anything marked
# "non-commercial", "no derivatives", or "fair use".
set -e
mkdir -p assets/img
dl () {  # dl <Commons filename> <local filename>
  echo "→ $2"
  curl -sL -A "CPR-Coach/1.0 (public-service CPR guidance)" \
    "https://commons.wikimedia.org/wiki/Special:FilePath/$1" -o "assets/img/$2"
}

# Adult chest compressions — CC BY 3.0
dl "Chest_compressions.gif" "chest-compressions.gif"

echo
echo "Done. Files are in assets/img/."
echo "The app uses each file only if it is present; otherwise it falls back to the"
echo "built-in drawings, so nothing breaks if a download fails."
