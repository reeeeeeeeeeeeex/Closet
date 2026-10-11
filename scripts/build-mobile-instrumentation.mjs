import { build } from 'esbuild';
// Test APK only: use the real mobile adapter and native plugin without a production test hook.
await build({stdin:{contents:'export * from "./mobile/store"; export * from "./mobile/client"; export * from "./mobile/sync"; export {setProfileContext} from "./lib/profile-client"; export {manifestFromState} from "./lib/portable";',resolveDir:process.cwd()},bundle:true,platform:'browser',format:'iife',globalName:'ClosetTest',target:'chrome100',outfile:'android/app/src/androidTest/assets/client-test.js',logLevel:'warning'});
