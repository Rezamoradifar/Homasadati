import {render,screen,cleanup,fireEvent} from "@testing-library/react";
import {afterEach,it,expect,vi} from "vitest";
import {PersonalPositions} from "./NetworkTree";
import {POSITION_PATHS,DIRECT_PATHS} from "./card-position-model";
afterEach(cleanup);
function fixture(desks:number){const build=(desk:number):any=>({desk,path:POSITION_PATHS[desk-1],active:desk<=desks,left:desk<4?build(desk*2):null,right:desk<4?build(desk*2+1):null,leftVolume:30_000_000,rightVolume:20_000_000,savings:{left:10_000_000,right:0}});return{desks,directCapacity:desks+1,tree:build(1),directs:DIRECT_PATHS.map((path,i)=>({ordinal:i+1,path,enabled:i<desks+1,member:i===0?{child_id:"first",name:"عضو اول"}:null}))};}
it.each([1,2,3,4,5,6,7])("shows the fixed 1–2–4 diagram with %s active positions and accessible direct drill-down",desks=>{
 const open=vi.fn();const{container}=render(<PersonalPositions data={fixture(desks)} onOpen={open}/>);
 expect(container.querySelectorAll('.personal-position')).toHaveLength(7);
 expect(container.querySelectorAll('.personal-position.lit')).toHaveLength(desks);
 expect(container.querySelectorAll('.personal-direct.enabled')).toHaveLength(desks+1);
 expect(Array.from(container.querySelectorAll('.personal-direct')).map(n=>n.textContent!.match(/[۱-۸]/)![0])).toEqual(['۱','۵','۳','۶','۴','۷','۸','۲']);
 fireEvent.click(screen.getByRole('button',{name:/دایرکت ۱/}));expect(open).toHaveBeenCalledWith('first');
 expect((screen.getByRole('button',{name:/دایرکت ۲/}) as HTMLButtonElement).disabled).toBe(true);
});
