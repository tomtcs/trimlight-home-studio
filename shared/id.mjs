// Record identifiers, not authentication tokens. getRandomValues is available
// on local HTTP origins where randomUUID may be absent.
export function uuid(source=globalThis.crypto){
 if(typeof source?.randomUUID==='function')return source.randomUUID();
 if(typeof source?.getRandomValues!=='function')throw new Error('This browser cannot generate record IDs. Try a current browser or HTTPS.');
 const bytes=source.getRandomValues(new Uint8Array(16));
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
