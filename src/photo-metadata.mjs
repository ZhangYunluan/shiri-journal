/** Bounded EXIF GPS reader. No geolocation, image inference or network requests. */
export function coordinateLabel(gps){
 if(!gps||!Number.isFinite(gps.latitude)||!Number.isFinite(gps.longitude)||Math.abs(gps.latitude)>90||Math.abs(gps.longitude)>180)return '';
 return `拍摄坐标：${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`;
}
// Called on demand for an open review candidate, never a background permission prompt.
export async function resolveCaptureLocation(record,asset,photos){
 if(!asset||record?.status!=='review'||record.location)return '';
 try{
  if(asset.captureLocation)return asset.captureLocation;
  if(asset.blob){const local=coordinateLabel(photoGps(new Uint8Array(await asset.blob.arrayBuffer())));if(local)return local;}
  if(record.source==='native-auto'&&record.id?.startsWith('native:')&&photos?.location){
   const gps=await photos.location({id:record.id.slice(7),requestPermission:false});
   return gps?.available?coordinateLabel(gps):'';
  }
 }catch{/* Missing permission/metadata must never block editing. */}
 return '';
}
function tiffGps(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),le=v.getUint16(0)===0x4949;
 if(!le&&v.getUint16(0)!==0x4d4d||v.getUint16(2,le)!==42)return null;
 const u16=p=>v.getUint16(p,le),u32=p=>v.getUint32(p,le);
 const entries=offset=>{const n=u16(offset);if(n>128||offset+2+n*12>bytes.length)throw Error('Invalid EXIF');return Array.from({length:n},(_,i)=>offset+2+i*12);};
 const pointer=entries(u32(4)).find(p=>u16(p)===0x8825&&u16(p+2)===4&&u32(p+4)===1);if(pointer===undefined)return null;
 const gps=entries(u32(pointer+8)),entry=tag=>gps.find(p=>u16(p)===tag);
 const ref=tag=>{const p=entry(tag);if(p===undefined||u16(p+2)!==2||u32(p+4)!==2)return '';return String.fromCharCode(v.getUint8(p+8));};
 const degrees=tag=>{const p=entry(tag);if(p===undefined||u16(p+2)!==5||u32(p+4)!==3)throw Error('Missing GPS');const off=u32(p+8),parts=[0,1,2].map(i=>{const d=u32(off+i*8+4);if(!d)throw Error('Invalid GPS');return u32(off+i*8)/d;});if(parts[1]>=60||parts[2]>=60)throw Error('Invalid GPS');return parts[0]+parts[1]/60+parts[2]/3600;};
 const ns=ref(1),ew=ref(3);if(!['N','S'].includes(ns)||!['E','W'].includes(ew))return null;
 const point={latitude:degrees(2)*(ns==='S'?-1:1),longitude:degrees(4)*(ew==='W'?-1:1)};
 return coordinateLabel(point)?point:null;
}
export function photoGps(bytes){
 try{
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),text=(p,n)=>String.fromCharCode(...bytes.subarray(p,p+n));
  const read=(p,n)=>{if(n>65536||p+n>bytes.length)return null;if(text(p,6)==='Exif\0\0'){p+=6;n-=6;}return tiffGps(bytes.subarray(p,p+n));};
  if(v.getUint16(0)===0xffd8){for(let p=2;p+4<=bytes.length;){if(bytes[p++]!==255)return null;const marker=bytes[p++];if(marker===0xda||marker===0xd9)break;const length=v.getUint16(p);if(length<2||p+length>bytes.length)return null;if(marker===0xe1&&text(p+2,6)==='Exif\0\0'){const gps=read(p+2,length-2);if(gps)return gps;}p+=length;}}
  else if(text(0,4)==='RIFF'&&text(8,4)==='WEBP'){for(let p=12;p+8<=bytes.length;){const n=v.getUint32(p+4,true);if(text(p,4)==='EXIF')return read(p+8,n);p+=8+n+(n%2);}}
  else if(v.getUint32(0)===0x89504e47){for(let p=8;p+12<=bytes.length;){const n=v.getUint32(p);if(text(p+4,4)==='eXIf')return read(p+8,n);p+=12+n;}}
 }catch{/* Absent or malformed EXIF must never block saving a photo. */}
 return null;
}
