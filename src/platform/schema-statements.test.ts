// @vitest-environment node
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {run,one,all,atomic,platformDb} from './schema';
const dir=mkdtempSync(join(tmpdir(),'homay-statements-'));
beforeAll(()=>{process.env.DATABASE_PATH=join(dir,'test.sqlite');run('CREATE TABLE statement_fixture(id TEXT PRIMARY KEY,value INTEGER NOT NULL)');run('INSERT INTO statement_fixture VALUES(?,?)','member-a',10);run('INSERT INTO statement_fixture VALUES(?,?)','member-b',20);});
afterAll(()=>{platformDb().close();rmSync(dir,{recursive:true,force:true});});
it('does not retain a prior account parameter or prior query result',()=>{
 for(let i=0;i<1000;i++){expect(one('SELECT value FROM statement_fixture WHERE id=?','member-a')!.value).toBe(10);expect(one('SELECT value FROM statement_fixture WHERE id=?','member-b')!.value).toBe(20);}
 run('UPDATE statement_fixture SET value=? WHERE id=?',30,'member-a');expect(one('SELECT value FROM statement_fixture WHERE id=?','member-a')!.value).toBe(30);
 expect(all('SELECT id FROM statement_fixture WHERE value>=? ORDER BY id',20).map(row=>row.id)).toEqual(['member-a','member-b']);
});
it('retains rollback behavior when compiled statements are reused',()=>{
 expect(()=>atomic(()=>{run('UPDATE statement_fixture SET value=? WHERE id=?',999,'member-b');expect(one('SELECT value FROM statement_fixture WHERE id=?','member-b')!.value).toBe(999);throw Error('rollback');})).toThrow('rollback');
 expect(one('SELECT value FROM statement_fixture WHERE id=?','member-b')!.value).toBe(20);
});
