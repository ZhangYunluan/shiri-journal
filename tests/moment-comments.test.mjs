import test from 'node:test';
import assert from 'node:assert/strict';
import {commentBody,commentsPanel} from '../src/moment-comments.mjs';
test('comment input permits ordinary Emoji but rejects empty, oversized and control text',()=>{
 assert.equal(commentBody(' 一起散步 😊 '),'一起散步 😊');assert.equal(commentBody('第一行\n第二行'),'第一行\n第二行');
 for(const body of ['',' '.repeat(3),'x'.repeat(301),'bad\u0000'])assert.throws(()=>commentBody(body));
});
test('comment UI escapes all content and only offers actor/owner moderation',()=>{
 const s={record:{id:'r',title:'<script>片刻</script>'},owner:false,participant:'bob',messages:[{id:'m',authorId:'alice',body:'<img onerror=x>',createdAt:'2026-10-28T09:00:00Z'}],threads:[],draft:'<b>',busy:false};
 const html=commentsPanel(s,'bob');assert.match(html,/&lt;img onerror=x&gt;/);assert.doesNotMatch(html,/<script>|<img onerror|data-comments-action="delete"/);
 assert.match(commentsPanel({...s,owner:true},'alice'),/data-comments-action="delete"/);
 assert.match(commentsPanel({...s,error:'网络异常',draft:'草稿'},'bob'),/网络异常|草稿/);
 assert.equal(commentsPanel({record:null},'bob'),'');
});
test('comment sheet separates scrollable messages from a bottom composer',()=>{
 const html=commentsPanel({record:{id:'r',title:'散步'},participant:'bob',messages:[],threads:[],draft:''},'bob');
 assert.match(html,/data-comment-scroll/);assert.match(html,/class="comment-composer"/);
 assert.ok(html.indexOf('data-comment-scroll')<html.indexOf('class="comment-composer"'));
});
