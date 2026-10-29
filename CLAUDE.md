# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🛠 Common Commands

- **Start Development Server**: `npm start`
- **Run on Android**: `npm run android`
- **Run on iOS**: `npm run ios`
- **Run on Web**: `npm run web`
- **Lint Code**: `npm run lint`
- **Reset Project**: `npm run reset-project`

## 🏗 Architecture

Flash Deck is an Expo/React Native application using Expo Router for navigation and Notion as a backend.

### Core Modules
- **Routing (`src/app/`)**: Uses file-based routing.
  - `index.tsx`: Dashboard for managing decks and Notion API tokens.
  - `deck/[id].tsx`: Study session implementation with swipe interactions.
- **Services (`src/services/`)**:
  - `notion.ts`: Handles communication with Notion REST API (querying and patching pages).
  - `spaced-repetition.ts`: Implements the SM-2 algorithm for calculating review intervals and Weighted Random selection for card drawing.
- **State Management**:
  - **Global Theme**: `src/app/theme-context.tsx` provides light/dark mode switching synced with device settings.
  - **Local Storage**: Uses `@react-native-async-storage/async-storage` to persist deck metadata (`@my_decks`).

### Key Logic Flows
1. **Study Session**: `Index` $\rightarrow$ `StudyScreen` $\rightarrow$ `SpacedRepetitionManager.initTodaySession` $\rightarrow$ `drawCard` $\rightarrow$ `processAnswer`.
2. **Data Sync**: Progress is tracked locally during a session and batch-updated to the Notion database when the user completes the session and returns to the home screen.

### Notion Schema Requirements
The connected Notion database must have:
- `Front` & `Back` (rich_text)
- `Repetitions` (number)
- `EaseFactor` (number)
- `IntervalDays` (number)
- `NextReviewDate` (date)
