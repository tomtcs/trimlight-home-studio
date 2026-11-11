import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
export function credentialStore(dir){
 const keyPath=path.join(dir,'credentials.key'),file=path.join(dir,'credentials.enc');
 let key;if(fs.existsSync(keyPath))key=fs.readFileSync(keyPath);else{if(fs.existsSync(file))throw new Error('Credential encryption key is missing. Restore the server data volume.');key=randomBytes(32);fs.writeFileSync(keyPath,key,{mode:0o600,flag:'wx'})}if(key.length!==32)throw new Error('Invalid credential encryption key.');fs.chmodSync(keyPath,0o600);
 return {read(){if(!fs.existsSync(file))return null;const b=JSON.parse(fs.readFileSync(file,'utf8')),d=createDecipheriv('aes-256-gcm',key,Buffer.from(b.iv,'base64'));d.setAuthTag(Buffer.from(b.tag,'base64'));return JSON.parse(Buffer.concat([d.update(Buffer.from(b.data,'base64')),d.final()]).toString());},write(value){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify({iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:data.toString('base64')}),{mode:0o600});fs.renameSync(temp,file);}};
}
const fields={clientId:'TRIMLIGHT_CLIENT_ID',clientSecret:'TRIMLIGHT_CLIENT_SECRET',deviceId:'TRIMLIGHT_DEVICE_ID'};
export function configureCredentials(env,store){let saved=store.read();if(saved===null&&Object.values(fields).every(k=>env[k])){saved=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,env[v]]));store.write(saved)}if(saved!==null)for(const [k,v]of Object.entries(fields))env[v]=saved[k]||'';}
export {credentialsApi} from '../shared/connection.mjs';
