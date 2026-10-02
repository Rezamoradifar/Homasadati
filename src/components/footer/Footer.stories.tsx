import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {NextIntlClientProvider} from 'next-intl';
import {Footer} from './Footer';
import {FooterColumn} from './FooterColumn';
import {FooterLink} from './FooterLink';
import type {FooterProps} from './types';
import {demoSocials, demoPayments, demoCertifications} from './demo-data';
import en from '../../messages/en.json';
import fa from '../../messages/fa.json';
import ar from '../../messages/ar.json';
const messages = {en, fa, ar};
function StoryFooter({initialLocale = 'en', ...props}: FooterProps & {initialLocale?: keyof typeof messages}) {
  const [locale, setLocale] = useState(initialLocale);
  const [currency, setCurrency] = useState('USD');
  return <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="UTC">
    <Footer {...props} currency={currency} onCurrencyChange={setCurrency} onLocaleChange={value => setLocale(value as keyof typeof messages)} />
  </NextIntlClientProvider>;
}
const meta = {
  title: 'Homanet/Footer', component: Footer, subcomponents: {FooterColumn, FooterLink}, tags: ['autodocs'],
  args: {year: 2026, socials: demoSocials, paymentMethods: demoPayments, certifications: demoCertifications,
    onSubscribe: async () => {await new Promise(resolve => setTimeout(resolve, 600));}},
  argTypes: {direction: {control: 'inline-radio', options: ['ltr', 'rtl']}, onSubscribe: {control: false},
    socials: {control: false}, paymentMethods: {control: false}, certifications: {control: false}, logo: {control: false}},
  render: args => <StoryFooter {...args} />
} satisfies Meta<typeof Footer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const English: Story = {};
export const Persian: Story = {render: args => <StoryFooter {...args} initialLocale="fa" />};
export const Arabic: Story = {render: args => <StoryFooter {...args} initialLocale="ar" />};
export const Mobile: Story = {parameters: {viewport: {defaultViewport: 'mobile1'}}};
export const MobileRTL: Story = {...Persian, parameters: {viewport: {defaultViewport: 'mobile1'}}};
export const SubscriptionError: Story = {args: {onSubscribe: async () => {throw new Error('Demo failure');}}};
export const SubscriptionPending: Story = {args: {onSubscribe: () => new Promise<void>(() => {})}};
export const Unconfigured: Story = {args: {onSubscribe: undefined, socials: [], paymentMethods: [], certifications: []},
  render: args => <NextIntlClientProvider locale="en" messages={en}><Footer {...args} /></NextIntlClientProvider>};
