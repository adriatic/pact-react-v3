#!/bin/bash
# add-copyright.sh
# Adds copyright header to all .ts, .tsx, and .py source files
# Skips files that already have the header, node_modules, out/, and .d.ts files

COPYRIGHT_TS="// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net"
COPYRIGHT_PY="# Copyright © 2026 PACTResearch.net. All rights reserved.\n# pactresearch.net"

SKIPPED=0
UPDATED=0

cd "$(dirname "$0")"

# Find all .ts and .tsx files, excluding node_modules, out/, and .d.ts
while IFS= read -r -d '' file; do
    if grep -q "Copyright © 2026 PACTResearch.net" "$file"; then
        SKIPPED=$((SKIPPED + 1))
        continue
    fi
    echo "$COPYRIGHT_TS" | cat - "$file" > /tmp/pact_copyright_tmp && mv /tmp/pact_copyright_tmp "$file"
    echo "  ✓ $file"
    UPDATED=$((UPDATED + 1))
done < <(find . \
    -not -path "*/node_modules/*" \
    -not -path "*/out/*" \
    -not -path "*/.git/*" \
    -not -name "*.d.ts" \
    \( -name "*.ts" -o -name "*.tsx" \) \
    -print0)

# Find all .py files
while IFS= read -r -d '' file; do
    if grep -q "Copyright © 2026 Pact Research LLC" "$file"; then
        SKIPPED=$((SKIPPED + 1))
        continue
    fi
    # Preserve shebang line if present
    first_line=$(head -1 "$file")
    if [[ "$first_line" == "#!"* ]]; then
        tail -n +2 "$file" > /tmp/pact_body
        echo -e "$first_line\n$COPYRIGHT_PY" | cat - /tmp/pact_body > /tmp/pact_copyright_tmp
    else
        echo "$COPYRIGHT_PY" | cat - "$file" > /tmp/pact_copyright_tmp
    fi
    mv /tmp/pact_copyright_tmp "$file"
    echo "  ✓ $file"
    UPDATED=$((UPDATED + 1))
done < <(find . \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -name "*.py" \
    -print0)

echo ""
echo "Done. $UPDATED files updated, $SKIPPED already had copyright."