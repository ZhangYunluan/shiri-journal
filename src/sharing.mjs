// Explicit allowlist: never serialize a local record/asset wholesale for the server.
export const canShare=(grant,record)=>record.shareApproved===true&&record.status==='confirmed'&&(grant.scope==='all'||(grant.scope==='shared'&&record.kind==='shared')||(grant.scope==='categories'&&grant.categories.includes(record.categoryId)));
export function sharedRecord(record,category,photo) {
  const r={id:record.id,kind:record.kind==='shared'?'shared':'record',status:record.status,shareApproved:record.shareApproved===true,categoryId:record.categoryId,date:record.date,title:record.title.trim(),note:(record.note||'').trim()};
  if(record.assetId)r.privatePhotoId=record.id;
  if(photo&&!record.assetId)r.photo=photo;
  for(const field of ['location','time','categoryName']){const value=field==='categoryName'?category?.name:record[field];if(value)r[field]=value.trim();}
  for(const field of ['amount','weight','duration','mood'])if(record[field]!=null)r[field]=record[field];
  if(record.tags)r.tags=record.tags.map(t=>t.trim());
  return r;
}
export async function recordDigest(record){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(record)))),x=>x.toString(16).padStart(2,'0')).join('');}
