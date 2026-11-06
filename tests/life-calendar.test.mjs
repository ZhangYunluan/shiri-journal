import test from 'node:test';
import assert from 'node:assert/strict';
import {monthDays,shiftMonth,savedOn,photosIn,dailyFeeling,makeDailyFeeling,friendLabel,makeFriendNote,validatePrivateSetting} from '../src/life-calendar.mjs';
import {DEFAULT_CATEGORIES} from '../src/core.mjs';
import * as views from '../src/views.mjs';
import {friendsView} from '../src/cloudbase-friends-view.mjs';
const row=(id,date,patch={})=>({id,date,time:'18:00',title:id,note:'当天的感受',categoryId:'daily',status:'confirmed',kind:'moment',tags:[],...patch});
test('Monday calendar handles leap years, cross-year months and local dates',()=>{
 const october=monthDays('2026-10');assert.equal(october[3],'2026-10-01');assert.equal(october.filter(Boolean).length,31);assert.equal(october.length%7,0);
 assert.equal(monthDays('2024-02').filter(Boolean).length,29);assert.equal(monthDays('2100-02').filter(Boolean).length,28);
 assert.equal(shiftMonth('2026-12',1),'2027-01');assert.equal(shiftMonth('2027-01',-1),'2026-12');
 assert.equal(shiftMonth('1900-01',-1),'1900-01');assert.throws(()=>monthDays('2026-13'));
});
test('daily feelings are explicit private settings, independent from moment emotions',()=>{
 const settings=[makeDailyFeeling('2026-10-28','疲惫','😴')],record=row('party','2026-10-28',{emotion:'开心'});
 assert.equal(dailyFeeling(settings,record.date).emotion,'疲惫');assert.equal(record.emotion,'开心');
 assert.equal(makeDailyFeeling(record.date,''),null);assert.equal(dailyFeeling([],record.date),null);
 assert.throws(()=>makeDailyFeeling('2026-02-30','开心','😊'));assert.throws(()=>makeDailyFeeling(record.date,'x'.repeat(21),'😊'));
 assert.throws(()=>makeDailyFeeling(record.date,'开心','<img>'));
});
test('date and report photos only include saved, nonexcluded records in the actual range',()=>{
 const records=[row('a','2026-10-28',{assetId:'a'}),row('review','2026-10-28',{status:'review',assetId:'b'}),row('excluded','2026-10-28',{excluded:true,assetId:'c'}),row('old','2026-10-27',{assetId:'d'}),row('text','2026-10-28')];
 assert.deepEqual(savedOn(records,'2026-10-28').map(r=>r.id),['a','text']);
 assert.deepEqual(photosIn(records,{start:'2026-10-28',end:'2026-10-28'}).map(r=>r.id),['a']);
});
test('friend notes use stable UID, escape at render time, and never mutate cloud profile',()=>{
 const person={id:'friend-123',nickname:'原昵称'},note=makeFriendNote(person.id,'高中同桌');
 assert.equal(friendLabel(person,[note]),'高中同桌');assert.equal(friendLabel({...person,nickname:'新昵称'},[note]),'高中同桌');
 assert.equal(person.nickname,'原昵称');assert.equal(friendLabel(person,[]),'原昵称');assert.equal(makeFriendNote(person.id,''),null);
 assert.throws(()=>makeFriendNote('../bad','名字'));assert.throws(()=>makeFriendNote(person.id,'a'.repeat(31)));
 assert.equal(validatePrivateSetting(note),true);assert.throws(()=>validatePrivateSetting({...note,userId:'other'}));
});
test('calendar and report reuse saved photos without leaking review images into personal recap',()=>{
 const records=[row('saved','2026-10-28',{assetId:'safe'}),row('pending','2026-10-28',{status:'review',assetId:'private'})];
 const s={date:'2026-10-28',calendarMonth:'2026-10',data:{records,categories:DEFAULT_CATEGORIES,settings:[makeDailyFeeling('2026-10-28','开心','😊')],reports:[]},urls:{},period:'week',reportDate:'2026-10-28',reportStyle:'brief'};
 const html=views.lifeCalendar(s);assert.match(html,/😊/);assert.match(html,/data-local-photo="safe"/);assert.doesNotMatch(html,/data-local-photo="private"|0 条/);
 const report=views.reports(s);assert.match(report,/照片回顾/);assert.match(report,/data-local-photo="safe"/);assert.doesNotMatch(report,/data-local-photo="private"/);
 const empty=views.reports({...s,data:{...s.data,records:[]}});assert.doesNotMatch(empty,/照片回顾/);
});
test('friend labels only decorate the current users known friend UID in search and feed',()=>{
 const friend={id:'friend-123',nickname:'原昵称',scope:'none',categories:[]};const d={friends:[friend],discoverable:false,incoming:[],outgoing:[],blocked:[],mine:[]};
 const s={view:'people',dashboard:d,found:[{...friend,isFriend:true}],searched:true,drafts:{},requestNotes:{},feed:[],photos:new Map()};
 const data={settings:[makeFriendNote(friend.id,'高中同桌')],categories:[],records:[]};
 assert.match(friendsView(s,data),/高中同桌/);assert.match(friendsView({...s,view:'feed',selected:friend.id},data),/高中同桌/);
 assert.match(friendsView(s,{...data,settings:[]}),/原昵称/);
});
