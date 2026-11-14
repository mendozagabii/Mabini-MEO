import { useState, type RefObject } from 'react';
import { CalendarDays } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';

export function StyledFilterSelect({ label, value, onChange, options, compact = false }: { label: string; value: string; onChange: (value: string) => void; compact?: boolean; options: { value: string; label: string }[] }) {
  return <Select value={value} onValueChange={onChange}>
    <SelectTrigger aria-label={label} className={compact ? "h-10 w-[120px] min-w-0 px-3" : "w-auto min-w-36"}><SelectValue /></SelectTrigger>
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
    <PopoverContent align="start" className="z-[9999] w-auto rounded-[18px] border border-blue-100 bg-white p-1 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.16)]">
      <Calendar mode="single" selected={selected} defaultMonth={selected} onSelect={choose} fromYear={1000} toYear={9999} className="p-1 text-xs" classNames={{months:'flex flex-col gap-1', month:'flex flex-col gap-2', caption:'relative flex w-full items-center justify-center pt-1', caption_label:'text-xs font-medium', table:'w-full border-collapse', head_row:'flex', head_cell:'w-7 text-xs text-slate-500', row:'flex w-full mt-1', cell:'w-7 text-center text-xs', day:'h-7 w-7 rounded-lg p-0 text-xs hover:bg-blue-50', nav_button:'inline-flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-blue-50', nav_button_previous:'absolute left-0', nav_button_next:'absolute right-0', day_selected:'rounded-2xl bg-blue-600 text-white hover:bg-blue-600 hover:text-white', day_today:'font-semibold text-blue-700'}} />
      <div className="flex justify-between px-2 pb-1 text-xs"><button type="button" className="rounded-lg px-2 py-1 text-blue-700 hover:bg-blue-50" onClick={() => choose(undefined)}>Clear</button><button type="button" className="rounded-lg px-2 py-1 text-blue-700 hover:bg-blue-50" onClick={() => choose(new Date())}>Today</button></div>
    </PopoverContent>
  </Popover>;
}
