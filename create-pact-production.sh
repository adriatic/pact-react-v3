#!/bin/bash
set -e

# create-pact-production.sh
# Copies pact-react-v2 source files to pact-production (clean rebuild target)
# Excludes: .git, .DS_Store, *.tsbuildinfo, out/, pact-data/, host/, betas/

SRC="$HOME/Work/pact-react-v2"
DEST="$HOME/Work/pact-production"

# Back up existing pact-data if present
if [ -d "$DEST/pact-data" ]; then
    echo "Backing up pact-data..."
    cp -r "$DEST/pact-data" /tmp/pact-production-data-backup
fi

echo "Removing existing pact-production..."
rm -rf "$DEST"

echo "Creating fresh pact-production..."
mkdir -p "$DEST"

echo "Copying source files..."
rsync -av \
  --exclude='.git' \
  --exclude='.DS_Store' \
  --exclude='*.tsbuildinfo' \
  --exclude='out/' \
  --exclude='pact-data/' \
  --exclude='host/' \
  --exclude='betas/' \
  --exclude='pact.code-workspace' \
  --exclude='config.dev.json' \
  "$SRC/" "$DEST/"
  
# Restore pact-data if backed up
if [ -d /tmp/pact-production-data-backup ]; then
    echo "Restoring pact-data..."
    cp -r /tmp/pact-production-data-backup "$DEST/pact-data"
    rm -rf /tmp/pact-production-data-backup
fi
echo ""
echo "Done. pact-production is ready to build."
echo "Next: cd $DEST && npm install && npm run build"