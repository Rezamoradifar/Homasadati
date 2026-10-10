import {renderHook,act,waitFor,cleanup} from "@testing-library/react";
import {useData} from "./Widgets";
import {afterEach,it,expect,vi} from "vitest";
import {api} from "./client";
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
it("times out a hanging read and reports a coarse diagnostic",async()=>{
  vi.useFakeTimers();const diagnostic=vi.fn();window.addEventListener("platform-diagnostic",diagnostic);
  vi.stubGlobal("fetch",vi.fn((_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener("abort",()=>reject(new Error("aborted"))))));
  const request=api("dashboard");const rejected=expect(request).rejects.toThrow("دریافت اطلاعات بیش از حد طول کشید");
  await vi.advanceTimersByTimeAsync(20000);await rejected;
  expect(diagnostic.mock.calls[0][0].detail).toEqual({kind:"api_timeout",duration:20000});
  window.removeEventListener("platform-diagnostic",diagnostic);
});
it("does not add automatic retries or a read timeout to mutations",async()=>{
  const fetch=vi.fn().mockResolvedValue(Response.json({ok:true}));vi.stubGlobal("fetch",fetch);
  await api("referral","POST",{code:"new-code"});
  expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][1].signal).toBeUndefined();
});

it("retries a failed data read on explicit user action",async()=>{
  const fetch=vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(Response.json({rows:[{id:"ok"}]}));
  vi.stubGlobal("fetch",fetch);
  const {result}=renderHook(()=>useData("orders"));
  await waitFor(()=>expect(result.current.error).toContain("ارتباط شبکه قطع است"));
  act(()=>result.current.retry());
  await waitFor(()=>expect(result.current.data?.rows).toEqual([{id:"ok"}]));
  expect(result.current.error).toBe("");expect(fetch).toHaveBeenCalledTimes(2);
});
