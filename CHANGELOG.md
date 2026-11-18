## 1.1.1 — Board interaction update

- Added right-click-and-drag arrows to Analysis Studio and Game Review; repeated gestures toggle arrows off.
- Added clear-all annotation controls.
- Added mobile board focus/fullscreen mode with a fixed-viewport fallback for browsers without Fullscreen API support.

# Changelog

## 1.1.0 — Emerald Graphite UX refresh

### Visual identity
- Replaced the previous charcoal/lime palette with the Emerald Graphite system.
- Standardized application surfaces, borders, text hierarchy, focus rings, and status colors.
- Updated PWA theme/background colors and application icons to match the new identity.

### Dashboard
- Reworked the welcome area into a more prominent dashboard hero with a direct training action.
- Improved dashboard card surfaces, spacing, typography, and hover feedback.
- Preserved real-data statistics, recent games, activity summaries, and training progress.

### Cross-module styling
- Updated shared navigation, panels, forms, engine controls, opening rows, training tabs, game cards, and settings controls.
- Refined chessboard square colors while preserving move-selection and legal-move behavior.
- Improved reduced-motion handling and visible keyboard focus styling.

### Platform
- Updated application version to 1.1.0.
- Bumped the service-worker cache namespace to ensure clients fetch the new release assets.
- Updated the web app manifest and browser theme color.

### Validation
- `node scripts/selftest.mjs`: passed (perft, legal-move comparison with Stockfish, and Opera Game PGN parsing).
- `git diff --check`: passed.
- TypeScript, Vitest, and production build could not be executed in the editing environment because project dependencies were not available and the npm registry could not be reached. Run the full validation commands locally before deployment.
