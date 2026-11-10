const ID='controller-credentials';
const fields={clientId:'TRIMLIGHT_CLIENT_ID',clientSecret:'TRIMLIGHT_CLIENT_SECRET',deviceId:'TRIMLIGHT_DEVICE_ID'};
const encode=a=>btoa(String.fromCharCode(...new Uint8Array(a)));
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export function cloudCredentialStore(env){
 async function key(){if(!/^[a-f0-9]{64}$/i.test(env.CREDENTIAL_ENCRYPTION_KEY||''))throw new Error('Cloud credential storage is not configured.');return crypto.subtle.importKey('raw',Uint8Array.from(env.CREDENTIAL_ENCRYPTION_KEY.match(/../g),x=>parseInt(x,16)),{name:'AES-GCM'},false,['encrypt','decrypt'])}
 async function seal(value){const iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(ID)},await key(),new TextEncoder().encode(JSON.stringify(value)));return JSON.stringify({iv:encode(iv),data:encode(data)})}
 return {
 async read(){const r=await env.DB.prepare('SELECT data FROM documents WHERE id=?').bind(ID).first();if(!r)return null;try{const b=JSON.parse(r.data),clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(b.iv),additionalData:new TextEncoder().encode(ID)},await key(),decode(b.data));return JSON.parse(new TextDecoder().decode(clear))}catch{throw new Error('Saved connection could not be decrypted. Restore the matching server encryption key.')}},
 async write(value){const data=await seal(value);await env.DB.prepare('INSERT INTO documents(id,data,revision) VALUES (?,?,0) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=documents.revision+1').bind(ID,data).run()},
 async initialize(value){const data=await seal(value);await env.DB.prepare('INSERT OR IGNORE INTO documents(id,data,revision) VALUES (?,?,0)').bind(ID,data).run()}
 };
}
export async function cloudConnectionEnv(env){
 const store=cloudCredentialStore(env);let saved=await store.read();
 if(saved===null&&Object.values(fields).every(k=>env[k])){await store.initialize(Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,env[v]])));saved=await store.read()}
 const resolved={...env};if(saved!==null)for(const [k,v]of Object.entries(fields))resolved[v]=saved[k]||'';
 return {env:resolved,store};
}
