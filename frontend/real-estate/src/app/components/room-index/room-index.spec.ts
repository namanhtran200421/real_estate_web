import { indexItems } from './room-index';
import { RoomChapter } from '../../data/sun-garden-rooms';

const photo = (file: string) => ({ src: `/apartments/${file}.jpg`, alt: file, width: 1, height: 1 }) as RoomChapter['photos'][number];
const chapter = (id: string, files: string[], textOnly = false): RoomChapter => ({ id, key: id, photos: files.map(photo), textOnly });

describe('indexItems', () => {
  const items = indexItems([
    chapter('phong-khach', ['10', '09', '02']),
    chapter('bep', ['01']),
    chapter('text-only', [], true),
    chapter('phong-tam', ['11', '12']),
    chapter('phong-ngu-1', ['13', '14']),
    chapter('phong-ngu-2', ['16', '15', '03']),
  ]);

  it('picks 09, 01 for the kitchen, nothing for a text-only room, 12, 13 and 15', () => {
    expect(items.map((i) => i.photo?.src.match(/(\d\d)\.jpg/)?.[1])).toEqual(['09', '01', undefined, '12', '13', '15']);
  });

  it('crops the bathroom photo towards the top', () => {
    expect(items.find((i) => i.chapter.id === 'phong-tam')?.position).toBe('50% 15%');
    expect(items[0].position).toBe('50% 50%');
  });

  it('falls back to the first photo of a room without a named one', () => {
    expect(indexItems([chapter('khac', ['20', '21'])])[0].photo?.src).toContain('20.jpg');
  });
});
