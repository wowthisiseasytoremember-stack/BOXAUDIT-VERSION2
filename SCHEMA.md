# Application Data Schema

## Session

The root data structure for the current working session.

```typescript
interface Session {
  id: string; // Unique session ID (e.g., "session-2023-10-27T10-00-00")
  startedAt: string; // ISO Date string
  boxes: {
    [boxKey: string]: BoxData; // Key is normalized box number (e.g., "BOX042", "SHELF 2C")
  };
}
```

## BoxData

Represents a single container (Box) or location (Shelf) being audited.

```typescript
interface BoxData {
  items: Item[]; // List of items in this box
  completed: boolean; // Whether this box/location is marked as done
  completedAt: string | null; // ISO Date string when completed
  secondaryLocation: string | null; // Optional sub-location (e.g., "SHELF 2C" if box is on a shelf)
}
```

## Item

Represents a single inventory entry.

```typescript
interface Item {
  id: number; // Unique timestamp-based ID
  name: string; // Item description/name
  qty: number; // Quantity (default 1)
  addedAt: string; // ISO Date string
  isDuplicate: boolean; // Flag if this item name/qty matches another in the same box
  tags: string[]; // List of context tags active when item was added (e.g., ["Estate Sale", "Damaged"])
}
```

## Global Config

Configuration accessible via `window.CONFIG`.

```typescript
interface Config {
  MAX_HISTORY_SIZE: number; // e.g., 50
  AUTO_SAVE_INTERVAL_MS: number; // e.g., 2000
  MAX_SEARCH_RESULTS: number; // e.g., 50
}
```

## Voice Context

The active context state for voice commands.

```typescript
interface ActiveContext {
  tags: string[]; // Current tags to apply to new items
}
```
