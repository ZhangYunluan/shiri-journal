/** Tesseract output is a suggestion. Discard noise instead of inventing text. */
export function cleanOcr(data={}){
  const valid=text=>{
    text=String(text||'').normalize('NFKC').trim();
    const chars=text.replace(/\s/g,'');
    if(!chars||/(.)\1{3,}/u.test(chars)||/(.{1,5})\1{3,}/u.test(chars))return '';
    if((chars.match(/[\p{L}\p{N}]/gu)||[]).length/chars.length<.6)return '';
    if(!/[\p{L}\p{N}]{2}/u.test(chars))return '';
    return text;
  };
  const words=data.words||data.blocks?.flatMap(b=>b.paragraphs?.flatMap(p=>p.lines?.flatMap(l=>l.words||[])||[])||[])||[];
  if(words.length){
    const good=words.filter(w=>Number(w.confidence)>=75).map(w=>valid(w.text)).filter(Boolean);
    if(good.join('').length<4||good.length<2&&good.join('').length<6)return '';
    return good.join(' ').slice(0,20000);
  }
  // Older engines without word boxes need a stricter whole-image confidence gate.
  if(!Number.isFinite(Number(data.confidence))||Number(data.confidence)<85)return '';
  const text=String(data.text||'').split(/\r?\n/).map(valid).filter(Boolean).join('\n');
  return text.replace(/\s/g,'').length>=6?text.slice(0,20000):'';
}
