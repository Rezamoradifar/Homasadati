import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ParsehLanding, { ParsehGuide } from './ParsehLanding';

afterEach(cleanup);

it('connects the six service entries, destination cards and journal to their own actions', () => {
  const onGuide = vi.fn(), onEnquire = vi.fn();
  const { container } = render(<ParsehLanding locale="en" values={{}} onGuide={onGuide} onEnquire={onEnquire} />);
  const services = within(container.querySelector('#hex-products') as HTMLElement);
  expect(services.getAllByRole('listitem')).toHaveLength(6);
  for (const [label, href] of [['Travel','/worlds/tourism'],['Handicrafts','/worlds/craft'],['Beauty','/worlds/beauty'],['AI studio','/worlds/ai'],['Homa Club','/club']]) {
    expect(services.getByRole('link', {name:label}).getAttribute('href')).toBe(href);
  }
  fireEvent.click(services.getByRole('button', {name:'Content production'}));
  expect(onEnquire).toHaveBeenCalledWith('Content production');
  expect(screen.getByRole('link', {name:'Explore destinations'}).getAttribute('href')).toBe('#destinations');
  const places = within(container.querySelector('#destinations') as HTMLElement);
  for (const [name, id] of [['Isfahan','isfahan'], ['Yazd','yazd'], ['Hormuz','hormuz']]) {
    fireEvent.click(places.getByRole('button', {name}));
    expect(onGuide).toHaveBeenLastCalledWith(id);
  }
  fireEvent.click(screen.getByRole('button', {name:'Read the guide'}));
  expect(onGuide).toHaveBeenLastCalledWith('kashan');
});

it('honours the editor on the first paint and switches the selected hero', () => {
  const { container } = render(<ParsehLanding locale="en" values={{'en.hero.hero':'Custom title', 'image.hero':'/test.webp'}} onGuide={vi.fn()} onEnquire={vi.fn()} />);
  expect(screen.getByRole('heading', {level:1}).textContent).toBe('Custom title');
  expect(container.querySelector('section img')?.getAttribute('src')).toBe('/test.webp');
  const selector=within(screen.getByRole('group', {name:'Images of Iran'})).getByRole('button', {name:'Yazd'});
  fireEvent.click(selector);
  expect(selector.getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('section img')?.getAttribute('alt')).toBe('Yazd');
});

it('carries the chosen destination into its enquiry', () => {
  const onEnquire=vi.fn();
  render(<ParsehGuide locale="en" id="kashan" onEnquire={onEnquire}/>);
  expect(screen.getByRole('heading').textContent).toBe('A day in Kashan');
  fireEvent.click(screen.getByRole('button', {name:'Ask about this trip'}));
  expect(onEnquire).toHaveBeenCalledWith('Kashan');
});
