import {spawn} from 'node:child_process';
const args=process.argv.slice(2); const portIndex=args.indexOf('--port'); const hostIndex=args.indexOf('--host');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-H',hostIndex>=0?args[hostIndex+1]:'0.0.0.0','-p',portIndex>=0?args[portIndex+1]:'3000'],{stdio:'inherit',env:{...process.env,HOMAY_BUILD_DIRECTORY:process.env.HOMAY_BUILD_DIRECTORY||'.next-dev'}});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??0));
