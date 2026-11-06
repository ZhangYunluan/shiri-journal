import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
export class ServiceError extends Error { constructor(message,status=400){super(message);this.status=status;} }
const fail=(message,status)=>{throw new ServiceError(message,status);};
const hash=value=>createHash('sha256').update(value).digest('hex');
const scopes=new Set(['none','shared','categories','all']);
const cleanText=(value,max,required=false)=>{
  if(typeof value!=='string'||value.length>max||(required&&!value.trim())) fail('文字格式或长度不正确');
  return value.trim();
};
export function visible(grant,record){
  return record.shareApproved===true&&record.status==='confirmed'&&(grant?.scope==='all'||(grant?.scope==='shared'&&record.kind==='shared')||
    (grant?.scope==='categories'&&grant.categories.includes(record.categoryId)));
}
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const privateId=id=>{if(typeof id!=='string'||! /^[\w:-]{1,100}$/.test(id))fail('照片 ID 无效');return id;};
function validateRecord(r){
  if(!r||!['record','shared'].includes(r.kind)||!['review','confirmed'].includes(r.status)) fail('近况格式不正确');
  if(!/^[\w:-]{1,100}$/.test(r.id)||!/^[-\w]{1,100}$/.test(r.categoryId)||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) fail('近况标识或日期不正确');
  const result={id:r.id,kind:r.kind,status:r.status,shareApproved:r.shareApproved===true,categoryId:r.categoryId,date:r.date,title:cleanText(r.title,200,true),note:cleanText(r.note||'',20000)};
  if(r.privatePhotoId)result.privatePhotoId=privateId(r.privatePhotoId);
  if(r.photo){
    if(!r.privatePhotoId)fail('照片必须先进入私人库并由本人确认');
    if(typeof r.photo!=='string'||r.photo.length>400000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(r.photo)) fail('仅允许本机生成的 JPEG 预览图');
    // The friend feed always fetches the reviewed private image, never caller-supplied bytes.
  }
  for(const field of ['location','time','categoryName']) if(r[field]) result[field]=cleanText(r[field],200);
  for(const field of ['amount','weight','duration','mood']) if(r[field]!=null){if(!Number.isFinite(r[field])) fail('近况数值无效');result[field]=r[field];}
  if(r.tags){if(!Array.isArray(r.tags)||r.tags.length>30) fail('标签过多');result.tags=r.tags.map(t=>cleanText(t,80));}
  return result;
}
/** All identities passed into this store must come from authenticate(), never request bodies. */
export class SocialStore {
  constructor(path,clock=()=>Date.now()){
    this.clock=clock; this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,nickname TEXT NOT NULL,salt TEXT NOT NULL,password TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS requests(sender TEXT REFERENCES users(id) ON DELETE CASCADE,recipient TEXT REFERENCES users(id) ON DELETE CASCADE,created INTEGER NOT NULL,PRIMARY KEY(sender,recipient));
      CREATE TABLE IF NOT EXISTS friends(owner TEXT REFERENCES users(id) ON DELETE CASCADE,peer TEXT REFERENCES users(id) ON DELETE CASCADE,scope TEXT NOT NULL DEFAULT 'none',categories TEXT NOT NULL DEFAULT '[]',PRIMARY KEY(owner,peer));
      CREATE TABLE IF NOT EXISTS records(owner TEXT REFERENCES users(id) ON DELETE CASCADE,id TEXT NOT NULL,payload TEXT NOT NULL,digest TEXT NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(owner,id));
      CREATE TABLE IF NOT EXISTS private_photos(owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,id TEXT NOT NULL,date TEXT NOT NULL,time TEXT NOT NULL,name TEXT NOT NULL,photo BLOB NOT NULL,digest TEXT NOT NULL,approval TEXT NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(owner,id));
      CREATE TABLE IF NOT EXISTS private_config(owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,enabled INTEGER NOT NULL DEFAULT 0);`);
  }
  close(){this.db.close();}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  user(id){const u=this.db.prepare('SELECT id,nickname FROM users WHERE id=?').get(id);if(!u) fail('找不到该 ID',404);return {...u};}
  password(value){if(typeof value!=='string'||value.length<12||value.length>128) fail('密码需要 12–128 个字符');return value;}
  session(id){const token=randomBytes(32).toString('base64url');this.db.prepare('DELETE FROM sessions WHERE expires<=?').run(this.clock());this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),id,this.clock()+30*86400000);return{user:this.user(id),token};}
  register(nickname,password){
    nickname=cleanText(nickname,40,true);this.password(password);
    const id='SR'+randomBytes(9).toString('hex').slice(0,12).toUpperCase(),salt=randomBytes(24).toString('hex');
    this.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,nickname,salt,scryptSync(password,salt,64).toString('hex'),this.clock());return this.session(id);
  }
  login(id,password){
    this.password(password);
    const u=this.db.prepare('SELECT * FROM users WHERE id=?').get(String(id).trim().toUpperCase());
    const candidate=scryptSync(password,u?.salt||'missing-account-salt',64);
    if(!u||!timingSafeEqual(candidate,Buffer.from(u.password,'hex'))) fail('ID 或密码不正确',401);
    return this.session(u.id);
  }
  authenticate(token){
    if(typeof token!=='string'||token.length>200) fail('请先登录',401);
    const s=this.db.prepare('SELECT user_id FROM sessions WHERE hash=? AND expires>?').get(hash(token),this.clock());
    if(!s) fail('登录已失效，请重新登录',401);return s.user_id;
  }
  logout(token){this.db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(token));}
  privateConfigure(id,enabled){if(typeof enabled!=='boolean')fail('上传设置无效');this.db.prepare('INSERT INTO private_config VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET enabled=excluded.enabled').run(id,enabled?1:0);return{enabled};}
  privateConfig(id){return{enabled:Boolean(this.db.prepare('SELECT enabled FROM private_config WHERE owner=?').get(id)?.enabled)};}
  privateList(id){return{...this.privateConfig(id),photos:this.db.prepare("SELECT id,date,time,name,digest,approval,updated FROM private_photos WHERE owner=? AND approval!='deleted' ORDER BY date DESC,updated DESC").all(id).map(r=>({...r})),deletedIds:this.db.prepare("SELECT id FROM private_photos WHERE owner=? AND approval='deleted'").all(id).map(r=>r.id)};}
  privateGet(id,photoId){const r=this.db.prepare("SELECT * FROM private_photos WHERE owner=? AND id=? AND approval!='deleted'").get(id,privateId(photoId));if(!r)fail('私人照片不存在',404);return{id:r.id,date:r.date,time:r.time,name:r.name,approval:r.approval,photo:'data:image/jpeg;base64,'+Buffer.from(r.photo).toString('base64')};}
  privatePut(id,r){
    if(!r||typeof r!=='object')fail('照片无效');const photoId=privateId(r.id);
    if(r.auto===true&&!this.privateConfig(id).enabled)fail('自动上传已关闭',403);
    if(!validDay(r.date)||typeof r.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time))fail('照片日期时间无效');
    const name=cleanText(r.name,200,true);
    if(typeof r.photo!=='string'||r.photo.length>400000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(r.photo))fail('仅支持压缩 JPEG 照片');
    const bytes=Buffer.from(r.photo.split(',')[1],'base64');
    if(bytes.length<4||bytes.length>2*1024*1024||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)fail('照片数据无效');
    const old=this.db.prepare('SELECT approval FROM private_photos WHERE owner=? AND id=?').get(id,photoId);
    // A late retry cannot resurrect a deleted image or silently revoke its prior review.
    if(old)return{ok:true,id:photoId,approval:old.approval,deleted:old.approval==='deleted'};
    const quota=this.db.prepare("SELECT COUNT(*) n,COALESCE(SUM(length(photo)),0) bytes FROM private_photos WHERE owner=? AND approval!='deleted'").get(id);
    if(quota.n>=2000||quota.bytes+bytes.length>100*1024*1024)fail('私人照片库达到测试版容量上限，请先备份并清理',413);
    this.db.prepare('INSERT INTO private_photos VALUES(?,?,?,?,?,?,?,?,?)').run(id,photoId,r.date,r.time,name,bytes,hash(bytes),'pending',this.clock());return{ok:true,id:photoId,approval:'pending'};
  }
  privateReview(id,photoId,approved){
    if(typeof approved!=='boolean')fail('请明确选择是否开放');privateId(photoId);
    return this.transaction(()=>{
      const r=this.db.prepare("UPDATE private_photos SET approval=?,updated=? WHERE owner=? AND id=? AND approval!='deleted'").run(approved?'approved':'private',this.clock(),id,photoId);
      if(!r.changes)fail('私人照片不存在',404);
      if(!approved)this.db.prepare("DELETE FROM records WHERE owner=? AND json_extract(payload,'$.privatePhotoId')=?").run(id,photoId);
      return{ok:true,approval:approved?'approved':'private'};
    });
  }
  privateDelete(id,photoId){privateId(photoId);return this.transaction(()=>{
    this.db.prepare("INSERT INTO private_photos VALUES(?,?,'','','',X'','','deleted',?) ON CONFLICT(owner,id) DO UPDATE SET photo=X'',approval='deleted',updated=excluded.updated").run(id,photoId,this.clock());
    this.db.prepare("DELETE FROM records WHERE owner=? AND json_extract(payload,'$.privatePhotoId')=?").run(id,photoId);return{ok:true};
  });}
  privateDeleteAll(id){return this.transaction(()=>{this.privateConfigure(id,false);this.db.prepare("UPDATE private_photos SET photo=X'',approval='deleted',updated=? WHERE owner=?").run(this.clock(),id);this.db.prepare('DELETE FROM records WHERE owner=?').run(id);return{ok:true};});}
  approvedPhoto(id,record){return !record.privatePhotoId||this.db.prepare("SELECT 1 FROM private_photos WHERE owner=? AND id=? AND approval='approved'").get(id,record.privatePhotoId);}
  friends(id){return this.db.prepare('SELECT f.peer AS id,u.nickname,f.scope,f.categories FROM friends f JOIN users u ON u.id=f.peer WHERE f.owner=?').all(id).map(r=>({...r,categories:JSON.parse(r.categories)}));}
  requests(id){return this.db.prepare('SELECT r.sender,r.recipient,u.nickname,r.created FROM requests r JOIN users u ON u.id=r.sender WHERE r.recipient=?').all(id).map(r=>({...r}));}
  request(id,peer){
    this.user(peer);if(id===peer) fail('不能添加自己');
    if(this.db.prepare('SELECT 1 FROM friends WHERE owner=? AND peer=?').get(id,peer)) fail('已经是好友');
    if(this.db.prepare('SELECT COUNT(*) n FROM requests WHERE sender=?').get(id).n>=30) fail('待处理申请过多',429);
    this.db.prepare('INSERT OR IGNORE INTO requests VALUES(?,?,?)').run(id,peer,this.clock());return{ok:true};
  }
  respond(id,sender,accept){return this.transaction(()=>{
    if(!this.db.prepare('SELECT 1 FROM requests WHERE sender=? AND recipient=?').get(sender,id)) fail('申请不存在',404);
    this.db.prepare('DELETE FROM requests WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)').run(sender,id,id,sender);
    if(accept){const stmt=this.db.prepare("INSERT OR IGNORE INTO friends(owner,peer) VALUES(?,?)");stmt.run(id,sender);stmt.run(sender,id);}return{ok:true};
  });}
  grants(id){return this.friends(id).filter(f=>f.scope!=='none');}
  purge(id){const grants=this.grants(id);for(const r of this.db.prepare('SELECT id,payload FROM records WHERE owner=?').all(id)) if(!grants.some(g=>visible(g,JSON.parse(r.payload)))) this.db.prepare('DELETE FROM records WHERE owner=? AND id=?').run(id,r.id);}
  setGrant(id,peer,grant){
    if(!scopes.has(grant?.scope)||!Array.isArray(grant.categories)||grant.categories.length>100||grant.categories.some(c=>typeof c!=='string'||!/^[-\w]{1,100}$/.test(c))) fail('授权范围不正确');
    if(grant.scope==='categories'&&!grant.categories.length) fail('请选择至少一个分类');
    return this.transaction(()=>{const r=this.db.prepare('UPDATE friends SET scope=?,categories=? WHERE owner=? AND peer=?').run(grant.scope,JSON.stringify([...new Set(grant.categories)]),id,peer);if(!r.changes) fail('仅可向已通过申请的好友授权',403);this.purge(id);return{ok:true};});
  }
  removeFriend(id,peer){return this.transaction(()=>{this.db.prepare('DELETE FROM friends WHERE (owner=? AND peer=?) OR (owner=? AND peer=?)').run(id,peer,peer,id);this.purge(id);this.purge(peer);return{ok:true};});}
  syncState(id){return{grants:this.grants(id),records:this.db.prepare('SELECT id,digest FROM records WHERE owner=?').all(id).map(r=>({...r}))};}
  sync(id,{upserts=[],deleteIds=[]}={}){
    if(!Array.isArray(upserts)||upserts.length>10||!Array.isArray(deleteIds)||deleteIds.length>100||deleteIds.some(id=>typeof id!=='string'||id.length>100)) fail('同步批次过大或格式无效');
    const grants=this.grants(id),rows=upserts.map(validateRecord);
    if(rows.some(r=>r.shareApproved!==true||r.status!=='confirmed'||!this.approvedPhoto(id,r)))fail('照片或记录尚未由本人确认开放',403);
    if(rows.some(r=>!grants.some(g=>visible(g,r)))) fail('这些内容不在你授予好友的范围内',403);
    return this.transaction(()=>{
      for(const idToDelete of deleteIds)this.db.prepare('DELETE FROM records WHERE owner=? AND id=?').run(id,idToDelete);
      for(const record of rows){const json=JSON.stringify(record);this.db.prepare('INSERT INTO records VALUES(?,?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET payload=excluded.payload,digest=excluded.digest,updated=excluded.updated').run(id,record.id,json,hash(json),this.clock());}
      return{ok:true};
    });
  }
  feed(id){
    // Authorization is checked on every read. A reverse relationship never grants access.
    const grants=this.db.prepare('SELECT owner,scope,categories FROM friends WHERE peer=? AND scope!=?').all(id,'none');
    const feed=[];
    for(const g of grants){const grant={...g,categories:JSON.parse(g.categories)};for(const r of this.db.prepare('SELECT payload,updated FROM records WHERE owner=? ORDER BY updated DESC LIMIT 300').all(g.owner)){
      const record=JSON.parse(r.payload);if(visible(grant,record)&&this.approvedPhoto(g.owner,record))feed.push({...record,...(record.privatePhotoId?{photo:this.privateGet(g.owner,record.privatePhotoId).photo}:{}),owner:this.user(g.owner),syncedAt:r.updated});
    }}
    return feed.sort((a,b)=>b.date.localeCompare(a.date)||b.syncedAt-a.syncedAt).slice(0,50);
  }
  deleteAccount(id,password){this.login(id,password);return this.transaction(()=>{const peers=this.friends(id);this.db.prepare('DELETE FROM users WHERE id=?').run(id);for(const peer of peers)this.purge(peer.id);return{ok:true};});}
}
