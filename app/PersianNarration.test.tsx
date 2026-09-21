import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import PersianNarration from './PersianNarration';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function voices(list:any[]){const synth={getVoices:()=>list,addEventListener:vi.fn(),removeEventListener:vi.fn(),cancel:vi.fn(),speak:vi.fn()};vi.stubGlobal('speechSynthesis',synth);vi.stubGlobal('SpeechSynthesisUtterance',class{constructor(public text:string){}});return synth;}
it('never substitutes an English voice when Persian is unavailable',()=>{const synth=voices([{lang:'en-US'}]);render(<PersianNarration/>);fireEvent.click(screen.getByRole('button'));expect(synth.speak).not.toHaveBeenCalled();expect(screen.getByRole('status').textContent).toContain('صدای فارسی');});
it('uses only a Persian voice and lets the user stop speech',()=>{const voice={lang:'fa-IR',name:'Persian'};const synth=voices([voice]);render(<PersianNarration/>);fireEvent.click(screen.getByRole('button'));expect(synth.speak.mock.calls[0][0]).toMatchObject({lang:'fa-IR',voice});fireEvent.click(screen.getByRole('button'));expect(synth.cancel).toHaveBeenCalled();});
