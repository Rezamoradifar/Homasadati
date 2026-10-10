import {setting,saveSetting} from './providers';
/** Records execution health only; never changes settlement eligibility or rewards. */
export function observeFinancialCycle<T>(task:()=>T):T {
  saveSetting('financial_cycle_started',new Date().toISOString());
  try {
    const result=task();
    saveSetting('financial_cycle_success',new Date().toISOString());
    saveSetting('financial_cycle_failed','');
    return result;
  } catch(error) {
    saveSetting('financial_cycle_failed',new Date().toISOString());
    throw error;
  }
}
export function operationsHealth(at=Date.now()) {
  const stamp=(key:string)=>setting(key)||null;
  const age=(value:string|null)=>value&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=at?at-Date.parse(value):null;
  const worker=stamp('worker_last_success'),financial=stamp('financial_cycle_success');
  const workerAge=age(worker),financialAge=age(financial);
  return {
    worker:{lastSuccess:worker,healthy:workerAge!==null&&workerAge<120000},
    financial:{enabled:setting('seven_card_live')==='1',lastStarted:stamp('financial_cycle_started'),lastSuccess:financial,lastFailure:stamp('financial_cycle_failed'),healthy:financialAge!==null&&financialAge<120000&&!stamp('financial_cycle_failed')},
  };
}
