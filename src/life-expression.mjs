// Local display/entry helpers. IDs and cloud permission values never change here.
const CATEGORY_NAMES={travel:['出行见闻','旅途与见闻'],learning:['学习工作','学习与成长'],spending:['消费账单','消费与好物'],wellbeing:['身心状态','心情与感受'],fitness:['健身运动','运动与活力'],other:['其他','生活碎片']};
export function displayCategory(c){const pair=CATEGORY_NAMES[c.id];return pair&&c.builtIn!==false&&c.name===pair[0]?{...c,name:pair[1]}:c;}
export const MOODS=['','低落','有些疲惫','平静','愉快','很开心'];
export const EMOTION_GROUPS=[
 {id:'joy',name:'开心与愉悦',words:['开心','满足','兴奋','轻松']},
 {id:'sadness',name:'难过与低落',words:['失落','委屈','难过','沮丧']},
 {id:'anger',name:'愤怒与烦躁',words:['生气','烦躁','不满','无奈']},
 {id:'worry',name:'焦虑与担忧',words:['焦虑','紧张','不安','担心','害怕']},
 {id:'surprise',name:'惊讶与意外',words:['惊喜','震惊','意外','困惑']},
 {id:'warmth',name:'爱与温暖',words:['温暖','感动','幸福','被关心','感激']},
 {id:'calm',name:'平静与放松',words:['平静','自在','安心','释然']},
 {id:'energy',name:'身体与精神',words:['疲惫','困倦','精力充沛']},
];
export function feelingLabel(r){return r.emotion||MOODS[r.mood]||'';}
export function validEmotion(value){return value==null||typeof value==='string'&&Array.from(value).length<=20&&!/[\x00-\x1f\x7f]/.test(value);}
export function feelingSelection(r){
 if(r.emotion){const found=EMOTION_GROUPS.find(g=>g.words.includes(r.emotion));return {group:found?.id||'custom',word:r.emotion};}
 return {group:MOODS[r.mood]?'legacy':'none',word:''};
}
export function readFeeling(form,old={}){
 const group=form.get('emotionGroup');
 // Older forms/records remain valid; never reinterpret an existing numeric score.
 if(group==null||group==='legacy')return {mood:old.mood??null,emotion:old.emotion||''};
 if(group==='none')return {mood:null,emotion:''};
 const word=String(group==='custom'?form.get('customEmotion')||'':form.get('emotion')||'').trim();
 if(!word||!validEmotion(word)||group!=='custom'&&!EMOTION_GROUPS.find(g=>g.id===group)?.words.includes(word))throw Error('请选择具体感受，或填写 1–20 字的情绪词。');
 return {mood:null,emotion:word};
}
export function categoryCanDelete(category,data){return category?.builtIn===false&&!['records','plans','learning'].some(key=>(data[key]||[]).some(r=>r.categoryId===category.id));}
