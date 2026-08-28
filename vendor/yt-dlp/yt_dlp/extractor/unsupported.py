# Intentionally left empty.
#
# Upstream yt-dlp ships KnownDRMIE / KnownPiracyIE / KnownLiabilityIE here to
# hard-reject entire domain lists (DRM-only services, alleged piracy hosts,
# and "liability" sites). VidBee removes those policy extractors so matching
# URLs can fall through to site-specific or Generic extractors instead of
# failing with a deliberate "will not be supported" error.
#
# Do not reintroduce domain blocklists in this module.
