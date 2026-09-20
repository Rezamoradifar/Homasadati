import {vi} from 'vitest';
if(typeof window!=='undefined')Object.defineProperty(window, 'matchMedia', {writable: true, value: vi.fn().mockImplementation(() => ({
  matches: true, media: '', onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn()
}))});
