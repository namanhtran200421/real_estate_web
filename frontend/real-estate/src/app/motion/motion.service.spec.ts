import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, Scroll, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { MotionService } from './motion.service';
import type { MotionEngine } from './engine';

function fakeEngine() {
  return {
    enableSmoothScroll: vi.fn(), disableSmoothScroll: vi.fn(), teardown: vi.fn(), refresh: vi.fn(), jumpTo: vi.fn(),
    pause: vi.fn(), resume: vi.fn(), smooth: () => null,
  } as unknown as MotionEngine;
}

describe('MotionService', () => {
  let events: Subject<unknown>;
  let story = true;
  let engine: ReturnType<typeof fakeEngine>;

  beforeEach(() => {
    events = new Subject();
    story = true;
    engine = fakeEngine();
    MotionService.loadEngine = () => Promise.resolve(engine);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Router, useValue: { events, routerState: { snapshot: { root: { data: {}, firstChild: { data: { get motion() { return story; } }, firstChild: null } } } } } },
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('loads the engine on a story page and turns on smooth scrolling', async () => {
    const motion = TestBed.inject(MotionService);
    motion.start();
    expect(await motion.ready()).toBe(engine);
    expect(engine.enableSmoothScroll).toHaveBeenCalled();
  });

  it('tears everything down when navigating into the booking flow', async () => {
    const motion = TestBed.inject(MotionService);
    motion.start();
    await motion.ready();
    story = false;
    events.next(new NavigationEnd(1, '/book', '/book'));
    expect(engine.teardown).toHaveBeenCalled();
    expect(await motion.ready()).toBeUndefined();
  });

  it('restores the saved position on back/forward and the top on forward navigation', async () => {
    const motion = TestBed.inject(MotionService);
    motion.start();
    await motion.ready();
    events.next(new Scroll(new NavigationEnd(2, '/', '/'), [0, 1840], null));
    expect(engine.jumpTo).toHaveBeenLastCalledWith(1840);
    events.next(new Scroll(new NavigationEnd(3, '/gallery', '/gallery'), null, null));
    expect(engine.jumpTo).toHaveBeenLastCalledWith(0);
  });

  it('leaves anchor scrolling to the router', async () => {
    const motion = TestBed.inject(MotionService);
    motion.start();
    await motion.ready();
    vi.mocked(engine.jumpTo).mockClear();
    events.next(new Scroll(new NavigationEnd(4, '/apartment#bang-gia', '/apartment#bang-gia'), null, 'bang-gia'));
    expect(engine.jumpTo).not.toHaveBeenCalled();
  });

  it('never loads the engine when reduced motion is on', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const motion = TestBed.inject(MotionService);
    motion.start();
    expect(await motion.ready()).toBeUndefined();
  });
});
