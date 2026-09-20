import {existsSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
if(existsSync('.env.local')) {console.log('.env.local already exists; no changes made.');process.exit(0);}
const password=randomBytes(24).toString('base64url');
writeFileSync('.env.local',`DATABASE_PATH=./data/homay.sqlite\nADMIN_PASSWORD=${password}\nAPP_ORIGIN=\nTRUST_PROXY=0\n`,{mode:0o600,flag:'wx'});
console.log('Created private .env.local. Read ADMIN_PASSWORD from that file to sign in at /admin/legacy. Keep it out of source control.');
