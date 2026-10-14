/** The check-out checklist of an apartment: rooms with the things to look at. */
export interface InspectionRoom {
  room: string;
  items: string[];
}

export type InspectionChecklist = InspectionRoom[];

/** One result of an inspection (backend: inspection.ts). */
export interface InspectionResult {
  room: string;
  item: string;
  ok: boolean;
  note: string | null;
}

const GENERAL_ROOM = 'Chung';

/**
 * The editor's text → a checklist. A line starting with "-" is an item of the current room, any
 * other line starts a room. Items before any room go under "Chung"; rooms without items are dropped.
 */
export function parseChecklist(text: string): InspectionChecklist {
  const rooms: InspectionChecklist = [];
  let current: InspectionRoom | undefined;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('-')) {
      const item = line.slice(1).trim();
      if (!item) continue;
      if (!current) {
        current = { room: GENERAL_ROOM, items: [] };
        rooms.push(current);
      }
      current.items.push(item);
    } else {
      current = { room: line, items: [] };
      rooms.push(current);
    }
  }
  return rooms.filter((room) => room.items.length > 0);
}

/** A checklist → the editor's text (one room per line, items below it starting with "- "). */
export function formatChecklist(list: InspectionChecklist): string {
  return list.map((room) => [room.room, ...room.items.map((item) => `- ${item}`)].join('\n')).join('\n');
}
