import {plusDay} from './domain.mjs';
export function calendarDays(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Invalid month.');
 const first=month+'-01',offset=new Date(first+'T12:00Z').getUTCDay();
 const days=new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).getUTCDate();
 return Array.from({length:Math.ceil((offset+days)/7)*7},(_,i)=>plusDay(first,i-offset));
}
export function moveMonth(month,delta){
 calendarDays(month);
 const d=new Date(month+'-01T12:00Z');d.setUTCMonth(d.getUTCMonth()+delta);return d.toISOString().slice(0,7);
}
