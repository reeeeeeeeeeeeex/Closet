import { spawn, spawnSync } from 'node:child_process';
const tests = ['i18n','portability','item-details','subsets','photos','photo-view','brands','colors','color-sampling','color-filter','runtime','accounts','profile-client','colors-runtime','sync','sync-runtime','ai-mcp'];
let child;
const cleanup = () => process.platform === 'win32' ? spawnSync('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/stop-services.ps1'], { stdio: 'inherit' }).status : 0;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  process.exitCode = 1;
  if (child?.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill();
  }
});
try {
  for (const name of tests) {
    if (process.exitCode) break;
    child = spawn(process.execPath, [`tests/${name}.mjs`], { stdio: 'inherit' });
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    if (code !== 0) { process.exitCode = code || 1; break; }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { if (cleanup() !== 0) process.exitCode = 1; }
