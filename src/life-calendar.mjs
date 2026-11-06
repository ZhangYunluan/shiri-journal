import {validDate,localDate,periodRange} from './core.mjs';
import {EMOTION_GROUPS,validEmotion} from './life-expression.mjs';

// Account-local settings only. These values never enter the moment sharing projection.
export const DAILY_PREFIX='daily-feeling:';
export const NOTE_PREFIX='friend-note:';
export const DAILY_EMOJIS=['😊','😌','😴','😔','😤','😟','🤩','🥰','💭'];
export const DAILY_PRESETS=[['开心','😊'],['平静','😌'],['疲惫','😴'],['难过','😔'],['烦躁','😤'],['焦虑','😟'],['惊喜','🤩'],['温暖','🥰']];
const groupEmoji={joy:'😊',sadness:'😔',anger:'😤',worry:'😟',surprise:'🤩',warmth:'🥰',calm:'😌',energy:'😴'};
export function emotionEmoji(word){return groupEmoji[EMOTION_GROUPS.find(g=>g.words.includes(word))?.id]||'💭';}
function validMonth(month){return /^\d{4}-\d{2}$/.test(month)&&validDate(month+'-01');}
export function monthDays(month){
 if(!validMonth(month))throw Error('请选择有效年月');
 const first=month+'-01',start=(new Date(first+'T12:00:00').getDay()+6)%7;
 const days=Number(periodRange('month',first).end.slice(-2));
 return Array.from({length:Math.ceil((start+days)/7)*7},(_,i)=>i<start||i>=start+days?null:month+'-'+String(i-start+1).padStart(2,'0'));
}
export function shiftMonth(month,offset){
 if(!validMonth(month)||!Number.isInteger(offset))throw Error('月份无效');
 const [year,m]=month.split('-').map(Number),n=Math.max(1900*12,Math.min(2200*12+11,year*12+m-1+offset));
 return Math.floor(n/12)+'-'+String(n%12+1).padStart(2,'0');
}
export function savedOn(records,date){return records.filter(r=>r.status==='confirmed'&&!r.excluded&&r.date===date).sort((a,b)=>(a.time||'').localeCompare(b.time||''));}
export function photosIn(records,range){return records.filter(r=>r.status==='confirmed'&&!r.excluded&&r.assetId&&r.date>=range.start&&r.date<=range.end).sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));}
export function dailyFeeling(settings,date){return settings?.find(r=>r.id===DAILY_PREFIX+date)||null;}
export function makeDailyFeeling(date,emotion,emoji=emotionEmoji(emotion)){
 if(!validDate(date))throw Error('日期无效');
 emotion=String(emotion||'').trim();if(!emotion)return null;
 if(!validEmotion(emotion)||!DAILY_EMOJIS.includes(emoji))throw Error('请选择有效感受和表情');
 return {id:DAILY_PREFIX+date,date,emotion,emoji,updatedAt:new Date().toISOString()};
}
export function makeFriendNote(uid,note){
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid))throw Error('好友标识无效');
 note=String(note||'').trim();if(!note)return null;
 if(Array.from(note).length>30||/[\x00-\x1f\x7f]/.test(note))throw Error('备注需为 1–30 字');
 return {id:NOTE_PREFIX+uid,uid,note,updatedAt:new Date().toISOString()};
}
export function friendLabel(person,settings){return settings?.find(r=>r.id===NOTE_PREFIX+person.id)?.note||person.nickname||'好友';}
export function validatePrivateSetting(row){
 let expected;
 if(row.id.startsWith(DAILY_PREFIX)){
  expected=makeDailyFeeling(row.date,row.emotion,row.emoji);
  if(!expected||row.id!==expected.id)throw Error('每日感受备份无效');
 }else if(row.id.startsWith(NOTE_PREFIX)){
  expected=makeFriendNote(row.uid,row.note);
  if(!expected||row.id!==expected.id)throw Error('好友备注备份无效');
 }else return false;
 if(Object.keys(row).some(k=>!Object.hasOwn(expected,k))||typeof row.updatedAt!=='string'||row.updatedAt.length>40)throw Error('本机私人设置格式无效');
 return true;
}
