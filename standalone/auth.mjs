import {randomBytes,randomUUID,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback),digest=s=>createHash('sha256').update(s).digest('hex');
const publicUser=u=>u&&({id:u.id,username:u.username,role:u.role,disabled:!!u.disabled});
function fail(message,status=400){throw Object.assign(new Error(message),{status})}
async function hash(password){if(typeof password!=='string'||password.length<8||password.length>256)fail('Passwords must contain 8–256 characters.');const salt=randomBytes(16).toString('hex');return salt+':'+(await scrypt(password,salt,64)).toString('hex')}
async function verify(password,stored){const [salt,key]=stored.split(':');const actual=await scrypt(typeof password==='string'?password.slice(0,256):'',salt,64);return timingSafeEqual(actual,Buffer.from(key,'hex'))}
export async function createAuth(db,config){
 db.exec('CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,disabled INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);');
 if(!db.prepare('SELECT id FROM users LIMIT 1').get()){
  if(!config.APP_PASSWORD||config.APP_PASSWORD.length<8)throw new Error('Set APP_PASSWORD to at least 8 characters before starting.');
  db.prepare('INSERT INTO users VALUES(?,?,?,?,0)').run(randomUUID(),(config.APP_USER||'admin').trim().toLowerCase(),await hash(config.APP_PASSWORD),'admin');
 }
 const attempts=new Map(),dummy=await hash(randomBytes(20).toString('hex'));
 const cookie=(token,maxAge)=>`studio_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.COOKIE_SECURE==='true'?'; Secure':''}`;
 function token(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('studio_session='))?.slice(15)||''}
 function user(req){const row=db.prepare('SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.disabled=0').get(digest(token(req)),Date.now());return publicUser(row)||null}
 async function route(req,path,body,current){
  if(path==='/api/auth/session'&&req.method==='GET')return {data:{user:current}};
  if(path==='/api/auth/login'&&req.method==='POST'){
   const key=req.socket.remoteAddress||'local',now=Date.now();for(const [k,v] of attempts)if(now-v.at>600000)attempts.delete(k);
   const a=attempts.get(key)||{at:now,count:0};if(a.count>=10)fail('Too many login attempts. Try again in 10 minutes.',429);a.count++;attempts.set(key,a);
   const u=db.prepare('SELECT * FROM users WHERE username=?').get(String(body.username||'').trim().toLowerCase());const valid=await verify(body.password,u?.password||dummy);
   if(!u||u.disabled||!valid)fail('Incorrect username or password.',401);
   attempts.delete(key);db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);const value=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(value),u.id,now+8*3600000);
   return {data:{user:publicUser(u)},cookie:cookie(value,28800)};
  }
  if(!current)fail('Please sign in.',401);
  if(path==='/api/auth/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token(req)));return {data:{ok:true},cookie:cookie('',0)}}
  if(path==='/api/auth/password'&&req.method==='POST'){
   const u=db.prepare('SELECT * FROM users WHERE id=?').get(current.id);if(!await verify(body.currentPassword,u.password))fail('Current password is incorrect.',403);
   const password=await hash(body.password);db.prepare('UPDATE users SET password=? WHERE id=?').run(password,current.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(current.id);return {data:{ok:true},cookie:cookie('',0)};
  }
  if(current.role!=='admin')fail('Administrator access required.',403);
  if(path==='/api/users'&&req.method==='GET')return {data:{users:db.prepare('SELECT * FROM users ORDER BY username').all().map(publicUser)}};
  if(path==='/api/users'&&req.method==='POST'){
   const original=body.id?db.prepare('SELECT * FROM users WHERE id=?').get(body.id):null;if(body.id&&!original)fail('User not found.',404);
   const username=String(body.username||'').trim().toLowerCase(),role=body.role,disabled=!!body.disabled;
   if(!/^[a-z0-9_.-]{1,64}$/.test(username))fail('Use 1–64 letters, numbers, dots, underscores or hyphens for usernames.');
   if(!['admin','editor','viewer'].includes(role))fail('Invalid role.');
   const duplicate=db.prepare('SELECT id FROM users WHERE username=?').get(username);if(duplicate&&duplicate.id!==original?.id)fail('Username already exists.');
   const password=body.password?await hash(body.password):original?.password;if(!password)fail('Set a password for the new user.');
   // Recheck immediately before synchronous writes, after password hashing yields.
   if(original?.role==='admin'&&!original.disabled&&(role!=='admin'||disabled)&&db.prepare("SELECT count(*) AS n FROM users WHERE role='admin' AND disabled=0").get().n<=1)fail('Keep at least one active administrator.');
   const id=original?.id||randomUUID();db.prepare('INSERT INTO users VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,password=excluded.password,role=excluded.role,disabled=excluded.disabled').run(id,username,password,role,Number(disabled));
   if(original)db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
   return {data:{ok:true}};
  }
  fail('Not found.',404);
 }
 return {user,route};
}
export function authorize(user,path,method,body,state){
 if(!user)fail('Please sign in.',401);
 if(user.role==='admin')return;
 if(path==='/api/credentials'||path==='/api/rolling-backup'||path==='/api/controller-diagnostics'||path==='/api/controller-test')fail('Administrator access required.',403);
 if(method==='GET')return;
 if(user.role==='viewer')fail('Viewer accounts cannot make changes.',403);
 if(!['/api/state','/api/action'].includes(path))fail('Administrator access required.',403);
 if(path==='/api/state'&&JSON.stringify(body.state?.settings)!==JSON.stringify(state.settings))fail('Only administrators can change household settings.',403);
}
