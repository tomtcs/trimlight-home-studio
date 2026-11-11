import {zonedParts} from './domain.mjs';
export function calendarTestPlan(device,body,timezone,now=new Date()){
 const {date,start,end,effectId}=body;const z=zonedParts(now,timezone),today=`${z.year}-${z.month}-${z.day}`;
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<=today||date.slice(0,4)!==today.slice(0,4))throw new Error('Choose a future date within the current year.');
 const minutes=t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t)?+t.slice(0,2)*60+(+t.slice(3)):NaN;
 const a=minutes(start),b=minutes(end);
 if(!Number.isFinite(a)||!Number.isFinite(b)||a>=b||a%5||b%5)throw new Error('Choose start and end times on the same day in five-minute increments, with end after start.');
 if(!Number.isInteger(effectId)||!device.effects.some(e=>e.id===effectId))throw new Error('Select a design already saved on the controller. Refresh if it is missing.');
 if(device.calendar.length>=60)throw new Error('No free calendar slot. This test never deletes entries.');
 const md=d=>d.month*100+d.day,target=+date.slice(5,7)*100+(+date.slice(8,10));
 if(device.calendar.some(c=>{const s=md(c.startDate),e=md(c.endDate);return s<=e?target>=s&&target<=e:target>=s||target<=e}))throw new Error('An existing controller calendar entry covers that date. Choose an unused date; this test never replaces entries.');
 if((device.daily||[]).some(d=>d.enable))throw new Error('Disable overlapping daily timers in Trimlight before testing.');
 const row={start:date,end:date,patternId:'calendar-test',startTime:{hours:Math.floor(a/60),minutes:a%60},endTime:{hours:Math.floor(b/60),minutes:b%60}};
 return {window:{start:date,end:date,month:date.slice(0,7)},rows:[row],wanted:[],mapping:{'calendar-test':effectId},missing:[],removeEffects:[],calendarSlots:device.calendar.length+1,patternSlots:device.effects.length};
}
