OnlyFans signing regression fixture
=================================

sign-20260928.js.txt is the public signing chunk 2313.js from revision
202609281423-40290c0906, retrieved anonymously from the script URL advertised
by https://onlyfans.com/medusa4prsdnt/media on September 28, 2026.

It contains no cookies, account data, or session tokens. The text extension
keeps the original obfuscated input intact instead of formatting/linting it as
application code. Production parses the bundle statically.

The expected signatures in test_onlyfans.py were generated independently by
running webpack module 802313 with Date fixed at 1700000000123, authUserId "42",
a SHA-1 implementation, and a property getter for the three requested paths:
url, navigator.userAgent, and getters.auth/authUserId.

Run the regression suite from the repository root:

    python -m unittest discover -s apps/desktop/test -p test_onlyfans.py
