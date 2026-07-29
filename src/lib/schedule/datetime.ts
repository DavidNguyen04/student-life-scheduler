import { format } from "date-fns";

export function toDatetimeLocalValue(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function fromDatetimeLocalValue(value: string): Date {
  return new Date(value);
}

export function defaultEventTimes(): { startTime: string; endTime: string } {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    startTime: toDatetimeLocalValue(start),
    endTime: toDatetimeLocalValue(end),
  };
}
