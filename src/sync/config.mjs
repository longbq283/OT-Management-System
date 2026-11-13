export const SHARED_CONFIG=Object.freeze({owner:'longbq283',repo:'OT-Management-System',branch:'main',path:'data/shared-ot.json'});
export function sharedEnabled(location=globalThis.location){
  if(!location)return false;
  const params=new URLSearchParams(location.search);
  return params.get('shared')==='1'||(!['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&location.protocol==='https:');
}
