import { useState, type RefObject } from 'react';
import { CalendarDays } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';

export function StyledFilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return <Select value={value} onValueChange={onChange}>
    <SelectTrigger aria-label={label} className="w-auto min-w-36"><SelectValue /></SelectTrigger>
    <SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
  </Select>;
}

export function DateCalendarButton({ inputRef, value, onChange, label }: { inputRef: RefObject<HTMLInputElement>; value: string; onChange: (value: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [year, month, day] = value.split('-').map(Number);
  const selected = value && year >= 1000 && year <= 9999 ? new Date(year, month - 1, day) : undefined;
  const choose = (date: Date | undefined) => {
    const next = date ? [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-') : '';
    if (inputRef.current) inputRef.current.value = next;
    onChange(next); setOpen(false);
  };
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" aria-label={label} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"><CalendarDays className="h-4 w-4" aria-hidden="true" /></button></PopoverTrigger>
    <PopoverContent align="start" className="z-[9999] w-auto rounded-[22px] border border-blue-100 bg-white p-2 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.16)]">
      <Calendar mode="single" selected={selected} defaultMonth={selected} onSelect={choose} fromYear={1000} toYear={9999} classNames={{day_selected:'rounded-2xl bg-blue-600 text-white hover:bg-blue-600 hover:text-white', day_today:'font-semibold text-blue-700'}} />
      <div className="flex justify-between px-4 pb-2 text-sm"><button type="button" className="rounded-lg px-2 py-1 text-blue-700 hover:bg-blue-50" onClick={() => choose(undefined)}>Clear</button><button type="button" className="rounded-lg px-2 py-1 text-blue-700 hover:bg-blue-50" onClick={() => choose(new Date())}>Today</button></div>
    </PopoverContent>
  </Popover>;
}
