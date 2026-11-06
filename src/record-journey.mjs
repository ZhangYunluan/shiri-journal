import {validDate} from './core.mjs';
import {syncLabel} from './moment-review.mjs';
export function journeyState(records,reports=[],date){
 const visible=records.filter(r=>!r.excluded&&validDate(r.date)&&r.date<=date);
 const confirmed=visible.filter(r=>r.status==='confirmed'),day=visible.filter(r=>r.date===date);
 const saved=day.filter(r=>r.status==='confirmed').length,pending=day.filter(r=>r.status==='review').length;
 const reviewed=reports.some(r=>r.userReviewedAt&&r.start<=date&&r.end>=date);
 return {saved,pending,discovered:day.length,total:confirmed.length,days:new Set(confirmed.map(r=>r.date)).size,reviewed,
 reviews:reports.filter(r=>r.userReviewedAt).length,action:pending?'review-today':saved?'journey-report':'import'};
}
export function saveFeedback(before,after,rows,date){
 const old=journeyState(before,[],date),next=journeyState(after,[],date);
 const milestone=[7,30,100,365].filter(n=>old.days<n&&next.days>=n).at(-1);
 const countMilestone=[10,50,100,500].filter(n=>old.total<n&&next.total>=n).at(-1);
 const fresh=rows.some(r=>!before.some(b=>b.id===r.id&&b.status==='confirmed'));
 const title=milestone?`你已留下 ${milestone} 天的生活足迹`:countMilestone?`已有 ${countMilestone} 个片刻，属于你的生活`:fresh?(rows.length>1?`为生活留下了 ${rows.length} 个片刻`:'又留下一个值得记住的瞬间'):'这个片刻，已更新';
 const labels=[...new Set(rows.map(r=>syncLabel(r)))].join(' · ');
 return {title,detail:`已保存在本机 · ${labels}`,milestone:!!(milestone||countMilestone)};
}
