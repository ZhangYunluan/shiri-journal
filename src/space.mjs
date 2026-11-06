export function spaceId(storage=globalThis.localStorage){
  const id=storage?.getItem('shiri-space-owner');return /^(?:SR[A-Z0-9]{12}|CB(?:[a-f0-9]{2}){1,64})$/.test(id||'')?id:'guest';
}
export function databaseName(storage=globalThis.localStorage){const id=spaceId(storage);return id==='guest'?'shiri-life-v1':`shiri-life-v1-${id}`;}
