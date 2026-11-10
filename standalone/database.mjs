import {DatabaseSync} from 'node:sqlite';
export function openDatabase(path){
 const sqlite=new DatabaseSync(path);sqlite.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS leases(id TEXT PRIMARY KEY,token TEXT NOT NULL,expires INTEGER NOT NULL);');
 return {
  sqlite,
  prepare(sql) {
   const stmt=sqlite.prepare(sql);
   return {
    bind(...args) {
     return {
      async first(){return stmt.get(...args)||null},
      async run(){const r=stmt.run(...args);return {meta:{changes:Number(r.changes)}}}
     };
    }
   };
  }
 };
}
