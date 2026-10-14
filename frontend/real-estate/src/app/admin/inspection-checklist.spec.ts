import { InspectionChecklist, formatChecklist, parseChecklist } from './inspection-checklist';

describe('inspection checklist text', () => {
  const list: InspectionChecklist = [
    { room: 'Phòng khách', items: ['Ghế sofa', 'Tivi'] },
    { room: 'Phòng ngủ', items: ['Giường', 'Điều hòa'] },
  ];

  it('round-trips a list', () => {
    expect(parseChecklist(formatChecklist(list))).toEqual(list);
  });

  it('formats one room per line with dashed items', () => {
    expect(formatChecklist(list)).toBe('Phòng khách\n- Ghế sofa\n- Tivi\nPhòng ngủ\n- Giường\n- Điều hòa');
  });

  it('puts items before any room under "Chung"', () => {
    expect(parseChecklist('- Chìa khóa\nBếp\n- Bếp từ')).toEqual([
      { room: 'Chung', items: ['Chìa khóa'] },
      { room: 'Bếp', items: ['Bếp từ'] },
    ]);
  });

  it('ignores blank lines and drops rooms without items', () => {
    expect(parseChecklist('\nBếp\n\n- Bếp từ\n  \nBan công\nWC\n- Vòi sen\n-\n')).toEqual([
      { room: 'Bếp', items: ['Bếp từ'] },
      { room: 'WC', items: ['Vòi sen'] },
    ]);
  });

  it('returns an empty list for empty text', () => {
    expect(parseChecklist('  \n ')).toEqual([]);
  });
});
