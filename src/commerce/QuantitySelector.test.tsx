import {useState} from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import QuantitySelector from './QuantitySelector';

afterEach(cleanup);

it('lets a shopper clear and replace a quantity without committing an empty value',()=>{
 const changed=vi.fn();
 function Purchase(){const [quantity,setQuantity]=useState(12);return <form><QuantitySelector value={quantity} max={20} onChange={n=>{changed(n);setQuantity(n);}}/></form>;}
 render(<Purchase/>);
 const input=screen.getByRole('spinbutton') as HTMLInputElement;
 fireEvent.change(input,{target:{value:''}});
 expect(input.value).toBe('');expect(input.validity.valueMissing).toBe(true);expect(changed).not.toHaveBeenCalled();
 fireEvent.change(input,{target:{value:'3'}});
 expect(input.value).toBe('3');expect(input.checkValidity()).toBe(true);expect(changed).toHaveBeenLastCalledWith(3);
 expect(input.inputMode).toBe('numeric');
});

it('never commits fractional or over-stock drafts and restores the saved quantity on blur',()=>{
 const changed=vi.fn();render(<QuantitySelector value={2} max={5} onChange={changed}/>);
 const input=screen.getByRole('spinbutton') as HTMLInputElement;
 fireEvent.change(input,{target:{value:'6'}});expect(input.validity.rangeOverflow).toBe(true);
 fireEvent.change(input,{target:{value:'1.5'}});expect(input.validity.stepMismatch).toBe(true);
 expect(changed).not.toHaveBeenCalled();
 fireEvent.blur(input);expect(input.value).toBe('2');expect(input.checkValidity()).toBe(true);expect(changed).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'افزایش تعداد'}));expect(input.value).toBe('3');expect(changed).toHaveBeenLastCalledWith(3);
});

it('refreshes a draft when the caller changes the quantity or stock',()=>{
 const changed=vi.fn();const {rerender}=render(<QuantitySelector value={2} max={5} onChange={changed}/>);
 const input=screen.getByRole('spinbutton') as HTMLInputElement;
 fireEvent.change(input,{target:{value:''}});
 rerender(<QuantitySelector value={1} max={1} onChange={changed}/>);
 expect(input.value).toBe('1');expect(screen.getByRole('button',{name:'افزایش تعداد'}).hasAttribute('disabled')).toBe(true);
});
