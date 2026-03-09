#!/bin/sh
set -e

# Decompress only if not already done (happens once per container)
if [ ! -x /usr/bin/node ]; then
    echo "→ Decompressing Node.js executable (gzip → original)..."
    gunzip -c /usr/bin/node.gz > /usr/bin/node
    chmod 755 /usr/bin/node
fi

exec /sbin/tini -- "$@"